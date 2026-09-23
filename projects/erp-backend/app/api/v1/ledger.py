from uuid import UUID
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.database import get_db
from app.core.security import get_current_user

router = APIRouter(tags=["Ledger & Outstanding"])

@router.get("/party/{party_id}")
async def get_party_ledger(
    party_id: UUID,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    [S44AA] Fetch full Party Ledger statement with running balance.
    """
    company_id = current_user["company_id"]

    party_res = await db.execute(
        text("SELECT id, name, account_id FROM caratloop.parties WHERE id = :pid AND company_id = :cid"),
        {"pid": str(party_id), "cid": company_id}
    )
    party = party_res.mappings().first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    query = """
        SELECT 
            je.entry_date as date, je.entry_type as voucher_type, je.entry_no as voucher_no, 
            jel.narration as particulars, jel.dr_amount as debit, jel.cr_amount as credit,
            SUM(jel.dr_amount - jel.cr_amount) OVER (ORDER BY je.entry_date, je.id, jel.sequence_no) as running_balance,
            NULL as due_date, je.reference_no as bill_ref
        FROM caratloop.journal_entry_lines jel
        JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.company_id = CAST(:cid AS UUID)
          AND (jel.party_id = CAST(:pid AS UUID) OR jel.account_id = :acc_id)
    """
    params = {
        "pid": str(party_id),
        "acc_id": party["account_id"],
        "cid": str(company_id)
    }

    if from_date:
        query += " AND je.entry_date >= :from_date"
        params["from_date"] = from_date
    if to_date:
        query += " AND je.entry_date <= :to_date"
        params["to_date"] = to_date

    query += " ORDER BY je.entry_date ASC, je.id ASC, jel.sequence_no ASC"

    result = await db.execute(text(query), params)
    return [dict(r) for r in result.mappings().all()]


@router.get("/outstanding/receivables")
async def get_receivables(
    as_of_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    company_id = current_user["company_id"]
    query = """
        SELECT 
            p.id as party_id, p.name as party_name, p.gstin,
            COALESCE(SUM(jel.dr_amount - jel.cr_amount), 0) as total_outstanding,
            0 as overdue_amount
        FROM caratloop.parties p
        LEFT JOIN caratloop.journal_entry_lines jel ON (jel.party_id = p.id OR jel.account_id = p.account_id)
        LEFT JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id AND je.company_id = p.company_id
        WHERE p.company_id = :cid AND p.party_type IN ('Customer', 'Both')
    """
    params = {"cid": company_id}
    if as_of_date:
        query += " AND (je.entry_date IS NULL OR je.entry_date <= :as_of)"
        params["as_of"] = date.fromisoformat(str(as_of_date)) if isinstance(as_of_date, (str, date)) else as_of_date

    query += " GROUP BY p.id, p.name, p.gstin"
    
    result = await db.execute(text(query), params)
    return [dict(r) for r in result.mappings().all()]


@router.get("/outstanding/payables")
async def get_payables(
    as_of_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    company_id = current_user["company_id"]
    query = """
        SELECT 
            p.id as party_id, p.name as party_name, p.gstin,
            COALESCE(SUM(jel.cr_amount - jel.dr_amount), 0) as total_outstanding,
            0 as overdue_amount
        FROM caratloop.parties p
        LEFT JOIN caratloop.journal_entry_lines jel ON (jel.party_id = p.id OR jel.account_id = p.account_id)
        LEFT JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id AND je.company_id = p.company_id
        WHERE p.company_id = :cid AND p.party_type IN ('Vendor', 'Supplier', 'Both')
    """
    params = {"cid": company_id}
    if as_of_date:
        query += " AND (je.entry_date IS NULL OR je.entry_date <= :as_of)"
        params["as_of"] = date.fromisoformat(str(as_of_date)) if isinstance(as_of_date, (str, date)) else as_of_date

    query += " GROUP BY p.id, p.name, p.gstin"

    result = await db.execute(text(query), params)
    return [dict(r) for r in result.mappings().all()]


@router.get("/outstanding/age-wise")
async def get_age_wise_outstanding(
    party_type: Optional[str] = "Customer",
    as_of_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    [Section 44AA] Age-wise Debtors/Creditors Outstanding Aging Analysis.
    Buckets: 0-30 days, 31-60 days, 61-90 days, >90 days.
    """
    company_id = current_user["company_id"]
    if not as_of_date:
        as_of_date = date.today()
    elif isinstance(as_of_date, str):
        as_of_date = date.fromisoformat(as_of_date)

    is_cust = party_type in ('Customer', 'Debtor')

    if is_cust:
        party_filter = "(p.party_type = 'Customer' OR p.party_type = 'Both')"
    else:
        party_filter = "(p.party_type = 'Vendor' OR p.party_type = 'Supplier' OR p.party_type = 'Both')"

    query = f"""
        SELECT 
            p.id as party_id,
            p.name as party_name,
            COALESCE(p.gstin, 'Unregistered') as gstin,
            p.phone,
            COALESCE(SUM(
                CASE 
                    WHEN :is_cust THEN (jel.dr_amount - jel.cr_amount)
                    ELSE (jel.cr_amount - jel.dr_amount)
                END
            ), 0) as total_outstanding,
            COALESCE(SUM(
                CASE 
                    WHEN (CAST(:as_of_date AS DATE) - je.entry_date) <= 30 THEN 
                        CASE WHEN :is_cust THEN (jel.dr_amount - jel.cr_amount) ELSE (jel.cr_amount - jel.dr_amount) END
                    ELSE 0 
                END
            ), 0) as d0_30,
            COALESCE(SUM(
                CASE 
                    WHEN (CAST(:as_of_date AS DATE) - je.entry_date) BETWEEN 31 AND 60 THEN 
                        CASE WHEN :is_cust THEN (jel.dr_amount - jel.cr_amount) ELSE (jel.cr_amount - jel.dr_amount) END
                    ELSE 0 
                END
            ), 0) as d31_60,
            COALESCE(SUM(
                CASE 
                    WHEN (CAST(:as_of_date AS DATE) - je.entry_date) BETWEEN 61 AND 90 THEN 
                        CASE WHEN :is_cust THEN (jel.dr_amount - jel.cr_amount) ELSE (jel.cr_amount - jel.dr_amount) END
                    ELSE 0 
                END
            ), 0) as d61_90,
            COALESCE(SUM(
                CASE 
                    WHEN (CAST(:as_of_date AS DATE) - je.entry_date) > 90 THEN 
                        CASE WHEN :is_cust THEN (jel.dr_amount - jel.cr_amount) ELSE (jel.cr_amount - jel.dr_amount) END
                    ELSE 0 
                END
            ), 0) as d90_plus
        FROM caratloop.parties p
        LEFT JOIN caratloop.journal_entry_lines jel ON (jel.party_id = p.id OR jel.account_id = p.account_id)
        LEFT JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id 
            AND je.company_id = p.company_id 
            AND je.status = 'Posted'
            AND je.entry_date <= CAST(:as_of_date AS DATE)
        WHERE p.company_id = :cid 
          AND {party_filter}
        GROUP BY p.id, p.name, p.gstin, p.phone
        HAVING COALESCE(SUM(
            CASE 
                WHEN :is_cust THEN (jel.dr_amount - jel.cr_amount)
                ELSE (jel.cr_amount - jel.dr_amount)
            END
        ), 0) != 0
        ORDER BY total_outstanding DESC
    """

    result = await db.execute(
        text(query),
        {
            "cid": company_id,
            "as_of_date": as_of_date,
            "is_cust": is_cust,
        }
    )
    rows = result.mappings().all()

    formatted = []
    for r in rows:
        item = dict(r)
        item["total"] = float(item["total_outstanding"] or 0)
        item["d0_30"] = float(item["d0_30"] or 0)
        item["d31_60"] = float(item["d31_60"] or 0)
        item["d61_90"] = float(item["d61_90"] or 0)
        item["d90_plus"] = float(item["d90_plus"] or 0)
        formatted.append(item)

    return formatted


