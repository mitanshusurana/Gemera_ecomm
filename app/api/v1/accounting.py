"""
Caratloop ERP — Accounting API
[S44AA] Double-entry mercantile system: Trial Balance, General Ledger, Journal Entries
"""
import logging
from typing import Optional, List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from uuid import UUID

from app.core.database import get_db, set_audit_context
from decimal import Decimal

from app.core.ledger import TOLERANCE
from app.core.money import to_decimal
from app.core.roles import CAN_AMEND, require
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

class OpeningBalanceItem(BaseModel):
    account_id: UUID
    opening_balance: float
    opening_balance_type: str = "D"  # 'D' or 'C'

class BatchOpeningBalancesRequest(BaseModel):
    balances: List[OpeningBalanceItem]
    reason: str = "Opening balances initialization"

class CreateAccountRequest(BaseModel):
    code: str
    name: str
    group_id: Optional[UUID] = None
    group_code: Optional[str] = None
    account_type: str = "Other"
    normal_balance: str = "D"  # 'D' or 'C'
    opening_balance: float = 0.0
    opening_balance_type: str = "D"
    description: Optional[str] = None
    reason: str = "Account creation"

class UpdateOpeningBalanceRequest(BaseModel):
    opening_balance: float
    opening_balance_type: str = "D"
    reason: str = "Opening balance update"


@router.get("/trial-balance")
async def get_trial_balance(
    as_of_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    [Section 44AA] Trial Balance — every account's debit/credit totals.
    Total debits must equal total credits (double-entry constraint).
    """
    if not as_of_date:
        as_of_date = date.today()

    result = await db.execute(
        text("""
            SELECT
                a.code, a.name AS account_name, ag.name AS group_name,
                a.normal_balance,
                COALESCE(a.opening_balance, 0) AS opening_balance,
                a.opening_balance_type,
                COALESCE(SUM(jel.dr_amount), 0) AS period_debit,
                COALESCE(SUM(jel.cr_amount), 0) AS period_credit,
                CASE
                    WHEN a.normal_balance = 'D' THEN
                        COALESCE(a.opening_balance, 0) + COALESCE(SUM(jel.dr_amount), 0)
                        - COALESCE(SUM(jel.cr_amount), 0)
                    ELSE
                        COALESCE(a.opening_balance, 0) + COALESCE(SUM(jel.cr_amount), 0)
                        - COALESCE(SUM(jel.dr_amount), 0)
                END AS closing_balance
            FROM caratloop.accounts a
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            LEFT JOIN caratloop.journal_entry_lines jel ON jel.account_id = a.id
            LEFT JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                AND je.status = 'Posted'
                AND je.entry_date <= :as_of_date
            WHERE a.company_id = :cid AND a.is_active = TRUE
            GROUP BY a.id, a.code, a.name, ag.name, a.normal_balance,
                     a.opening_balance, a.opening_balance_type
            ORDER BY ag.name, a.code
        """),
        {"as_of_date": as_of_date, "cid": current_user["company_id"]},
    )
    formatted_rows = []
    for r in result.mappings().all():
        row_dict = dict(r)
        dr_val = to_decimal(r["period_debit"])
        cr_val = to_decimal(r["period_credit"])
        row_dict["total_debit"] = dr_val
        row_dict["total_credit"] = cr_val
        row_dict["debit"] = dr_val
        row_dict["credit"] = cr_val
        row_dict["net_balance"] = to_decimal(r["closing_balance"])
        formatted_rows.append(row_dict)

    # Start at Decimal("0") so an empty trial balance does not fall back to
    # int, and compare against the same tolerance the ledger guard uses so the
    # report and the posting check can never disagree.
    total_dr = sum((r["total_debit"] for r in formatted_rows), Decimal("0"))
    total_cr = sum((r["total_credit"] for r in formatted_rows), Decimal("0"))
    balanced = abs(total_dr - total_cr) <= TOLERANCE

    return {
        "as_of_date": str(as_of_date),
        "section_44aa": "Trial Balance — Double-Entry Verification",
        "accounts": formatted_rows,
        "trial_balance": formatted_rows,
        "totals": {
            "total_debit": total_dr,
            "total_credit": total_cr,
            "is_balanced": balanced,
            "difference": abs(total_dr - total_cr),
        },
    }


@router.get("/ledger/{account_id}")
async def get_general_ledger(
    account_id: UUID,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """[Section 44AA] General Ledger for a specific account."""
    result = await db.execute(
        text("""
            SELECT
                je.entry_date, je.entry_no, je.entry_type,
                je.narration, je.reference_no,
                jel.dr_amount, jel.cr_amount, jel.narration AS line_narration,
                SUM(jel.dr_amount - jel.cr_amount) OVER (
                    ORDER BY je.entry_date, je.id
                ) AS running_balance
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            WHERE jel.account_id = :account_id
              AND je.company_id = :cid
              AND je.status = 'Posted'
              AND (:from_date IS NULL OR je.entry_date >= :from_date)
              AND (:to_date IS NULL OR je.entry_date <= :to_date)
            ORDER BY je.entry_date, je.id
        """),
        {
            "account_id": str(account_id),
            "cid": current_user["company_id"],
            "from_date": str(from_date) if from_date else None,
            "to_date": str(to_date) if to_date else None,
        },
    )
    return {
        "account_id": str(account_id),
        "section_44aa": "General Ledger",
        "entries": [dict(r) for r in result.mappings().all()],
    }


@router.get("/journal-entries")
async def get_journal_entries(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    entry_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """[Section 44AA] Journal Entries — complete transaction register."""
    query = """
        SELECT
            je.entry_no, je.entry_date, je.entry_type, je.narration,
            je.reference_no, je.total_debit, je.total_credit,
            je.is_reversal, je.status,
            u.full_name AS created_by_name,
            je.created_at
        FROM caratloop.journal_entries je
        JOIN caratloop.users u ON u.id = je.created_by
        WHERE je.company_id = :cid
    """
    params = {"cid": current_user["company_id"]}
    if from_date:
        query += " AND je.entry_date >= :from_date"
        params["from_date"] = str(from_date)
    if to_date:
        query += " AND je.entry_date <= :to_date"
        params["to_date"] = str(to_date)
    if entry_type:
        query += " AND je.entry_type = :entry_type"
        params["entry_type"] = entry_type
    query += " ORDER BY je.entry_date DESC, je.entry_no DESC"

    result = await db.execute(text(query), params)
    return {"entries": [dict(r) for r in result.mappings().all()]}


@router.get("/accounts")
async def list_accounts(
    nature: Optional[str] = None,
    group_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List Chart of Accounts with opening balances and current balances."""
    query = """
        SELECT
            a.id, a.code, a.name, a.account_type, a.normal_balance, a.currency,
            a.opening_balance, a.opening_balance_type, a.is_system, a.is_active,
            a.description, ag.id AS group_id, ag.code AS group_code,
            ag.name AS group_name, ag.nature,
            COALESCE(SUM(jel.dr_amount), 0) AS total_dr,
            COALESCE(SUM(jel.cr_amount), 0) AS total_cr,
            CASE
                WHEN a.normal_balance = 'D' THEN
                    COALESCE(a.opening_balance, 0) + COALESCE(SUM(jel.dr_amount), 0) - COALESCE(SUM(jel.cr_amount), 0)
                ELSE
                    COALESCE(a.opening_balance, 0) + COALESCE(SUM(jel.cr_amount), 0) - COALESCE(SUM(jel.dr_amount), 0)
            END AS current_balance
        FROM caratloop.accounts a
        JOIN caratloop.account_groups ag ON ag.id = a.group_id
        LEFT JOIN caratloop.journal_entry_lines jel ON jel.account_id = a.id
        LEFT JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'Posted'
        WHERE a.company_id = :cid AND a.is_active = TRUE
    """
    params = {"cid": current_user["company_id"]}
    if nature:
        query += " AND ag.nature = :nature"
        params["nature"] = nature
    if group_id:
        query += " AND ag.id = :group_id"
        params["group_id"] = str(group_id)
    query += " GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance, a.currency, a.opening_balance, a.opening_balance_type, a.is_system, a.is_active, a.description, ag.id, ag.code, ag.name, ag.nature ORDER BY ag.nature, ag.name, a.code"

    result = await db.execute(text(query), params)
    return {"accounts": [dict(r) for r in result.mappings().all()]}


@router.post("/accounts", dependencies=[Depends(require(*CAN_AMEND))])
async def create_account(
    payload: CreateAccountRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new general ledger account in the Chart of Accounts."""
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        # Determine group_id
        group_id = payload.group_id
        if not group_id and payload.group_code:
            g_res = await db.execute(
                text("SELECT id FROM caratloop.account_groups WHERE (code = :code OR name = :code) AND company_id = :cid LIMIT 1"),
                {"code": payload.group_code, "cid": company_id}
            )
            group_id = g_res.scalar()
        if not group_id:
            g_res = await db.execute(
                text("SELECT id FROM caratloop.account_groups WHERE company_id = :cid LIMIT 1"),
                {"cid": company_id}
            )
            group_id = g_res.scalar()

        if not group_id:
            raise HTTPException(status_code=400, detail="Account group not found.")

        acc_res = await db.execute(
            text("""
                INSERT INTO caratloop.accounts (
                    company_id, group_id, code, name, account_type, normal_balance,
                    opening_balance, opening_balance_type, description, created_by
                ) VALUES (
                    :cid, :gid, :code, :name, :type, :nb,
                    :ob, :obt, :desc, CAST(:cb AS UUID)
                ) RETURNING id
            """),
            {
                "cid": company_id,
                "gid": str(group_id),
                "code": payload.code.strip().upper(),
                "name": payload.name.strip(),
                "type": payload.account_type,
                "nb": payload.normal_balance,
                "ob": payload.opening_balance,
                "obt": payload.opening_balance_type,
                "desc": payload.description,
                "cb": user_id,
            }
        )
        acc_id = acc_res.scalar()
        await db.commit()
        return {"status": "success", "id": str(acc_id), "code": payload.code}
    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to create account")
        raise HTTPException(
            status_code=500,
            detail="Failed to create account. The operation was rolled back and nothing was saved.",
        ) from e


@router.patch("/accounts/{account_id}/opening-balance", dependencies=[Depends(require(*CAN_AMEND))])
async def update_account_opening_balance(
    account_id: UUID,
    payload: UpdateOpeningBalanceRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Set or update the opening balance of an individual account."""
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        res = await db.execute(
            text("""
                UPDATE caratloop.accounts
                SET opening_balance = :ob, opening_balance_type = :obt
                WHERE id = :id AND company_id = :cid
                RETURNING id
            """),
            {"ob": payload.opening_balance, "obt": payload.opening_balance_type, "id": str(account_id), "cid": company_id}
        )
        if not res.scalar():
            raise HTTPException(status_code=404, detail="Account not found")
        await db.commit()
        return {"status": "success", "account_id": str(account_id), "opening_balance": payload.opening_balance}
    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to update opening balance")
        raise HTTPException(
            status_code=500,
            detail="Failed to update opening balance. The operation was rolled back and nothing was saved.",
        ) from e


@router.post("/opening-balances", dependencies=[Depends(require(*CAN_AMEND))])
async def batch_update_opening_balances(
    payload: BatchOpeningBalancesRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Batch update opening balances across Chart of Accounts for migration."""
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        updated_count = 0
        for item in payload.balances:
            await db.execute(
                text("""
                    UPDATE caratloop.accounts
                    SET opening_balance = :ob, opening_balance_type = :obt
                    WHERE id = :id AND company_id = :cid
                """),
                {"ob": item.opening_balance, "obt": item.opening_balance_type, "id": str(item.account_id), "cid": company_id}
            )
            updated_count += 1

        await db.commit()
        return {"status": "success", "updated_accounts_count": updated_count}
    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to batch update opening balances")
        raise HTTPException(
            status_code=500,
            detail="Failed to batch update opening balances. The operation was rolled back and nothing was saved.",
        ) from e