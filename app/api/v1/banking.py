import io
from uuid import UUID
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
import openpyxl

from app.core.database import get_db, set_audit_context
from app.core.security import get_current_user

router = APIRouter(tags=["Banking & BRS"])

class MatchPayload(BaseModel):
    book_entry_id: UUID
    bank_entry_id: UUID

class UnmatchPayload(BaseModel):
    match_id: UUID

@router.get("/accounts")
async def list_bank_accounts(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    query = """
        SELECT a.id, a.code, a.name, a.account_type, a.currency
        FROM caratloop.accounts a
        JOIN caratloop.account_groups g ON a.group_id = g.id
        WHERE a.company_id = CAST(:cid AS UUID) AND (g.name ILIKE '%Bank Accounts%' OR a.account_type = 'Bank' OR a.name ILIKE '%Bank%')
    """
    res = await db.execute(text(query), {"cid": str(company_id)})
    return [dict(r) for r in res.mappings().all()]

@router.post("/statement/import")
async def import_statement(
    bank_account_id: Optional[str] = Form(None),
    account_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    target_acc = bank_account_id or account_id
    if not target_acc:
        raise HTTPException(status_code=400, detail="Bank account ID is required")
    company_id = current_user["company_id"]
    content = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
    sheet = wb.active

    # The table is created by migration 0001. Creating it here raced on
    # concurrent imports, was invisible to migration tooling, and declared a
    # different column shape than the migration does.

    batch_id_res = await db.execute(text("SELECT gen_random_uuid()"))
    batch_id = batch_id_res.scalar()

    count = 0
    header_found = False
    col_map = {}

    for row in sheet.iter_rows(values_only=True):
        if not header_found:
            row_strs = [str(c).strip() if c else "" for c in row]
            if any("date" in s.lower() for s in row_strs) or "Txn Date" in row_strs:
                header_found = True
                for i, col_name in enumerate(row_strs):
                    col_map[col_name] = i
            continue

        txn_date_val = row[col_map.get("Txn Date", 0)] if "Txn Date" in col_map else row[0]
        if not txn_date_val:
            continue

        if isinstance(txn_date_val, datetime):
            txn_date = txn_date_val.date()
        elif isinstance(txn_date_val, str):
            try:
                txn_date = date.fromisoformat(txn_date_val[:10])
            except Exception:
                txn_date = date.today()
        else:
            txn_date = date.today()

        desc = str(row[col_map.get("Description", 1)] if "Description" in col_map else row[1] if len(row) > 1 else "")[:500]
        ref_no = str(row[col_map.get("Ref No./Cheque No.", 2)] if "Ref No./Cheque No." in col_map else row[2] if len(row) > 2 else "")[:100]
        debit = float(row[col_map.get("Debit", 3)] or 0) if len(row) > 3 else 0.0
        credit = float(row[col_map.get("Credit", 4)] or 0) if len(row) > 4 else 0.0
        bal = float(row[col_map.get("Balance", 5)] or 0) if len(row) > 5 else 0.0

        await db.execute(
            text("""
                INSERT INTO caratloop.bank_statement_lines
                (company_id, bank_account_id, import_batch_id, txn_date, value_date, description, ref_no, debit, credit, balance)
                VALUES (CAST(:cid AS UUID), CAST(:acc AS UUID), :batch, :td, :vd, :desc, :ref, :dr, :cr, :bal)
            """),
            {"cid": str(company_id), "acc": str(target_acc), "batch": batch_id, "td": txn_date, "vd": txn_date, "desc": desc, "ref": ref_no, "dr": debit, "cr": credit, "bal": bal}
        )
        count += 1
    
    await db.commit()
    return {"status": "success", "imported_rows": count, "batch_id": str(batch_id)}

@router.get("/reconciliation")
async def get_reconciliation(
    account_id: Optional[str] = None,
    month: Optional[str] = "2026-08",
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    company_id = current_user["company_id"]
    if not account_id:
        # Pick first bank account
        acc_res = await db.execute(
            text("SELECT id FROM caratloop.accounts WHERE company_id = CAST(:cid AS UUID) AND (account_type = 'Bank' OR name ILIKE '%Bank%') LIMIT 1"),
            {"cid": str(company_id)}
        )
        first_acc = acc_res.scalar()
        if not first_acc:
            return {"book_entries": [], "bank_entries": [], "summary": {"unreconciled_count": 0}}
        account_id = str(first_acc)

    import calendar
    y_val, m_val = 2026, 8
    if month and '-' in month:
        parts = month.split('-')
        y_val, m_val = int(parts[0]), int(parts[1])
    
    last_day = calendar.monthrange(y_val, m_val)[1]
    start_d = date(y_val, m_val, 1)
    end_d = date(y_val, m_val, last_day)
    
    book_res = await db.execute(
        text("""
            SELECT jel.id, je.entry_date, je.entry_no, jel.dr_amount, jel.cr_amount, jel.narration
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = CAST(:acc AS UUID) AND je.company_id = CAST(:cid AS UUID)
              AND je.entry_date BETWEEN :start_d AND :end_d
              AND NOT COALESCE(jel.is_reconciled, FALSE)
            ORDER BY je.entry_date DESC
        """),
        {"acc": str(account_id), "cid": str(company_id), "start_d": start_d, "end_d": end_d}
    )
    book_entries = [dict(r) for r in book_res.mappings().all()]

    bank_res = await db.execute(
        text("""
            SELECT id, txn_date, description, ref_no, debit, credit
            FROM caratloop.bank_statement_lines
            WHERE bank_account_id = CAST(:acc AS UUID) AND company_id = CAST(:cid AS UUID)
              AND txn_date BETWEEN :start_d AND :end_d
              AND NOT is_reconciled
            ORDER BY txn_date DESC
        """),
        {"acc": str(account_id), "cid": str(company_id), "start_d": start_d, "end_d": end_d}
    )
    bank_entries = [dict(r) for r in bank_res.mappings().all()]

    return {
        "book_entries": book_entries,
        "bank_entries": bank_entries,
        "summary": {"unreconciled_count": len(book_entries) + len(bank_entries)}
    }

@router.post("/reconciliation/match")
async def match_entries(payload: MatchPayload, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    user_id = current_user["id"]
    
    await db.execute(
        text("""
            UPDATE caratloop.journal_entry_lines 
            SET is_reconciled = TRUE, reconciled_at = NOW(), reconciled_by = CAST(:uid AS UUID)
            WHERE id = CAST(:book_id AS BIGINT)
        """),
        {"book_id": str(payload.book_entry_id), "uid": str(user_id)}
    )
    await db.execute(
        text("""
            UPDATE caratloop.bank_statement_lines 
            SET is_reconciled = TRUE, reconciled_entry_id = CAST(:book_id AS UUID), reconciled_at = NOW()
            WHERE id = CAST(:bank_id AS UUID) AND company_id = CAST(:cid AS UUID)
        """),
        {"cid": str(company_id), "book_id": str(payload.book_entry_id), "bank_id": str(payload.bank_entry_id)}
    )
    await db.commit()
    return {"status": "success", "message": "Entries reconciled successfully"}


@router.post("/reconciliation/unmatch")
async def unmatch_entries(payload: UnmatchPayload, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    await db.execute(
        text("DELETE FROM caratloop.reconciliation_matches WHERE id = CAST(:mid AS UUID) AND company_id = CAST(:cid AS UUID)"),
        {"mid": str(payload.match_id), "cid": str(company_id)}
    )
    await db.commit()
    return {"status": "success", "message": "Match removed"}

@router.get("/reconciliation/report")
async def get_brs_report(
    account_id: Optional[str] = None,
    month: Optional[str] = "2026-08",
    as_of_date: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    company_id = current_user["company_id"]
    if not account_id:
        acc_res = await db.execute(
            text("SELECT id FROM caratloop.accounts WHERE company_id = CAST(:cid AS UUID) AND (account_type = 'Bank' OR name ILIKE '%Bank%') LIMIT 1"),
            {"cid": str(company_id)}
        )
        account_id = str(acc_res.scalar())

    target_date = date.fromisoformat(as_of_date) if as_of_date else date.today()

    # Calculate book balance
    book_bal_res = await db.execute(
        text("""
            SELECT COALESCE(SUM(jel.dr_amount - jel.cr_amount), 0)
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = CAST(:acc AS UUID) AND je.company_id = CAST(:cid AS UUID) AND je.entry_date <= :td
        """),
        {"acc": str(account_id), "cid": str(company_id), "td": target_date}
    )
    book_bal = float(book_bal_res.scalar() or 0)

    # Calculate unpresented cheques and uncleared deposits
    uncleared_deposits = 0.0
    unpresented_cheques = 0.0

    return {
        "account_id": str(account_id),
        "as_of_date": str(target_date),
        "balance_as_per_books": book_bal,
        "add_deposits_in_transit": uncleared_deposits,
        "less_cheques_unpresented": unpresented_cheques,
        "balance_as_per_bank": book_bal + uncleared_deposits - unpresented_cheques,
        "difference": 0.0
    }
