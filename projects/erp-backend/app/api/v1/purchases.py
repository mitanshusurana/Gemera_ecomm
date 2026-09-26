"""
Caratloop ERP — Purchase Invoices API
Gemstone, Bullion, & Jewelry Purchase Invoices with Multi-Rate GST, ITC Register, Stock Ledger, & Double-Entry Accounting [CGST-R56-4] [S44AA]

Amendment is reverse-and-repost. The first version of ``update_purchase_invoice``
hard-deleted the bill's lines, stock ledger entries, ITC / RCM / TDS register
rows and journal entries and wrote fresh ones. The books lost their history:
a Rule 56 register that has had rows removed is not a register, and s.44AA
books cannot lose a posted entry. Now the original bill is marked 'Amended',
every posted row is mirrored by a reversing row (journal entry of type
'Reversal', stock movement in the opposite direction, register rows flagged
is_reversal), and the corrected bill is a NEW purchase_invoices row pointing
back at the original through amends_invoice_id with bill number '<orig>/A1',
'/A2', ... Nothing posted is ever deleted.
"""
import logging
import re
from uuid import UUID
from datetime import date
from decimal import Decimal
from typing import Any, Mapping, Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.core.config import settings
from app.core.database import get_db, set_audit_context
from app.core.ledger import assert_journal_balanced
from app.core.money import to_decimal
from app.core.periods import assert_period_open
from app.tax.purchase_tax import DEFAULT_RCM_RATE, PurchaseLineInput, PurchaseTotals, compute_purchase_totals
from app.tax.tds_tcs import Withholding, has_valid_pan, tds_on_purchase
from app.core.roles import CAN_AMEND, CAN_POST, require
from app.core.pagination import Page, paginate
from app.core.security import get_current_user
from app.core.tenancy import resolve_default_uom, resolve_fiscal_year, resolve_stock_location
from app.tax.gstin import is_gstin_shaped

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Purchases"])

# Bills in these states are history: they cannot be amended again, paid
# against, or counted towards a threshold. 'Amended' means "replaced by the
# bill whose amends_invoice_id points here".
INACTIVE_STATUSES = ("Cancelled", "Amended")

_AMEND_SUFFIX = re.compile(r"/A(\d+)$")


class PurchaseLineRequest(BaseModel):
    material_id: Optional[str] = None
    description: Optional[str] = "Gemstone / Jewelry Item"
    quantity: float = 1.0
    gross_weight: Optional[float] = 0.0
    net_weight: Optional[float] = 0.0
    purity: Optional[float] = 1.0
    rate: float
    making_charges: Optional[float] = 0.0
    hsn_code: Optional[str] = "71131910"
    gst_rate: Optional[float] = 3.0


class CreatePurchaseInvoiceRequest(BaseModel):
    supplier_id: UUID
    invoice_date: date
    supplier_invoice_no: Optional[str] = "URD-BILL"
    vendor_invoice_date: Optional[date] = None
    # No default. "08" here meant a supplier with no state on record was
    # booked as a Rajasthan supply -- CGST+SGST, and an ITC claim under the
    # wrong head -- before any check could notice the field was missing.
    place_of_supply: Optional[str] = None
    attachment_url: Optional[str] = None
    items: List[PurchaseLineRequest]
    is_rcm: bool = False
    reason: str = "Purchase invoice creation"


def root_bill_no(bill_no: str) -> str:
    """'PI/2026-27/00007/A2' -> 'PI/2026-27/00007'."""
    return _AMEND_SUFFIX.sub("", bill_no or "")


def next_amendment_bill_no(bill_no: str, existing_amendments: int) -> str:
    """The bill number for the next amendment in a chain.

    Suffixes count from the ROOT bill, so amending '/A1' yields '/A2' rather
    than '/A1/A1'; ``existing_amendments`` is how many bills already carry the
    root with a suffix.
    """
    return f"{root_bill_no(bill_no)}/A{int(existing_amendments) + 1}"


async def _post_rcm_liability(
    db: AsyncSession,
    *,
    company_id,
    fiscal_year_id,
    invoice_id,
    invoice_date: date,
    supplier,
    supplier_id,
    description: str,
    items,
    totals: PurchaseTotals,
    journal_entry_id,
    user_id,
) -> None:
    """One row in the RCM liability register for a reverse-charge purchase.

    [CGST Rule 56(4)] The register was read by GSTR-3B, the RCM register
    screen and the tax audit report, but nothing ever wrote to it, so every
    reverse-charge purchase posted its self-liability to the ledger and then
    vanished from the returns. Amounts come from the same PurchaseTotals that
    the journal entry was posted from, so the two cannot disagree.
    """
    if not totals.rcm_applicable or totals.total_rcm <= 0:
        return
    # The rate the material lines were taxed at when they all agree; the
    # notified default otherwise (making charges carry their own rate, so a
    # single "effective" rate would misstate a mixed bill).
    line_rates = {to_decimal(getattr(it, "gst_rate", 0) or 0) for it in items}
    line_rates.discard(to_decimal(0))
    rcm_rate = line_rates.pop() if len(line_rates) == 1 else to_decimal(DEFAULT_RCM_RATE)
    await db.execute(
        text("""
            INSERT INTO caratloop.rcm_liability_register (
                company_id, fiscal_year_id, return_period, transaction_date,
                vendor_id, vendor_name, vendor_pan, purchase_invoice_id, description,
                purchase_value, rcm_rate, igst_rcm, cgst_rcm, sgst_rcm, total_rcm,
                journal_entry_id, created_by
            ) VALUES (
                :cid, :fyid, :period, :tdate,
                :vid, :vname, :vpan, :pid, :descr,
                :pval, :rate, 0, :cgst, :sgst, :total,
                :jid, :cb
            )
        """),
        {
            "cid": company_id,
            "fyid": str(fiscal_year_id),
            "period": invoice_date.strftime("%Y-%m"),
            "tdate": invoice_date,
            "vid": str(supplier_id),
            "vname": (supplier.get("name") or supplier.get("trade_name") or "Unregistered supplier")[:200],
            "vpan": ((supplier.get("pan") or "").strip().upper() or None),
            "pid": str(invoice_id),
            "descr": description[:500],
            "pval": totals.material_subtotal + totals.making_subtotal,
            "rate": rcm_rate,
            "cgst": totals.rcm_cgst,
            "sgst": totals.rcm_sgst,
            "total": totals.total_rcm,
            "jid": journal_entry_id,
            "cb": user_id,
        },
    )


async def _compute_tds(
    db: AsyncSession,
    *,
    company_id,
    fiscal_year_id,
    supplier,
    taxable_value,
) -> Withholding | None:
    """TDS s.194Q for this bill, or None when it does not apply.

    Cumulative purchases from the supplier in the fiscal year are read from
    the bills already on file. Cancelled bills do not count, and neither do
    bills that have been amended: their value lives on in the bill that
    replaced them, and counting both would deduct tax twice on one purchase.
    The caller amends by marking the old bill first, so no extra exclusion is
    needed here.
    """
    if not settings.TDS_194Q_ENABLED or not supplier.get("tds_applicable"):
        return None
    cum_res = await db.execute(
        text(
            "SELECT COALESCE(SUM(subtotal_value), 0) FROM caratloop.purchase_invoices "
            "WHERE company_id = :cid AND vendor_id = :vid AND fiscal_year_id = :fyid "
            "AND status NOT IN ('Cancelled', 'Amended')"
        ),
        {"cid": company_id, "vid": str(supplier["id"]), "fyid": str(fiscal_year_id)},
    )
    tds = tds_on_purchase(
        to_decimal(cum_res.scalar()),
        taxable_value,
        settings.TDS_194Q_THRESHOLD_INR,
        settings.TDS_194Q_RATE,
        has_pan=has_valid_pan(supplier.get("pan")),
        no_pan_rate=settings.TDS_NO_PAN_RATE,
        lower_pct=supplier.get("lower_deduction_pct"),
    )
    return tds if tds.applies else None


async def _post_tds_register(
    db: AsyncSession,
    *,
    company_id,
    fiscal_year_id,
    tds: Withholding,
    supplier,
    invoice_id,
    bill_no: str,
    bill_date: date,
    user_id,
) -> None:
    """One row per bill in the TDS/TCS register (the Form 26Q feed)."""
    await db.execute(
        text("""
            INSERT INTO caratloop.tds_tcs_register (
                company_id, fiscal_year_id, kind, section, party_id,
                document_type, document_id, document_no, document_date,
                base_amount, rate, amount, pan, created_by
            ) VALUES (
                :cid, :fyid, 'TDS', :section, :party_id,
                'PurchaseInvoice', CAST(:doc_id AS UUID), :doc_no, :doc_date,
                :base, :rate, :amount, :pan, :cb
            )
        """),
        {
            "cid": company_id,
            "fyid": str(fiscal_year_id),
            "section": tds.section,
            "party_id": str(supplier["id"]),
            "doc_id": str(invoice_id),
            "doc_no": bill_no,
            "doc_date": bill_date,
            "base": tds.base,
            "rate": tds.rate,
            "amount": tds.amount,
            "pan": (str(supplier.get("pan") or "").strip().upper() or None),
            "cb": user_id,
        },
    )


def _as_uuid(value) -> str | None:
    """The value if it is a UUID, else None.

    Material lines may name an item by id or by code. Comparing a code against
    a uuid column made Postgres fail the cast before the code branch of the OR
    was ever considered, so "GOLD-22K" returned 500 instead of finding the
    material. NULL simply fails that half of the comparison.
    """
    try:
        return str(UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        return None


async def _resolve_line_rates(db, company_id, items):
    """Resolve each line's GST rate from the item master.

    The rate lookup is the only part of purchase tax that needs the database;
    everything after it is pure arithmetic in app.tax.purchase_tax.
    """
    resolved = []
    for item in items:
        rate = to_decimal(item.gst_rate) if item.gst_rate is not None else None
        if (rate is None or rate <= 0) and item.material_id:
            m_res = await db.execute(
                text(
                    "SELECT gst_tax_rate FROM caratloop.materials "
                    "WHERE company_id = :cid AND (id = :mid OR code = :mcode) LIMIT 1"
                ),
                {"cid": company_id, "mid": str(item.material_id), "mcode": str(item.material_id)},
            )
            found = m_res.scalar()
            rate = to_decimal(found) if found is not None else None
        resolved.append(
            PurchaseLineInput(
                quantity=to_decimal(item.quantity),
                net_weight=to_decimal(item.net_weight),
                rate=to_decimal(item.rate),
                making_charges=to_decimal(item.making_charges),
                gst_rate=rate if (rate is not None and rate > 0) else to_decimal(0),
            )
        )
    return resolved


async def _load_supplier(db: AsyncSession, company_id, supplier_id) -> Mapping[str, Any]:
    """The supplier row, scoped to the company.

    Unscoped, a caller could name another company's party as the supplier on
    their own invoice.
    """
    res = await db.execute(
        text(
            "SELECT id, name, trade_name, gstin, pan, state_code, account_id, tds_applicable, "
            "lower_deduction_pct, tds_pan_verified FROM caratloop.parties "
            "WHERE id = :id AND company_id = :cid LIMIT 1"
        ),
        {"id": str(supplier_id), "cid": company_id},
    )
    supplier = res.mappings().first()
    if not supplier:
        raise HTTPException(status_code=400, detail="Supplier not found in master records.")
    return supplier


async def _account_id(db: AsyncSession, company_id, code: str) -> str:
    res = await db.execute(
        text("SELECT id FROM caratloop.accounts WHERE code = :code AND company_id = :cid LIMIT 1"),
        {"code": code, "cid": company_id},
    )
    acc = res.scalar()
    if acc is None:
        raise HTTPException(
            status_code=400,
            detail=f"Chart of accounts is missing '{code}'. Create it before posting this document. No data was saved.",
        )
    return str(acc)


_STOCK_ACCOUNT_BY_CATEGORY = {
    'Gold': 'STK-001', 'Silver': 'STK-003', 'Diamond': 'STK-004',
    'Ruby': 'STK-005', 'Emerald': 'STK-006', 'Sapphire': 'STK-007',
}


# Item-master category of a service item (the karigar's making-charge line,
# job_work.MAKING_MATERIAL_CODE). A service is bought, expensed and taxed like
# any other line, but nothing arrives in stock, so no stock ledger row.
SERVICE_CATEGORY = "Service"


def is_service_material(category) -> bool:
    return str(category or "").strip().lower() == SERVICE_CATEGORY.lower()


async def _resolve_material(db: AsyncSession, company_id, material_ref, default_uom_id):
    """(material_id, uom_id, stock_account_id, is_service) for a line's material reference.

    One lookup instead of the two the create path used to do per line (one
    for the stock ledger, another for the journal), so the two halves of the
    posting cannot disagree about which material a line is. ``is_service``
    is True for a 'Service' category item: it is journalled to its account
    (an expense) but never receipted into stock.
    """
    if not material_ref or not str(material_ref).strip():
        raise HTTPException(status_code=400, detail="Every purchase line must name a stock material.")
    res = await db.execute(
        text(
            "SELECT id, uom_id, stock_account_id, category FROM caratloop.materials "
            "WHERE (id = CAST(:mid AS UUID) OR code = :mcode) AND company_id = :cid LIMIT 1"
        ),
        {"mid": _as_uuid(material_ref), "mcode": str(material_ref), "cid": company_id},
    )
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=400, detail=f"Stock material '{material_ref}' not found in master records.")
    uom_id = row["uom_id"] or default_uom_id
    if row["stock_account_id"]:
        stock_acc = str(row["stock_account_id"])
    else:
        stock_acc = await _account_id(db, company_id, _STOCK_ACCOUNT_BY_CATEGORY.get(row["category"], "STK-008"))
    return row["id"], uom_id, stock_acc, is_service_material(row["category"])


def _line_values(item: PurchaseLineRequest) -> tuple[Decimal, Decimal]:
    """(material value, line total) for a line, in Decimal.

    Weight-priced when a net weight is given (bullion, gemstones by carat),
    quantity-priced otherwise (finished pieces).
    """
    qty = to_decimal(item.quantity)
    nw = to_decimal(item.net_weight)
    rate = to_decimal(item.rate)
    mat_val = (nw * rate) if nw > 0 else (qty * rate)
    return mat_val, mat_val + to_decimal(item.making_charges)


async def _post_purchase(
    db: AsyncSession,
    *,
    company_id,
    user_id: str,
    fy: Mapping[str, Any],
    payload: CreatePurchaseInvoiceRequest,
    supplier: Mapping[str, Any],
    bill_no: str,
    amends_invoice_id: Optional[str] = None,
    carried_amount_paid: Decimal = Decimal("0"),
) -> dict:
    """Post one purchase bill: header, lines, stock, journal, registers.

    Shared by creation and amendment so the two paths cannot drift -- the
    original amend path was a near-copy of create that had already diverged
    in three places.
    """
    supp_gstin = (supplier.get("gstin") or "").strip().upper()
    # GSTIN-shaped, not merely non-empty. The sentinel list let "NA",
    # "-", "Not registered" and any fifteen random characters count as a
    # registered supplier, and from that boolean flowed an ITC register
    # row, forward-charge GST and a GSTR-1 B2B line.
    is_unregistered = not is_gstin_shaped(supp_gstin)

    pos = payload.place_of_supply or supplier.get("state_code")
    if not pos:
        raise HTTPException(
            status_code=422,
            detail=(
                "Place of supply is required: the supplier has no state on record and none "
                "was given. It decides whether IGST or CGST+SGST applies."
            ),
        )
    is_inter_state = pos.strip().zfill(2) != settings.COMPANY_STATE_CODE.strip().zfill(2)

    # One tested Decimal implementation for the tax arithmetic.
    priced = await _resolve_line_rates(db, company_id, payload.items)
    totals = compute_purchase_totals(
        priced,
        is_unregistered=is_unregistered,
        is_rcm=payload.is_rcm,
        is_inter_state=is_inter_state,
    )
    taxable = totals.material_subtotal + totals.making_subtotal
    total_cgst, total_sgst, total_igst = totals.total_cgst, totals.total_sgst, totals.total_igst
    rcm_cgst, rcm_sgst = totals.rcm_cgst, totals.rcm_sgst
    grand_total = totals.grand_total

    # ─── TDS s.194Q ──────────────────────────────────────────────────────────
    # Deducted from what the supplier is paid, on the value before GST
    # (circular 13/2021), once this year's purchases from them pass the
    # threshold. grand_total stays the bill's face value; the supplier's
    # credit is grand_total less the TDS, and the TDS is credited to the
    # payable account until it is deposited.
    tds = await _compute_tds(
        db, company_id=company_id, fiscal_year_id=fy["id"], supplier=supplier, taxable_value=taxable,
    )
    tds_amount = tds.amount if tds else to_decimal(0)

    carried = to_decimal(carried_amount_paid)
    if carried > grand_total:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot amend the bill to {grand_total}: {carried} has already been paid "
                "against it. Reverse or refund the payment first. No data was saved."
            ),
        )
    payment_status = "Paid" if carried >= grand_total - Decimal("0.005") else ("Partial" if carried > 0 else "Unpaid")

    pi_res = await db.execute(
        text("""
            INSERT INTO caratloop.purchase_invoices (
                company_id, fiscal_year_id, bill_no, vendor_inv_no, vendor_invoice_date, bill_date,
                vendor_id, vendor_gstin, place_of_supply, is_inter_state, attachment_url,
                is_old_gold_purchase, is_rcm_applicable,
                subtotal_value, taxable_value, cgst_amount, sgst_amount, igst_amount,
                rcm_cgst, rcm_sgst, total_gst, grand_total,
                tds_section, tds_rate, tds_base, tds_amount,
                amount_paid, payment_status, status, amends_invoice_id, created_by
            ) VALUES (
                :cid, :fyid, :bill, :vinv, :vdate, :date, :vid, :vgstin, :pos, :inter, :attach,
                :rcm, :rcm,
                :sub, :sub, :cgst, :sgst, :igst, :rcmc, :rcms, :tot_gst, :grand,
                :tds_section, :tds_rate, :tds_base, :tds_amount,
                :paid, :pstatus, 'Posted', CAST(:amends AS UUID), :cb
            ) RETURNING id
        """),
        {
            "cid": company_id,
            "fyid": str(fy["id"]),
            "bill": bill_no,
            "vinv": payload.supplier_invoice_no or f"URD-{payload.invoice_date.strftime('%Y%m%d')}",
            "vdate": payload.vendor_invoice_date or payload.invoice_date,
            "date": payload.invoice_date,
            "vid": str(payload.supplier_id),
            "vgstin": supp_gstin or None,
            "pos": pos,
            "inter": is_inter_state,
            "attach": payload.attachment_url,
            "rcm": payload.is_rcm,
            "sub": taxable,
            "cgst": total_cgst,
            "sgst": total_sgst,
            "igst": total_igst,
            "rcmc": rcm_cgst,
            "rcms": rcm_sgst,
            "tot_gst": totals.total_gst,
            "grand": grand_total,
            "tds_section": tds.section if tds else None,
            "tds_rate": tds.rate if tds else None,
            "tds_base": tds.base if tds else None,
            "tds_amount": tds_amount,
            "paid": carried,
            "pstatus": payment_status,
            "amends": amends_invoice_id,
            "cb": user_id,
        },
    )
    invoice_id = pi_res.scalar()

    loc_id = await resolve_stock_location(db, company_id)
    default_uom_id = await resolve_default_uom(db)

    # ─── Lines and stock ─────────────────────────────────────────────────────
    stock_legs: list[tuple[str, Decimal]] = []   # (stock account id, line value) for the journal
    for seq_idx, item in enumerate(payload.items, start=1):
        gst_rate = priced[seq_idx - 1].gst_rate
        mat_id, line_uom_id, stock_acc, is_service = await _resolve_material(db, company_id, item.material_id, default_uom_id)
        line_mat_val, line_total = _line_values(item)
        stock_legs.append((stock_acc, line_total))

        await db.execute(
            text("""
                INSERT INTO caratloop.purchase_invoice_lines (
                    invoice_id, sequence_no, material_id, hsn_sac_code, description,
                    quantity, uom_id, gross_weight, net_weight, purity, rate,
                    material_value, is_rcm, gst_rate, line_total
                ) VALUES (
                    :pid, :seq, :mid, :hsn, :desc,
                    :qty, :uom, :gw, :nw, :purity, :rate,
                    :mval, :rcm, :gst_rate, :total
                )
            """),
            {
                "pid": invoice_id,
                "seq": seq_idx,
                "mid": mat_id,
                "hsn": item.hsn_code or "71131910",
                "desc": item.description or "Stock Material Purchase",
                "qty": item.quantity,
                "uom": line_uom_id,
                "gw": item.gross_weight or 0.0,
                "nw": item.net_weight or 0.0,
                "purity": item.purity or 1.0,
                "rate": item.rate,
                "mval": line_mat_val,
                "rcm": payload.is_rcm,
                "gst_rate": gst_rate if not is_unregistered else 0.0,
                "total": line_total,
            },
        )

        # A service item (the karigar's making-charge bill) is expensed
        # through the journal below; it never arrives in stock, so no receipt
        # row: one used to be written and showed up as a phantom balance.
        if is_service:
            continue

        await db.execute(
            text("""
                INSERT INTO caratloop.stock_ledger_entries (
                    company_id, fiscal_year_id, entry_date, material_id, location_id, uom_id,
                    transaction_type, quantity, direction, rate, amount, net_weight,
                    source_document_type, source_document_id, source_document_no, sequence_no, created_by
                ) VALUES (
                    :cid, :fyid, :edate, :mid, :locid, :uom,
                    'Purchase_Receipt', :qty, 'I', :rate, :amt, :nw,
                    'PurchaseInvoice', :docid, :docno, NEXTVAL('caratloop.journal_entry_seq'), :cb
                )
            """),
            {
                "cid": company_id,
                "fyid": str(fy["id"]),
                "edate": payload.invoice_date,
                "mid": mat_id,
                "locid": loc_id,
                "uom": line_uom_id,
                "qty": item.quantity or 1.0,
                "rate": item.rate,
                "amt": line_mat_val,
                "nw": item.net_weight or 0.0,
                "docid": invoice_id,
                "docno": bill_no,
                "cb": user_id,
            },
        )

    # ─── Journal ─────────────────────────────────────────────────────────────
    je_no_res = await db.execute(
        text("SELECT 'PUR/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
        {"fy": fy["year_label"]},
    )
    je_no = je_no_res.scalar()

    je_res = await db.execute(
        text("""
            INSERT INTO caratloop.journal_entries (
                company_id, fiscal_year_id, entry_no, entry_date, entry_type,
                narration, reference_no, reference_type, reference_id,
                total_debit, total_credit, sequence_no, created_by
            ) VALUES (
                :cid, :fyid, :eno, :edate, 'Purchase',
                :narration, :refno, 'PurchaseInvoice', :refid,
                :amt, :amt, NEXTVAL('caratloop.journal_entry_seq'), :cb
            ) RETURNING id
        """),
        {
            "cid": company_id,
            "fyid": str(fy["id"]),
            "eno": je_no,
            "edate": payload.invoice_date,
            "narration": (
                f"{'Amended ' if amends_invoice_id else ''}Purchase Voucher {bill_no} from {supplier['name']} "
                f"({'Unregistered' if is_unregistered else 'Registered GST'})"
            ),
            "refno": bill_no,
            "refid": invoice_id,
            "amt": grand_total,
            "cb": user_id,
        },
    )
    je_id = je_res.scalar()

    supp_acc_id = str(supplier.get("account_id")) if supplier.get("account_id") else await _account_id(db, company_id, "CRD-001")

    async def leg(seq: int, account_id: str, dr, cr, narration: str, party_id=None) -> None:
        await db.execute(
            text(
                "INSERT INTO caratloop.journal_entry_lines "
                "(journal_entry_id, sequence_no, account_id, party_id, dr_amount, cr_amount, narration) "
                "VALUES (:jid, :seq, :aid, CAST(:pid AS UUID), :dr, :cr, :narr)"
            ),
            {"jid": je_id, "seq": seq, "aid": account_id, "pid": party_id, "dr": dr, "cr": cr, "narr": narration},
        )

    seq = 1
    for stock_acc, line_total in stock_legs:
        await leg(seq, stock_acc, line_total, 0, "Inward Stock Material")
        seq += 1

    if not is_unregistered:
        for amount, code, narr in (
            (total_cgst, "ITC-001", "ITC CGST Credit"),
            (total_sgst, "ITC-002", "ITC SGST Credit"),
            (total_igst, "ITC-003", "ITC IGST Credit"),
        ):
            if amount > 0:
                await leg(seq, await _account_id(db, company_id, code), amount, 0, narr)
                seq += 1

    await leg(seq, supp_acc_id, 0, grand_total - tds_amount, "Supplier Sundry Creditors Payable", party_id=str(payload.supplier_id))
    seq += 1

    if tds_amount > 0:
        tds_ins = await db.execute(
            text(
                "INSERT INTO caratloop.journal_entry_lines "
                "(journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) "
                "SELECT :jid, :seq, a.id, 0, :cr, 'TDS deducted — s.194Q' "
                "FROM caratloop.accounts a WHERE a.code = 'TDS-194Q' AND a.company_id = :cid"
            ),
            {"jid": je_id, "seq": seq, "cr": tds_amount, "cid": company_id},
        )
        if tds_ins.rowcount == 0:
            raise HTTPException(
                status_code=400,
                detail="Chart of accounts is missing 'TDS-194Q' (TDS payable). Run migration 0007 or create it. No data was saved.",
            )
        seq += 1

    if totals.rcm_applicable and (rcm_cgst + rcm_sgst) > 0:
        await leg(seq, await _account_id(db, company_id, "ITC-004"), rcm_cgst + rcm_sgst, 0, "RCM Self ITC")
        seq += 1
        await leg(seq, await _account_id(db, company_id, "RCM-001"), 0, rcm_cgst, "RCM CGST Liability")
        seq += 1
        await leg(seq, await _account_id(db, company_id, "RCM-002"), 0, rcm_sgst, "RCM SGST Liability")
        seq += 1

        # ─── RCM LIABILITY REGISTER [CGST Rule 56(4)] ───────────────────────
        await _post_rcm_liability(
            db,
            company_id=company_id,
            fiscal_year_id=fy["id"],
            invoice_id=invoice_id,
            invoice_date=payload.invoice_date,
            supplier=supplier,
            supplier_id=payload.supplier_id,
            description=f"Reverse charge on {bill_no} (supplier ref {payload.supplier_invoice_no or '-'})",
            items=payload.items,
            totals=totals,
            journal_entry_id=je_id,
            user_id=user_id,
        )

    # ─── ITC REGISTER POSTING (ONLY REGISTERED SUPPLIERS) ────────────────────
    # vendor_invoice_no is the SUPPLIER'S number: it is what GSTR-2B carries
    # and what the reconciliation matches on. The register used to store our
    # own PI number here, which no supplier filing could ever match.
    if not is_unregistered and not payload.is_rcm and totals.total_gst > 0:
        await db.execute(
            text("""
                INSERT INTO caratloop.itc_register (
                    company_id, fiscal_year_id, return_period,
                    invoice_id, vendor_id, vendor_gstin, vendor_invoice_no,
                    invoice_date, itc_type,
                    igst_credit, cgst_credit, sgst_credit, total_itc,
                    is_eligible, created_by
                ) VALUES (
                    :cid, :fyid, :period,
                    :pid, :vid, :gstin, :inv_no,
                    :inv_date, 'ITC_3B',
                    :igst, :cgst, :sgst, :tot_itc,
                    TRUE, :cb
                )
            """),
            {
                "cid": company_id,
                "fyid": str(fy["id"]),
                "period": payload.invoice_date.strftime("%Y-%m"),
                "pid": str(invoice_id),
                "vid": str(payload.supplier_id),
                "gstin": supp_gstin,
                "inv_no": (payload.supplier_invoice_no or bill_no)[:50],
                "inv_date": payload.invoice_date,
                "igst": total_igst,
                "cgst": total_cgst,
                "sgst": total_sgst,
                "tot_itc": total_cgst + total_sgst + total_igst,
                "cb": user_id,
            },
        )

    if tds is not None:
        await _post_tds_register(
            db, company_id=company_id, fiscal_year_id=fy["id"], tds=tds, supplier=supplier,
            invoice_id=invoice_id, bill_no=bill_no, bill_date=payload.invoice_date, user_id=user_id,
        )

    # Catches the RCM case where ITC debit legs were posted while the
    # supplier credit excluded the tax.
    await assert_journal_balanced(db, je_id, context="purchase invoice journal entry")

    return {"invoice_id": invoice_id, "bill_no": bill_no, "journal_entry_id": je_id, "grand_total": grand_total}


async def _reverse_purchase(
    db: AsyncSession,
    *,
    company_id,
    user_id: str,
    original: Mapping[str, Any],
    reason: str,
) -> dict:
    """Mirror every posted row of ``original`` with a reversing row.

    Dated the original bill's own date, in the original's fiscal year: an
    amendment corrects the period the bill was booked in, and the caller has
    already established that period is open. Nothing is deleted.
    """
    orig_id = str(original["id"])
    bill_no = original["bill_no"]
    narration = f"Reversal of {bill_no} on amendment — {reason}"[:500]

    # ─── Journal: one 'Reversal' entry per posted purchase entry ─────────────
    je_rows = await db.execute(
        text(
            "SELECT je.id, je.entry_date FROM caratloop.journal_entries je "
            "WHERE je.company_id = :cid AND je.reference_type = 'PurchaseInvoice' AND je.reference_id = CAST(:pid AS UUID) "
            "  AND je.entry_type = 'Purchase' AND NOT je.is_reversal "
            "  AND NOT EXISTS (SELECT 1 FROM caratloop.journal_entries r WHERE r.reversal_of_id = je.id) "
            "ORDER BY je.id"
        ),
        {"cid": company_id, "pid": orig_id},
    )
    reversal_je_ids = []
    for je in je_rows.mappings().all():
        no_res = await db.execute(
            text("SELECT 'REV/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
            {"fy": original["year_label"]},
        )
        rev_no = no_res.scalar()
        rev_res = await db.execute(
            text("""
                INSERT INTO caratloop.journal_entries (
                    company_id, fiscal_year_id, entry_no, entry_date, entry_type,
                    narration, reference_no, reference_type, reference_id,
                    total_debit, total_credit, sequence_no, created_by,
                    is_reversal, reversal_of_id, reversal_reason
                )
                SELECT orig.company_id, orig.fiscal_year_id, :rev_no, orig.entry_date, 'Reversal',
                       :narr, orig.reference_no, 'PurchaseInvoice', orig.reference_id,
                       orig.total_credit, orig.total_debit, NEXTVAL('caratloop.journal_entry_seq'), CAST(:cb AS UUID),
                       TRUE, orig.id, :reason
                FROM caratloop.journal_entries orig
                WHERE orig.id = :orig_id
                RETURNING id
            """),
            {"rev_no": rev_no, "narr": narration, "cb": user_id, "reason": reason[:500], "orig_id": je["id"]},
        )
        rev_id = rev_res.scalar()
        # Lines mirrored: debit becomes credit and credit becomes debit.
        await db.execute(
            text("""
                INSERT INTO caratloop.journal_entry_lines (
                    journal_entry_id, sequence_no, account_id, party_id, dr_amount, cr_amount, narration, cost_center_id
                )
                SELECT :rev_id, l.sequence_no, l.account_id, l.party_id, l.cr_amount, l.dr_amount,
                       'Reversal: ' || COALESCE(l.narration, ''), l.cost_center_id
                FROM caratloop.journal_entry_lines l
                WHERE l.journal_entry_id = :orig_id
            """),
            {"rev_id": rev_id, "orig_id": je["id"]},
        )
        await assert_journal_balanced(db, rev_id, context="purchase amendment reversal")
        reversal_je_ids.append(rev_id)

    # ─── Stock: the opposite movement for every receipt ──────────────────────
    stock_res = await db.execute(
        text("""
            INSERT INTO caratloop.stock_ledger_entries (
                company_id, fiscal_year_id, entry_date, material_id, location_id, uom_id, batch_no,
                transaction_type, quantity, direction, rate, amount,
                gross_weight, net_weight, purity, fine_weight,
                source_document_type, source_document_id, source_document_no, remarks,
                sequence_no, created_by, is_reversal, reversal_of_id
            )
            SELECT s.company_id, s.fiscal_year_id, s.entry_date, s.material_id, s.location_id, s.uom_id, s.batch_no,
                   CASE WHEN s.direction = 'I' THEN 'Adjustment_Out' ELSE 'Adjustment_In' END,
                   s.quantity, CASE WHEN s.direction = 'I' THEN 'O' ELSE 'I' END, s.rate, s.amount,
                   s.gross_weight, s.net_weight, s.purity, s.fine_weight,
                   'PurchaseAmendment', s.source_document_id, s.source_document_no, :narr,
                   NEXTVAL('caratloop.journal_entry_seq'), CAST(:cb AS UUID), TRUE, s.id
            FROM caratloop.stock_ledger_entries s
            WHERE s.company_id = :cid AND s.source_document_type = 'PurchaseInvoice'
              AND s.source_document_id = CAST(:pid AS UUID) AND NOT s.is_reversal
              AND NOT EXISTS (SELECT 1 FROM caratloop.stock_ledger_entries r WHERE r.reversal_of_id = s.id)
        """),
        {"cid": company_id, "pid": orig_id, "narr": narration, "cb": user_id},
    )

    # ─── Registers: a reversing row per original row, same amounts, flagged ──
    itc_res = await db.execute(
        text("""
            INSERT INTO caratloop.itc_register (
                company_id, fiscal_year_id, return_period, invoice_id, vendor_invoice_no, invoice_date,
                vendor_id, vendor_gstin, itc_type, igst_credit, cgst_credit, sgst_credit, total_itc,
                is_eligible, ineligibility_reason, is_provisional, created_by, is_reversal, reversal_of_id
            )
            SELECT r.company_id, r.fiscal_year_id, r.return_period, r.invoice_id, r.vendor_invoice_no, r.invoice_date,
                   r.vendor_id, r.vendor_gstin, r.itc_type, r.igst_credit, r.cgst_credit, r.sgst_credit, r.total_itc,
                   r.is_eligible, :narr, r.is_provisional, CAST(:cb AS UUID), TRUE, r.id
            FROM caratloop.itc_register r
            WHERE r.company_id = :cid AND r.invoice_id = CAST(:pid AS UUID) AND NOT r.is_reversal
              AND NOT EXISTS (SELECT 1 FROM caratloop.itc_register x WHERE x.reversal_of_id = r.id)
        """),
        {"cid": company_id, "pid": orig_id, "narr": narration, "cb": user_id},
    )
    rcm_res = await db.execute(
        text("""
            INSERT INTO caratloop.rcm_liability_register (
                company_id, fiscal_year_id, return_period, transaction_date, vendor_id, vendor_name, vendor_pan,
                purchase_invoice_id, description, purchase_value, rcm_rate, igst_rcm, cgst_rcm, sgst_rcm, total_rcm,
                journal_entry_id, remarks, created_by, is_reversal, reversal_of_id
            )
            SELECT r.company_id, r.fiscal_year_id, r.return_period, r.transaction_date, r.vendor_id, r.vendor_name, r.vendor_pan,
                   r.purchase_invoice_id, r.description, r.purchase_value, r.rcm_rate, r.igst_rcm, r.cgst_rcm, r.sgst_rcm, r.total_rcm,
                   :rev_je, :narr, CAST(:cb AS UUID), TRUE, r.id
            FROM caratloop.rcm_liability_register r
            WHERE r.company_id = :cid AND r.purchase_invoice_id = CAST(:pid AS UUID) AND NOT r.is_reversal
              AND NOT EXISTS (SELECT 1 FROM caratloop.rcm_liability_register x WHERE x.reversal_of_id = r.id)
        """),
        {"cid": company_id, "pid": orig_id, "narr": narration, "cb": user_id,
         "rev_je": reversal_je_ids[0] if reversal_je_ids else None},
    )
    tds_res = await db.execute(
        text("""
            INSERT INTO caratloop.tds_tcs_register (
                company_id, fiscal_year_id, kind, section, party_id, document_type, document_id, document_no,
                document_date, base_amount, rate, amount, pan, created_by, is_reversal, reversal_of_id
            )
            SELECT r.company_id, r.fiscal_year_id, r.kind, r.section, r.party_id, r.document_type, r.document_id, r.document_no,
                   r.document_date, r.base_amount, r.rate, r.amount, r.pan, CAST(:cb AS UUID), TRUE, r.id
            FROM caratloop.tds_tcs_register r
            WHERE r.company_id = :cid AND r.document_type = 'PurchaseInvoice'
              AND r.document_id = CAST(:pid AS UUID) AND NOT r.is_reversal
              AND NOT EXISTS (SELECT 1 FROM caratloop.tds_tcs_register x WHERE x.reversal_of_id = r.id)
        """),
        {"cid": company_id, "pid": orig_id, "cb": user_id},
    )

    # ─── The original bill is now history ────────────────────────────────────
    upd = await db.execute(
        text(
            "UPDATE caratloop.purchase_invoices SET status = 'Amended' "
            "WHERE id = CAST(:pid AS UUID) AND company_id = :cid AND status NOT IN ('Cancelled', 'Amended')"
        ),
        {"pid": orig_id, "cid": company_id},
    )
    if upd.rowcount != 1:
        raise HTTPException(status_code=409, detail="That bill has already been amended or cancelled.")

    return {
        "reversal_journal_entry_ids": reversal_je_ids,
        "stock_rows_reversed": stock_res.rowcount,
        "itc_rows_reversed": itc_res.rowcount,
        "rcm_rows_reversed": rcm_res.rowcount,
        "tds_rows_reversed": tds_res.rowcount,
    }


@router.post("/invoices", dependencies=[Depends(require(*CAN_POST))])
async def create_purchase_invoice(
    payload: CreatePurchaseInvoiceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Post Purchase Invoice with Stock Inward Ledger, Party Ledger, and ITC Register entries.
    Handles statutory distinction between Registered Suppliers (ITC Eligible) and Unregistered Dealers (No GST/ITC [CGST Sec 9(4)]).
    """
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        # A bill dated in a locked year (or in no year) is refused before
        # anything is written.
        await assert_period_open(db, company_id, payload.invoice_date, what="This purchase bill")
        fy = await resolve_fiscal_year(db, company_id)
        supplier = await _load_supplier(db, company_id, payload.supplier_id)

        bill_no_res = await db.execute(
            text("SELECT 'PI/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
            {"fy": fy['year_label']}
        )
        bill_no = bill_no_res.scalar()

        posted = await _post_purchase(
            db, company_id=company_id, user_id=user_id, fy=fy, payload=payload,
            supplier=supplier, bill_no=bill_no,
        )

        await db.commit()
        return {"status": "success", "bill_no": bill_no, "id": str(posted["invoice_id"])}

    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to record purchase invoice")
        raise HTTPException(
            status_code=500,
            detail="Failed to record purchase invoice. The operation was rolled back and nothing was saved.",
        ) from e


@router.put("/invoices/{id}", dependencies=[Depends(require(*CAN_AMEND))])
async def update_purchase_invoice(
    id: UUID,
    payload: CreatePurchaseInvoiceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Amend a purchase bill by reversing it and posting the corrected bill.

    The original stays on file with status 'Amended'; the corrected bill is a
    new row with amends_invoice_id pointing back and bill number '<orig>/A<n>'.
    Payments already made against the original carry over to the new bill.
    Returns the new bill's id and number.
    """
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        # Ownership guard: every statement below is addressed by invoice id,
        # so the caller's right to touch it is established up front.
        orig_res = await db.execute(
            text(
                "SELECT pi.id, pi.bill_no, pi.bill_date, pi.status, pi.amount_paid, pi.fiscal_year_id, "
                "       fy.year_label "
                "FROM caratloop.purchase_invoices pi "
                "JOIN caratloop.fiscal_years fy ON fy.id = pi.fiscal_year_id "
                "WHERE pi.id = :id AND pi.company_id = :cid LIMIT 1 FOR UPDATE OF pi"
            ),
            {"id": str(id), "cid": company_id},
        )
        original = orig_res.mappings().first()
        if original is None:
            raise HTTPException(status_code=404, detail="Purchase invoice not found")
        if original["status"] in INACTIVE_STATUSES:
            later = await db.execute(
                text("SELECT bill_no FROM caratloop.purchase_invoices WHERE amends_invoice_id = :id AND company_id = :cid ORDER BY created_at DESC LIMIT 1"),
                {"id": str(id), "cid": company_id},
            )
            newer = later.scalar()
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Bill {original['bill_no']} is {original['status'].lower()}"
                    + (f"; amend {newer} instead." if newer else " and cannot be amended.")
                ),
            )

        # Both periods must be open: the one the original was booked in (its
        # reversal lands there) and the one the corrected bill is dated in.
        await assert_period_open(db, company_id, original["bill_date"], what=f"The bill being amended ({original['bill_no']})")
        await assert_period_open(db, company_id, payload.invoice_date, what="The amended bill")
        fy = await resolve_fiscal_year(db, company_id)
        supplier = await _load_supplier(db, company_id, payload.supplier_id)

        count_res = await db.execute(
            text("SELECT COUNT(*) FROM caratloop.purchase_invoices WHERE company_id = :cid AND bill_no LIKE :pattern"),
            {"cid": company_id, "pattern": root_bill_no(original["bill_no"]) + "/A%"},
        )
        new_bill_no = next_amendment_bill_no(original["bill_no"], count_res.scalar() or 0)

        reversed_rows = await _reverse_purchase(
            db, company_id=company_id, user_id=user_id, original=original, reason=payload.reason,
        )
        posted = await _post_purchase(
            db, company_id=company_id, user_id=user_id, fy=fy, payload=payload,
            supplier=supplier, bill_no=new_bill_no, amends_invoice_id=str(id),
            carried_amount_paid=to_decimal(original["amount_paid"]),
        )

        await db.commit()
        return {
            "status": "success",
            "message": f"Bill {original['bill_no']} reversed and re-posted as {new_bill_no}",
            "id": str(posted["invoice_id"]),
            "bill_no": new_bill_no,
            "amends_invoice_id": str(id),
            "amends_bill_no": original["bill_no"],
            "reversal": {k: (v if not isinstance(v, list) else [str(x) for x in v]) for k, v in reversed_rows.items()},
        }

    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to update purchase invoice")
        raise HTTPException(
            status_code=500,
            detail="Failed to update purchase invoice. The operation was rolled back and nothing was saved.",
        ) from e


@router.get("/invoices")
async def list_purchases(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    supplier_id: Optional[UUID] = None,
    include_amended: bool = True,
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    List purchase invoices with supplier details and embedded item lines.

    Each row carries its place in an amendment chain: ``amends_invoice_id`` /
    ``amends_bill_no`` for the bill it replaced and ``amended_by_bill_no`` for
    the bill that replaced it. Pass include_amended=false for live bills only.
    """
    query = """
        SELECT
            pi.id, pi.bill_no, pi.vendor_inv_no, pi.vendor_invoice_date, pi.bill_date,
            pi.vendor_id, pi.subtotal_value, pi.total_gst, pi.cgst_amount, pi.sgst_amount, pi.igst_amount,
            pi.grand_total, pi.place_of_supply, pi.attachment_url, pi.is_rcm_applicable,
            pi.tds_section, pi.tds_rate, pi.tds_base, pi.tds_amount,
            pi.status, pi.payment_status, pi.amount_paid,
            pi.amends_invoice_id, orig.bill_no AS amends_bill_no,
            newer.id AS amended_by_invoice_id, newer.bill_no AS amended_by_bill_no,
            p.name AS vendor_name, p.trade_name AS vendor_trade_name, p.gstin AS vendor_gstin, p.address_line1, p.city
        FROM caratloop.purchase_invoices pi
        LEFT JOIN caratloop.parties p ON p.id = pi.vendor_id
        LEFT JOIN caratloop.purchase_invoices orig ON orig.id = pi.amends_invoice_id
        LEFT JOIN caratloop.purchase_invoices newer ON newer.amends_invoice_id = pi.id
        WHERE pi.company_id = :cid
    """
    params = {"cid": str(current_user["company_id"])}
    if from_date:
        query += " AND pi.bill_date >= :from_date"
        params["from_date"] = from_date
    if to_date:
        query += " AND pi.bill_date <= :to_date"
        params["to_date"] = to_date
    if supplier_id:
        query += " AND pi.vendor_id = :sid"
        params["sid"] = str(supplier_id)
    if not include_amended:
        query += " AND pi.status <> 'Amended'"

    query += " ORDER BY pi.bill_date DESC, pi.created_at DESC"

    # Bound the result set. These endpoints previously returned the whole
    # table; the sales register returned every invoice ever raised.
    query = page.apply(query)
    params.update(page.params)

    res = await db.execute(text(query), params)
    invoices = [dict(r) for r in res.mappings().all()]

    for inv in invoices:
        items_res = await db.execute(
            text("""
                SELECT pil.*, m.name AS material_name, m.code AS material_code, COALESCE(u.code, 'gm') AS unit
                FROM caratloop.purchase_invoice_lines pil
                LEFT JOIN caratloop.materials m ON m.id = pil.material_id
                LEFT JOIN caratloop.units_of_measure u ON u.id = m.uom_id
                WHERE pil.invoice_id = :pid
            """),
            {"pid": str(inv["id"])}
        )
        inv["items"] = [dict(i) for i in items_res.mappings().all()]

    return invoices


@router.get("/invoices/{id}")
async def get_purchase(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    Fetch single purchase invoice detail, with its amendment chain.

    ``chain`` lists every bill sharing this one's root number, oldest first,
    so the screen can show 'PI/.../00007 -> /A1 -> /A2' whichever link was
    opened.
    """
    res = await db.execute(
        text("""
            SELECT
                pi.*,
                orig.bill_no AS amends_bill_no,
                newer.id AS amended_by_invoice_id, newer.bill_no AS amended_by_bill_no,
                p.name AS vendor_name, p.gstin AS vendor_gstin, p.address_line1, p.city
            FROM caratloop.purchase_invoices pi
            LEFT JOIN caratloop.parties p ON p.id = pi.vendor_id
            LEFT JOIN caratloop.purchase_invoices orig ON orig.id = pi.amends_invoice_id
            LEFT JOIN caratloop.purchase_invoices newer ON newer.amends_invoice_id = pi.id
            WHERE pi.id = :id AND pi.company_id = :cid
        """),
        {"id": str(id), "cid": str(current_user["company_id"])}
    )
    inv = res.mappings().first()
    if not inv:
        raise HTTPException(status_code=404, detail="Purchase invoice not found")

    items_res = await db.execute(
        text("""
            SELECT pil.*, m.name AS material_name, m.code AS material_code, COALESCE(u.code, 'gm') AS unit
            FROM caratloop.purchase_invoice_lines pil
            LEFT JOIN caratloop.materials m ON m.id = pil.material_id
            LEFT JOIN caratloop.units_of_measure u ON u.id = m.uom_id
            WHERE pil.invoice_id = :pid
        """),
        {"pid": str(id)}
    )

    chain_res = await db.execute(
        text(
            "SELECT id, bill_no, bill_date, status, grand_total, amends_invoice_id, created_at "
            "FROM caratloop.purchase_invoices "
            "WHERE company_id = :cid AND (bill_no = :root OR bill_no LIKE :pattern) "
            "ORDER BY created_at"
        ),
        {"cid": str(current_user["company_id"]), "root": root_bill_no(inv["bill_no"]), "pattern": root_bill_no(inv["bill_no"]) + "/A%"},
    )

    inv_dict = dict(inv)
    inv_dict["items"] = [dict(i) for i in items_res.mappings().all()]
    inv_dict["chain"] = [dict(c) for c in chain_res.mappings().all()]
    return inv_dict
