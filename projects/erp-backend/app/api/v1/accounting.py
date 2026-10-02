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

from app.core.balances import normal_side_balance, side_of, signed_opening, split_sides, with_running_balance
from app.core.ledger import TOLERANCE
from app.core.money import to_decimal
from app.core.roles import CAN_AMEND, require
from app.core.pagination import Page, paginate
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

    # Postings are filtered in a subquery. The previous shape -- LEFT JOIN
    # journal_entries with the status and date test in the ON clause -- left
    # the journal_entry_lines row in place when the entry failed the test, so
    # every line was summed regardless of as_of_date. 'Opening' journals
    # (year-end carry-forwards) are skipped in a from-inception total; see
    # app.core.periods.
    #
    # The opening balance is read with its own side (opening_balance_type)
    # in Python, through app.core.balances. The SQL used to add it on the
    # account's normal side whatever the type said, and the totals ignored
    # it altogether, so a trial balance with opening balances could report
    # "balanced" while its closing columns did not add up.
    result = await db.execute(
        text("""
            SELECT
                a.id AS account_id, a.code, a.name AS account_name, ag.name AS group_name,
                ag.nature, a.normal_balance,
                COALESCE(a.opening_balance, 0) AS opening_balance,
                a.opening_balance_type,
                COALESCE(t.dr, 0) AS period_debit,
                COALESCE(t.cr, 0) AS period_credit
            FROM caratloop.accounts a
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            LEFT JOIN (
                SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                WHERE je.company_id = :cid AND je.status = 'Posted'
                  AND je.entry_date <= :as_of_date
                  AND je.entry_type <> 'Opening'
                GROUP BY jel.account_id
            ) t ON t.account_id = a.id
            WHERE a.company_id = :cid AND a.is_active = TRUE
            ORDER BY ag.name, a.code
        """),
        {"as_of_date": as_of_date, "cid": current_user["company_id"]},
    )
    formatted_rows = []
    for r in result.mappings().all():
        row_dict = dict(r)
        dr_val = to_decimal(r["period_debit"])
        cr_val = to_decimal(r["period_credit"])
        opening = signed_opening(r)
        closing = opening + dr_val - cr_val
        opening_dr, opening_cr = split_sides(opening)
        closing_dr, closing_cr = split_sides(closing)
        row_dict["account_id"] = str(r["account_id"])
        row_dict["total_debit"] = dr_val
        row_dict["total_credit"] = cr_val
        row_dict["debit"] = dr_val
        row_dict["credit"] = cr_val
        row_dict["opening_debit"] = opening_dr
        row_dict["opening_credit"] = opening_cr
        row_dict["closing_debit"] = closing_dr
        row_dict["closing_credit"] = closing_cr
        row_dict["closing_side"] = side_of(closing)
        # Signed, debit positive: the figure every other reader works in.
        row_dict["closing_signed"] = closing
        # On the account's normal side (positive = usual balance), which is
        # what the chart of accounts shows and what the old field meant.
        row_dict["closing_balance"] = normal_side_balance(closing, r["normal_balance"])
        row_dict["net_balance"] = row_dict["closing_balance"]
        formatted_rows.append(row_dict)

    # Start at Decimal("0") so an empty trial balance does not fall back to
    # int, and compare against the same tolerance the ledger guard uses so the
    # report and the posting check can never disagree. Opening balances are
    # part of the test: a one-sided opening balance makes the closing
    # columns disagree even when every posting since balances.
    total_dr = sum((r["total_debit"] for r in formatted_rows), Decimal("0"))
    total_cr = sum((r["total_credit"] for r in formatted_rows), Decimal("0"))
    opening_dr = sum((r["opening_debit"] for r in formatted_rows), Decimal("0"))
    opening_cr = sum((r["opening_credit"] for r in formatted_rows), Decimal("0"))
    closing_dr = sum((r["closing_debit"] for r in formatted_rows), Decimal("0"))
    closing_cr = sum((r["closing_credit"] for r in formatted_rows), Decimal("0"))
    period_difference = total_dr - total_cr
    closing_difference = closing_dr - closing_cr
    balanced = abs(period_difference) <= TOLERANCE and abs(closing_difference) <= TOLERANCE

    return {
        "as_of_date": str(as_of_date),
        "section_44aa": "Trial Balance — Double-Entry Verification",
        "accounts": formatted_rows,
        "trial_balance": formatted_rows,
        "totals": {
            "total_debit": total_dr,
            "total_credit": total_cr,
            "opening_debit": opening_dr,
            "opening_credit": opening_cr,
            "closing_debit": closing_dr,
            "closing_credit": closing_cr,
            "is_balanced": balanced,
            "difference": abs(period_difference),
            "closing_difference": abs(closing_difference),
        },
    }


async def _account_opening_balance(db: AsyncSession, company_id, account_id: str, from_date: Optional[date]) -> tuple[Decimal, Optional[dict]]:
    """(signed opening balance as at ``from_date``, account row).

    accounts.opening_balance (with its side) plus every Posted, non-'Opening'
    posting dated before ``from_date``. With no from_date the ledger is read
    from inception and the opening balance is the account's own figure.
    """
    res = await db.execute(
        text("""
            SELECT a.id, a.code, a.name, a.normal_balance, a.account_type,
                   COALESCE(a.opening_balance, 0) AS opening_balance, a.opening_balance_type,
                   ag.name AS group_name, ag.nature,
                   COALESCE(t.dr, 0) AS prior_dr, COALESCE(t.cr, 0) AS prior_cr
            FROM caratloop.accounts a
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            LEFT JOIN (
                SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                WHERE je.company_id = :cid AND je.status = 'Posted'
                  AND je.entry_type <> 'Opening'
                  AND (CAST(:from_date AS DATE) IS NOT NULL AND je.entry_date < CAST(:from_date AS DATE))
                GROUP BY jel.account_id
            ) t ON t.account_id = a.id
            WHERE a.id = CAST(:account_id AS UUID) AND a.company_id = :cid
        """),
        {"cid": company_id, "account_id": str(account_id), "from_date": from_date},
    )
    acc = res.mappings().first()
    if acc is None:
        return Decimal("0"), None
    opening = signed_opening(acc) + to_decimal(acc["prior_dr"]) - to_decimal(acc["prior_cr"])
    return opening, dict(acc)


LEDGER_LINES_SQL = """
    SELECT
        je.id AS journal_entry_id, je.entry_uuid, je.sequence_no AS entry_sequence,
        je.entry_date, je.entry_no, je.entry_type, je.status,
        je.narration, je.reference_no, je.reference_type, je.reference_id,
        jel.id AS line_id, jel.sequence_no AS line_sequence, jel.party_id,
        jel.dr_amount, jel.cr_amount, jel.narration AS line_narration
    FROM caratloop.journal_entry_lines jel
    JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = CAST(:account_id AS UUID)
      AND je.company_id = :cid
      AND je.status = 'Posted'
      AND (CAST(:from_date AS DATE) IS NULL OR je.entry_date >= CAST(:from_date AS DATE))
      AND (CAST(:to_date AS DATE) IS NULL OR je.entry_date <= CAST(:to_date AS DATE))
      -- A year's 'Opening' journal restates the balance the earlier
      -- postings already carry; the ledger shows that balance as its
      -- computed opening row instead, so listing the voucher as well would
      -- count it twice.
      AND je.entry_type <> 'Opening'
    ORDER BY je.entry_date, je.sequence_no, je.id, jel.sequence_no, jel.id
"""


def _ledger_rows(rows) -> list[dict]:
    out = []
    for r in rows:
        d = dict(r)
        for k in ("entry_uuid", "reference_id", "party_id"):
            if d.get(k) is not None:
                d[k] = str(d[k])
        d["debit"] = to_decimal(d.get("dr_amount"))
        d["credit"] = to_decimal(d.get("cr_amount"))
        out.append(d)
    return out


@router.get("/ledger/{account_id}")
async def get_general_ledger(
    account_id: UUID,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """[Section 44AA] General Ledger for a specific account.

    Opening balance as at ``from_date`` (the account's own opening balance
    plus every earlier posting), then every Posted voucher in the range in
    date and voucher order with a running balance that starts from that
    opening figure. The running balance used to start at zero at the first
    row of whatever range was asked for, so a ledger read for one month
    showed balances that agreed with nothing.
    """
    company_id = current_user["company_id"]
    opening, acc = await _account_opening_balance(db, company_id, str(account_id), from_date)
    if acc is None:
        raise HTTPException(status_code=404, detail="Account not found")

    result = await db.execute(
        text(LEDGER_LINES_SQL),
        {
            "account_id": str(account_id),
            "cid": company_id,
            # Real dates: asyncpg types CAST(:p AS DATE) as a date and refuses a str.
            "from_date": from_date,
            "to_date": to_date,
        },
    )
    entries = with_running_balance(opening, _ledger_rows(result.mappings().all()))
    closing = entries[-1]["running_balance"] if entries else opening
    total_dr = sum((e["debit"] for e in entries), Decimal("0"))
    total_cr = sum((e["credit"] for e in entries), Decimal("0"))
    opening_dr, opening_cr = split_sides(opening)
    closing_dr, closing_cr = split_sides(closing)
    return {
        "account_id": str(account_id),
        "account": {
            "id": str(acc["id"]), "code": acc["code"], "name": acc["name"],
            "normal_balance": acc["normal_balance"], "account_type": acc["account_type"],
            "group_name": acc["group_name"], "nature": acc["nature"],
        },
        "section_44aa": "General Ledger",
        "from_date": str(from_date) if from_date else None,
        "to_date": str(to_date) if to_date else None,
        "opening_balance": opening,
        "opening_abs": abs(opening),
        "opening_side": side_of(opening),
        "opening_debit": opening_dr,
        "opening_credit": opening_cr,
        "entries": entries,
        "total_debit": total_dr,
        "total_credit": total_cr,
        "closing_balance": closing,
        "closing_abs": abs(closing),
        "closing_side": side_of(closing),
        "closing_debit": closing_dr,
        "closing_credit": closing_cr,
    }


@router.get("/journal-entries")
async def get_journal_entries(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    entry_type: Optional[str] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """[Section 44AA] Journal Entries — complete transaction register."""
    query = """
        SELECT
            je.id, je.entry_uuid, je.sequence_no,
            je.entry_no, je.entry_date, je.entry_type, je.narration,
            je.reference_no, je.reference_type, je.reference_id,
            je.total_debit, je.total_credit,
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
    if status:
        query += " AND je.status = :status"
        params["status"] = status
    # Newest first, in posting order: entry_no is text ('JV/2026-27/00009'
    # sorts after 'JV/2026-27/00010' only by accident), sequence_no is not.
    query += " ORDER BY je.entry_date DESC, je.sequence_no DESC, je.id DESC"

    result = await db.execute(text(query), params)
    entries = []
    for r in result.mappings().all():
        d = dict(r)
        for k in ("entry_uuid", "reference_id"):
            if d.get(k) is not None:
                d[k] = str(d[k])
        entries.append(d)
    return {"entries": entries}


@router.get("/accounts")
async def list_accounts(
    nature: Optional[str] = None,
    group_id: Optional[UUID] = None,
    page: Page = Depends(paginate),
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
            COALESCE(t.dr, 0) AS total_dr,
            COALESCE(t.cr, 0) AS total_cr
        FROM caratloop.accounts a
        JOIN caratloop.account_groups ag ON ag.id = a.group_id
        LEFT JOIN (
            SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
            FROM caratloop.journal_entry_lines jel
            JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
            WHERE je.company_id = :cid AND je.status = 'Posted' AND je.entry_type <> 'Opening'
            GROUP BY jel.account_id
        ) t ON t.account_id = a.id
        WHERE a.company_id = :cid AND a.is_active = TRUE
    """
    params = {"cid": current_user["company_id"]}
    if nature:
        query += " AND ag.nature = :nature"
        params["nature"] = nature
    if group_id:
        query += " AND ag.id = :group_id"
        params["group_id"] = str(group_id)
    query += " ORDER BY ag.nature, ag.name, a.code"

    # Bound the result set. These endpoints previously returned the whole
    # table; the sales register returned every invoice ever raised.
    query = page.apply(query)
    params.update(page.params)

    result = await db.execute(text(query), params)
    accounts = []
    for r in result.mappings().all():
        d = dict(r)
        # Opening balance on its own side (opening_balance_type), not assumed
        # to sit on the account's normal side; see app.core.balances.
        signed = signed_opening(r) + to_decimal(r["total_dr"]) - to_decimal(r["total_cr"])
        d["balance_signed"] = signed
        d["balance_abs"] = abs(signed)
        d["balance_side"] = side_of(signed)
        d["current_balance"] = normal_side_balance(signed, r["normal_balance"])
        accounts.append(d)
    return {"accounts": accounts}


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