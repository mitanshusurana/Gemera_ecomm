"""
Caratloop ERP — Sales Invoice API
[CGST Rule 56(4)] Dual-rate GST: 3% material + 5% making charges
[CGST Rule 56(2)] Stock ledger update on sale
[S44AA] Double-entry: Dr Customer / Cr Sales + GST Output
[MCA-11g] Append-only, immutable audit trail
"""
import logging
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel, Field, model_validator

from app.core.database import get_db, set_audit_context
from app.core.costing import (
    cost_of_goods_sold,
    account_id_for_code,
    resolve_stock_account,
)
from app.core.ledger import assert_journal_balanced
from app.core.money import to_decimal
from app.core.stock import assert_stock_available
from app.core.roles import CAN_AMEND, CAN_POST, require
from app.core.pagination import Page, paginate
from app.core.security import get_current_user
from app.tax.gst_engine import calculate_jewelry_gst, get_return_period
from app.tax.job_work import JOB_WORK_SAC
from app.core.config import settings
from app.core.tenancy import resolve_default_uom, resolve_fiscal_year, resolve_stock_location
from app.tax.gstin import is_gstin_shaped

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Sales"])


def _as_uuid(value) -> str | None:
    """The value if it is a UUID, else None -- so a material CODE can be
    compared against the code column without first failing the uuid cast."""
    try:
        return str(UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        return None


class InvoiceLineRequest(BaseModel):
    """Money and quantities are Decimal end to end.

    Every corresponding column is NUMERIC in Postgres. Accepting float here
    meant a value arrived as its binary expansion before any arithmetic ran.
    Pydantic coerces an incoming JSON number to Decimal via its string form,
    so the exact decimal the client sent is preserved.
    """

    product_id: Optional[UUID] = None
    material_id: Optional[UUID] = None
    hsn_sac_code: Optional[str] = None       # Falls back to the item master
    description: Optional[str] = None
    quantity: Decimal = Field(default=Decimal("1"), ge=0)
    gross_weight: Optional[Decimal] = Field(default=None, ge=0)
    net_weight: Optional[Decimal] = Field(default=None, ge=0)
    stone_weight: Optional[Decimal] = Field(default=None, ge=0)
    gold_weight: Optional[Decimal] = Field(default=None, ge=0)
    # Purity is a fraction (0.916), not millesimal (916): fine weight is
    # net weight times purity. The DB CHECK enforces the same bound.
    purity: Optional[Decimal] = Field(default=None, gt=0, le=1)
    material_value: Decimal = Field(default=Decimal("0"), ge=0)
    making_charges: Decimal = Field(default=Decimal("0"), ge=0)
    other_charges: Decimal = Field(default=Decimal("0"), ge=0)
    # Above 100 produced a negative taxable value and negative tax.
    discount_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)

    @model_validator(mode="after")
    def _net_not_more_than_gross(self):
        if (
            self.gross_weight is not None
            and self.net_weight is not None
            and self.net_weight > self.gross_weight
        ):
            raise ValueError("net_weight cannot exceed gross_weight")
        return self


class CreateSalesInvoiceRequest(BaseModel):
    customer_id: UUID
    invoice_date: date
    # No default. Defaulting to the seller's own state charged CGST+SGST on
    # genuinely inter-state supplies whenever the client omitted the field.
    # When absent, the customer's registered state is used instead.
    place_of_supply: Optional[str] = None
    lines: List[InvoiceLineRequest]
    payment_terms: Optional[str] = "Immediate"
    narration: Optional[str] = None
    reason: str = "Sales invoice creation"


@router.post("/invoices", dependencies=[Depends(require(*CAN_POST))])
async def create_sales_invoice(
    payload: CreateSalesInvoiceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Create a sales invoice with dual-rate GST calculation.

    [CGST Rule 56(4)] GST computation:
      - Material value (gold + gems): HSN 7113 → 3% GST
      - Making charges (labor/artisan): SAC 9988 → 5% GST
      - Intra-state (Rajasthan buyer): CGST 1.5% + SGST 1.5% on material
                                       CGST 2.5% + SGST 2.5% on making
      - Inter-state: IGST 3% on material, IGST 5% on making

    Posts:
      1. Sales invoice record
      2. [CGST-R56-4] GST output tax register entry
      3. [CGST-R56-2] Stock outward ledger entry per line
      4. [S44AA] Double-entry journal:
           Dr. Customer A/c (grand total)
           Cr. Gold Jewelry Sales A/c (material value)
           Cr. Making Charges Income A/c (making charges)
           Cr. CGST Output A/c
           Cr. SGST Output A/c (or IGST Output A/c)
    """
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    # Fetch customer details to determine inter/intra state
    cust_result = await db.execute(
        text("SELECT * FROM caratloop.parties WHERE id = :id AND company_id = :cid"),
        {"id": str(payload.customer_id), "cid": company_id},
    )
    customer = cust_result.mappings().first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # Determine inter-state vs intra-state.
    # Precedence: an explicit place of supply, else the customer's registered
    # state. Falling back to the seller's state would silently mis-classify the
    # supply and send the wrong tax to the wrong government.
    buyer_state = (payload.place_of_supply or customer.get("state_code") or "").strip()
    if not buyer_state:
        raise HTTPException(
            status_code=400,
            detail=(
                "Place of supply could not be determined: the customer has no "
                "registered state and none was supplied. Set the customer's state "
                "or pass place_of_supply explicitly."
            ),
        )
    seller_state = settings.COMPANY_STATE_CODE

    # [MCA-11g] Set audit context
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    # ─── Compute line-level GST ───────────────────────────────────────────────
    total_material = Decimal("0")
    total_making = Decimal("0")
    total_other = Decimal("0")
    total_igst_mat = Decimal("0")
    total_igst_mak = Decimal("0")
    total_cgst_mat = Decimal("0")
    total_sgst_mat = Decimal("0")
    total_cgst_mak = Decimal("0")
    total_sgst_mak = Decimal("0")

    computed_lines = []
    for line in payload.lines:
        mat_gst_rate = Decimal("3.0")
        mat_hsn = line.hsn_sac_code or ""
        mat_row_id = None
        mat_uom_id = None
        if line.material_id:
            m_res = await db.execute(
                text(
                    "SELECT id, uom_id, gst_tax_rate, hsn_code FROM caratloop.materials "
                    "WHERE company_id = :cid AND (id = CAST(:mid AS UUID) OR code = :mcode) LIMIT 1"
                ),
                {"cid": company_id, "mid": _as_uuid(line.material_id), "mcode": str(line.material_id)}
            )
            m_row = m_res.mappings().first()
            if m_row:
                mat_row_id = m_row["id"]
                mat_uom_id = m_row["uom_id"]
                # Keep as Decimal: the engine accepts it natively now.
                mat_gst_rate = (
                    m_row["gst_tax_rate"] if m_row["gst_tax_rate"] is not None
                    else Decimal("3.0")
                )
                mat_hsn = m_row["hsn_code"] or mat_hsn

        # Rule 46(g): every line on a tax invoice carries its HSN. Refuse now
        # rather than write a line the document cannot lawfully print.
        if not str(mat_hsn).strip():
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Line {len(computed_lines) + 1} has no HSN/SAC code and the item master "
                    "does not supply one. Set hsn_code on the material or pass hsn_sac_code on the line."
                ),
            )

        taxable_mat = line.material_value * (1 - line.discount_pct / 100)
        taxable_mak = line.making_charges * (1 - line.discount_pct / 100)

        # Pass Decimal straight through. Casting to float here meant a
        # discounted value such as 66666.66666666667 was taxed as its binary
        # expansion rather than the exact decimal.
        gst = calculate_jewelry_gst(
            material_value=taxable_mat,
            making_charges=taxable_mak,
            seller_state_code=seller_state,
            buyer_state_code=buyer_state,
            material_gst_rate=mat_gst_rate,
        )

        line_total = (taxable_mat + taxable_mak + line.other_charges
                      + gst.total_gst)

        total_material += taxable_mat
        total_making += taxable_mak
        total_other += line.other_charges
        total_igst_mat += gst.igst_material
        total_igst_mak += gst.igst_making
        total_cgst_mat += gst.cgst_material
        total_sgst_mat += gst.sgst_material
        total_cgst_mak += gst.cgst_making
        total_sgst_mak += gst.sgst_making

        computed_lines.append({
            "line": line,
            "gst": gst,
            "mat_gst_rate": mat_gst_rate,
            "mat_hsn": mat_hsn,
            "mat_id": mat_row_id,
            "uom_id": mat_uom_id,
            "taxable_mat": taxable_mat,
            "taxable_mak": taxable_mak,
            "line_total": line_total,
        })

    total_gst = total_igst_mat + total_igst_mak + total_cgst_mat + total_sgst_mat + total_cgst_mak + total_sgst_mak
    grand_total = total_material + total_making + total_other + total_gst

    try:
        # ─── Generate invoice number ──────────────────────────────────────────
        fy = await resolve_fiscal_year(db, company_id)

        # Atomic allocation. COUNT(*)+1 raced across workers and minted
        # duplicate invoice numbers.
        inv_count_result = await db.execute(
            text("SELECT caratloop.next_document_number(:cid, :fyid, 'SalesInvoice')"),
            {"cid": company_id, "fyid": str(fy["id"])},
        )
        inv_count = inv_count_result.scalar()
        invoice_no = f"CL/{fy['year_label']}/{inv_count:05d}"

        inv_date_obj = date.fromisoformat(str(payload.invoice_date)) if isinstance(payload.invoice_date, str) else payload.invoice_date
        is_inter_state = buyer_state != seller_state
        inv_result = await db.execute(
            text("""
                INSERT INTO caratloop.sales_invoices (
                    company_id, fiscal_year_id, invoice_no, invoice_date,
                    customer_id, customer_gstin, customer_state_code,
                    place_of_supply, is_inter_state,
                    subtotal_material_value, subtotal_making_charges, subtotal_other_charges,
                    taxable_material_value, taxable_making_value,
                    igst_material, igst_making,
                    cgst_material, sgst_material, cgst_making, sgst_making,
                    total_gst, grand_total,
                    payment_terms,
                    narration, status, created_by
                ) VALUES (
                    :cid, :fyid, :inv_no, :inv_date,
                    :cust_id, :cust_gstin, :cust_state,
                    :pos, :is_inter,
                    :mat_val, :mak_val, :other_val,
                    :mat_val, :mak_val,
                    :igst_mat, :igst_mak,
                    :cgst_mat, :sgst_mat, :cgst_mak, :sgst_mak,
                    :total_gst, :grand_total,
                    :payment_terms,
                    :narration, 'Posted', :created_by
                )
                RETURNING id
            """),
            {
                "cid": company_id,
                "fyid": str(fy["id"]),
                "inv_no": invoice_no,
                "inv_date": inv_date_obj,
                "cust_id": str(payload.customer_id),
                "cust_gstin": customer["gstin"],
                "cust_state": buyer_state,
                "pos": buyer_state,
                "is_inter": is_inter_state,
                "mat_val": total_material,
                "mak_val": total_making,
                "other_val": total_other,
                "igst_mat": total_igst_mat,
                "igst_mak": total_igst_mak,
                "cgst_mat": total_cgst_mat,
                "sgst_mat": total_sgst_mat,
                "cgst_mak": total_cgst_mak,
                "sgst_mak": total_sgst_mak,
                "total_gst": total_gst,
                "grand_total": grand_total,
                "payment_terms": payload.payment_terms,
                "narration": payload.narration,
                "created_by": user_id,
            },
        )
        invoice_id = inv_result.scalar()

        # ─── Invoice lines ────────────────────────────────────────────────────
        # Nothing wrote these. The header, the stock ledger, the GST register
        # and the journal were all posted per line, and the lines themselves
        # were then discarded -- so no invoice could be printed with what it
        # actually sold, and the print component invented a single line from
        # the totals. Rule 46(g)-(h) require the HSN and description of each
        # item; the line record is the invoice.
        default_uom = None
        for seq, cl in enumerate(computed_lines, 1):
            line = cl["line"]
            uom_id = cl["uom_id"]
            if uom_id is None:
                if default_uom is None:
                    default_uom = await resolve_default_uom(db)
                uom_id = default_uom
            g = cl["gst"]
            disc_amt = (line.material_value + line.making_charges) * (line.discount_pct / 100)
            await db.execute(
                text("""
                    INSERT INTO caratloop.sales_invoice_lines (
                        invoice_id, sequence_no, product_id, material_id,
                        hsn_sac_code, description, quantity, uom_id,
                        gross_weight, net_weight, stone_weight, gold_weight, purity,
                        material_value, making_charges, other_charges,
                        discount_pct, discount_amount,
                        taxable_material, taxable_making,
                        material_gst_rate, making_gst_rate,
                        igst_material, igst_making, cgst_material, sgst_material,
                        cgst_making, sgst_making, line_total
                    ) VALUES (
                        :inv_id, :seq, :product_id, :material_id,
                        :hsn, :descr, :qty, :uom_id,
                        :gw, :nw, :sw, :gldw, :purity,
                        :mat_val, :mak_chg, :oth_chg,
                        :disc_pct, :disc_amt,
                        :tax_mat, :tax_mak,
                        :mat_rate, :mak_rate,
                        :igst_m, :igst_k, :cgst_m, :sgst_m,
                        :cgst_k, :sgst_k, :line_total
                    )
                """),
                {
                    "inv_id": invoice_id,
                    "seq": seq,
                    "product_id": str(line.product_id) if line.product_id else None,
                    "material_id": str(cl["mat_id"]) if cl["mat_id"] else None,
                    "hsn": cl["mat_hsn"],
                    "descr": line.description,
                    "qty": line.quantity,
                    "uom_id": str(uom_id),
                    "gw": line.gross_weight,
                    "nw": line.net_weight,
                    "sw": line.stone_weight,
                    "gldw": line.gold_weight,
                    "purity": line.purity,
                    "mat_val": line.material_value,
                    "mak_chg": line.making_charges,
                    "oth_chg": line.other_charges,
                    "disc_pct": line.discount_pct,
                    "disc_amt": disc_amt,
                    "tax_mat": cl["taxable_mat"],
                    "tax_mak": cl["taxable_mak"],
                    "mat_rate": cl["mat_gst_rate"],
                    "mak_rate": Decimal("5.00"),
                    "igst_m": g.igst_material, "igst_k": g.igst_making,
                    "cgst_m": g.cgst_material, "sgst_m": g.sgst_material,
                    "cgst_k": g.cgst_making, "sgst_k": g.sgst_making,
                    "line_total": cl["line_total"],
                },
            )

        # ─── Post Stock Ledger Entries Outward [CGST-R56-2] ──────────────────────
        # LIMIT 1 with no ORDER BY returned whatever the heap gave, so the
        # availability check below ran against an arbitrary location: a sale of
        # stock sitting in the vault was refused because the query happened to
        # pick the karigar's workshop, where the balance is zero.
        loc_id = await resolve_stock_location(db, company_id)

        # Cost of goods sold, accumulated per stock account so the journal can
        # relieve each one correctly.
        cogs_by_account: dict[str, Decimal] = {}
        total_cogs = Decimal("0")

        for cl in computed_lines:
            line = cl["line"]
            mat_res = await db.execute(
                text("SELECT id FROM caratloop.materials WHERE (id = :mid OR code = :mcode) AND company_id = :cid LIMIT 1"),
                {"mid": str(line.material_id) if line.material_id else None, "mcode": str(line.material_id), "cid": company_id}
            )
            mat_id = mat_res.scalar()
            if mat_id and loc_id:
                # Refuse to ship stock that is not there. Nothing checked this,
                # so the ledger could go negative on a sale.
                await assert_stock_available(
                    db, company_id, mat_id, line.quantity,
                    location_id=loc_id,
                    context=f"invoice {invoice_no}",
                    material_label=str(line.material_id),
                )

                # Weighted average cost at the moment of issue.
                line_cogs = await cost_of_goods_sold(
                    db, company_id, mat_id, line.quantity
                )
                if line_cogs > 0:
                    stock_acc = await resolve_stock_account(db, company_id, mat_id)
                    if not stock_acc:
                        # Skipping would debit COGS with nothing to credit, and
                        # the balance invariant would then reject the whole
                        # invoice with an opaque difference. Name the cause.
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                f"Material {line.material_id} has no stock account and "
                                "its category has no default. Set one before selling it. "
                                "No data was saved."
                            ),
                        )
                    total_cogs += line_cogs
                    cogs_by_account[stock_acc] = (
                        cogs_by_account.get(stock_acc, Decimal("0")) + line_cogs
                    )
                await db.execute(
                    text("""
                        INSERT INTO caratloop.stock_ledger_entries (
                            company_id, fiscal_year_id, location_id, material_id, entry_date,
                            direction, transaction_type, quantity, amount, gross_weight, net_weight,
                            source_document_type, source_document_id, source_document_no, sequence_no, created_by
                        ) VALUES (
                            :cid, :fyid, :loc_id, :mat_id, :entry_date,
                            'O', 'Sale_Delivery', :qty, :amt, :gw, :nw,
                            'SalesInvoice', :inv_id, :inv_no, COALESCE((SELECT MAX(sequence_no) FROM caratloop.stock_ledger_entries), 0) + 1, CAST(:created_by AS UUID)
                        )
                    """),
                    {
                        "cid": company_id,
                        "fyid": str(fy["id"]),
                        "loc_id": loc_id,
                        "mat_id": mat_id,
                        "entry_date": inv_date_obj,
                        "qty": line.quantity,
                        # Cost, not the sale value. Recording line_total here
                        # (tax inclusive) fed margin and GST back into the
                        # weighted average this very function reads.
                        "amt": line_cogs,
                        "gw": line.gross_weight if line.gross_weight else 0.0,
                        "nw": line.net_weight if line.net_weight else 0.0,
                        "inv_id": invoice_id,
                        "inv_no": invoice_no,
                        "created_by": user_id
                    }
                )

        # ─── Post to GST Output Tax Register [CGST-R56-4] ────────────────────
        return_period = get_return_period(payload.invoice_date)
        # B2B declares the buyer holds a GST registration and routes the
        # invoice into GSTR-1 Table 4 against their GSTIN. Any non-empty
        # string used to qualify, "Unregistered" included.
        supply_type = "B2B" if is_gstin_shaped(customer.get("gstin")) else "B2C_Large"
        await db.execute(
            text("""
                INSERT INTO caratloop.gst_output_tax_register (
                    company_id, fiscal_year_id, return_period,
                    invoice_id, invoice_no, invoice_date,
                    party_id, party_gstin, place_of_supply, is_inter_state, supply_type,
                    hsn_material, hsn_making,
                    taxable_material_value, material_gst_rate,
                    taxable_making_value, making_gst_rate,
                    igst_amount, cgst_amount, sgst_amount, total_tax,
                    created_by
                ) VALUES (
                    :cid, :fyid, :period,
                    :inv_id, :inv_no, :inv_date,
                    :party_id, :party_gstin, :pos, :is_inter, :supply_type,
                    :mat_hsn, :making_sac,
                    :mat_val, :mat_gst_rate,
                    :mak_val, 5.00,
                    :igst, :cgst, :sgst, :total_gst,
                    :created_by
                )
            """),
            {
                "cid": company_id,
                "fyid": str(fy["id"]),
                "period": return_period,
                "inv_id": invoice_id,
                "inv_no": invoice_no,
                "inv_date": inv_date_obj,
                "party_id": str(payload.customer_id),
                "party_gstin": customer.get("gstin"),
                "pos": buyer_state,
                "is_inter": is_inter_state,
                "supply_type": supply_type,
                # Whatever the line actually carries; no jewellery-code default.
                "mat_hsn": computed_lines[0]["mat_hsn"] if computed_lines else "",
                # SAC for the making-charges half. Shared with job work so the
                # two cannot drift; it was hardcoded here as 998821, the
                # textile code.
                "making_sac": JOB_WORK_SAC,
                "mat_val": total_material,
                "mat_gst_rate": computed_lines[0]["mat_gst_rate"] if computed_lines else Decimal("3.0"),
                "mak_val": total_making,
                "igst": total_igst_mat + total_igst_mak,
                "cgst": total_cgst_mat + total_cgst_mak,
                "sgst": total_sgst_mat + total_sgst_mak,
                "total_gst": total_gst,
                "created_by": user_id
            }
        )

        # ─── Post Journal Entry [S44AA] [DENTRY] ─────────────────────────────
        je_no_result = await db.execute(
            text("SELECT 'JV/' || :fy_label || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
            {"fy_label": fy["year_label"]},
        )
        je_no = je_no_result.scalar()

        je_result = await db.execute(
            text("""
                INSERT INTO caratloop.journal_entries (
                    company_id, fiscal_year_id, entry_no, entry_date, entry_type,
                    narration, reference_no, reference_type, reference_id,
                    total_debit, total_credit, created_by, ip_address, session_id, sequence_no
                ) VALUES (
                    :cid, :fyid, :je_no, :entry_date, 'Sales',
                    'Sales Invoice ' || :inv_no || ' — ' || :cust_name,
                    :inv_no, 'SalesInvoice', :inv_id,
                    :grand_total, :grand_total,
                    :created_by, CAST(:ip AS INET), :session_id,
                    nextval('caratloop.journal_entry_seq')
                ) RETURNING id, entry_uuid
            """),
            {
                "cid": company_id,
                "fyid": str(fy["id"]),
                "je_no": je_no,
                "entry_date": inv_date_obj,
                "inv_no": invoice_no,
                "cust_name": customer["name"],
                "inv_id": invoice_id,
                "grand_total": grand_total,
                "created_by": user_id,
                "ip": ip_address,
                "session_id": int(session_id) if str(session_id).isdigit() and int(session_id) > 0 else None,
            },
        )
        row = je_result.mappings().first()
        je_id = row["id"]
        je_uuid = row["entry_uuid"]

        # 1. Dr. Customer Account (using customer's specific ledger account_id)
        cust_acc_id = customer.get("account_id")
        if not cust_acc_id:
            # Lookup by party relationship
            acc_res = await db.execute(
                text("SELECT account_id FROM caratloop.parties WHERE id = :cid LIMIT 1"),
                {"cid": str(payload.customer_id)}
            )
            cust_acc_id = acc_res.scalar()
        if not cust_acc_id:
            raise HTTPException(status_code=400, detail="Customer ledger account not configured. Please add the customer to party master first.")

        await db.execute(
            text("""
                INSERT INTO caratloop.journal_entry_lines
                    (journal_entry_id, sequence_no, account_id, party_id, dr_amount, cr_amount, narration)
                VALUES (:je_id, 1, :acc_id, :party_id, :dr, 0, :narr)
            """),
            {
                "je_id": je_id,
                "acc_id": cust_acc_id,
                "party_id": str(payload.customer_id),
                "dr": grand_total,
                "narr": f"Customer — {customer['name']}"
            }
        )

        # 2. Cr. Sales & GST Output Accounts
        #
        # other_charges is included in grand_total and therefore in the customer
        # debit above, so it must be credited to an income account. It was
        # omitted entirely, leaving every invoice carrying other charges out of
        # balance by exactly that amount.
        credit_lines = [
            ("SAL-001", total_material, "Gold/Gem material sales"),
            ("SAL-003", total_making, "Making charges income"),
            # SAL-004 is "Scrap / Polishing Dust Sales" in the chart of accounts;
            # other charges get their own code rather than polluting scrap revenue.
            ("SAL-005", total_other, "Other charges"),
        ]
        if is_inter_state:
            credit_lines.extend([
                ("GST-005", total_igst_mat, "IGST Output — Material 3%"),
                ("GST-006", total_igst_mak, "IGST Output — Making 5%"),
            ])
        else:
            credit_lines.extend([
                ("GST-001", total_cgst_mat, "CGST Output — Material 1.5%"),
                ("GST-002", total_sgst_mat, "SGST Output — Material 1.5%"),
                ("GST-003", total_cgst_mak, "CGST Output — Making 2.5%"),
                ("GST-004", total_sgst_mak, "SGST Output — Making 2.5%"),
            ])

        seq = 2
        for acc_code, cr_val, narr in credit_lines:
            if cr_val <= 0:
                continue
            result = await db.execute(
                text("""
                    INSERT INTO caratloop.journal_entry_lines
                        (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration)
                    SELECT :je_id, :seq, a.id, 0, :cr, :narr
                    FROM caratloop.accounts a
                    WHERE a.code = :code AND a.company_id = :cid
                """),
                {"je_id": je_id, "seq": seq, "cr": cr_val, "narr": narr, "code": acc_code, "cid": company_id},
            )
            # INSERT...SELECT inserts zero rows and raises nothing when the
            # account code is absent. Say which code is missing rather than
            # letting the balance check report an opaque difference later.
            if result.rowcount == 0:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Chart of accounts is missing '{acc_code}' ({narr}). "
                        "Create it before raising this invoice. No data was saved."
                    ),
                )
            seq += 1

        # ─── Cost of goods sold ──────────────────────────────────────────────
        # Dr COGS / Cr Stock, relieving each stock account by the cost of what
        # left it. Without this the sale recognised revenue while inventory
        # stayed on the balance sheet, so gross profit equalled revenue.
        if total_cogs > 0:
            cogs_acc = await account_id_for_code(db, company_id, "COGS-001")
            if not cogs_acc:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Chart of accounts is missing 'COGS-001' (Cost of Goods "
                        "Sold). Create it before raising this invoice. "
                        "No data was saved."
                    ),
                )

            await db.execute(
                text(
                    "INSERT INTO caratloop.journal_entry_lines "
                    "(journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) "
                    "VALUES (:je_id, :seq, :aid, :dr, 0, :narr)"
                ),
                {
                    "je_id": je_id, "seq": seq, "aid": cogs_acc,
                    "dr": total_cogs,
                    "narr": f"Cost of goods sold — {invoice_no}",
                },
            )
            seq += 1

            for stock_acc, amount in cogs_by_account.items():
                await db.execute(
                    text(
                        "INSERT INTO caratloop.journal_entry_lines "
                        "(journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) "
                        "VALUES (:je_id, :seq, :aid, 0, :cr, :narr)"
                    ),
                    {
                        "je_id": je_id, "seq": seq, "aid": stock_acc,
                        "cr": amount,
                        "narr": f"Stock relieved at cost — {invoice_no}",
                    },
                )
                seq += 1

        # Update invoice with journal entry UUID reference
        await db.execute(
            text("UPDATE caratloop.sales_invoices SET journal_entry_id = :je_uuid WHERE id = :inv_id"),
            {"je_uuid": str(je_uuid), "inv_id": invoice_id},
        )

        # Double-entry invariant. Catches, among others, the case where
        # other_charges is debited to the customer but credited to no account.
        # je_id, not je_uuid: journal_entry_lines references the bigint id.
        # entry_uuid is the stable external reference stored on the invoice.
        await assert_journal_balanced(db, je_id, context="sales invoice journal entry")

        await db.commit()

        return {
            "status": "success",
            "invoice_no": invoice_no,
            "invoice_id": invoice_id,
            "journal_entry_no": je_no,
            "is_inter_state": is_inter_state,
            "tax_summary": {
                "material_value": float(total_material),
                "making_charges": float(total_making),
                "total_igst": float(total_igst_mat + total_igst_mak),
                "total_cgst": float(total_cgst_mat + total_cgst_mak),
                "total_sgst": float(total_sgst_mat + total_sgst_mak),
                "total_gst": float(total_gst),
                "grand_total": float(grand_total),
            },
            "compliance": {
                "cgst_rule_56_4": "Posted to GST output tax register",
                "section_44aa": f"Journal entry {je_no} posted",
                "mca_rule_11g": "Audit trail recorded",
            },
        }

    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Invoice creation failed")
        raise HTTPException(
            status_code=500,
            detail="Invoice creation failed. The operation was rolled back and nothing was saved.",
        ) from e


@router.get("/invoices")
async def list_sales_invoices(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    customer_id: Optional[UUID] = None,
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List sales invoices — Sales Register [S44AA]."""
    query = """
        SELECT
            si.id, si.invoice_no, si.invoice_date, si.status, si.payment_status,
            p.name AS customer_name, p.trade_name AS customer_trade_name, p.gstin AS customer_gstin,
            p.pan AS customer_pan, p.address_line1 AS customer_address1, p.address_line2 AS customer_address2,
            p.city AS customer_city, p.state_name AS customer_state_name, p.state_code AS customer_state_code,
            p.pincode AS customer_pincode, p.phone AS customer_phone, p.email AS customer_email,
            si.is_inter_state, si.place_of_supply,
            si.subtotal_material_value, si.subtotal_making_charges,
            si.total_gst, si.grand_total
        FROM caratloop.sales_invoices si
        JOIN caratloop.parties p ON p.id = si.customer_id
        WHERE si.company_id = :cid
    """
    params = {"cid": current_user["company_id"]}
    if from_date:
        query += " AND si.invoice_date >= :from_date"
        params["from_date"] = from_date
    if to_date:
        query += " AND si.invoice_date <= :to_date"
        params["to_date"] = to_date
    if customer_id:
        query += " AND si.customer_id = :cust_id"
        params["cust_id"] = str(customer_id)
    query += " ORDER BY si.invoice_date DESC"

    # Bound the result set. These endpoints previously returned the whole
    # table; the sales register returned every invoice ever raised.
    query = page.apply(query)
    params.update(page.params)

    result = await db.execute(text(query), params)
    return {"invoices": [dict(r) for r in result.mappings().all()]}


@router.get("/invoices/{invoice_id}")
async def get_sales_invoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """One invoice with its lines, its buyer and its seller.

    There was no detail endpoint. The register listed invoices without their
    lines, the print component received a register row, and -- finding no
    lines -- it synthesised ONE from the header totals: description "22K Gold
    Jewelry / Material", HSN blank, rates 3% and 5%. Every printed tax invoice
    therefore showed a single invented line. CGST Rule 46(g) requires the HSN
    and (h) the description of each item supplied; a two-line invoice printed
    as one made-up line is not the invoice that was issued.

    The seller block is included so the print does not depend on a second
    request, and so a PDF rendered server-side later has the same shape.
    """
    cid = str(current_user["company_id"])

    head = await db.execute(
        text("""
            SELECT
                si.id, si.invoice_no, si.invoice_date, si.invoice_type, si.status,
                si.payment_status, si.amount_paid, si.due_date, si.payment_terms,
                si.narration, si.is_inter_state, si.place_of_supply,
                si.subtotal_material_value, si.subtotal_making_charges,
                si.subtotal_other_charges, si.discount_amount,
                si.taxable_material_value, si.taxable_making_value,
                si.igst_material, si.igst_making, si.cgst_material, si.sgst_material,
                si.cgst_making, si.sgst_making, si.total_gst, si.round_off,
                si.grand_total, si.amount_in_words,
                si.e_invoice_irn, si.e_invoice_ack_no, si.e_invoice_ack_date,
                si.e_invoice_status, si.eway_bill_no, si.eway_bill_date,
                p.id AS customer_id, p.name AS customer_name, p.trade_name AS customer_trade_name,
                p.gstin AS customer_gstin, p.pan AS customer_pan,
                p.address_line1 AS customer_address1, p.address_line2 AS customer_address2,
                p.city AS customer_city, p.state_name AS customer_state_name,
                p.state_code AS customer_state_code, p.pincode AS customer_pincode,
                p.phone AS customer_phone, p.email AS customer_email
            FROM caratloop.sales_invoices si
            JOIN caratloop.parties p ON p.id = si.customer_id
            WHERE si.id = :id AND si.company_id = :cid
        """),
        {"id": str(invoice_id), "cid": cid},
    )
    inv = head.mappings().first()
    if inv is None:
        raise HTTPException(status_code=404, detail="Invoice not found")

    lines = await db.execute(
        text("""
            SELECT
                l.id, l.sequence_no, l.description, l.hsn_sac_code,
                l.quantity, u.code AS uom, l.gross_weight, l.net_weight,
                l.stone_weight, l.gold_weight, l.purity, l.rate,
                l.material_value, l.making_charges, l.other_charges,
                l.discount_pct, l.discount_amount,
                l.taxable_material, l.taxable_making,
                l.material_gst_rate, l.making_gst_rate,
                l.igst_material, l.igst_making, l.cgst_material, l.sgst_material,
                l.cgst_making, l.sgst_making, l.line_total,
                m.code AS material_code, m.name AS material_name
            FROM caratloop.sales_invoice_lines l
            LEFT JOIN caratloop.materials m ON m.id = l.material_id
            LEFT JOIN caratloop.units_of_measure u ON u.id = l.uom_id
            WHERE l.invoice_id = :id
            ORDER BY l.sequence_no
        """),
        {"id": str(invoice_id)},
    )

    company = await db.execute(
        text("""
            SELECT id, name, legal_name, trade_name, gstin, pan,
                   address_line1, address_line2, city, state_code, state_name, pincode,
                   phone, email, bank_name, bank_branch, bank_account_no, bank_ifsc
            FROM caratloop.companies WHERE id = :cid
        """),
        {"cid": cid},
    )
    c = dict(company.mappings().first() or {})
    if c:
        c["id"] = str(c["id"])
        bank = {
            "bank_name": c.pop("bank_name", None),
            "bank_branch": c.pop("bank_branch", None),
            "account_no": c.pop("bank_account_no", None),
            "ifsc": c.pop("bank_ifsc", None),
        }
        c["bank"] = bank if bank["account_no"] and bank["ifsc"] else None

    out = dict(inv)
    out["id"] = str(out["id"])
    out["customer_id"] = str(out["customer_id"])
    out["lines"] = [dict(r) for r in lines.mappings().all()]
    out["company"] = c or None
    return out


# {invoice_no:path}, not {invoice_no}. Invoice numbers are formatted
# "CL/2026-27/00001", so the plain converter stopped at the first slash and the
# route never matched: the UI's own call, DELETE /sales/invoices/by-no/CL/...,
# returned 404 and no invoice could be cancelled from the interface at all.
# Percent-encoding is not a fix either -- nginx normalises %2F back to a slash
# before FastAPI sees it.
@router.delete("/invoices/by-no/{invoice_no:path}", dependencies=[Depends(require(*CAN_AMEND))])
async def delete_sales_invoice(
    invoice_no: str,
    request: Request,
    reason: str = Query("Sales invoice cancellation"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Cancel/Delete a Sales Invoice and reverse GL ledger entries & stock outward entries.
    """
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, reason)

    try:
        # 1. Fetch invoice
        inv_res = await db.execute(
            text("SELECT * FROM caratloop.sales_invoices WHERE invoice_no = :inv_no AND company_id = :cid"),
            {"inv_no": invoice_no, "cid": company_id}
        )
        inv = inv_res.mappings().first()
        if not inv:
            raise HTTPException(status_code=404, detail="Invoice not found")

        # Reversal vouchers are numbered in the invoice's own financial year.
        # The label was previously hardcoded to 2026-27.
        fy_res = await db.execute(
            text("SELECT year_label FROM caratloop.fiscal_years WHERE id = :fyid"),
            {"fyid": str(inv["fiscal_year_id"])},
        )
        fy_label = fy_res.scalar() or "UNKNOWN"
        if inv["status"] == "Cancelled":
            return {"status": "already_cancelled"}

        inv_id = inv["id"]
        customer_id = inv["customer_id"]
        grand_total = to_decimal(inv["grand_total"])

        # 2. Update status to Cancelled
        await db.execute(
            text("UPDATE caratloop.sales_invoices SET status = 'Cancelled' WHERE id = :id"),
            {"id": str(inv_id)}
        )

        # 3. Create reversal Journal Entry
        # Scoped by company: invoice numbers are per-company (CL/FY/00001) and
        # will collide across tenants, which would reverse another company's
        # journal entry.
        je_original_res = await db.execute(
            text(
                "SELECT id, entry_no FROM caratloop.journal_entries "
                "WHERE reference_no = :inv_no AND reference_type = 'SalesInvoice' "
                "AND company_id = :cid"
            ),
            {"inv_no": invoice_no, "cid": company_id}
        )
        orig_je = je_original_res.mappings().first()

        rev_je_id = None
        if orig_je:
            orig_je_id = orig_je["id"]
            
            # Create new reversing entry
            rev_no_res = await db.execute(
                text("SELECT caratloop.next_document_number(:cid, NULL, 'JournalVoucher')"),
                {"cid": company_id}
            )
            cnt = rev_no_res.scalar()
            # The financial year was hardcoded to 2026-27 here.
            rev_vno = f"JV/{fy_label}/{cnt:05d}"
            
            # fiscal_year_id, total_debit, total_credit and sequence_no are
            # all NOT NULL, and this statement supplied none of them, so
            # cancelling any invoice failed outright at the database. The
            # totals are taken from the entry being reversed: a reversal moves
            # exactly the same money the other way, and the original is
            # balanced, so its two totals are equal.
            je_res = await db.execute(
                text("""
                    INSERT INTO caratloop.journal_entries (
                        company_id, fiscal_year_id, entry_no, entry_date, entry_type,
                        reference_no, reference_type, reference_id, narration,
                        total_debit, total_credit, sequence_no, created_by
                    )
                    SELECT
                        -- 'Reversal', not 'Sales Reversal': chk_je_type permits
                        -- Sales / Purchase / Receipt / Payment / Contra / Journal /
                        -- Opening / Closing / Depreciation / RCM_Payment /
                        -- ITC_Utilization / Stock_Adjustment / Reversal /
                        -- Bank_Reconciliation, and nothing else.
                        :cid, COALESCE((SELECT fy.id FROM caratloop.fiscal_years fy WHERE fy.company_id = orig.company_id AND CURRENT_DATE BETWEEN fy.start_date AND fy.end_date ORDER BY fy.is_active DESC LIMIT 1), orig.fiscal_year_id),
                        :vno, CURRENT_DATE, 'Reversal',
                        :ref_no, 'SalesInvoice', :inv_id, :narr,
                        orig.total_credit, orig.total_debit,
                        NEXTVAL('caratloop.journal_entry_seq'), CAST(:created_by AS UUID)
                    FROM caratloop.journal_entries orig
                    WHERE orig.id = :orig_je_id
                    RETURNING id
                """),
                {
                    "cid": company_id,
                    "vno": rev_vno,
                    "ref_no": f"CNCL-{invoice_no}",
                    "inv_id": inv_id,
                    "narr": f"Cancellation of Sales Invoice {invoice_no}",
                    "created_by": user_id,
                    "orig_je_id": orig_je_id,
                }
            )
            rev_je_id = je_res.scalar()
            
            # Reverse lines by swapping dr and cr
            await db.execute(
                text("""
                    INSERT INTO caratloop.journal_entry_lines (
                        journal_entry_id, sequence_no, account_id, party_id,
                        dr_amount, cr_amount, narration
                    )
                    SELECT :rev_je_id, sequence_no, account_id, party_id,
                           cr_amount, dr_amount, 'Reversal of ' || COALESCE(narration, '')
                    FROM caratloop.journal_entry_lines
                    WHERE journal_entry_id = :orig_je_id
                    ORDER BY sequence_no
                """),
                {"rev_je_id": rev_je_id, "orig_je_id": orig_je_id}
            )

        # 4. Reverse Stock Ledger Entries
        await db.execute(
            text("""
                INSERT INTO caratloop.stock_ledger_entries (
                    company_id, fiscal_year_id, location_id, material_id, entry_date,
                    direction, transaction_type, quantity, amount, gross_weight, net_weight,
                    source_document_type, source_document_id, source_document_no, sequence_no, created_by
                )
                SELECT company_id, fiscal_year_id, location_id, material_id, CURRENT_DATE,
                    'I', 'Return_Inward', quantity, amount, gross_weight, net_weight,
                    'SalesInvoice', source_document_id, 'CNCL-' || source_document_no, COALESCE((SELECT MAX(sequence_no) FROM caratloop.stock_ledger_entries), 0) + 1, CAST(:created_by AS UUID)
                FROM caratloop.stock_ledger_entries
                WHERE source_document_no = :inv_no AND direction = 'O'
            """),
            {"inv_no": invoice_no, "created_by": user_id}
        )

        # 5. Reverse GST output tax with a credit note.
        #
        # This has been wrong twice. It first DELETEd the register row, which
        # desynchronised the books from an already-filed GSTR-1 and destroyed
        # the evidence. It then flipped the invoice's own row to
        # is_credit_note = TRUE, which is not a credit note: it erased the
        # invoice. The register was left holding a credit note against a sale
        # that, on the face of the record, never happened, and the period
        # netted to minus the tax rather than to nil.
        #
        # A credit note is a second document (GSTR-1 Table 9B). The invoice row
        # stays exactly as filed and a mirror row is added against it, so the
        # two net to zero and both remain on the record.
        await db.execute(
            text("""
                INSERT INTO caratloop.gst_output_tax_register (
                    company_id, fiscal_year_id, return_period,
                    invoice_id, invoice_no, invoice_date,
                    party_id, party_gstin, place_of_supply, is_inter_state,
                    supply_type, hsn_material, hsn_making,
                    taxable_material_value, material_gst_rate,
                    taxable_making_value, making_gst_rate,
                    igst_amount, cgst_amount, sgst_amount, total_tax,
                    is_credit_note, credit_note_id, remarks, created_by
                )
                SELECT
                    -- The note is dated today, so it belongs to today's return
                    -- period and fiscal year. Copying the invoice's would alter
                    -- a month that may already have been filed.
                    r.company_id,
                    COALESCE((SELECT fy.id FROM caratloop.fiscal_years fy WHERE fy.company_id = r.company_id AND CURRENT_DATE BETWEEN fy.start_date AND fy.end_date ORDER BY fy.is_active DESC LIMIT 1), r.fiscal_year_id),
                    to_char(CURRENT_DATE, 'YYYY-MM'),
                    r.invoice_id, :cn_no, CURRENT_DATE,
                    r.party_id, r.party_gstin, r.place_of_supply, r.is_inter_state,
                    r.supply_type, r.hsn_material, r.hsn_making,
                    r.taxable_material_value, r.material_gst_rate,
                    r.taxable_making_value, r.making_gst_rate,
                    r.igst_amount, r.cgst_amount, r.sgst_amount, r.total_tax,
                    -- credit_note_id references caratloop.credit_notes, the
                    -- credit-note document table. A cancellation does not
                    -- create one of those, so the link back to the sale is
                    -- invoice_id, carried above.
                    TRUE, NULL, :remarks, CAST(:cb AS UUID)
                FROM caratloop.gst_output_tax_register r
                WHERE r.invoice_no = :inv_no
                  AND r.company_id = :cid
                  AND NOT r.is_credit_note
            """),
            {
                "cn_no": f"CN/{invoice_no}",
                "inv_no": invoice_no,
                "cid": company_id,
                "remarks": f"Credit note against cancelled invoice {invoice_no}",
                "cb": user_id,
            },
        )

        # The reversal must itself balance.
        if rev_je_id:
            await assert_journal_balanced(
                db, rev_je_id, context="sales cancellation reversal entry"
            )

        await db.commit()
        return {"status": "success", "invoice_no": invoice_no, "message": f"Invoice {invoice_no} cancelled successfully"}
    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to delete invoice")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete invoice. The operation was rolled back and nothing was saved.",
        ) from e

