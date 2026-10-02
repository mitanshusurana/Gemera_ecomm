"""Bank and cash accounts under /accounting/bank-accounts.

GET    /bank-accounts                 Bank and Cash ledgers with their details and balance
POST   /bank-accounts                 new account under BANK (or CASH) with the next BNK-nnn code
PATCH  /bank-accounts/{id}            rename, details, active flag, default flag
POST   /bank-accounts/{id}/make-default

Balances are what the chart of accounts shows: the account's own opening
balance on its side plus every Posted, non-'Opening' journal line (see
app.core.balances and the trial balance in accounting.py). The rules -- code
allocation, detail validation, one default per company, no deactivating an
account with money in it -- are pure functions in app.core.bank_accounts.
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.balances import normal_side_balance, side_of, signed_opening
from app.core.bank_accounts import (
    ACCOUNT_TYPE_BANK,
    ACCOUNT_TYPES,
    GROUP_CODE,
    BankAccountError,
    check_deactivation,
    next_code,
    opening_balance_columns,
    plan_default_change,
    validate_details,
)
from app.core.database import get_db, set_audit_context
from app.core.money import to_decimal
from app.core.pagination import Page, paginate
from app.core.roles import CAN_AMEND, require
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()


class CreateBankAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    account_type: str = ACCOUNT_TYPE_BANK
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    upi_id: Optional[str] = None
    description: Optional[str] = None
    opening_balance: Optional[Decimal] = None
    # The chart holds one opening figure per account (as at the start of the
    # books); the date is recorded in the audit reason, not on the row.
    opening_date: Optional[date] = None
    is_default_bank: bool = False
    reason: str = "Bank account created"


class UpdateBankAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    upi_id: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_default_bank: Optional[bool] = None
    reason: str = "Bank account updated"


class MakeDefaultRequest(BaseModel):
    reason: str = "Default bank account changed"


LIST_SQL = """
    SELECT
        a.id, a.code, a.name, a.account_type, a.currency, a.normal_balance,
        a.is_active, a.is_default_bank, a.is_system, a.description,
        a.bank_name, a.bank_branch, a.bank_account_no, a.bank_ifsc, a.upi_id,
        COALESCE(a.opening_balance, 0) AS opening_balance, a.opening_balance_type,
        ag.code AS group_code, ag.name AS group_name,
        COALESCE(t.dr, 0) AS total_dr, COALESCE(t.cr, 0) AS total_cr,
        COALESCE(t.n, 0) AS posting_count
    FROM caratloop.accounts a
    JOIN caratloop.account_groups ag ON ag.id = a.group_id
    LEFT JOIN (
        SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr, COUNT(*) AS n
        FROM caratloop.journal_entry_lines jel
        JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.company_id = CAST(:cid AS UUID) AND je.status = 'Posted' AND je.entry_type <> 'Opening'
        GROUP BY jel.account_id
    ) t ON t.account_id = a.id
    WHERE a.company_id = CAST(:cid AS UUID)
      AND a.account_type IN ('Bank', 'Cash')
"""
ORDER_SQL = " ORDER BY a.account_type, a.is_default_bank DESC, a.code"


def _shape(r) -> dict:
    d = dict(r)
    d["id"] = str(d["id"])
    signed = signed_opening(r) + to_decimal(r["total_dr"]) - to_decimal(r["total_cr"])
    d["balance_signed"] = signed
    d["balance_abs"] = abs(signed)
    d["balance_side"] = side_of(signed)
    d["current_balance"] = normal_side_balance(signed, r["normal_balance"])
    d["has_details"] = bool(d.get("bank_account_no") and d.get("bank_ifsc"))
    return d


async def _fetch_all(db: AsyncSession, company_id, include_inactive: bool, page: Optional[Page] = None) -> list[dict]:
    sql = LIST_SQL
    if not include_inactive:
        sql += " AND a.is_active = TRUE"
    sql += ORDER_SQL
    params: dict = {"cid": str(company_id)}
    if page is not None:
        sql = page.apply(sql)
        params.update(page.params)
    res = await db.execute(text(sql), params)
    return [_shape(r) for r in res.mappings().all()]


async def _fetch_one(db: AsyncSession, company_id, account_id) -> dict:
    res = await db.execute(
        text(LIST_SQL + " AND a.id = CAST(:id AS UUID)"),
        {"cid": str(company_id), "id": str(account_id)},
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Bank account not found")
    return _shape(row)


def _http(e: BankAccountError) -> HTTPException:
    return HTTPException(status_code=e.status, detail=" ".join(e.problems))


async def _set_default(db: AsyncSession, company_id, account_id: str) -> None:
    """Clear the current flag, then set the new one (one default per company)."""
    await db.execute(
        text(
            "UPDATE caratloop.accounts SET is_default_bank = FALSE "
            "WHERE company_id = CAST(:cid AS UUID) AND is_default_bank AND id <> CAST(:id AS UUID)"
        ),
        {"cid": str(company_id), "id": account_id},
    )
    await db.execute(
        text(
            "UPDATE caratloop.accounts SET is_default_bank = TRUE "
            "WHERE company_id = CAST(:cid AS UUID) AND id = CAST(:id AS UUID)"
        ),
        {"cid": str(company_id), "id": account_id},
    )


@router.get("/bank-accounts")
async def list_bank_accounts(
    include_inactive: bool = False,
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Bank and cash accounts with their details, balance and default flag.

    Bounded like every list endpoint (page.apply), though a company rarely
    has more than a handful."""
    accounts = await _fetch_all(db, current_user["company_id"], include_inactive, page)
    return {
        "accounts": accounts,
        "default_bank_account_id": next((a["id"] for a in accounts if a["is_default_bank"]), None),
        "account_types": sorted(ACCOUNT_TYPES),
    }


@router.post("/bank-accounts", dependencies=[Depends(require(*CAN_AMEND))], status_code=201)
async def create_bank_account(
    payload: CreateBankAccountRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """A new bank (or cash) ledger with the next free BNK-nnn (CSH-nnn) code.

    The opening balance is written through the chart's own mechanism
    (accounts.opening_balance with its side), the same figure the trial
    balance and the ledger read. The first bank account of a company becomes
    its default automatically; later ones only when asked.
    """
    company_id = current_user["company_id"]
    user_id = str(current_user["id"])
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    try:
        details = validate_details(
            name=payload.name, bank_name=payload.bank_name, bank_branch=payload.bank_branch,
            bank_account_no=payload.bank_account_no, bank_ifsc=payload.bank_ifsc,
            upi_id=payload.upi_id, description=payload.description, account_type=payload.account_type,
        )
    except BankAccountError as e:
        raise _http(e)
    if payload.is_default_bank and payload.account_type != ACCOUNT_TYPE_BANK:
        raise HTTPException(status_code=422, detail="Only a bank account can be the default for remittances.")

    opening, opening_type = opening_balance_columns(payload.opening_balance)
    reason = payload.reason
    if payload.opening_date and opening:
        reason = f"{reason}; opening balance as at {payload.opening_date.isoformat()}"
    await set_audit_context(db, user_id, session_id, ip_address, reason)

    try:
        grp = await db.execute(
            text("SELECT id FROM caratloop.account_groups WHERE company_id = CAST(:cid AS UUID) AND code = :code LIMIT 1"),
            {"cid": str(company_id), "code": GROUP_CODE[payload.account_type]},
        )
        group_id = grp.scalar()
        if group_id is None:
            raise HTTPException(
                status_code=409,
                detail=f"The {GROUP_CODE[payload.account_type]} account group is missing from this company's chart.",
            )

        codes = await db.execute(
            text("SELECT code FROM caratloop.accounts WHERE company_id = CAST(:cid AS UUID)"),
            {"cid": str(company_id)},
        )
        code = next_code([r[0] for r in codes.fetchall()], payload.account_type)

        existing_default = await db.execute(
            text("SELECT id FROM caratloop.accounts WHERE company_id = CAST(:cid AS UUID) AND is_default_bank LIMIT 1"),
            {"cid": str(company_id)},
        )
        make_default = payload.account_type == ACCOUNT_TYPE_BANK and (
            payload.is_default_bank or existing_default.scalar() is None
        )

        ins = await db.execute(
            text("""
                INSERT INTO caratloop.accounts (
                    company_id, group_id, code, name, account_type, normal_balance,
                    opening_balance, opening_balance_type, description,
                    bank_name, bank_branch, bank_account_no, bank_ifsc, upi_id,
                    is_default_bank, created_by
                ) VALUES (
                    CAST(:cid AS UUID), :gid, :code, :name, :type, 'D',
                    :ob, :obt, :description,
                    :bank_name, :bank_branch, :bank_account_no, :bank_ifsc, :upi_id,
                    FALSE, CAST(:cb AS UUID)
                ) RETURNING id
            """),
            {
                "cid": str(company_id), "gid": str(group_id), "code": code, "name": details["name"],
                "type": payload.account_type, "ob": opening, "obt": opening_type,
                "description": details.get("description"),
                "bank_name": details.get("bank_name"), "bank_branch": details.get("bank_branch"),
                "bank_account_no": details.get("bank_account_no"), "bank_ifsc": details.get("bank_ifsc"),
                "upi_id": details.get("upi_id"), "cb": user_id,
            },
        )
        account_id = str(ins.scalar())
        if make_default:
            await _set_default(db, company_id, account_id)
        await db.commit()
    except IntegrityError as e:
        # uq_account_code: two requests allocated the same BNK-nnn at once.
        await db.rollback()
        logger.warning("Bank account code collision for company %s: %s", company_id, e)
        raise HTTPException(
            status_code=409,
            detail="Another account was created at the same moment; please try again.",
        ) from e
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to create bank account")
        raise HTTPException(
            status_code=500,
            detail="Failed to create the bank account. The operation was rolled back and nothing was saved.",
        ) from e

    return await _fetch_one(db, company_id, account_id)


@router.patch("/bank-accounts/{account_id}", dependencies=[Depends(require(*CAN_AMEND))])
async def update_bank_account(
    account_id: UUID,
    payload: UpdateBankAccountRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Rename, change details, activate/deactivate, or make default.

    Refused: deactivating the default bank or an account with a balance;
    clearing the default flag directly (make another account the default);
    making an inactive or cash account the default.
    """
    company_id = current_user["company_id"]
    provided = payload.model_fields_set - {"reason"}
    if not provided:
        raise HTTPException(status_code=422, detail="Nothing to update.")

    current = await _fetch_one(db, company_id, account_id)

    try:
        details = validate_details(
            name=payload.name if "name" in provided else ...,
            bank_name=payload.bank_name if "bank_name" in provided else ...,
            bank_branch=payload.bank_branch if "bank_branch" in provided else ...,
            bank_account_no=payload.bank_account_no if "bank_account_no" in provided else ...,
            bank_ifsc=payload.bank_ifsc if "bank_ifsc" in provided else ...,
            upi_id=payload.upi_id if "upi_id" in provided else ...,
            description=payload.description if "description" in provided else ...,
            account_type=current["account_type"],
        )
        if payload.is_active is False and current["is_active"]:
            check_deactivation(current, current["balance_signed"])
    except BankAccountError as e:
        raise _http(e)

    if payload.is_default_bank is False and current["is_default_bank"]:
        raise HTTPException(
            status_code=409,
            detail="Make another account the default instead of clearing this one; the documents need one.",
        )
    make_default = bool(payload.is_default_bank) and not current["is_default_bank"]
    if make_default:
        if payload.is_active is False:
            raise HTTPException(status_code=409, detail="An inactive account cannot be the default bank.")
        try:
            plan_default_change(await _fetch_all(db, company_id, include_inactive=True), str(account_id))
        except BankAccountError as e:
            raise _http(e)

    user_id = str(current_user["id"])
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    cols = ("name", "bank_name", "bank_branch", "bank_account_no", "bank_ifsc", "upi_id", "description")
    params: dict = {"cid": str(company_id), "id": str(account_id)}
    for col in cols:
        params[f"set_{col}"] = col in details
        params[col] = details.get(col)
    params["set_is_active"] = "is_active" in provided
    params["is_active"] = payload.is_active

    try:
        res = await db.execute(
            text("""
                UPDATE caratloop.accounts SET
                    name            = CASE WHEN :set_name THEN :name ELSE name END,
                    bank_name       = CASE WHEN :set_bank_name THEN :bank_name ELSE bank_name END,
                    bank_branch     = CASE WHEN :set_bank_branch THEN :bank_branch ELSE bank_branch END,
                    bank_account_no = CASE WHEN :set_bank_account_no THEN :bank_account_no ELSE bank_account_no END,
                    bank_ifsc       = CASE WHEN :set_bank_ifsc THEN :bank_ifsc ELSE bank_ifsc END,
                    upi_id          = CASE WHEN :set_upi_id THEN :upi_id ELSE upi_id END,
                    description     = CASE WHEN :set_description THEN :description ELSE description END,
                    is_active       = CASE WHEN :set_is_active THEN :is_active ELSE is_active END
                WHERE company_id = CAST(:cid AS UUID) AND id = CAST(:id AS UUID)
                RETURNING id
            """),
            params,
        )
        if res.scalar() is None:
            raise HTTPException(status_code=404, detail="Bank account not found")
        if make_default:
            await _set_default(db, company_id, str(account_id))
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to update bank account")
        raise HTTPException(
            status_code=500,
            detail="Failed to update the bank account. The operation was rolled back and nothing was saved.",
        ) from e

    return await _fetch_one(db, company_id, account_id)


@router.post("/bank-accounts/{account_id}/make-default", dependencies=[Depends(require(*CAN_AMEND))])
async def make_default_bank_account(
    account_id: UUID,
    request: Request,
    payload: MakeDefaultRequest = MakeDefaultRequest(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Flag this account as the one the documents print and the bridge settles into."""
    company_id = current_user["company_id"]
    try:
        plan_default_change(await _fetch_all(db, company_id, include_inactive=True), str(account_id))
    except BankAccountError as e:
        raise _http(e)

    user_id = str(current_user["id"])
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
    try:
        await _set_default(db, company_id, str(account_id))
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to change the default bank account")
        raise HTTPException(
            status_code=500,
            detail="Failed to change the default bank account. Nothing was saved.",
        ) from e
    return await _fetch_one(db, company_id, account_id)
