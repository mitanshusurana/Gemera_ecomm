from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter(tags=["Books of Accounts"])

@router.get("/daybook")
async def get_daybook(
    entry_date: Optional[date] = None,
    voucher_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    target_date = entry_date if entry_date else date.today()
    company_id = current_user["company_id"]
    query = """
        SELECT id, entry_no, entry_date, entry_type as voucher_type, narration, total_debit, total_credit
        FROM caratloop.journal_entries
        WHERE company_id = :cid AND entry_date = :date
    """
    params = {"cid": company_id, "date": target_date}
    if voucher_type:
        query += " AND entry_type = :vtype"
        params["vtype"] = voucher_type
    query += " ORDER BY sequence_no"

    res = await db.execute(text(query), params)
    entries = [dict(r) for r in res.mappings().all()]
    for e in entries:
        l_res = await db.execute(text("SELECT * FROM caratloop.journal_entry_lines WHERE journal_entry_id = :jeid"), {"jeid": e['id']})
        e['lines'] = [dict(r) for r in l_res.mappings().all()]
    
    return entries

@router.get("/cashbook")
async def get_cashbook(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    company_id = current_user["company_id"]
    query = """
        SELECT 
            je.entry_date as date, jel.narration as particulars, je.entry_type as voucher_type, je.entry_no as voucher_no,
            jel.dr_amount as debit, jel.cr_amount as credit,
            SUM(jel.dr_amount - jel.cr_amount) OVER (ORDER BY je.entry_date, je.id) as balance
        FROM caratloop.journal_entry_lines jel
        JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
        JOIN caratloop.accounts a ON a.id = jel.account_id
        WHERE je.company_id = :cid AND (a.account_type = 'Cash' OR a.name ILIKE '%Cash%')
    """
    params = {"cid": company_id}
    if from_date:
        query += " AND je.entry_date >= :f"
        params["f"] = from_date
    if to_date:
        query += " AND je.entry_date <= :t"
        params["t"] = to_date
    query += " ORDER BY je.entry_date, je.id"
    
    res = await db.execute(text(query), params)
    return [dict(r) for r in res.mappings().all()]

@router.get("/bankbook")
async def get_bankbook(
    account_id: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    company_id = current_user["company_id"]
    query = """
        SELECT 
            je.entry_date as date, jel.narration as particulars, je.entry_type as voucher_type, je.entry_no as voucher_no,
            jel.dr_amount as debit, jel.cr_amount as credit,
            SUM(jel.dr_amount - jel.cr_amount) OVER (ORDER BY je.entry_date, je.id) as balance,
            je.reference_no as instrument_no
        FROM caratloop.journal_entry_lines jel
        JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.company_id = :cid AND jel.account_id = CAST(:acc AS UUID)
    """
    params = {"cid": company_id, "acc": str(account_id)}
    if from_date:
        query += " AND je.entry_date >= :f"
        params["f"] = from_date
    if to_date:
        query += " AND je.entry_date <= :t"
        params["t"] = to_date
    query += " ORDER BY je.entry_date, je.id"
    
    res = await db.execute(text(query), params)
    return [dict(r) for r in res.mappings().all()]

