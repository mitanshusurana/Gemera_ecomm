"""
Caratloop ERP — E-commerce bridge

The storefront API (Spring Boot, repository root ``backend/``) is the system
that sells; this service is the book of record. Until now every web order had
to be re-keyed here by hand, so the sales register, the GST output register
and the receivables lagged the shop by however long that took.

The bridge accepts two documents from the storefront, authenticated by a
shared key in ``X-Api-Key`` (never a user JWT: the shop is a system, not a
person, and its postings must be attributable as such):

* ``POST /integrations/ecommerce/sales`` -- a paid (or dispatched
  cash-on-delivery) order, already invoiced by the shop in its own ``WEB/``
  series, or a repair job's service invoice (``SRV/`` series, lines flagged
  ``is_service``). It is recorded under that same number: one supply, one
  invoice number in the books. The GST is recomputed here from the lines and compared
  with what the shop charged before anything is written; a mismatch is a 409
  and nothing is saved, because two systems disagreeing about tax is a fact
  the accountant must see, not something to paper over. A settled payment
  posts a receipt voucher against the invoice.
* ``POST /integrations/ecommerce/credit-notes`` -- a refund. Posts a credit
  note (sales and output tax come down, the customer is credited) and, when a
  settlement account is configured, the refund payment itself (customer
  debited, bank credited). The existing voucher credit note cannot be used
  here: it "settles" the invoice, which a fully paid invoice refuses.

* ``POST /integrations/ecommerce/old-gold-purchases`` -- old gold or silver
  bought from a customer through the shop's exchange programme. Recorded as
  a reverse-charge purchase from an unregistered person (the customer's
  party, widened to Customer-and-Vendor). The customer is paid in store
  credit, so the payable stays open until a later web sale carries an
  ``exchange_credit``: the sale then nets the two on the party's single
  ledger account and marks both documents settled by that amount.

All three are idempotent on the shop's document numbers, so the storefront's
retry queue can replay them safely.
"""
from __future__ import annotations

import hmac
import logging
import secrets
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.parties import CreatePartyRequest, create_party
from app.api.v1.purchases import (
    CreatePurchaseInvoiceRequest,
    PurchaseLineRequest,
    create_purchase_invoice,
)
from app.api.v1.sales import (
    CreateSalesInvoiceRequest,
    InvoiceLineRequest,
    create_sales_invoice,
)
from app.api.v1.vouchers import (
    ReceiptPaymentPayload,
    create_receipt,
    get_fy,
    post_journal,
    settle_invoice,
)
from app.core.config import settings
from app.core.database import get_db, set_audit_context
from app.core.ledger import assert_journal_balanced
from app.core.money import to_decimal
from app.core.security import hash_password
from app.core.tenancy import resolve_uom
from app.tax.gst_engine import calculate_jewelry_gst, get_return_period
from app.tax.gstin import STATE_NAMES
from app.tax.job_work import JOB_WORK_SAC

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Integrations"])

SERVICE_USER_EMAIL = "ecommerce-bridge@caratloop.local"
SERVICE_USER_NAME = "E-commerce bridge"
# Shop and ERP round independently (the shop per line, this side per tax
# component), so totals may differ by paise. Anything beyond a rupee is a
# genuine disagreement about rate or base.
TOTALS_TOLERANCE = Decimal("1.00")
PAISA = Decimal("0.01")


# ─── Authentication ──────────────────────────────────────────────────────────

async def require_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-Api-Key")) -> None:
    """Constant-time comparison against the configured key.

    Disabled (503) rather than open when no key is configured: an empty
    configured key must never match an empty header.
    """
    configured = settings.ECOMMERCE_API_KEY or ""
    if not configured:
        raise HTTPException(
            status_code=503,
            detail="E-commerce bridge is disabled: ECOMMERCE_API_KEY is not set.",
        )
    if not x_api_key or not hmac.compare_digest(x_api_key, configured):
        raise HTTPException(status_code=401, detail="Invalid API key.")


# ─── Payloads ─────────────────────────────────────────────────────────────────

class BridgeCustomer(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: Optional[str] = None
    phone: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    state_code: Optional[str] = None
    address_line1: Optional[str] = None
    city: Optional[str] = None
    pincode: Optional[str] = None


class BridgeLine(BaseModel):
    description: str = Field(min_length=1)
    sku: Optional[str] = None
    # ERP item master code. When set, the sale relieves that material's stock
    # and posts cost of goods sold; unknown codes are ignored by sales.py.
    material_code: Optional[str] = None
    hsn_sac_code: str = Field(min_length=2, max_length=8)
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    # Value after discount, before tax: the base the shop taxed.
    taxable_value: Decimal = Field(ge=0)
    gst_rate: Decimal = Field(ge=0, le=100)
    # A service line (repair, SAC 9987xx): no material and no stock. It is
    # booked through the invoice's making/service leg at gst_rate, so the
    # ledger credits service income (SAL-003) and not material sales.
    is_service: bool = False


class BridgeTotals(BaseModel):
    taxable: Decimal
    cgst: Decimal = Decimal("0")
    sgst: Decimal = Decimal("0")
    igst: Decimal = Decimal("0")
    grand_total: Decimal


class BridgePayment(BaseModel):
    mode: str = "Razorpay"
    reference: Optional[str] = None
    amount: Decimal = Field(gt=0)
    date: Optional[date] = None


class BridgeExchangeCredit(BaseModel):
    """Part of a sale paid with old-gold exchange credit."""
    amount: Decimal = Field(gt=0)
    reference: str = Field(min_length=1, max_length=40)   # the exchange request number
    purchase_ref: Optional[str] = None                     # this ledger's purchase bill number, if known


class BridgeAdvanceApplied(BaseModel):
    """Part of a sale paid from money the customer deposited earlier (the
    Treasure savings plan). The deposits reached this ledger as on-account
    receipts, so the party already carries the credit."""
    amount: Decimal = Field(gt=0)
    reference: str = Field(min_length=1, max_length=40)   # e.g. TRS-<account id>


class BridgeSaleRequest(BaseModel):
    external_ref: str = Field(min_length=1, max_length=40)
    invoice_no: str = Field(min_length=1, max_length=30)
    invoice_date: date
    customer: BridgeCustomer
    place_of_supply: Optional[str] = None
    lines: List[BridgeLine] = Field(min_length=1)
    # Shipping and the like, charged without tax at checkout.
    other_charges: Decimal = Field(default=Decimal("0"), ge=0)
    totals: BridgeTotals
    payment: Optional[BridgePayment] = None
    exchange_credit: Optional[BridgeExchangeCredit] = None
    advance_applied: Optional[BridgeAdvanceApplied] = None


class BridgeAdvance(BaseModel):
    """An on-account receipt: a Treasure plan installment or any other
    deposit taken before a sale exists."""
    external_ref: str = Field(min_length=1, max_length=40)
    customer: BridgeCustomer
    amount: Decimal = Field(gt=0)
    date: date
    mode: str = "Razorpay"
    reference: Optional[str] = None
    scheme: Optional[str] = None


class BridgeOldGoldPurchase(BaseModel):
    external_ref: str = Field(min_length=1, max_length=40)   # exchange request number
    purchase_date: date
    customer: BridgeCustomer
    metal: str = Field(pattern="^(GOLD|SILVER)$")
    purity: Decimal = Field(gt=0, le=1)
    gross_weight: Decimal = Field(gt=0)
    net_weight: Decimal = Field(gt=0)
    rate_per_gram: Decimal = Field(ge=0)
    # What the customer is paid (in store credit), before any GST treatment.
    value: Decimal = Field(gt=0)
    description: str = Field(min_length=1, max_length=255)


class BridgeCreditNoteRequest(BaseModel):
    external_ref: str = Field(min_length=1, max_length=40)
    invoice_no: str = Field(min_length=1, max_length=30)
    amount: Decimal = Field(gt=0)
    reason: str = Field(min_length=1)
    date: date
    # Money actually returned to the customer (gateway refund). Absent means
    # the whole note was paid back; zero means nothing was: the credit stays
    # on the party (store credit or a Treasure balance restored by the shop).
    refund_paid: Optional[Decimal] = Field(default=None, ge=0)


# ─── Pure helpers (unit-tested without a database) ───────────────────────────

def expected_totals(
    lines: List[BridgeLine],
    other_charges: Decimal,
    seller_state: str,
    place_of_supply: str,
) -> dict:
    """What this ledger will book for these lines, using the same engine the
    invoice posting uses, so the pre-check and the posting cannot drift."""
    taxable = cgst = sgst = igst = Decimal("0")
    for ln in lines:
        # A service line goes through the making leg, exactly as the posting
        # books it (see service_line_request), so the two cannot disagree.
        service = bool(getattr(ln, "is_service", False))
        gst = calculate_jewelry_gst(
            material_value=Decimal("0") if service else to_decimal(ln.taxable_value),
            making_charges=to_decimal(ln.taxable_value) if service else Decimal("0"),
            seller_state_code=seller_state,
            buyer_state_code=place_of_supply,
            material_gst_rate=to_decimal(ln.gst_rate),
            making_gst_rate=to_decimal(ln.gst_rate),
        )
        taxable += to_decimal(ln.taxable_value)
        cgst += gst.cgst_material + gst.cgst_making
        sgst += gst.sgst_material + gst.sgst_making
        igst += gst.igst_material + gst.igst_making
    grand = taxable + to_decimal(other_charges) + cgst + sgst + igst
    return {
        "taxable": taxable.quantize(PAISA, ROUND_HALF_UP),
        "cgst": cgst.quantize(PAISA, ROUND_HALF_UP),
        "sgst": sgst.quantize(PAISA, ROUND_HALF_UP),
        "igst": igst.quantize(PAISA, ROUND_HALF_UP),
        "grand_total": grand.quantize(PAISA, ROUND_HALF_UP),
    }


def line_request(ln: BridgeLine, other_charges: Decimal) -> InvoiceLineRequest:
    """The sales-module line for a bridge line.

    Goods: the taxable value is the material value at the line's rate, the
    material code (if any) relieves stock. Service: zero material, the value
    on the making leg at the line's rate, no material code, so the invoice
    posts it to service income with no stock movement.
    """
    descr = ln.description.strip()
    if ln.sku:
        descr = f"{descr} [{ln.sku.strip()}]"
    if ln.is_service:
        return InvoiceLineRequest(
            material_id=None,
            hsn_sac_code=ln.hsn_sac_code.strip(),
            description=descr[:255],
            quantity=to_decimal(ln.quantity),
            material_value=Decimal("0"),
            material_gst_rate=to_decimal(ln.gst_rate),
            making_charges=to_decimal(ln.taxable_value),
            making_gst_rate=to_decimal(ln.gst_rate),
            other_charges=to_decimal(other_charges),
        )
    return InvoiceLineRequest(
        material_id=(ln.material_code or "").strip() or None,
        hsn_sac_code=ln.hsn_sac_code.strip(),
        description=descr[:255],
        quantity=to_decimal(ln.quantity),
        material_value=to_decimal(ln.taxable_value),
        material_gst_rate=to_decimal(ln.gst_rate),
        other_charges=to_decimal(other_charges),
    )


def totals_mismatch(expected: dict, claimed: BridgeTotals, tolerance: Decimal = TOTALS_TOLERANCE) -> dict:
    """Fields where the shop's figure differs from ours by more than
    ``tolerance``; empty when the two agree."""
    diffs = {}
    for key in ("taxable", "cgst", "sgst", "igst", "grand_total"):
        ours = expected[key]
        theirs = to_decimal(getattr(claimed, key)).quantize(PAISA, ROUND_HALF_UP)
        if abs(ours - theirs) > tolerance:
            diffs[key] = {"erp": str(ours), "storefront": str(theirs)}
    return diffs


def split_refund(
    amount: Decimal,
    grand_total: Decimal,
    taxable_material: Decimal,
    other_charges: Decimal,
    seller_state: str,
    place_of_supply: str,
    material_gst_rate: Decimal,
):
    """Apportion a refund over the invoice's material, tax and other-charge
    legs in the invoice's own proportions.

    Returns (material, other, gst_result, total). ``total`` is what the books
    will carry; it equals ``amount`` unless the invoice had no untaxed charges
    to absorb rounding, in which case it may differ by paise.
    """
    amount = to_decimal(amount).quantize(PAISA, ROUND_HALF_UP)
    grand_total = to_decimal(grand_total)
    if grand_total <= 0:
        raise ValueError("grand_total must be positive")
    if amount > grand_total + TOTALS_TOLERANCE:
        raise ValueError("refund exceeds the invoice value")

    ratio = amount / grand_total
    material = (to_decimal(taxable_material) * ratio).quantize(PAISA, ROUND_HALF_UP)
    gst = calculate_jewelry_gst(
        material_value=material,
        making_charges=Decimal("0"),
        seller_state_code=seller_state,
        buyer_state_code=place_of_supply,
        material_gst_rate=to_decimal(material_gst_rate),
    )
    other = (amount - material - gst.total_gst).quantize(PAISA, ROUND_HALF_UP)
    if other < 0:
        # No untaxed leg to absorb the rounding: book a paise less rather
        # than a negative "other charges" line.
        other = Decimal("0")
    if other > to_decimal(other_charges) + TOTALS_TOLERANCE:
        # The caller asked for more than the taxed value plus the untaxed
        # charges can explain; cap the untaxed leg at what was charged.
        other = to_decimal(other_charges).quantize(PAISA, ROUND_HALF_UP)
    total = (material + other + gst.total_gst).quantize(PAISA, ROUND_HALF_UP)
    return material, other, gst, total


# ─── Tenancy and the service identity ────────────────────────────────────────

async def _resolve_company(db: AsyncSession) -> str:
    if settings.ECOMMERCE_COMPANY_ID:
        res = await db.execute(
            text("SELECT id FROM caratloop.companies WHERE id = CAST(:cid AS UUID) AND is_active"),
            {"cid": settings.ECOMMERCE_COMPANY_ID},
        )
        cid = res.scalar()
        if not cid:
            raise HTTPException(status_code=503, detail="ECOMMERCE_COMPANY_ID does not name an active company.")
        return str(cid)
    res = await db.execute(text("SELECT id FROM caratloop.companies WHERE is_active ORDER BY created_at LIMIT 2"))
    ids = [str(r[0]) for r in res.fetchall()]
    if len(ids) != 1:
        raise HTTPException(
            status_code=503,
            detail="Set ECOMMERCE_COMPANY_ID: the bridge cannot choose between several companies.",
        )
    return ids[0]


async def _service_user(db: AsyncSession, company_id: str) -> dict:
    """The user every bridge posting is attributed to.

    Created on first use with an unknowable password: the row exists so the
    audit trail and created_by columns name the shop, not so anyone signs in
    as it. Role accountant: it posts invoices and receipts, nothing more.
    """
    res = await db.execute(
        text(
            "SELECT id, email, full_name, role, company_id FROM caratloop.users "
            "WHERE company_id = CAST(:cid AS UUID) AND email = :email"
        ),
        {"cid": company_id, "email": SERVICE_USER_EMAIL},
    )
    row = res.mappings().first()
    if not row:
        res = await db.execute(
            text(
                "INSERT INTO caratloop.users (company_id, full_name, email, password_hash, role, department, is_active) "
                "VALUES (CAST(:cid AS UUID), :name, :email, :hash, 'accountant', 'Integration', TRUE) "
                "RETURNING id, email, full_name, role, company_id"
            ),
            {
                "cid": company_id,
                "name": SERVICE_USER_NAME,
                "email": SERVICE_USER_EMAIL,
                "hash": hash_password(secrets.token_urlsafe(32)),
            },
        )
        row = res.mappings().first()
        await db.commit()
    ctx = dict(row)
    ctx["company_id"] = str(ctx["company_id"])
    ctx["session_id"] = "0"
    return ctx


async def _account_id(db: AsyncSession, company_id: str, code: str) -> Optional[str]:
    res = await db.execute(
        text("SELECT id FROM caratloop.accounts WHERE company_id = CAST(:cid AS UUID) AND code = :code"),
        {"cid": company_id, "code": code},
    )
    acc = res.scalar()
    return str(acc) if acc else None


async def _find_or_create_customer(
    db: AsyncSession, request: Request, user: dict, company_id: str, customer: BridgeCustomer, external_ref: str
) -> str:
    """Match a web customer to a party by e-mail, then phone; create otherwise."""
    email = (customer.email or "").strip().lower()
    phone = (customer.phone or "").strip()
    if email:
        res = await db.execute(
            text(
                "SELECT id FROM caratloop.parties WHERE company_id = CAST(:cid AS UUID) "
                "AND party_type IN ('Customer','Both') AND lower(email) = :email ORDER BY created_at LIMIT 1"
            ),
            {"cid": company_id, "email": email},
        )
        pid = res.scalar()
        if pid:
            return str(pid)
    if phone:
        res = await db.execute(
            text(
                "SELECT id FROM caratloop.parties WHERE company_id = CAST(:cid AS UUID) "
                "AND party_type IN ('Customer','Both') AND phone = :phone ORDER BY created_at LIMIT 1"
            ),
            {"cid": company_id, "phone": phone},
        )
        pid = res.scalar()
        if pid:
            return str(pid)

    state_code = (customer.state_code or "").strip() or None
    created = await create_party(
        CreatePartyRequest(
            party_type="Customer",
            name=customer.name.strip(),
            gstin=(customer.gstin or "").strip().upper() or None,
            pan=(customer.pan or "").strip().upper() or None,
            address_line1=customer.address_line1,
            city=customer.city,
            state_code=state_code,
            state_name=STATE_NAMES.get(state_code) if state_code else None,
            pincode=customer.pincode,
            mobile=phone or None,
            email=email or None,
            credit_days=0,
            reason=f"Web customer from order {external_ref}",
        ),
        request,
        db,
        user,
    )
    return str(created["id"])


async def _post_receipt_if_due(
    db: AsyncSession, request: Request, user: dict, company_id: str,
    party_id: str, invoice_id: str, invoice_no: str, erp_grand_total: Decimal,
    payment: BridgePayment, external_ref: str,
) -> Optional[str]:
    """Receipt voucher for an online settlement. Returns the voucher number,
    or None when no settlement account is configured (logged, not fatal:
    the invoice is still in the books and the receipt can be entered by
    hand)."""
    bank_acc = await _account_id(db, company_id, settings.ECOMMERCE_SETTLEMENT_ACCOUNT_CODE)
    if not bank_acc:
        logger.warning(
            "Bridge: settlement account %s missing; invoice %s recorded without its receipt",
            settings.ECOMMERCE_SETTLEMENT_ACCOUNT_CODE, invoice_no,
        )
        return None
    # The shop and this ledger may disagree by paise; a receipt above the
    # invoice value is refused by settle_invoice, so cap at what is booked.
    amount = min(to_decimal(payment.amount), erp_grand_total).quantize(PAISA, ROUND_HALF_UP)
    if amount <= 0:
        return None
    ref = " ".join(p for p in (payment.mode, payment.reference) if p)
    result = await create_receipt(
        ReceiptPaymentPayload(
            party_id=party_id,
            bank_account_id=bank_acc,
            amount=float(amount),
            date=payment.date or date.today(),
            reference_no=ref[:50],
            invoice_id=invoice_id,
            payment_mode=payment.mode[:20],
            narration=f"Online payment for web order {external_ref} ({ref})",
            reason=f"Web order {external_ref} settlement",
        ),
        request,
        db,
        user,
    )
    return result.get("voucher_no")


async def _net_exchange_credit(
    db: AsyncSession, request: Request, user: dict, company_id: str,
    party_id: str, invoice_id: str, invoice_no: str, credit: BridgeExchangeCredit,
    *, tag: str = "EXCH", label: str = "Old gold exchange credit",
) -> Optional[str]:
    """Settle a web sale with credit the party already holds on its ledger.

    Used for old-gold exchange credit (tag EXCH, with the purchase bill set
    off too) and for Treasure plan advances (tag ADV, receipts already on
    account). Original description follows.

    The customer's party account already carries a credit from the old-gold
    purchase and a debit from this sale, so the ledger nets itself. What the
    ledger does not do on its own is mark the two documents settled, and the
    day book would show no trace of the set-off; hence a zero-sum journal
    voucher on the party account and a settlement of each document by the
    credited amount. Returns the voucher number, or None when nothing was
    left outstanding on the sale.
    """
    user_id = str(user["id"])
    ip_address = request.client.host if request.client else "0.0.0.0"
    reference_no = f"{invoice_no}/{tag}/{credit.reference}"[:50]

    dup = await db.execute(
        text(
            "SELECT entry_no FROM caratloop.journal_entries WHERE company_id = CAST(:cid AS UUID) "
            "AND entry_type = 'Journal' AND reference_no = :ref"
        ),
        {"cid": company_id, "ref": reference_no},
    )
    prior = dup.scalar()
    if prior:
        return prior

    inv = await db.execute(
        text(
            "SELECT grand_total, amount_paid FROM caratloop.sales_invoices "
            "WHERE id = CAST(:iid AS UUID) AND company_id = CAST(:cid AS UUID)"
        ),
        {"iid": invoice_id, "cid": company_id},
    )
    row = inv.mappings().first()
    outstanding = (to_decimal(row["grand_total"]) - to_decimal(row["amount_paid"] or 0)).quantize(PAISA, ROUND_HALF_UP)
    amount = min(to_decimal(credit.amount).quantize(PAISA, ROUND_HALF_UP), outstanding)
    if amount <= 0:
        return None

    acc_res = await db.execute(
        text("SELECT account_id FROM caratloop.parties WHERE id = CAST(:pid AS UUID) AND company_id = CAST(:cid AS UUID)"),
        {"pid": party_id, "cid": company_id},
    )
    party_acc = acc_res.scalar()
    if not party_acc:
        raise HTTPException(status_code=400, detail="Customer has no ledger account; nothing was saved.")

    await set_audit_context(db, user_id, "0", ip_address, f"{label} {credit.reference} set off against {invoice_no}")
    fy = await get_fy(db, company_id)
    await settle_invoice(db, "sales_invoices", company_id, amount, invoice_id=invoice_id, party_id=party_id)
    if getattr(credit, "purchase_ref", None):
        # The old-gold bill may already be partly set off by an earlier sale,
        # or may carry a paise of rounding; settle what it still has.
        pres = await db.execute(
            text(
                "SELECT id, grand_total, amount_paid FROM caratloop.purchase_invoices "
                "WHERE company_id = CAST(:cid AS UUID) AND vendor_id = CAST(:pid AS UUID) "
                "AND (bill_no = :ref OR vendor_inv_no = :ref) ORDER BY bill_date DESC LIMIT 1"
            ),
            {"cid": company_id, "pid": party_id, "ref": credit.purchase_ref.strip()},
        )
        prow = pres.mappings().first()
        if prow:
            p_out = (to_decimal(prow["grand_total"]) - to_decimal(prow["amount_paid"] or 0)).quantize(PAISA, ROUND_HALF_UP)
            p_amt = min(amount, p_out)
            if p_amt > 0:
                await settle_invoice(db, "purchase_invoices", company_id, p_amt, invoice_id=prow["id"], party_id=party_id)
        else:
            logger.warning("Bridge: exchange purchase %s not found for party %s; sale %s settled by credit only",
                           credit.purchase_ref, party_id, invoice_no)

    narr = f"{label} {credit.reference} set off against {invoice_no}"
    no_res = await db.execute(
        text("SELECT 'JV/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
        {"fy": fy["year_label"]},
    )
    vno = no_res.scalar()
    je_id = await post_journal(
        db, company_id, str(fy["id"]), vno, date.today(), "Journal", narr,
        reference_no, amount, user_id, ip_address, "0",
        [
            {"acc": str(party_acc), "dr": amount, "cr": 0, "narr": narr},
            {"acc": str(party_acc), "dr": 0, "cr": amount, "narr": narr},
        ],
        ref_type="SalesInvoice", ref_id=invoice_id,
    )
    await assert_journal_balanced(db, je_id, context="exchange credit set-off")
    await db.commit()
    return vno


def _old_metal_material_code(metal: str) -> str:
    return (
        settings.ECOMMERCE_OLD_SILVER_MATERIAL_CODE
        if metal.upper() == "SILVER"
        else settings.ECOMMERCE_OLD_GOLD_MATERIAL_CODE
    )


async def _ensure_old_metal_material(db: AsyncSession, company_id: str, user_id: str, metal: str) -> str:
    """The item-master row old gold or silver is booked into, created on
    first use in grams under HSN 7113 so a purchase never fails for want of
    a master record the accountant did not know to create. The stock
    account is left for the item master screen; a purchase that needs one
    says so."""
    code = _old_metal_material_code(metal)
    res = await db.execute(
        text("SELECT id FROM caratloop.materials WHERE company_id = CAST(:cid AS UUID) AND code = :code"),
        {"cid": company_id, "code": code},
    )
    if res.scalar():
        return code
    uom_id = await resolve_uom(db, "gm")
    is_silver = metal.upper() == "SILVER"
    await db.execute(
        text(
            "INSERT INTO caratloop.materials (company_id, code, name, category, hsn_code, uom_id, "
            " is_raw_material, is_finished_good, gst_tax_rate, description, created_by) "
            "VALUES (CAST(:cid AS UUID), :code, :name, :cat, '7113', :uom, TRUE, FALSE, 3.00, :descr, CAST(:cb AS UUID))"
        ),
        {
            "cid": company_id, "code": code,
            "name": "Old silver (exchange)" if is_silver else "Old gold (exchange)",
            "cat": "Old_Silver" if is_silver else "Old_Gold",
            "uom": str(uom_id),
            "descr": "Created by the storefront exchange bridge. Set a stock account before the first purchase posts.",
            "cb": user_id,
        },
    )
    await db.commit()
    return code


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/ecommerce/sales", dependencies=[Depends(require_api_key)])
async def record_ecommerce_sale(
    payload: BridgeSaleRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    company_id = await _resolve_company(db)
    user = await _service_user(db, company_id)
    invoice_no = payload.invoice_no.strip()

    seller_state = settings.COMPANY_STATE_CODE
    pos = (payload.place_of_supply or payload.customer.state_code or "").strip() or seller_state

    # Already recorded: answer as if we had just done it. If its payment is
    # still open and the shop reports one, post the receipt now, so a retry
    # after a failure between invoice and receipt heals the gap.
    existing = await db.execute(
        text(
            "SELECT id, customer_id, grand_total, amount_paid FROM caratloop.sales_invoices "
            "WHERE company_id = CAST(:cid AS UUID) AND invoice_no = :no"
        ),
        {"cid": company_id, "no": invoice_no},
    )
    row = existing.mappings().first()
    if row:
        receipt_no = None
        outstanding = to_decimal(row["grand_total"]) - to_decimal(row["amount_paid"] or 0)
        setoff_no = None
        if payload.payment and outstanding > 0:
            receipt_no = await _post_receipt_if_due(
                db, request, user, company_id, str(row["customer_id"]), str(row["id"]),
                invoice_no, to_decimal(row["grand_total"]), payload.payment, payload.external_ref,
            )
        if payload.exchange_credit:
            setoff_no = await _net_exchange_credit(
                db, request, user, company_id, str(row["customer_id"]), str(row["id"]),
                invoice_no, payload.exchange_credit,
            )
        advance_no = None
        if payload.advance_applied:
            advance_no = await _net_exchange_credit(
                db, request, user, company_id, str(row["customer_id"]), str(row["id"]),
                invoice_no, payload.advance_applied, tag="ADV", label="Advance",
            )
        return {
            "status": "success",
            "invoice_no": invoice_no,
            "invoice_id": str(row["id"]),
            "receipt_voucher_no": receipt_no,
            "setoff_voucher_no": setoff_no,
            "advance_voucher_no": advance_no,
            "already_recorded": True,
        }

    # Agree on the tax before writing a single row.
    expected = expected_totals(payload.lines, payload.other_charges, seller_state, pos)
    diffs = totals_mismatch(expected, payload.totals)
    if diffs:
        raise HTTPException(
            status_code=409,
            detail={
                "message": (
                    f"Storefront and ERP disagree on the tax for {invoice_no}; nothing was recorded. "
                    "Check the GST rate settings on both sides."
                ),
                "place_of_supply": pos,
                "differences": diffs,
            },
        )

    party_id = await _find_or_create_customer(db, request, user, company_id, payload.customer, payload.external_ref)

    # Untaxed charges ride on the first line; the invoice sums them.
    lines = [
        line_request(ln, to_decimal(payload.other_charges) if i == 0 else Decimal("0"))
        for i, ln in enumerate(payload.lines)
    ]

    result = await create_sales_invoice(
        CreateSalesInvoiceRequest(
            customer_id=party_id,
            invoice_date=payload.invoice_date,
            place_of_supply=pos,
            lines=lines,
            payment_terms="Immediate" if payload.payment else "Cash on delivery",
            narration=f"Web order {payload.external_ref}",
            reason=f"Storefront order {payload.external_ref} invoiced as {invoice_no}",
            external_invoice_no=invoice_no,
            pan=(payload.customer.pan or "").strip().upper() or None,  # Rule 114B on Rs 2 lakh+ sales
        ),
        request,
        db,
        user,
    )
    invoice_id = str(result["invoice_id"])
    erp_grand = to_decimal(str(result["tax_summary"]["grand_total"]))

    receipt_no = None
    setoff_no = None
    if payload.payment:
        receipt_no = await _post_receipt_if_due(
            db, request, user, company_id, party_id, invoice_id, invoice_no,
            erp_grand, payload.payment, payload.external_ref,
        )
    if payload.exchange_credit:
        setoff_no = await _net_exchange_credit(
            db, request, user, company_id, party_id, invoice_id, invoice_no, payload.exchange_credit,
        )
    advance_no = None
    if payload.advance_applied:
        advance_no = await _net_exchange_credit(
            db, request, user, company_id, party_id, invoice_id, invoice_no,
            payload.advance_applied, tag="ADV", label="Advance",
        )

    return {
        "status": "success",
        "invoice_no": invoice_no,
        "invoice_id": invoice_id,
        "party_id": party_id,
        "receipt_voucher_no": receipt_no,
        "setoff_voucher_no": setoff_no,
        "advance_voucher_no": advance_no,
        "grand_total": str(erp_grand),
    }


@router.post("/ecommerce/advances", dependencies=[Depends(require_api_key)])
async def record_advance(
    payload: BridgeAdvance,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """On-account receipt for money taken before a sale (Treasure plan
    installments). Dr bank / Cr customer; no invoice to settle. The later
    sale that spends it carries ``advance_applied`` and nets the two."""
    company_id = await _resolve_company(db)
    user = await _service_user(db, company_id)
    user_id = str(user["id"])
    ip_address = request.client.host if request.client else "0.0.0.0"
    reference_no = f"ADV/{payload.external_ref.strip()}"[:50]

    dup = await db.execute(
        text(
            "SELECT entry_no FROM caratloop.journal_entries WHERE company_id = CAST(:cid AS UUID) "
            "AND entry_type = 'Receipt' AND reference_no = :ref"
        ),
        {"cid": company_id, "ref": reference_no},
    )
    prior = dup.scalar()
    if prior:
        return {"status": "success", "voucher_no": prior, "already_recorded": True}

    bank_acc = await _account_id(db, company_id, settings.ECOMMERCE_SETTLEMENT_ACCOUNT_CODE)
    if not bank_acc:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Settlement account {settings.ECOMMERCE_SETTLEMENT_ACCOUNT_CODE} is missing from the chart "
                "of accounts; the advance was not recorded."
            ),
        )
    party_id = await _find_or_create_customer(db, request, user, company_id, payload.customer, payload.external_ref)
    acc_res = await db.execute(
        text("SELECT account_id FROM caratloop.parties WHERE id = CAST(:pid AS UUID) AND company_id = CAST(:cid AS UUID)"),
        {"pid": party_id, "cid": company_id},
    )
    party_acc = acc_res.scalar()

    amount = to_decimal(payload.amount).quantize(PAISA, ROUND_HALF_UP)
    scheme = (payload.scheme or "advance").strip()
    narr = f"{scheme}: on-account receipt {payload.external_ref} ({payload.mode} {payload.reference or ''})".strip()[:500]
    await set_audit_context(db, user_id, "0", ip_address, f"Advance {payload.external_ref} from storefront")
    try:
        fy = await get_fy(db, company_id)
        no_res = await db.execute(
            text("SELECT 'REC/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
            {"fy": fy["year_label"]},
        )
        vno = no_res.scalar()
        je_id = await post_journal(
            db, company_id, str(fy["id"]), vno, payload.date, "Receipt", narr,
            reference_no, amount, user_id, ip_address, "0",
            [
                {"acc": bank_acc, "dr": amount, "cr": 0, "narr": narr},
                {"acc": str(party_acc), "dr": 0, "cr": amount, "narr": narr},
            ],
        )
        await assert_journal_balanced(db, je_id, context="e-commerce advance receipt")
        await db.commit()
        return {"status": "success", "voucher_no": vno, "party_id": party_id, "amount": str(amount)}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("E-commerce advance failed")
        raise HTTPException(
            status_code=500,
            detail="Advance posting failed. The operation was rolled back and nothing was saved.",
        ) from e


@router.post("/ecommerce/old-gold-purchases", dependencies=[Depends(require_api_key)])
async def record_old_gold_purchase(
    payload: BridgeOldGoldPurchase,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    company_id = await _resolve_company(db)
    user = await _service_user(db, company_id)
    user_id = str(user["id"])
    ref = payload.external_ref.strip()

    existing = await db.execute(
        text(
            "SELECT id, bill_no FROM caratloop.purchase_invoices "
            "WHERE company_id = CAST(:cid AS UUID) AND vendor_inv_no = :ref"
        ),
        {"cid": company_id, "ref": ref},
    )
    row = existing.mappings().first()
    if row:
        return {
            "status": "success",
            "purchase_invoice_no": row["bill_no"],
            "purchase_id": str(row["id"]),
            "already_recorded": True,
        }

    if payload.net_weight > payload.gross_weight:
        raise HTTPException(status_code=422, detail="net_weight cannot exceed gross_weight.")

    party_id = await _find_or_create_customer(db, request, user, company_id, payload.customer, ref)
    # A customer who sells us metal is also a vendor; the party keeps its one
    # ledger account (Sundry Debtors), which is what lets the later sale net.
    pan = (payload.customer.pan or "").strip().upper() or None
    await db.execute(
        text(
            "UPDATE caratloop.parties SET party_type = 'Both', is_old_gold_supplier = TRUE, "
            "pan = COALESCE(:pan, pan) WHERE id = CAST(:pid AS UUID) AND company_id = CAST(:cid AS UUID)"
        ),
        {"pan": pan, "pid": party_id, "cid": company_id},
    )
    await db.commit()

    material_code = await _ensure_old_metal_material(db, company_id, user_id, payload.metal)

    seller_state = settings.COMPANY_STATE_CODE
    pos = (payload.customer.state_code or "").strip() or seller_state
    net = to_decimal(payload.net_weight)
    value = to_decimal(payload.value).quantize(PAISA, ROUND_HALF_UP)
    # Booked by weight so the stock ledger carries grams; the rate is derived
    # so quantity x rate reproduces the value paid to within a paisa.
    rate = (value / net).quantize(Decimal("0.0001"), ROUND_HALF_UP)

    result = await create_purchase_invoice(
        CreatePurchaseInvoiceRequest(
            supplier_id=party_id,
            invoice_date=payload.purchase_date,
            supplier_invoice_no=ref,
            place_of_supply=pos,
            items=[
                PurchaseLineRequest(
                    material_id=material_code,
                    description=payload.description[:200],
                    quantity=float(net),
                    gross_weight=float(payload.gross_weight),
                    net_weight=float(net),
                    purity=float(payload.purity),
                    rate=float(rate),
                    making_charges=0.0,
                    hsn_code="7113",
                    gst_rate=3.0,
                )
            ],
            is_rcm=True,
            reason=f"Old {payload.metal.lower()} bought from customer under exchange request {ref}",
        ),
        request,
        db,
        user,
    )
    return {
        "status": "success",
        "purchase_invoice_no": result["bill_no"],
        "purchase_id": str(result["id"]),
        "party_id": party_id,
        "material_code": material_code,
    }


@router.post("/ecommerce/credit-notes", dependencies=[Depends(require_api_key)])
async def record_ecommerce_credit_note(
    payload: BridgeCreditNoteRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    company_id = await _resolve_company(db)
    user = await _service_user(db, company_id)
    user_id = str(user["id"])
    ip_address = request.client.host if request.client else "0.0.0.0"
    invoice_no = payload.invoice_no.strip()
    reference_no = f"{invoice_no}/CN/{payload.external_ref}"[:50]

    inv_res = await db.execute(
        text(
            "SELECT si.id, si.customer_id, si.fiscal_year_id, si.is_inter_state, si.place_of_supply, "
            "       si.customer_gstin, si.grand_total, si.taxable_material_value, si.subtotal_other_charges, "
            "       si.status, p.account_id AS party_account, p.name AS party_name, "
            "       COALESCE((SELECT MAX(l.material_gst_rate) FROM caratloop.sales_invoice_lines l "
            "                 WHERE l.invoice_id = si.id), 3.00) AS material_gst_rate, "
            "       COALESCE((SELECT MAX(l.hsn_sac_code) FROM caratloop.sales_invoice_lines l "
            "                 WHERE l.invoice_id = si.id), '') AS hsn_material "
            "FROM caratloop.sales_invoices si JOIN caratloop.parties p ON p.id = si.customer_id "
            "WHERE si.company_id = CAST(:cid AS UUID) AND si.invoice_no = :no"
        ),
        {"cid": company_id, "no": invoice_no},
    )
    inv = inv_res.mappings().first()
    if not inv:
        raise HTTPException(status_code=404, detail=f"Invoice {invoice_no} is not recorded here; sync the sale first.")

    dup = await db.execute(
        text(
            "SELECT entry_no FROM caratloop.journal_entries WHERE company_id = CAST(:cid AS UUID) "
            "AND entry_type = 'Credit_Note' AND reference_no = :ref"
        ),
        {"cid": company_id, "ref": reference_no},
    )
    prior = dup.scalar()
    if prior:
        return {"status": "success", "voucher_no": prior, "already_recorded": True}

    try:
        material, other, gst, total = split_refund(
            payload.amount, inv["grand_total"], inv["taxable_material_value"],
            inv["subtotal_other_charges"], settings.COMPANY_STATE_CODE, inv["place_of_supply"],
            inv["material_gst_rate"],
        )
    except ValueError:
        raise HTTPException(
            status_code=422,
            detail=f"Refund of {payload.amount} exceeds the value of invoice {invoice_no}; nothing was saved.",
        )

    await set_audit_context(db, user_id, "0", ip_address, f"Refund of web order {payload.external_ref}")
    try:
        fy = await get_fy(db, company_id)
        narr = f"Credit Note against {invoice_no} — {payload.reason}"[:500]

        async def acc(code: str) -> str:
            found = await _account_id(db, company_id, code)
            if not found:
                raise HTTPException(
                    status_code=400,
                    detail=f"Chart of accounts is missing '{code}'. Nothing was saved.",
                )
            return found

        lines = []
        if material > 0:
            lines.append({"acc": await acc("SAL-001"), "dr": material, "cr": 0, "narr": narr})
        if other > 0:
            lines.append({"acc": await acc("SAL-005"), "dr": other, "cr": 0, "narr": narr})
        if inv["is_inter_state"]:
            if gst.igst_material > 0:
                lines.append({"acc": await acc("GST-005"), "dr": gst.igst_material, "cr": 0, "narr": narr})
        else:
            if gst.cgst_material > 0:
                lines.append({"acc": await acc("GST-001"), "dr": gst.cgst_material, "cr": 0, "narr": narr})
            if gst.sgst_material > 0:
                lines.append({"acc": await acc("GST-002"), "dr": gst.sgst_material, "cr": 0, "narr": narr})
        lines.append({"acc": str(inv["party_account"]), "dr": 0, "cr": total, "narr": narr})

        cn_res = await db.execute(
            text("SELECT 'CN/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
            {"fy": fy["year_label"]},
        )
        cn_no = cn_res.scalar()
        cn_id = await post_journal(
            db, company_id, str(fy["id"]), cn_no, payload.date, "Credit_Note", narr,
            reference_no, total, user_id, ip_address, "0", lines,
            ref_type="CreditNote", ref_id=inv["id"],
        )

        # GSTR-1 Table 9B, in the note's own period.
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
                    is_credit_note, remarks, created_by
                ) VALUES (
                    CAST(:cid AS UUID), :fyid, :period,
                    :inv_id, :note_no, :note_date,
                    :pid, :pgstin, :pos, :inter,
                    :supply_type, :hsn_mat, :hsn_mak,
                    :mat_val, :mat_rate,
                    0, 5.00,
                    :igst, :cgst, :sgst, :total_tax,
                    TRUE, :remarks, CAST(:cb AS UUID)
                )
            """),
            {
                "cid": company_id, "fyid": str(fy["id"]),
                "period": get_return_period(payload.date),
                "inv_id": str(inv["id"]), "note_no": cn_no, "note_date": payload.date,
                "pid": str(inv["customer_id"]), "pgstin": inv["customer_gstin"],
                "pos": inv["place_of_supply"], "inter": bool(inv["is_inter_state"]),
                "supply_type": "B2B" if inv["customer_gstin"] else "B2C_Large",
                "hsn_mat": inv["hsn_material"], "hsn_mak": JOB_WORK_SAC,
                "mat_val": material, "mat_rate": to_decimal(inv["material_gst_rate"]),
                "igst": gst.igst_material, "cgst": gst.cgst_material, "sgst": gst.sgst_material,
                "total_tax": gst.total_gst,
                "remarks": narr, "cb": user_id,
            },
        )
        await assert_journal_balanced(db, cn_id, context="e-commerce credit note")

        # The money actually went back to the customer's card or account, so
        # the credit sitting on their ledger is paid out through the bank.
        refund_no = None
        # What actually left the bank. Store credit or a restored Treasure
        # balance stays on the party as a credit and is spent by a later sale.
        refund_out = total if payload.refund_paid is None else min(
            to_decimal(payload.refund_paid).quantize(PAISA, ROUND_HALF_UP), total
        )
        bank_acc = await _account_id(db, company_id, settings.ECOMMERCE_SETTLEMENT_ACCOUNT_CODE)
        if bank_acc and refund_out > 0:
            pay_res = await db.execute(
                text("SELECT 'PAY/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
                {"fy": fy["year_label"]},
            )
            refund_no = pay_res.scalar()
            pay_narr = f"Refund to {inv['party_name']} for web order {payload.external_ref}"[:500]
            pay_id = await post_journal(
                db, company_id, str(fy["id"]), refund_no, payload.date, "Payment", pay_narr,
                f"Refund {payload.external_ref}"[:50], refund_out, user_id, ip_address, "0",
                [
                    {"acc": str(inv["party_account"]), "dr": refund_out, "cr": 0, "narr": pay_narr},
                    {"acc": bank_acc, "dr": 0, "cr": refund_out, "narr": pay_narr},
                ],
                ref_type="PaymentVoucher", ref_id=inv["id"],
            )
            await assert_journal_balanced(db, pay_id, context="e-commerce refund payment")
        elif refund_out > 0:
            logger.warning(
                "Bridge: settlement account %s missing; refund for %s booked as a customer credit only",
                settings.ECOMMERCE_SETTLEMENT_ACCOUNT_CODE, invoice_no,
            )

        await db.commit()
        return {
            "status": "success",
            "voucher_no": cn_no,
            "refund_voucher_no": refund_no,
            "against": invoice_no,
            "total": str(total),
        }
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("E-commerce credit note failed")
        raise HTTPException(
            status_code=500,
            detail="Credit note posting failed. The operation was rolled back and nothing was saved.",
        ) from e
