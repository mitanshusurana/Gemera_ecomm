import logging
from uuid import UUID
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.core.database import get_db, set_audit_context
from app.core.ledger import assert_journal_balanced
from app.core.roles import CAN_AMEND, CAN_POST, require
from app.core.pagination import Page, paginate
from app.core.security import get_current_user
from app.core.tenancy import resolve_fiscal_year

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Vouchers"])

class ReceiptPaymentPayload(BaseModel):
    party_id: UUID
    bank_account_id: UUID
    amount: float
    date: date
    reference_no: Optional[str] = None
    invoice_id: Optional[UUID] = None
    payment_mode: Optional[str] = "NEFT"
    narration: str
    reason: str = "Voucher entry"

class ContraPayload(BaseModel):
    from_account_id: UUID
    to_account_id: UUID
    amount: float
    date: date
    narration: str
    reason: str = "Contra entry"

class JournalLine(BaseModel):
    account_id: UUID
    debit: float
    credit: float
    remarks: Optional[str] = None

class JournalPayload(BaseModel):
    date: date
    narration: str
    lines: List[JournalLine]
    reason: str = "Journal entry"

class CreditNotePayload(BaseModel):
    party_id: UUID
    original_invoice_id: UUID
    material_value: float
    making_charges: float
    reason: str
    date: date

class DebitNotePayload(BaseModel):
    party_id: UUID
    original_purchase_id: UUID
    amount: float
    reason: str
    date: date

async def get_fy(db, company_id):
    return await resolve_fiscal_year(db, company_id)

async def post_journal(db, cid, fy_id, je_no, entry_date, entry_type, narration, ref_no, amount, created_by, ip, sid, lines):
    # Convert entry_date if string
    entry_date_obj = date.fromisoformat(str(entry_date)) if isinstance(entry_date, str) else entry_date
    session_id_val = int(sid) if str(sid).isdigit() and int(sid) > 0 else None

    # Insert Header
    je_res = await db.execute(
        text("""
            INSERT INTO caratloop.journal_entries (
                company_id, fiscal_year_id, entry_no, entry_date, entry_type,
                narration, reference_no, total_debit, total_credit, created_by, ip_address, session_id, sequence_no
            ) VALUES (
                :cid, :fyid, :je_no, :date, :type, :narr, :ref, :dr, :cr, :cb, CAST(:ip AS INET), :sid, nextval('caratloop.journal_entry_seq')
            ) RETURNING id
        """),
        {"cid": cid, "fyid": fy_id, "je_no": je_no, "date": entry_date_obj, "type": entry_type, "narr": narration, "ref": ref_no, "dr": amount, "cr": amount, "cb": created_by, "ip": ip, "sid": session_id_val}
    )
    je_id = je_res.scalar()

    # Insert Lines
    for seq, ln in enumerate(lines, 1):
        # A missing account resolves to None upstream (e.g. a party with no
        # linked ledger account). Posting it produced a line with a NULL
        # account_id -- an orphaned amount in the ledger. Refuse instead.
        if not ln.get('acc'):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot post {entry_type}: line {seq} has no ledger account. "
                    "The party or bank account involved is not linked to an "
                    "account in the chart of accounts. No data was saved."
                ),
            )
        await db.execute(
            text("""
                INSERT INTO caratloop.journal_entry_lines (
                    journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration
                ) VALUES (
                    :je_id, :seq, :acc, :dr, :cr, :narr
                )
            """),
            {"je_id": je_id, "seq": seq, "acc": str(ln['acc']), "dr": ln['dr'], "cr": ln['cr'], "narr": ln.get('narr', '')}
        )

    # Every voucher type routes through here, so one check covers receipt,
    # payment, contra, journal, credit note and debit note.
    await assert_journal_balanced(db, je_id, context=f"{entry_type.lower()} voucher")
    return je_id


@router.post("/receipt", dependencies=[Depends(require(*CAN_POST))])
async def create_receipt(payload: ReceiptPaymentPayload, request: Request, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id, company_id = str(current_user["id"]), current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        fy = await get_fy(db, company_id)
        no_res = await db.execute(text("SELECT 'REC/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"), {"fy": fy['year_label']})
        vno = no_res.scalar()

        p_res = await db.execute(text("SELECT account_id FROM caratloop.parties WHERE id = :pid"), {"pid": str(payload.party_id)})
        party_acc = p_res.scalar()

        lines = [
            {'acc': payload.bank_account_id, 'dr': payload.amount, 'cr': 0.0, 'narr': payload.narration},
            {'acc': party_acc, 'dr': 0.0, 'cr': payload.amount, 'narr': payload.narration}
        ]
        je_id = await post_journal(db, company_id, str(fy['id']), vno, payload.date, 'Receipt', payload.narration, payload.reference_no, payload.amount, user_id, ip_address, session_id, lines)

        # Mark sales invoice as Paid if invoice_id or reference_no matched
        if payload.invoice_id:
            await db.execute(
                text("UPDATE caratloop.sales_invoices SET payment_status = 'Paid' WHERE id = CAST(:invid AS UUID) AND company_id = :cid"),
                {"invid": str(payload.invoice_id), "cid": company_id}
            )
        elif payload.reference_no:
            await db.execute(
                text("UPDATE caratloop.sales_invoices SET payment_status = 'Paid' WHERE invoice_no = :invno AND company_id = :cid"),
                {"invno": payload.reference_no.strip(), "cid": company_id}
            )

        await db.commit()
        return {"status": "success", "voucher_no": vno, "id": str(je_id)}
    except HTTPException:
        # Authorisation, unbalanced-entry and missing-account errors are
        # deliberate 4xx responses and must not become 500s.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Voucher posting failed")
        raise HTTPException(
            status_code=500,
            detail="Voucher posting failed. The operation was rolled back and nothing was saved.",
        ) from e

@router.post("/payment", dependencies=[Depends(require(*CAN_POST))])
async def create_payment(payload: ReceiptPaymentPayload, request: Request, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id, company_id = str(current_user["id"]), current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
    
    try:
        fy = await get_fy(db, company_id)
        no_res = await db.execute(text("SELECT 'PAY/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"), {"fy": fy['year_label']})
        vno = no_res.scalar()

        p_res = await db.execute(text("SELECT account_id FROM caratloop.parties WHERE id = :pid"), {"pid": str(payload.party_id)})
        party_acc = p_res.scalar()

        lines = [
            {'acc': party_acc, 'dr': payload.amount, 'cr': 0.0, 'narr': payload.narration},
            {'acc': payload.bank_account_id, 'dr': 0.0, 'cr': payload.amount, 'narr': payload.narration}
        ]
        je_id = await post_journal(db, company_id, str(fy['id']), vno, payload.date, 'Payment', payload.narration, payload.reference_no, payload.amount, user_id, ip_address, session_id, lines)

        # Mark purchase invoice as Paid if invoice_id or reference_no matched
        if payload.invoice_id:
            await db.execute(
                text("UPDATE caratloop.purchase_invoices SET payment_status = 'Paid' WHERE id = CAST(:invid AS UUID) AND company_id = :cid"),
                {"invid": str(payload.invoice_id), "cid": company_id}
            )
        elif payload.reference_no:
            await db.execute(
                text("UPDATE caratloop.purchase_invoices SET payment_status = 'Paid' WHERE (vendor_inv_no = :invno OR bill_no = :invno) AND company_id = :cid"),
                {"invno": payload.reference_no.strip(), "cid": company_id}
            )

        await db.commit()
        return {"status": "success", "voucher_no": vno, "id": str(je_id)}
    except HTTPException:
        # Authorisation, unbalanced-entry and missing-account errors are
        # deliberate 4xx responses and must not become 500s.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Voucher posting failed")
        raise HTTPException(
            status_code=500,
            detail="Voucher posting failed. The operation was rolled back and nothing was saved.",
        ) from e


@router.get("/open-invoices")
@router.get("/open-invoices/{party_id}")
async def get_open_invoices(
    party_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Fetch recent open / pending invoices for settlement selection."""
    if not party_id:
        return {"sales_invoices": [], "purchase_invoices": []}
    cid = current_user["company_id"]
    sales_res = await db.execute(
        text("""
            SELECT id, invoice_no, invoice_date, grand_total, status, payment_status, 'Sales' AS doc_type
            FROM caratloop.sales_invoices
            WHERE customer_id = CAST(:pid AS UUID) AND company_id = :cid AND status != 'Cancelled'
            ORDER BY invoice_date DESC LIMIT 50
        """),
        {"pid": str(party_id), "cid": cid}
    )
    purch_res = await db.execute(
        text("""
            SELECT id, bill_no AS invoice_no, vendor_inv_no AS supplier_invoice_no, bill_date AS invoice_date, grand_total, status, payment_status, 'Purchase' AS doc_type
            FROM caratloop.purchase_invoices
            WHERE vendor_id = CAST(:pid AS UUID) AND company_id = :cid AND status != 'Cancelled'
            ORDER BY bill_date DESC LIMIT 50
        """),
        {"pid": str(party_id), "cid": cid}
    )
    return {
        "sales_invoices": [dict(r) for r in sales_res.mappings().all()],
        "purchase_invoices": [dict(r) for r in purch_res.mappings().all()],
    }


@router.post("/contra", dependencies=[Depends(require(*CAN_POST))])
async def create_contra(payload: ContraPayload, request: Request, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id, company_id = str(current_user["id"]), current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
    
    try:
        fy = await get_fy(db, company_id)
        no_res = await db.execute(text("SELECT 'CON/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"), {"fy": fy['year_label']})
        vno = no_res.scalar()

        lines = [
            {'acc': payload.to_account_id, 'dr': payload.amount, 'cr': 0.0, 'narr': payload.narration},
            {'acc': payload.from_account_id, 'dr': 0.0, 'cr': payload.amount, 'narr': payload.narration}
        ]
        je_id = await post_journal(db, company_id, str(fy['id']), vno, payload.date, 'Contra', payload.narration, None, payload.amount, user_id, ip_address, session_id, lines)
        await db.commit()
        return {"status": "success", "voucher_no": vno, "id": str(je_id)}
    except HTTPException:
        # Authorisation, unbalanced-entry and missing-account errors are
        # deliberate 4xx responses and must not become 500s.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Voucher posting failed")
        raise HTTPException(
            status_code=500,
            detail="Voucher posting failed. The operation was rolled back and nothing was saved.",
        ) from e

@router.post("/journal", dependencies=[Depends(require(*CAN_POST))])
async def create_journal(payload: JournalPayload, request: Request, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id, company_id = str(current_user["id"]), current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
    
    try:
        dr_sum = sum(l.debit for l in payload.lines)
        cr_sum = sum(l.credit for l in payload.lines)
        if abs(dr_sum - cr_sum) > 0.01:
            raise HTTPException(status_code=400, detail="Debits and Credits must balance")

        fy = await get_fy(db, company_id)
        no_res = await db.execute(text("SELECT 'JRN/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"), {"fy": fy['year_label']})
        vno = no_res.scalar()

        lines = [{'acc': l.account_id, 'dr': l.debit, 'cr': l.credit, 'narr': l.remarks or payload.narration} for l in payload.lines]
        je_id = await post_journal(db, company_id, str(fy['id']), vno, payload.date, 'Journal', payload.narration, None, dr_sum, user_id, ip_address, session_id, lines)
        await db.commit()
        return {"status": "success", "voucher_no": vno, "id": str(je_id)}
    except HTTPException:
        # Authorisation, unbalanced-entry and missing-account errors are
        # deliberate 4xx responses and must not become 500s.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Voucher posting failed")
        raise HTTPException(
            status_code=500,
            detail="Voucher posting failed. The operation was rolled back and nothing was saved.",
        ) from e

@router.post("/credit-note", dependencies=[Depends(require(*CAN_AMEND))])
async def create_credit_note(payload: CreditNotePayload, request: Request, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id, company_id = str(current_user["id"]), current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
    try:
        fy = await get_fy(db, company_id)
        no_res = await db.execute(text("SELECT 'CDN/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"), {"fy": fy['year_label']})
        vno = no_res.scalar()

        p_res = await db.execute(text("SELECT account_id FROM caratloop.parties WHERE id = :pid"), {"pid": str(payload.party_id)})
        party_acc = p_res.scalar()

        # Sales return: Dr. Sales A/c, Cr. Customer A/c
        tot_val = payload.material_value + payload.making_charges
        acc_sales = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'SAL-001' AND company_id = :cid"), {"cid": company_id})
        sales_acc_id = acc_sales.scalar()

        lines = [
            {'acc': sales_acc_id, 'dr': tot_val, 'cr': 0.0, 'narr': f'Credit Note — {payload.reason}'},
            {'acc': party_acc, 'dr': 0.0, 'cr': tot_val, 'narr': f'Credit Note — {payload.reason}'}
        ]
        je_id = await post_journal(db, company_id, str(fy['id']), vno, payload.date, 'Credit Note', payload.reason, str(payload.original_invoice_id), tot_val, user_id, ip_address, session_id, lines)
        await db.commit()
        return {"status": "success", "voucher_no": vno, "id": str(je_id)}
    except HTTPException:
        # Authorisation, unbalanced-entry and missing-account errors are
        # deliberate 4xx responses and must not become 500s.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Voucher posting failed")
        raise HTTPException(
            status_code=500,
            detail="Voucher posting failed. The operation was rolled back and nothing was saved.",
        ) from e

@router.post("/debit-note", dependencies=[Depends(require(*CAN_AMEND))])
async def create_debit_note(payload: DebitNotePayload, request: Request, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    user_id, company_id = str(current_user["id"]), current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
    try:
        fy = await get_fy(db, company_id)
        no_res = await db.execute(text("SELECT 'DDN/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"), {"fy": fy['year_label']})
        vno = no_res.scalar()

        p_res = await db.execute(text("SELECT account_id FROM caratloop.parties WHERE id = :pid"), {"pid": str(payload.party_id)})
        party_acc = p_res.scalar()

        acc_pur = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'PUR-001' AND company_id = :cid"), {"cid": company_id})
        pur_acc_id = acc_pur.scalar()

        lines = [
            {'acc': party_acc, 'dr': payload.amount, 'cr': 0.0, 'narr': f'Debit Note — {payload.reason}'},
            {'acc': pur_acc_id, 'dr': 0.0, 'cr': payload.amount, 'narr': f'Debit Note — {payload.reason}'}
        ]
        je_id = await post_journal(db, company_id, str(fy['id']), vno, payload.date, 'Debit Note', payload.reason, str(payload.original_purchase_id), payload.amount, user_id, ip_address, session_id, lines)
        await db.commit()
        return {"status": "success", "voucher_no": vno, "id": str(je_id)}
    except HTTPException:
        # Authorisation, unbalanced-entry and missing-account errors are
        # deliberate 4xx responses and must not become 500s.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Voucher posting failed")
        raise HTTPException(
            status_code=500,
            detail="Voucher posting failed. The operation was rolled back and nothing was saved.",
        ) from e

@router.get("")
async def list_vouchers(type: Optional[str] = None, from_date: Optional[date] = None, to_date: Optional[date] = None, page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    query = "SELECT id, entry_no, entry_date, entry_type, narration, total_debit, status FROM caratloop.journal_entries WHERE company_id = :cid"
    params = {"cid": company_id}
    if type:
        query += " AND entry_type = :type"
        params["type"] = type
    if from_date:
        query += " AND entry_date >= :f"
        params["f"] = str(from_date)
    if to_date:
        query += " AND entry_date <= :t"
        params["t"] = str(to_date)
    
    # Bound the result set. These endpoints previously returned the whole
    # table; the sales register returned every invoice ever raised.
    query = page.apply(query)
    params.update(page.params)

    result = await db.execute(text(query), params)
    return [dict(r) for r in result.mappings().all()]

@router.get("/{id}")
async def get_voucher(id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    res = await db.execute(text("SELECT * FROM caratloop.journal_entries WHERE id = :id AND company_id = :cid"), {"id": str(id), "cid": company_id})
    v = res.mappings().first()
    if not v:
        raise HTTPException(status_code=404, detail="Not found")
    l_res = await db.execute(text("SELECT * FROM caratloop.journal_entry_lines WHERE journal_entry_id = :je_id"), {"je_id": v['id']})
    vd = dict(v)
    vd['lines'] = [dict(r) for r in l_res.mappings().all()]
    return vd
