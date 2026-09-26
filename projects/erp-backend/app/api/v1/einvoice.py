"""e-Invoice (IRN) and e-Way Bill for sales invoices, through the configured GSP.

Mounted under /gst, so the routes are /gst/einvoice/... and /gst/eway-bill/...

Rule 48(4) requires a registered person above the notified turnover to report
every B2B tax invoice to an Invoice Registration Portal and print the IRN and
signed QR it returns; without them the document is not a valid tax invoice.
The columns for that have existed on sales_invoices since the baseline and
nothing wrote them. This module does, and keeps a log of every exchange with
the provider in caratloop.einvoice_log, success or failure, so a disputed IRN
can be traced to the exact request and response.

A credit note against a B2B invoice is e-invoiced the same way (Typ CRN with
the invoice it reduces in PrecDocDtls): /gst/einvoice/credit-notes/{id}. The
note is a journal entry, so its IRN lives in caratloop.einvoice_documents
rather than on the entry. When the IRP refuses a generate with 2150 (it
already holds an IRN for that document: a retry after a timeout, or a save
that failed) the IRN is fetched by document details and recorded as
recovered; both calls are logged.

The e-way bill is generated from the IRN (Part A comes from the invoice, Part
B from the transport details posted here). Jewellery under Chapter 71 is
exempt from the e-way bill under Rule 138(14) read with Annexure, except where
a State has notified intra-state movement of gold (Kerala did in 2024 and
others may follow), so the e-way bill is never automatic here: it is generated
when the operator asks for it.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Mapping, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, set_audit_context
from app.core.money import to_decimal
from app.core.roles import CAN_AMEND, CAN_POST, require
from app.core.security import get_current_user
from app.einvoice import get_provider
from app.einvoice.provider import (
    IRN_CANCEL_REASONS,
    IRN_CANCEL_WINDOW_HOURS,
    ProviderDisabled,
    ProviderError,
    TransportDetails,
)
from app.einvoice.recovery import ProviderCall, generate_or_recover
from app.einvoice.schema import EInvoiceValidationError, build_credit_note_payload, build_einvoice_payload
from app.tax.gst_engine import calculate_jewelry_gst

logger = logging.getLogger(__name__)

router = APIRouter(tags=["e-Invoice & e-Way Bill"])

# einvoice_log.action and .status vocabularies; the CHECKs in 0007 permit
# exactly these. Passed as bind parameters, so test_einvoice.py compares the
# constants against the CHECKs directly.
LOG_ACTIONS = frozenset({"Generate_IRN", "Cancel_IRN", "Get_IRN_By_Doc", "Generate_EWB", "Cancel_EWB"})
LOG_STATUSES = frozenset({"Success", "Failed"})

STATUS_NOT_GENERATED = "Not_Generated"
STATUS_GENERATED = "Generated"
STATUS_CANCELLED = "Cancelled"

# einvoice_documents.document_type and .status; the CHECKs in 0011 permit
# exactly these.
DOCUMENT_TYPES = frozenset({"Invoice", "Credit_Note"})
DOCUMENT_STATUSES = frozenset({STATUS_NOT_GENERATED, STATUS_GENERATED, STATUS_CANCELLED})
DOC_CREDIT_NOTE = "Credit_Note"

TRANSPORT_MODES = {"1": "Road", "2": "Rail", "3": "Air", "4": "Ship"}


class CancelIrnRequest(BaseModel):
    reason_code: str = Field(..., description="1 Duplicate, 2 Data entry mistake, 3 Order cancelled, 4 Others")
    remarks: str = Field(..., min_length=3, max_length=100)
    reason: str = "e-Invoice cancellation"


class EwayBillRequest(BaseModel):
    transporter_id: Optional[str] = Field(default=None, max_length=15)
    transporter_name: Optional[str] = Field(default=None, max_length=100)
    transport_mode: str = Field(default="1", description="1 road, 2 rail, 3 air, 4 ship")
    vehicle_no: Optional[str] = Field(default=None, max_length=20)
    vehicle_type: Optional[str] = Field(default="R", description="R regular, O over-dimensional cargo")
    distance_km: int = Field(default=0, ge=0, le=4000)
    document_no: Optional[str] = Field(default=None, max_length=15)
    document_date: Optional[str] = Field(default=None, description="DD/MM/YYYY")
    reason: str = "e-Way Bill generation"


def _jsonable(value: Any) -> str:
    return json.dumps(value, default=str)


def _ctx(request: Request, current_user: dict) -> tuple[str, str, str, str]:
    return (
        str(current_user["id"]),
        str(current_user["company_id"]),
        request.client.host if request.client else "0.0.0.0",
        current_user.get("session_id", "0"),
    )


async def _load(db: AsyncSession, company_id: str, invoice_id: UUID):
    inv_res = await db.execute(
        text("SELECT * FROM caratloop.sales_invoices WHERE id = :id AND company_id = :cid"),
        {"id": str(invoice_id), "cid": company_id},
    )
    invoice = inv_res.mappings().first()
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")

    lines_res = await db.execute(
        text(
            "SELECT l.*, u.code AS uom "
            "FROM caratloop.sales_invoice_lines l "
            "LEFT JOIN caratloop.units_of_measure u ON u.id = l.uom_id "
            "WHERE l.invoice_id = :id ORDER BY l.sequence_no"
        ),
        {"id": str(invoice_id)},
    )
    lines = [dict(r) for r in lines_res.mappings().all()]

    party_res = await db.execute(
        text("SELECT * FROM caratloop.parties WHERE id = :pid AND company_id = :cid"),
        {"pid": str(invoice["customer_id"]), "cid": company_id},
    )
    party = party_res.mappings().first()
    if party is None:
        raise HTTPException(status_code=409, detail="The invoice's customer is no longer on the party master.")

    comp_res = await db.execute(
        text("SELECT * FROM caratloop.companies WHERE id = :cid"),
        {"cid": company_id},
    )
    company = comp_res.mappings().first()
    if company is None:
        raise HTTPException(status_code=409, detail="Company master record not found.")
    return dict(invoice), lines, dict(party), dict(company)


async def _log(
    db: AsyncSession,
    *,
    company_id: str,
    invoice_id: Any,
    action: str,
    request_payload: Any,
    response_payload: Any,
    status: str,
    error: Optional[str],
    user_id: str,
    journal_entry_id: Optional[int] = None,
) -> None:
    await db.execute(
        text(
            "INSERT INTO caratloop.einvoice_log "
            "(company_id, invoice_id, journal_entry_id, action, request_payload, response_payload, status, error, created_by) "
            "VALUES (:cid, :inv_id, :je_id, :action, CAST(:req AS JSONB), CAST(:resp AS JSONB), :status, :error, :cb)"
        ),
        {
            "cid": company_id,
            "inv_id": str(invoice_id),
            "je_id": journal_entry_id,
            "action": action,
            "req": _jsonable(request_payload) if request_payload is not None else None,
            "resp": _jsonable(response_payload) if response_payload is not None else None,
            "status": status,
            "error": error,
            "cb": user_id,
        },
    )


async def _log_calls(
    db: AsyncSession, calls: list[ProviderCall], *, company_id: str, invoice_id: Any, user_id: str,
    journal_entry_id: Optional[int] = None,
) -> None:
    """One log row per provider exchange (a recovered generate makes two)."""
    for call in calls:
        await _log(
            db, company_id=company_id, invoice_id=invoice_id, action=call.action,
            request_payload=call.request, response_payload=call.response,
            status=call.status, error=call.error, user_id=user_id, journal_entry_id=journal_entry_id,
        )


async def _fail_generate(
    db: AsyncSession, exc: ProviderError, *, company_id: str, invoice_id: Any, user_id: str,
    journal_entry_id: Optional[int] = None,
) -> None:
    """Record every call a failed generate made, commit, then 502."""
    calls = getattr(exc, "provider_calls", None) or [
        ProviderCall("Generate_IRN", None, exc.details, "Failed", exc.message)
    ]
    await _log_calls(db, calls, company_id=company_id, invoice_id=invoice_id, user_id=user_id,
                     journal_entry_id=journal_entry_id)
    await db.commit()
    raise HTTPException(
        status_code=502,
        detail=f"The e-invoice provider refused the request: {exc.message}"
        + (f" (code {exc.code})" if exc.code else ""),
    )


async def _recovered_from_irp(
    db: AsyncSession, *, company_id: str, invoice_id: Any = None, journal_entry_id: Optional[int] = None,
) -> bool:
    """Whether the IRN on record was fetched from the IRP (after a 2150)
    rather than issued by this ledger's own generate call."""
    if journal_entry_id is not None:
        res = await db.execute(
            text(
                "SELECT response_payload ->> 'recovered' FROM caratloop.einvoice_log "
                "WHERE company_id = :cid AND journal_entry_id = :je_id AND status = 'Success' "
                "AND action IN ('Generate_IRN', 'Get_IRN_By_Doc') ORDER BY created_at DESC LIMIT 1"
            ),
            {"cid": company_id, "je_id": journal_entry_id},
        )
    else:
        res = await db.execute(
            text(
                "SELECT response_payload ->> 'recovered' FROM caratloop.einvoice_log "
                "WHERE company_id = :cid AND invoice_id = :inv_id AND journal_entry_id IS NULL AND status = 'Success' "
                "AND action IN ('Generate_IRN', 'Get_IRN_By_Doc') ORDER BY created_at DESC LIMIT 1"
            ),
            {"cid": company_id, "inv_id": str(invoice_id)},
        )
    return str(res.scalar() or "").lower() == "true"


def _provider_or_503():
    try:
        return get_provider()
    except ProviderDisabled as exc:
        raise HTTPException(status_code=503, detail=str(exc))


async def _fail(db, *, company_id, invoice_id, action, request_payload, exc: ProviderError, user_id) -> None:
    """Record the refusal, commit it (the surrounding rollback must not lose it), then 502."""
    await _log(
        db,
        company_id=company_id,
        invoice_id=invoice_id,
        action=action,
        request_payload=request_payload,
        response_payload=exc.details,
        status="Failed",
        error=exc.message,
        user_id=user_id,
    )
    await db.commit()
    raise HTTPException(
        status_code=502,
        detail=f"The e-invoice provider refused the request: {exc.message}"
        + (f" (code {exc.code})" if exc.code else ""),
    )


# ─── Endpoints ───────────────────────────────────────────────────────────────


@router.get("/einvoice/{invoice_id}")
async def get_einvoice(
    invoice_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The stored IRN details plus a preview of what would be sent.

    The preview is built from the same rows the generate call uses, so what
    the screen shows is what the IRP receives. Validation problems come back
    as a list instead of an error, so the operator can fix the party master
    before pressing Generate.
    """
    company_id = str(current_user["company_id"])
    invoice, lines, party, company = await _load(db, company_id, invoice_id)

    payload: Optional[dict] = None
    errors: list[str] = []
    try:
        payload = build_einvoice_payload(company, invoice, lines, party)
    except EInvoiceValidationError as exc:
        errors = exc.errors

    log_res = await db.execute(
        text(
            "SELECT id, action, status, error, created_at "
            "FROM caratloop.einvoice_log WHERE invoice_id = :id AND company_id = :cid "
            "ORDER BY created_at DESC LIMIT 20"
        ),
        {"id": str(invoice_id), "cid": company_id},
    )

    threshold = to_decimal(settings.EINVOICE_THRESHOLD_INR)
    below_threshold = threshold > 0 and to_decimal(invoice.get("grand_total")) < threshold
    recovered = bool(invoice.get("e_invoice_irn")) and await _recovered_from_irp(
        db, company_id=company_id, invoice_id=invoice["id"]
    )

    return {
        "invoice_id": str(invoice["id"]),
        "invoice_no": invoice["invoice_no"],
        "invoice_status": invoice.get("status"),
        "e_invoice_status": invoice.get("e_invoice_status") or STATUS_NOT_GENERATED,
        "recovered_from_irp": recovered,
        "irn": invoice.get("e_invoice_irn"),
        "ack_no": invoice.get("e_invoice_ack_no"),
        "ack_date": invoice.get("e_invoice_ack_date"),
        "qr_code": invoice.get("e_invoice_qr_code"),
        "cancelled_at": invoice.get("e_invoice_cancelled_at"),
        "eway_bill": {
            "no": invoice.get("eway_bill_no"),
            "date": invoice.get("eway_bill_date"),
            "valid_upto": invoice.get("eway_bill_valid_upto"),
        },
        "provider": (settings.EINVOICE_PROVIDER or "disabled").lower(),
        "threshold_inr": float(threshold),
        "below_threshold": below_threshold,
        "payload": payload,
        "validation_errors": errors,
        "cancel_reasons": IRN_CANCEL_REASONS,
        "log": [dict(r) for r in log_res.mappings().all()],
    }


@router.post("/einvoice/{invoice_id}/generate", dependencies=[Depends(require(*CAN_POST))])
async def generate_einvoice(
    invoice_id: UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Build, validate, send to the IRP, and record the IRN on the invoice."""
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, "e-Invoice IRN generation")

    invoice, lines, party, company = await _load(db, company_id, invoice_id)
    if invoice.get("status") == "Cancelled":
        raise HTTPException(status_code=409, detail="The invoice is cancelled; a cancelled invoice is not e-invoiced.")
    if invoice.get("e_invoice_status") == STATUS_GENERATED and invoice.get("e_invoice_irn"):
        raise HTTPException(
            status_code=409,
            detail=f"An IRN already exists for {invoice['invoice_no']}: {invoice['e_invoice_irn']}",
        )
    if invoice.get("e_invoice_status") == STATUS_CANCELLED:
        # The IRP will not issue a second IRN for the same document number.
        raise HTTPException(
            status_code=409,
            detail=(
                f"The IRN for {invoice['invoice_no']} was cancelled. The IRP does not re-register a "
                "cancelled document number; raise a fresh invoice instead."
            ),
        )
    threshold = to_decimal(settings.EINVOICE_THRESHOLD_INR)
    if threshold > 0 and to_decimal(invoice.get("grand_total")) < threshold:
        raise HTTPException(
            status_code=400,
            detail=f"Invoice value is below the configured e-invoice threshold of Rs {threshold:,.2f}.",
        )

    try:
        payload = build_einvoice_payload(company, invoice, lines, party)
    except EInvoiceValidationError as exc:
        raise HTTPException(status_code=422, detail="Invoice cannot be e-invoiced: " + "; ".join(exc.errors))

    provider = _provider_or_503()
    try:
        outcome = await generate_or_recover(provider, payload)
    except ProviderError as exc:
        await _fail_generate(db, exc, company_id=company_id, invoice_id=invoice["id"], user_id=user_id)
        return  # unreachable; _fail_generate raises
    result = outcome.result

    try:
        await db.execute(
            text(
                "UPDATE caratloop.sales_invoices SET "
                "e_invoice_irn = :irn, e_invoice_ack_no = :ack_no, e_invoice_ack_date = :ack_date, "
                "e_invoice_qr_code = :qr, e_invoice_signed_invoice = :signed, "
                "e_invoice_status = :status, e_invoice_cancelled_at = NULL "
                "WHERE id = :id AND company_id = :cid"
            ),
            {
                "irn": result.irn,
                "ack_no": result.ack_no[:20],
                "ack_date": result.ack_date,
                "qr": result.signed_qr,
                "signed": result.signed_invoice,
                "status": STATUS_GENERATED,
                "id": str(invoice["id"]),
                "cid": company_id,
            },
        )
        await _log_calls(db, outcome.calls, company_id=company_id, invoice_id=invoice["id"], user_id=user_id)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("IRN was issued but could not be recorded")
        raise HTTPException(
            status_code=500,
            detail=(
                f"The IRP issued IRN {result.irn} but it could not be saved. Record it manually "
                "from the provider portal; nothing else was changed."
            ),
        ) from exc

    return {
        "status": "success",
        "invoice_no": invoice["invoice_no"],
        "irn": result.irn,
        "ack_no": result.ack_no,
        "ack_date": result.ack_date,
        "e_invoice_status": STATUS_GENERATED,
        "recovered": outcome.recovered,
        "provider": provider.name,
    }


# ─── Credit notes ────────────────────────────────────────────────────────────


def _journal_ref(ref: str) -> tuple[Optional[int], Optional[str]]:
    """A credit note is addressed by its journal entry: the bigint id the
    vouchers API returns, or the entry's UUID. (id, uuid), one of them set."""
    value = str(ref or "").strip()
    if value.isdigit():
        return int(value), None
    try:
        return None, str(UUID(value))
    except ValueError:
        raise HTTPException(status_code=422, detail="journal_entry_id must be the entry's id or UUID.")


def credit_note_lines(register: Mapping[str, Any], seller_state: str) -> list[dict]:
    """The note's item rows in the shape build_items reads, from its output
    tax register row: a material leg at the material rate and, when the note
    reduced making charges, a making leg at the making rate. The tax on each
    leg is recomputed with the same engine that posted the note, so the
    items agree with the register to the paisa.
    """
    mat = to_decimal(register.get("taxable_material_value") or 0)
    mak = to_decimal(register.get("taxable_making_value") or 0)
    gst = calculate_jewelry_gst(
        material_value=mat,
        making_charges=mak,
        seller_state_code=seller_state,
        buyer_state_code=str(register.get("place_of_supply") or seller_state),
        material_gst_rate=to_decimal(register.get("material_gst_rate") or 3),
        making_gst_rate=to_decimal(register.get("making_gst_rate") or 5),
    )
    return [{
        "sequence_no": 1,
        "hsn_sac_code": register.get("hsn_material") or (register.get("hsn_making") if mat == 0 else None),
        "description": (register.get("remarks") or "Credit note")[:300],
        "quantity": Decimal("1"),
        "uom": "OTH",
        "material_value": mat, "taxable_material": mat,
        "making_charges": mak, "taxable_making": mak,
        "other_charges": Decimal("0"), "discount_pct": Decimal("0"),
        "making_sac": register.get("hsn_making"),
        "material_gst_rate": gst.material_gst_rate, "making_gst_rate": gst.making_gst_rate,
        "igst_material": gst.igst_material, "cgst_material": gst.cgst_material, "sgst_material": gst.sgst_material,
        "igst_making": gst.igst_making, "cgst_making": gst.cgst_making, "sgst_making": gst.sgst_making,
        "line_total": mat + mak + gst.total_gst,
    }]


async def _load_credit_note(db: AsyncSession, company_id: str, ref: str):
    """(entry, original invoice, register row or None, party, company) for a
    Credit_Note journal entry of this company."""
    je_id, je_uuid = _journal_ref(ref)
    je_res = await db.execute(
        text(
            "SELECT id, entry_uuid, entry_no, entry_date, entry_type, narration, reference_no, "
            "       reference_type, reference_id, total_debit, status "
            "FROM caratloop.journal_entries "
            "WHERE company_id = CAST(:cid AS UUID) AND entry_type = 'Credit_Note' "
            "  AND (id = CAST(:jid AS BIGINT) OR entry_uuid = CAST(:juuid AS UUID))"
        ),
        {"cid": company_id, "jid": je_id, "juuid": je_uuid},
    )
    entry = je_res.mappings().first()
    if entry is None:
        raise HTTPException(status_code=404, detail="Credit note not found")

    # The invoice the note reduces: reference_id (CreditNote -> invoice id)
    # since the note vouchers were written; older rows carry the invoice
    # number in reference_no (the bridge writes '<invoice no>/CN/<rma>').
    ref_no = str(entry.get("reference_no") or "").split("/CN/")[0].strip()
    inv_res = await db.execute(
        text(
            "SELECT * FROM caratloop.sales_invoices "
            "WHERE company_id = CAST(:cid AS UUID) "
            "  AND (id = CAST(:rid AS UUID) OR invoice_no = :ino) "
            "ORDER BY CASE WHEN id = CAST(:rid AS UUID) THEN 0 ELSE 1 END LIMIT 1"
        ),
        {"cid": company_id, "rid": str(entry["reference_id"]) if entry.get("reference_id") else None, "ino": ref_no or None},
    )
    invoice = inv_res.mappings().first()
    if invoice is None:
        raise HTTPException(
            status_code=409,
            detail=f"The invoice credit note {entry['entry_no']} reduces could not be found; it cannot be e-invoiced.",
        )

    reg_res = await db.execute(
        text(
            "SELECT * FROM caratloop.gst_output_tax_register "
            "WHERE company_id = CAST(:cid AS UUID) AND is_credit_note AND invoice_no = :note_no "
            "ORDER BY created_at DESC LIMIT 1"
        ),
        {"cid": company_id, "note_no": entry["entry_no"]},
    )
    register = reg_res.mappings().first()

    party_res = await db.execute(
        text("SELECT * FROM caratloop.parties WHERE id = :pid AND company_id = :cid"),
        {"pid": str(invoice["customer_id"]), "cid": company_id},
    )
    party = party_res.mappings().first()
    if party is None:
        raise HTTPException(status_code=409, detail="The invoice's customer is no longer on the party master.")

    comp_res = await db.execute(text("SELECT * FROM caratloop.companies WHERE id = :cid"), {"cid": company_id})
    company = comp_res.mappings().first()
    if company is None:
        raise HTTPException(status_code=409, detail="Company master record not found.")
    return dict(entry), dict(invoice), (dict(register) if register else None), dict(party), dict(company)


def _credit_note_payload(entry: dict, invoice: dict, register: Optional[dict], party: dict, company: dict) -> dict:
    if register is None:
        raise EInvoiceValidationError([
            f"No output tax register row is recorded for credit note {entry['entry_no']}; "
            "the note's values cannot be established."
        ])
    seller_state = str(company.get("state_code") or settings.COMPANY_STATE_CODE)
    lines = credit_note_lines(register, seller_state)
    note = {
        "note_no": entry["entry_no"],
        "note_date": entry["entry_date"],
        "grand_total": entry["total_debit"],
        "place_of_supply": register.get("place_of_supply") or invoice.get("place_of_supply"),
        "is_inter_state": register.get("is_inter_state", invoice.get("is_inter_state")),
        "customer_gstin": register.get("party_gstin") or invoice.get("customer_gstin"),
    }
    return build_credit_note_payload(company, note, invoice, lines, party)


async def _document_row(db: AsyncSession, company_id: str, document_type: str, document_id: Any) -> Optional[dict]:
    res = await db.execute(
        text(
            "SELECT * FROM caratloop.einvoice_documents "
            "WHERE company_id = CAST(:cid AS UUID) AND document_type = :dtype AND document_id = CAST(:did AS UUID)"
        ),
        {"cid": company_id, "dtype": document_type, "did": str(document_id)},
    )
    row = res.mappings().first()
    return dict(row) if row else None


@router.get("/einvoice/credit-notes/{journal_entry_id}")
async def get_credit_note_einvoice(
    journal_entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The stored IRN for a credit note plus the CRN document it would send."""
    company_id = str(current_user["company_id"])
    entry, invoice, register, party, company = await _load_credit_note(db, company_id, journal_entry_id)
    doc = await _document_row(db, company_id, DOC_CREDIT_NOTE, entry["entry_uuid"]) or {}

    payload: Optional[dict] = None
    errors: list[str] = []
    try:
        payload = _credit_note_payload(entry, invoice, register, party, company)
    except EInvoiceValidationError as exc:
        errors = exc.errors

    log_res = await db.execute(
        text(
            "SELECT id, action, status, error, created_at "
            "FROM caratloop.einvoice_log WHERE journal_entry_id = :je_id AND company_id = :cid "
            "ORDER BY created_at DESC LIMIT 20"
        ),
        {"je_id": entry["id"], "cid": company_id},
    )
    recovered = bool(doc.get("irn")) and await _recovered_from_irp(db, company_id=company_id, journal_entry_id=entry["id"])

    return {
        "journal_entry_id": entry["id"],
        "entry_uuid": str(entry["entry_uuid"]),
        "note_no": entry["entry_no"],
        "note_date": entry["entry_date"],
        "note_status": entry.get("status"),
        "against_invoice_no": invoice["invoice_no"],
        "original_invoice_id": str(invoice["id"]),
        "e_invoice_status": doc.get("status") or STATUS_NOT_GENERATED,
        "recovered_from_irp": recovered,
        "irn": doc.get("irn"),
        "ack_no": doc.get("ack_no"),
        "ack_date": doc.get("ack_date"),
        "qr_code": doc.get("signed_qr"),
        "cancelled_at": doc.get("cancelled_at"),
        "provider": (settings.EINVOICE_PROVIDER or "disabled").lower(),
        "payload": payload,
        "validation_errors": errors,
        "cancel_reasons": IRN_CANCEL_REASONS,
        "log": [dict(r) for r in log_res.mappings().all()],
    }


@router.post("/einvoice/credit-notes/{journal_entry_id}/generate", dependencies=[Depends(require(*CAN_POST))])
async def generate_credit_note_einvoice(
    journal_entry_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Build the CRN document, send it, record the IRN in einvoice_documents.

    A 2150 from the IRP (it already holds an IRN for this note) is answered
    by fetching that IRN and storing it; the response then says
    ``recovered: true``.
    """
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, "e-Invoice IRN generation (credit note)")

    entry, invoice, register, party, company = await _load_credit_note(db, company_id, journal_entry_id)
    if entry.get("status") == "Reversed":
        raise HTTPException(status_code=409, detail="The credit note is reversed; a reversed note is not e-invoiced.")
    doc = await _document_row(db, company_id, DOC_CREDIT_NOTE, entry["entry_uuid"]) or {}
    if doc.get("status") == STATUS_GENERATED and doc.get("irn"):
        raise HTTPException(status_code=409, detail=f"An IRN already exists for {entry['entry_no']}: {doc['irn']}")
    if doc.get("status") == STATUS_CANCELLED:
        raise HTTPException(
            status_code=409,
            detail=(
                f"The IRN for {entry['entry_no']} was cancelled. The IRP does not re-register a "
                "cancelled document number; raise a fresh credit note instead."
            ),
        )

    try:
        payload = _credit_note_payload(entry, invoice, register, party, company)
    except EInvoiceValidationError as exc:
        raise HTTPException(status_code=422, detail="Credit note cannot be e-invoiced: " + "; ".join(exc.errors))

    provider = _provider_or_503()
    try:
        outcome = await generate_or_recover(provider, payload)
    except ProviderError as exc:
        await _fail_generate(
            db, exc, company_id=company_id, invoice_id=invoice["id"], user_id=user_id, journal_entry_id=entry["id"],
        )
        return  # unreachable
    result = outcome.result

    try:
        await db.execute(
            text(
                "INSERT INTO caratloop.einvoice_documents "
                "(company_id, document_type, document_id, document_no, irn, ack_no, ack_date, "
                " signed_qr, signed_invoice, status, cancelled_at, updated_at) "
                "VALUES (CAST(:cid AS UUID), :dtype, CAST(:did AS UUID), :dno, :irn, :ack_no, :ack_date, "
                "        :qr, :signed, :status, NULL, NOW()) "
                "ON CONFLICT (company_id, document_type, document_id) DO UPDATE SET "
                "  document_no = EXCLUDED.document_no, irn = EXCLUDED.irn, ack_no = EXCLUDED.ack_no, "
                "  ack_date = EXCLUDED.ack_date, signed_qr = EXCLUDED.signed_qr, "
                "  signed_invoice = EXCLUDED.signed_invoice, status = EXCLUDED.status, "
                "  cancelled_at = NULL, updated_at = NOW()"
            ),
            {
                "cid": company_id, "dtype": DOC_CREDIT_NOTE, "did": str(entry["entry_uuid"]),
                "dno": str(entry["entry_no"])[:30],
                "irn": result.irn, "ack_no": result.ack_no[:20], "ack_date": result.ack_date,
                "qr": result.signed_qr, "signed": result.signed_invoice, "status": STATUS_GENERATED,
            },
        )
        await _log_calls(
            db, outcome.calls, company_id=company_id, invoice_id=invoice["id"], user_id=user_id,
            journal_entry_id=entry["id"],
        )
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Credit note IRN was issued but could not be recorded")
        raise HTTPException(
            status_code=500,
            detail=(
                f"The IRP issued IRN {result.irn} for {entry['entry_no']} but it could not be saved. "
                "Record it manually from the provider portal; nothing else was changed."
            ),
        ) from exc

    return {
        "status": "success",
        "note_no": entry["entry_no"],
        "journal_entry_id": entry["id"],
        "irn": result.irn,
        "ack_no": result.ack_no,
        "ack_date": result.ack_date,
        "e_invoice_status": STATUS_GENERATED,
        "recovered": outcome.recovered,
        "provider": provider.name,
    }


@router.post("/einvoice/credit-notes/{journal_entry_id}/cancel", dependencies=[Depends(require(*CAN_AMEND))])
async def cancel_credit_note_einvoice(
    journal_entry_id: str,
    payload: CancelIrnRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Cancel the note's IRN at the IRP (within 24 hours of acknowledgement).
    The note itself stays in the books."""
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, payload.reason)
    if payload.reason_code not in IRN_CANCEL_REASONS:
        raise HTTPException(
            status_code=422,
            detail="reason_code must be one of " + ", ".join(f"{k} ({v})" for k, v in IRN_CANCEL_REASONS.items()),
        )

    entry, invoice, _register, _party, _company = await _load_credit_note(db, company_id, journal_entry_id)
    doc = await _document_row(db, company_id, DOC_CREDIT_NOTE, entry["entry_uuid"]) or {}
    irn = doc.get("irn")
    if doc.get("status") != STATUS_GENERATED or not irn:
        raise HTTPException(status_code=409, detail="This credit note has no active IRN to cancel.")
    ack = doc.get("ack_date")
    if ack is not None:
        if isinstance(ack, str):
            ack = datetime.fromisoformat(ack)
        if ack.tzinfo is None:
            ack = ack.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - ack > timedelta(hours=IRN_CANCEL_WINDOW_HOURS):
            raise HTTPException(
                status_code=409,
                detail=f"The IRP accepts cancellation only within {IRN_CANCEL_WINDOW_HOURS} hours of the acknowledgement.",
            )

    provider = _provider_or_503()
    req = {"Irn": irn, "CnlRsn": payload.reason_code, "CnlRem": payload.remarks}
    try:
        result = await provider.cancel_irn(irn, payload.reason_code, payload.remarks)
    except ProviderError as exc:
        await _log(
            db, company_id=company_id, invoice_id=invoice["id"], action="Cancel_IRN",
            request_payload=req, response_payload=exc.details, status="Failed", error=exc.message,
            user_id=user_id, journal_entry_id=entry["id"],
        )
        await db.commit()
        raise HTTPException(
            status_code=502,
            detail=f"The e-invoice provider refused the request: {exc.message}"
            + (f" (code {exc.code})" if exc.code else ""),
        )

    try:
        await db.execute(
            text(
                "UPDATE caratloop.einvoice_documents SET status = :status, cancelled_at = :at, updated_at = NOW() "
                "WHERE company_id = CAST(:cid AS UUID) AND document_type = :dtype AND document_id = CAST(:did AS UUID)"
            ),
            {"status": STATUS_CANCELLED, "at": result.cancel_date, "cid": company_id,
             "dtype": DOC_CREDIT_NOTE, "did": str(entry["entry_uuid"])},
        )
        await _log(
            db, company_id=company_id, invoice_id=invoice["id"], action="Cancel_IRN",
            request_payload=req, response_payload={"irn": result.irn, "cancel_date": result.cancel_date, "raw": result.raw},
            status="Success", error=None, user_id=user_id, journal_entry_id=entry["id"],
        )
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("Credit note IRN cancellation could not be recorded")
        raise HTTPException(status_code=500, detail="The IRN was cancelled at the IRP but could not be recorded here.") from exc

    return {
        "status": "success",
        "note_no": entry["entry_no"],
        "irn": irn,
        "e_invoice_status": STATUS_CANCELLED,
        "cancelled_at": result.cancel_date,
    }


@router.post("/einvoice/{invoice_id}/cancel", dependencies=[Depends(require(*CAN_AMEND))])
async def cancel_einvoice(
    invoice_id: UUID,
    payload: CancelIrnRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Cancel the IRN at the IRP. Allowed within 24 hours of the acknowledgement.

    Cancelling the IRN does not cancel the invoice in the books; that is the
    sales module's cancellation, which posts the reversal. An invoice whose
    IRN is cancelled cannot be re-registered under the same number.
    """
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, payload.reason)

    if payload.reason_code not in IRN_CANCEL_REASONS:
        raise HTTPException(
            status_code=422,
            detail="reason_code must be one of " + ", ".join(f"{k} ({v})" for k, v in IRN_CANCEL_REASONS.items()),
        )

    invoice, _lines, _party, _company = await _load(db, company_id, invoice_id)
    irn = invoice.get("e_invoice_irn")
    if invoice.get("e_invoice_status") != STATUS_GENERATED or not irn:
        raise HTTPException(status_code=409, detail="This invoice has no active IRN to cancel.")

    ack = invoice.get("e_invoice_ack_date")
    if ack is not None:
        if isinstance(ack, str):
            ack = datetime.fromisoformat(ack)
        if ack.tzinfo is None:
            ack = ack.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - ack > timedelta(hours=IRN_CANCEL_WINDOW_HOURS):
            raise HTTPException(
                status_code=409,
                detail=(
                    f"The IRP accepts cancellation only within {IRN_CANCEL_WINDOW_HOURS} hours of the "
                    "acknowledgement. Issue a credit note against this invoice instead."
                ),
            )

    provider = _provider_or_503()
    req = {"Irn": irn, "CnlRsn": payload.reason_code, "CnlRem": payload.remarks}
    try:
        result = await provider.cancel_irn(irn, payload.reason_code, payload.remarks)
    except ProviderError as exc:
        await _fail(
            db, company_id=company_id, invoice_id=invoice["id"], action="Cancel_IRN",
            request_payload=req, exc=exc, user_id=user_id,
        )
        return

    try:
        await db.execute(
            text(
                "UPDATE caratloop.sales_invoices SET e_invoice_status = :status, e_invoice_cancelled_at = :at "
                "WHERE id = :id AND company_id = :cid"
            ),
            {"status": STATUS_CANCELLED, "at": result.cancel_date, "id": str(invoice["id"]), "cid": company_id},
        )
        await _log(
            db, company_id=company_id, invoice_id=invoice["id"], action="Cancel_IRN",
            request_payload=req, response_payload={"irn": result.irn, "cancel_date": result.cancel_date, "raw": result.raw},
            status="Success", error=None, user_id=user_id,
        )
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("IRN cancellation could not be recorded")
        raise HTTPException(status_code=500, detail="The IRN was cancelled at the IRP but could not be recorded here.") from exc

    return {"status": "success", "invoice_no": invoice["invoice_no"], "irn": irn, "e_invoice_status": STATUS_CANCELLED, "cancelled_at": result.cancel_date}


@router.post("/eway-bill/{invoice_id}", dependencies=[Depends(require(*CAN_POST))])
async def generate_eway_bill(
    invoice_id: UUID,
    payload: EwayBillRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Generate the e-way bill from the invoice's IRN with the transport details given."""
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, payload.reason)

    mode = str(payload.transport_mode or "1").strip()
    if mode not in TRANSPORT_MODES:
        raise HTTPException(status_code=422, detail="transport_mode must be 1 (road), 2 (rail), 3 (air) or 4 (ship).")
    vehicle = (payload.vehicle_no or "").replace(" ", "").upper() or None
    if mode == "1" and not vehicle and not payload.transporter_id:
        raise HTTPException(
            status_code=422,
            detail="By road, either the vehicle number (Part B) or the transporter id (Part A only) is required.",
        )
    if mode != "1" and not payload.document_no:
        raise HTTPException(status_code=422, detail="For rail, air or ship the transport document (RR / airway bill / bill of lading) number is required.")
    if payload.document_date:
        try:
            datetime.strptime(payload.document_date, "%d/%m/%Y")
        except ValueError:
            raise HTTPException(status_code=422, detail="document_date must be DD/MM/YYYY.")

    invoice, _lines, _party, _company = await _load(db, company_id, invoice_id)
    irn = invoice.get("e_invoice_irn")
    if invoice.get("e_invoice_status") != STATUS_GENERATED or not irn:
        raise HTTPException(status_code=409, detail="Generate the IRN first; the e-way bill is issued against it.")
    if invoice.get("eway_bill_no"):
        raise HTTPException(status_code=409, detail=f"e-Way Bill {invoice['eway_bill_no']} already exists for this invoice.")

    transport = TransportDetails(
        transporter_id=payload.transporter_id or None,
        transporter_name=payload.transporter_name or None,
        transport_mode=mode,
        vehicle_no=vehicle,
        vehicle_type=(payload.vehicle_type or "R") if vehicle else None,
        distance_km=payload.distance_km,
        document_no=payload.document_no or None,
        document_date=payload.document_date or None,
    )
    req = {"Irn": irn, **transport.to_nic()}

    provider = _provider_or_503()
    try:
        result = await provider.generate_ewaybill_by_irn(irn, transport)
    except ProviderError as exc:
        await _fail(
            db, company_id=company_id, invoice_id=invoice["id"], action="Generate_EWB",
            request_payload=req, exc=exc, user_id=user_id,
        )
        return

    try:
        await db.execute(
            text(
                "UPDATE caratloop.sales_invoices SET eway_bill_no = :no, eway_bill_date = :dt, eway_bill_valid_upto = :valid "
                "WHERE id = :id AND company_id = :cid"
            ),
            {"no": result.ewb_no[:20], "dt": result.ewb_date, "valid": result.valid_upto, "id": str(invoice["id"]), "cid": company_id},
        )
        await _log(
            db, company_id=company_id, invoice_id=invoice["id"], action="Generate_EWB",
            request_payload=req,
            response_payload={"ewb_no": result.ewb_no, "ewb_date": result.ewb_date, "valid_upto": result.valid_upto, "raw": result.raw},
            status="Success", error=None, user_id=user_id,
        )
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("e-Way bill was issued but could not be recorded")
        raise HTTPException(
            status_code=500,
            detail=f"The e-way bill {result.ewb_no} was issued but could not be saved. Record it manually; nothing else was changed.",
        ) from exc

    return {
        "status": "success",
        "invoice_no": invoice["invoice_no"],
        "eway_bill_no": result.ewb_no,
        "eway_bill_date": result.ewb_date,
        "valid_upto": result.valid_upto,
        "provider": provider.name,
    }


class CancelEwbRequest(BaseModel):
    reason_code: str = Field(default="2", description="1 Duplicate, 2 Order cancelled, 3 Data entry mistake, 4 Others")
    remarks: str = Field(default="Cancelled from ERP", max_length=100)
    reason: str = "e-Way Bill cancellation"


EWB_CANCEL_REASONS = {"1": "Duplicate", "2": "Order cancelled", "3": "Data entry mistake", "4": "Others"}
EWB_CANCEL_WINDOW_HOURS = 24


@router.post("/eway-bill/{invoice_id}/cancel", dependencies=[Depends(require(*CAN_AMEND))])
async def cancel_eway_bill(
    invoice_id: UUID,
    payload: CancelEwbRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Cancel the e-way bill (Rule 138(9): within 24 hours, and only if not verified in transit).

    The number is cleared from the invoice so a corrected one can be generated;
    the log keeps the cancelled number and the provider's answer.
    """
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, payload.reason)
    if payload.reason_code not in EWB_CANCEL_REASONS:
        raise HTTPException(status_code=422, detail="reason_code must be 1, 2, 3 or 4.")

    invoice, _lines, _party, _company = await _load(db, company_id, invoice_id)
    ewb_no = invoice.get("eway_bill_no")
    if not ewb_no:
        raise HTTPException(status_code=409, detail="This invoice has no e-way bill to cancel.")
    issued = invoice.get("eway_bill_date")
    if issued is not None:
        if isinstance(issued, str):
            issued = datetime.fromisoformat(issued)
        if issued.tzinfo is None:
            issued = issued.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - issued > timedelta(hours=EWB_CANCEL_WINDOW_HOURS):
            raise HTTPException(
                status_code=409,
                detail=f"An e-way bill can be cancelled only within {EWB_CANCEL_WINDOW_HOURS} hours of generation.",
            )

    provider = _provider_or_503()
    req = {"ewbNo": ewb_no, "cancelRsnCode": payload.reason_code, "cancelRmrk": payload.remarks}
    try:
        result = await provider.cancel_ewaybill(str(ewb_no), payload.reason_code)
    except ProviderError as exc:
        await _fail(
            db, company_id=company_id, invoice_id=invoice["id"], action="Cancel_EWB",
            request_payload=req, exc=exc, user_id=user_id,
        )
        return

    try:
        await db.execute(
            text(
                "UPDATE caratloop.sales_invoices SET eway_bill_no = NULL, eway_bill_date = NULL, eway_bill_valid_upto = NULL "
                "WHERE id = :id AND company_id = :cid"
            ),
            {"id": str(invoice["id"]), "cid": company_id},
        )
        await _log(
            db, company_id=company_id, invoice_id=invoice["id"], action="Cancel_EWB",
            request_payload=req, response_payload={"ewb_no": result.ewb_no, "cancel_date": result.cancel_date, "raw": result.raw},
            status="Success", error=None, user_id=user_id,
        )
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        logger.exception("e-Way bill cancellation could not be recorded")
        raise HTTPException(status_code=500, detail="The e-way bill was cancelled at the provider but could not be recorded here.") from exc

    return {"status": "success", "invoice_no": invoice["invoice_no"], "cancelled_eway_bill_no": ewb_no, "cancelled_at": result.cancel_date}
