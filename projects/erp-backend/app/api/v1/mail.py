"""
Caratloop ERP — E-mailing documents

Send a sales invoice, a quote or an order, a statement of account, or a
reminder for overdue invoices, and keep a log of what went to whom.

Nothing is sent on a schedule: every message is started by a person, one
document or one batch of reminders at a time. The reminder batch is shown
first (``GET /mail/overdue``) so the list can be read before it is sent.
The body carries the document's figures; the PDF is still printed from the
invoice screen.
"""
import logging
from datetime import date
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import mailer
from app.core.company import fetch_company, fetch_default_bank_account, public_company
from app.core.config import settings
from app.core.database import get_db
from app.core.money import to_decimal
from app.core.roles import CAN_POST, require
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["E-mail"])


class SendRequest(BaseModel):
    to: Optional[str] = Field(default=None, max_length=500)      # blank = the party's e-mail on file
    cc: Optional[str] = Field(default=None, max_length=500)
    message: Optional[str] = Field(default=None, max_length=2000)


class RemindersRequest(BaseModel):
    party_ids: Optional[List[UUID]] = None                       # blank = every customer with overdue invoices and an e-mail
    message: Optional[str] = Field(default=None, max_length=2000)


def _require_configured() -> None:
    if not mailer.is_configured():
        raise HTTPException(status_code=503, detail="E-mail is not set up on this server. Add SMTP_HOST, SMTP_FROM and the SMTP login to the ERP environment.")


def _recipients(payload_to: Optional[str], on_file: Optional[str], cc: Optional[str]) -> tuple[list[str], list[str]]:
    try:
        to = mailer.split_addresses(payload_to) or mailer.split_addresses(on_file)
        cc_list = mailer.split_addresses(cc)
    except ValueError:
        raise HTTPException(status_code=422, detail="One of the e-mail addresses is not valid.")
    if not to:
        raise HTTPException(status_code=422, detail="No e-mail address: the party has none on file and none was given.")
    return to, cc_list


async def _company(db: AsyncSession, company_id) -> dict:
    row = await fetch_company(db, company_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return public_company(row, await fetch_default_bank_account(db, company_id))


async def _deliver(db: AsyncSession, *, company_id, user_id, kind: str, to: list[str], cc: list[str],
                   subject: str, html: str, text_body: str, ref_type: str, ref_id: str) -> dict:
    """Send, then record the outcome either way. A failed send is a 502, not a silent success."""
    error = None
    try:
        await mailer.send_mail(to, subject, html, text_body, cc)
    except Exception as e:  # noqa: BLE001 - any SMTP failure is recorded and reported, never swallowed
        logger.exception("E-mail delivery failed")
        error = f"{e.__class__.__name__}"
    await db.execute(
        text("""
            INSERT INTO caratloop.email_log (company_id, kind, to_address, cc_address, subject, reference_type, reference_id, status, error, sent_by)
            VALUES (:cid, :kind, :to, :cc, :subject, :rtype, :rid, :status, :error, CAST(:uid AS UUID))
        """),
        {"cid": company_id, "kind": kind, "to": ", ".join(to)[:500], "cc": ", ".join(cc)[:500] or None, "subject": subject[:300],
         "rtype": ref_type, "rid": ref_id[:60], "status": "Failed" if error else "Sent", "error": error, "uid": user_id},
    )
    await db.commit()
    if error:
        raise HTTPException(status_code=502, detail="The mail server refused or could not be reached. Nothing was sent; the attempt is in the mail log.")
    return {"status": "sent", "to": to, "cc": cc, "subject": subject}


@router.get("/status")
async def mail_status(current_user: dict = Depends(get_current_user)):
    return {"configured": mailer.is_configured(), "from": settings.SMTP_FROM or None}


@router.post("/invoice/{invoice_id}", dependencies=[Depends(require(*CAN_POST))])
async def email_invoice(invoice_id: UUID, payload: SendRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _require_configured()
    cid = current_user["company_id"]
    head = await db.execute(
        text("""
            SELECT si.id, si.invoice_no, si.invoice_date, si.due_date, si.grand_total, si.amount_paid, si.total_gst, si.status,
                   COALESCE(NULLIF(p.trade_name, ''), p.name) AS party_name, p.email AS party_email
            FROM caratloop.sales_invoices si
            JOIN caratloop.parties p ON p.id = si.customer_id
            WHERE si.id = :id AND si.company_id = :cid
        """),
        {"id": str(invoice_id), "cid": cid},
    )
    inv = head.mappings().first()
    if inv is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] == "Cancelled":
        raise HTTPException(status_code=409, detail=f"{inv['invoice_no']} is cancelled and cannot be e-mailed.")
    to, cc = _recipients(payload.to, inv["party_email"], payload.cc)
    lines = await db.execute(
        text("""
            SELECT COALESCE(sil.description, m.name, 'Item') AS description, sil.quantity, sil.line_total
            FROM caratloop.sales_invoice_lines sil
            LEFT JOIN caratloop.materials m ON m.id = sil.material_id
            WHERE sil.invoice_id = :id
            ORDER BY sil.sequence_no
        """),
        {"id": str(invoice_id)},
    )
    subject, html, body = mailer.invoice_email(await _company(db, cid), dict(inv), [dict(r) for r in lines.mappings().all()], payload.message)
    return await _deliver(db, company_id=cid, user_id=str(current_user["id"]), kind="Invoice", to=to, cc=cc,
                          subject=subject, html=html, text_body=body, ref_type="SalesInvoice", ref_id=inv["invoice_no"])


@router.post("/order/{doc_id}", dependencies=[Depends(require(*CAN_POST))])
async def email_order(doc_id: UUID, payload: SendRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _require_configured()
    cid = current_user["company_id"]
    head = await db.execute(
        text("""
            SELECT d.id, d.doc_type, d.doc_no, d.doc_date, d.valid_until, d.grand_total, d.terms, d.status,
                   COALESCE(NULLIF(p.trade_name, ''), p.name) AS party_name, p.email AS party_email
            FROM caratloop.order_documents d
            JOIN caratloop.parties p ON p.id = d.party_id
            WHERE d.id = :id AND d.company_id = :cid
        """),
        {"id": str(doc_id), "cid": cid},
    )
    doc = head.mappings().first()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc["status"] == "Cancelled":
        raise HTTPException(status_code=409, detail=f"{doc['doc_no']} is cancelled and cannot be e-mailed.")
    to, cc = _recipients(payload.to, doc["party_email"], payload.cc)
    lines = await db.execute(
        text("""
            SELECT l.description, m.name AS material_name, l.quantity, l.taxable, l.gst_amount, l.line_total
            FROM caratloop.order_document_lines l
            LEFT JOIN caratloop.materials m ON m.id = l.material_id
            WHERE l.document_id = :id
            ORDER BY l.sequence_no
        """),
        {"id": str(doc_id)},
    )
    subject, html, body = mailer.order_email(await _company(db, cid), dict(doc), [dict(r) for r in lines.mappings().all()], payload.message)
    return await _deliver(db, company_id=cid, user_id=str(current_user["id"]), kind=doc["doc_type"], to=to, cc=cc,
                          subject=subject, html=html, text_body=body, ref_type="OrderDocument", ref_id=doc["doc_no"])


async def _open_invoices(db: AsyncSession, company_id, *, party_id=None, overdue_only: bool) -> list[dict]:
    """Open sales invoices with their balance and days overdue, by the same due-date rule as the dashboard."""
    res = await db.execute(
        text("""
            SELECT si.customer_id AS party_id, COALESCE(NULLIF(p.trade_name, ''), p.name) AS party_name, p.email AS party_email,
                   si.invoice_no, si.invoice_date,
                   COALESCE(si.due_date, si.invoice_date + COALESCE(p.credit_days, 0)) AS due_date,
                   si.grand_total - si.amount_paid AS balance,
                   CAST(:today AS DATE) - COALESCE(si.due_date, si.invoice_date + COALESCE(p.credit_days, 0)) AS days_overdue
            FROM caratloop.sales_invoices si
            JOIN caratloop.parties p ON p.id = si.customer_id
            WHERE si.company_id = :cid
              AND si.payment_status != 'Paid' AND si.status != 'Cancelled'
              AND si.grand_total - si.amount_paid > 0
              AND (CAST(:pid AS UUID) IS NULL OR si.customer_id = CAST(:pid AS UUID))
              AND (NOT CAST(:overdue AS BOOLEAN)
                   OR COALESCE(si.due_date, si.invoice_date + COALESCE(p.credit_days, 0)) < CAST(:today AS DATE))
            ORDER BY party_name, due_date
            LIMIT 2000
        """),
        {"cid": company_id, "today": date.today(), "pid": str(party_id) if party_id else None, "overdue": overdue_only},
    )
    return [dict(r) for r in res.mappings().all()]


def _by_party(rows: list[dict]) -> list[dict]:
    out: dict[str, dict] = {}
    for r in rows:
        key = str(r["party_id"])
        g = out.setdefault(key, {"party_id": key, "party_name": r["party_name"], "email": r["party_email"], "invoices": [], "total": 0.0})
        g["invoices"].append(r)
        g["total"] = round(g["total"] + float(to_decimal(r["balance"])), 2)
    return list(out.values())


@router.post("/statement/{party_id}", dependencies=[Depends(require(*CAN_POST))])
async def email_statement(party_id: UUID, payload: SendRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    _require_configured()
    cid = current_user["company_id"]
    rows = await _open_invoices(db, cid, party_id=party_id, overdue_only=False)
    if not rows:
        raise HTTPException(status_code=404, detail="This party has no open invoices to state.")
    to, cc = _recipients(payload.to, rows[0]["party_email"], payload.cc)
    subject, html, body = mailer.statement_email(await _company(db, cid), rows[0]["party_name"], rows, date.today(), reminder=False, message=payload.message)
    return await _deliver(db, company_id=cid, user_id=str(current_user["id"]), kind="Statement", to=to, cc=cc,
                          subject=subject, html=html, text_body=body, ref_type="Party", ref_id=str(party_id))


@router.get("/overdue")
async def overdue_customers(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Customers with overdue invoices: what a reminder run would send, and to whom it cannot.

    Bounded by the LIMIT in _open_invoices.
    """
    groups = _by_party(await _open_invoices(db, current_user["company_id"], overdue_only=True))
    for g in groups:
        g["can_email"] = mailer.valid_address(g["email"])
        g["invoice_count"] = len(g["invoices"])
        g["oldest_days"] = max(int(i["days_overdue"]) for i in g["invoices"])
        g["invoices"] = [{"invoice_no": i["invoice_no"], "due_date": str(i["due_date"]), "days_overdue": int(i["days_overdue"]),
                          "balance": float(to_decimal(i["balance"]))} for i in g["invoices"]]
    return {"configured": mailer.is_configured(), "customers": groups, "total": round(sum(g["total"] for g in groups), 2)}


@router.post("/reminders", dependencies=[Depends(require(*CAN_POST))])
async def send_reminders(payload: RemindersRequest, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """One reminder per customer listing their overdue invoices. Customers without an e-mail are reported, not skipped silently."""
    _require_configured()
    cid = current_user["company_id"]
    wanted = {str(p) for p in payload.party_ids} if payload.party_ids else None
    company = await _company(db, cid)
    sent, failed, no_email = [], [], []
    for g in _by_party(await _open_invoices(db, cid, overdue_only=True)):
        if wanted is not None and g["party_id"] not in wanted:
            continue
        if not mailer.valid_address(g["email"]):
            no_email.append(g["party_name"])
            continue
        subject, html, body = mailer.statement_email(company, g["party_name"], g["invoices"], date.today(), reminder=True, message=payload.message)
        try:
            await _deliver(db, company_id=cid, user_id=str(current_user["id"]), kind="Reminder", to=[g["email"].strip()], cc=[],
                           subject=subject, html=html, text_body=body, ref_type="Party", ref_id=g["party_id"])
            sent.append(g["party_name"])
        except HTTPException:
            failed.append(g["party_name"])
    return {"sent": sent, "failed": failed, "no_email": no_email}


@router.get("/log")
async def list_mail_log(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    res = await db.execute(
        text("""
            SELECT l.id, l.kind, l.to_address, l.cc_address, l.subject, l.reference_type, l.reference_id, l.status, l.error, l.sent_at,
                   u.full_name AS sent_by_name
            FROM caratloop.email_log l
            LEFT JOIN caratloop.users u ON u.id = l.sent_by
            WHERE l.company_id = :cid
            ORDER BY l.sent_at DESC
            LIMIT 200
        """),
        {"cid": current_user["company_id"]},
    )
    return {"log": [dict(r) for r in res.mappings().all()]}
