"""Fiscal years: list, create, activate, lock/unlock, year-end close.

fiscal_years.is_locked existed since the baseline and was never read; the only
way a year came into being was the provisioning trigger at company creation.
This router is the administrative side of app.core.periods: it decides which
years exist and which are locked, and performs the year-end closing that
moves the P&L into Retained Earnings and carries balance-sheet balances into
the next year as an 'Opening' journal.
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.vouchers import post_journal
from app.core.database import get_db, set_audit_context
from app.core.money import round_money, to_decimal
from app.core.periods import load_fiscal_years
from app.core.roles import CAN_AMEND, require
from app.core.security import get_current_user
from app.core.year_end import (
    BALANCE_SHEET_NATURES,
    PL_NATURES,
    RETAINED_EARNINGS_CODE,
    closing_lines,
    next_year_bounds,
    opening_lines,
    overlaps,
    signed_debit_balance,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Fiscal Years"])


class CreateFiscalYearRequest(BaseModel):
    year_label: str
    start_date: date
    end_date: date
    reason: str = "Fiscal year creation"


class ReasonPayload(BaseModel):
    reason: str = "Fiscal year administration"


def _ctx(request: Request, current_user: dict) -> tuple[str, str, str, str]:
    return (
        str(current_user["id"]),
        current_user["company_id"],
        request.client.host if request.client else "0.0.0.0",
        current_user.get("session_id", "0"),
    )


async def _get_year(db: AsyncSession, company_id, fy_id: UUID, *, for_update: bool = False) -> dict:
    res = await db.execute(
        text(
            "SELECT id, year_label, start_date, end_date, is_active, is_locked, is_closed, "
            "       locked_at, locked_by, closed_at, closed_by, closing_journal_entry_id, opening_journal_entry_id "
            "FROM caratloop.fiscal_years WHERE id = CAST(:id AS UUID) AND company_id = :cid"
            + (" FOR UPDATE" if for_update else "")
        ),
        {"id": str(fy_id), "cid": company_id},
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Fiscal year not found")
    return dict(row)


@router.get("")
async def list_fiscal_years(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Every fiscal year of the company with how many journal entries it holds."""
    res = await db.execute(
        text("""
            SELECT fy.id, fy.year_label, fy.start_date, fy.end_date, fy.is_active, fy.is_locked, fy.is_closed,
                   fy.locked_at, lu.full_name AS locked_by_name,
                   fy.closed_at, cu.full_name AS closed_by_name,
                   fy.closing_journal_entry_id, fy.opening_journal_entry_id,
                   (SELECT COUNT(*) FROM caratloop.journal_entries je
                     WHERE je.company_id = fy.company_id AND je.entry_date BETWEEN fy.start_date AND fy.end_date) AS entry_count
            FROM caratloop.fiscal_years fy
            LEFT JOIN caratloop.users lu ON lu.id = fy.locked_by
            LEFT JOIN caratloop.users cu ON cu.id = fy.closed_by
            WHERE fy.company_id = :cid
            ORDER BY fy.start_date
            LIMIT 200
        """),
        {"cid": current_user["company_id"]},
    )
    # A company has one row per year; 200 is two centuries of books.
    return {"fiscal_years": [dict(r) for r in res.mappings().all()]}


@router.post("", dependencies=[Depends(require(*CAN_AMEND))])
async def create_fiscal_year(
    payload: CreateFiscalYearRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id, company_id, ip, sid = _ctx(request, current_user)
    await set_audit_context(db, user_id, sid, ip, payload.reason)
    try:
        if payload.end_date <= payload.start_date:
            raise HTTPException(status_code=422, detail="end_date must be after start_date.")
        label = payload.year_label.strip()
        if not label or len(label) > 10:
            raise HTTPException(status_code=422, detail="year_label is required and at most 10 characters (e.g. 2027-28).")
        existing = await load_fiscal_years(db, company_id)
        clash = overlaps(existing, payload.start_date, payload.end_date)
        if clash:
            raise HTTPException(
                status_code=409,
                detail="The dates overlap fiscal year " + ", ".join(fy["year_label"] for fy in clash) + ". Years may not overlap.",
            )
        if any(fy["year_label"] == label for fy in existing):
            raise HTTPException(status_code=409, detail=f"A fiscal year labelled {label} already exists.")
        res = await db.execute(
            text(
                "INSERT INTO caratloop.fiscal_years (company_id, year_label, start_date, end_date, is_active) "
                "VALUES (:cid, :label, :start, :end, FALSE) RETURNING id"
            ),
            {"cid": company_id, "label": label, "start": payload.start_date, "end": payload.end_date},
        )
        new_id = res.scalar()
        await db.commit()
        return {"status": "success", "id": str(new_id), "year_label": label}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to create fiscal year")
        raise HTTPException(status_code=500, detail="Failed to create fiscal year. Nothing was saved.") from e


@router.post("/{fy_id}/activate", dependencies=[Depends(require(*CAN_AMEND))])
async def activate_fiscal_year(
    fy_id: UUID,
    request: Request,
    payload: ReasonPayload = ReasonPayload(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Make this the year new documents post into. Exactly one year is active."""
    user_id, company_id, ip, sid = _ctx(request, current_user)
    await set_audit_context(db, user_id, sid, ip, payload.reason)
    try:
        fy = await _get_year(db, company_id, fy_id, for_update=True)
        if fy["is_closed"]:
            raise HTTPException(status_code=409, detail=f"{fy['year_label']} is closed and cannot be made active.")
        # ux_fiscal_years_one_active enforces a single active year per
        # company, so the current one is cleared first.
        await db.execute(
            text("UPDATE caratloop.fiscal_years SET is_active = FALSE WHERE company_id = :cid AND is_active"),
            {"cid": company_id},
        )
        await db.execute(
            text("UPDATE caratloop.fiscal_years SET is_active = TRUE WHERE id = CAST(:id AS UUID) AND company_id = :cid"),
            {"id": str(fy_id), "cid": company_id},
        )
        await db.commit()
        return {"status": "success", "active": fy["year_label"]}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to activate fiscal year")
        raise HTTPException(status_code=500, detail="Failed to activate fiscal year. Nothing was saved.") from e


@router.post("/{fy_id}/lock", dependencies=[Depends(require(*CAN_AMEND))])
async def lock_fiscal_year(
    fy_id: UUID,
    request: Request,
    payload: ReasonPayload = ReasonPayload(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Refuse every posting dated inside this year until it is unlocked."""
    user_id, company_id, ip, sid = _ctx(request, current_user)
    await set_audit_context(db, user_id, sid, ip, payload.reason)
    try:
        fy = await _get_year(db, company_id, fy_id, for_update=True)
        if fy["is_locked"]:
            return {"status": "success", "year_label": fy["year_label"], "is_locked": True, "message": "Already locked."}
        await db.execute(
            text(
                "UPDATE caratloop.fiscal_years SET is_locked = TRUE, locked_at = NOW(), locked_by = CAST(:uid AS UUID) "
                "WHERE id = CAST(:id AS UUID) AND company_id = :cid"
            ),
            {"uid": user_id, "id": str(fy_id), "cid": company_id},
        )
        await db.commit()
        return {"status": "success", "year_label": fy["year_label"], "is_locked": True}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to lock fiscal year")
        raise HTTPException(status_code=500, detail="Failed to lock fiscal year. Nothing was saved.") from e


@router.post("/{fy_id}/unlock", dependencies=[Depends(require(*CAN_AMEND))])
async def unlock_fiscal_year(
    fy_id: UUID,
    request: Request,
    payload: ReasonPayload = ReasonPayload(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Reopen a locked year. A CLOSED year stays shut: its closing journal has
    already moved the P&L, so a late entry belongs in the current year."""
    user_id, company_id, ip, sid = _ctx(request, current_user)
    await set_audit_context(db, user_id, sid, ip, payload.reason)
    try:
        fy = await _get_year(db, company_id, fy_id, for_update=True)
        if fy["is_closed"]:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{fy['year_label']} has been closed; its profit is already in Retained Earnings. "
                    "Post prior-period adjustments in the current year instead."
                ),
            )
        await db.execute(
            text(
                "UPDATE caratloop.fiscal_years SET is_locked = FALSE, locked_at = NULL, locked_by = NULL "
                "WHERE id = CAST(:id AS UUID) AND company_id = :cid"
            ),
            {"id": str(fy_id), "cid": company_id},
        )
        await db.commit()
        return {"status": "success", "year_label": fy["year_label"], "is_locked": False}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to unlock fiscal year")
        raise HTTPException(status_code=500, detail="Failed to unlock fiscal year. Nothing was saved.") from e


# ─── Closing ─────────────────────────────────────────────────────────────────

async def _pl_balances(db: AsyncSession, company_id, fy: dict) -> list[dict]:
    """Income and expense accounts with postings in the year, totals by side.

    Filtered in a subquery rather than on a LEFT JOIN condition: a condition
    on the joined journal_entries row leaves the journal_entry_lines row in
    place and still summed, so the date range would be ignored.
    """
    res = await db.execute(
        text("""
            SELECT a.id, a.code, a.name, ag.nature, t.dr, t.cr
            FROM caratloop.accounts a
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            JOIN (
                SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                WHERE je.company_id = :cid AND je.status = 'Posted'
                  AND je.entry_date BETWEEN :start AND :end
                  AND je.entry_type <> 'Closing'
                GROUP BY jel.account_id
            ) t ON t.account_id = a.id
            WHERE a.company_id = :cid AND ag.nature = ANY(:natures)
            ORDER BY ag.nature, a.code
        """),
        {"cid": company_id, "start": fy["start_date"], "end": fy["end_date"], "natures": list(PL_NATURES)},
    )
    return [dict(r) for r in res.mappings().all()]


async def _bs_balances(db: AsyncSession, company_id, as_of: date) -> list[dict]:
    """Balance-sheet accounts with inception opening balance and postings to date.

    Skips 'Opening' journals for the reason given in app.core.periods: they
    restate balances the earlier postings already carry.
    """
    res = await db.execute(
        text("""
            SELECT a.id, a.code, a.name, ag.nature, a.normal_balance, a.opening_balance,
                   COALESCE(t.dr, 0) AS dr, COALESCE(t.cr, 0) AS cr
            FROM caratloop.accounts a
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            LEFT JOIN (
                SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                WHERE je.company_id = :cid AND je.status = 'Posted'
                  AND je.entry_date <= :as_of
                  AND je.entry_type <> 'Opening'
                GROUP BY jel.account_id
            ) t ON t.account_id = a.id
            WHERE a.company_id = :cid AND a.is_active = TRUE AND ag.nature = ANY(:natures)
            ORDER BY ag.nature, a.code
        """),
        {"cid": company_id, "as_of": as_of, "natures": list(BALANCE_SHEET_NATURES)},
    )
    return [dict(r) for r in res.mappings().all()]


async def _retained_earnings(db: AsyncSession, company_id) -> dict:
    res = await db.execute(
        text("SELECT id, code, name FROM caratloop.accounts WHERE company_id = :cid AND code = :code LIMIT 1"),
        {"cid": company_id, "code": RETAINED_EARNINGS_CODE},
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(
            status_code=400,
            detail=f"Chart of accounts has no Retained Earnings account ({RETAINED_EARNINGS_CODE}). Run migration 0008.",
        )
    return dict(row)


def _preview_payload(fy: dict, pl_rows: list[dict], re_acc: dict, net_profit: Decimal,
                     bs_rows: list[dict], difference: Decimal, next_year: tuple[date, date, str], next_exists: Optional[dict]) -> dict:
    income = [r for r in pl_rows if r["nature"] == "Income"]
    expenses = [r for r in pl_rows if r["nature"] == "Expenses"]

    def shaped(rows):
        return [
            {"id": str(r["id"]), "code": r["code"], "name": r["name"], "nature": r["nature"],
             "debits": to_decimal(r["dr"]), "credits": to_decimal(r["cr"]),
             "balance": round_money(to_decimal(r["cr"]) - to_decimal(r["dr"]))}
            for r in rows
        ]

    carried = [
        {"id": str(r["id"]), "code": r["code"], "name": r["name"], "nature": r["nature"],
         "balance_dr": signed_debit_balance(r)}
        for r in bs_rows if signed_debit_balance(r) != 0
    ]
    # Retained Earnings after closing: its carried balance already includes
    # the transfer once the closing journal is posted; for the preview the
    # transfer is added on top of today's balance.
    re_now = next((signed_debit_balance(r) for r in bs_rows if str(r["id"]) == str(re_acc["id"])), Decimal("0"))
    return {
        "fiscal_year": {"id": str(fy["id"]), "year_label": fy["year_label"], "start_date": str(fy["start_date"]),
                        "end_date": str(fy["end_date"]), "is_locked": fy["is_locked"], "is_closed": fy["is_closed"]},
        "income_accounts": shaped(income),
        "expense_accounts": shaped(expenses),
        "total_income": round_money(sum((to_decimal(r["cr"]) - to_decimal(r["dr"]) for r in income), Decimal("0"))),
        "total_expenses": round_money(sum((to_decimal(r["dr"]) - to_decimal(r["cr"]) for r in expenses), Decimal("0"))),
        "net_profit": net_profit,
        "retained_earnings": {"id": str(re_acc["id"]), "code": re_acc["code"], "name": re_acc["name"],
                              "balance_before": -re_now, "balance_after": -re_now + net_profit},
        "carried_forward": carried,
        "opening_difference": difference,
        "next_year": {"start_date": str(next_year[0]), "end_date": str(next_year[1]), "year_label": next_year[2],
                      "exists": next_exists is not None,
                      "id": str(next_exists["id"]) if next_exists else None},
    }


async def _closing_figures(db: AsyncSession, company_id, fy: dict):
    re_acc = await _retained_earnings(db, company_id)
    pl_rows = await _pl_balances(db, company_id, fy)
    cl_lines, net_profit = closing_lines(pl_rows, re_acc["id"])
    # The carried balances are what the balance sheet will show AFTER the
    # closing journal: apply its effect to Retained Earnings in memory.
    bs_rows = await _bs_balances(db, company_id, fy["end_date"])
    for r in bs_rows:
        if str(r["id"]) == str(re_acc["id"]):
            r["cr"] = to_decimal(r["cr"]) + (net_profit if net_profit > 0 else Decimal("0"))
            r["dr"] = to_decimal(r["dr"]) + (-net_profit if net_profit < 0 else Decimal("0"))
    # P&L accounts are zero after closing, so only balance-sheet rows carry.
    op_lines, difference = opening_lines(bs_rows)
    nxt = next_year_bounds(fy["end_date"])
    years = await load_fiscal_years(db, company_id)
    next_exists = next((y for y in years if y["start_date"] == nxt[0]), None)
    return re_acc, pl_rows, cl_lines, net_profit, bs_rows, op_lines, difference, nxt, next_exists


@router.get("/{fy_id}/closing-preview")
async def closing_preview(fy_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """What POST /{id}/close would post: the accounts being closed, the
    Retained Earnings figure, and the balances carried into the next year."""
    company_id = current_user["company_id"]
    fy = await _get_year(db, company_id, fy_id)
    re_acc, pl_rows, _cl, net_profit, bs_rows, _op, difference, nxt, next_exists = await _closing_figures(db, company_id, fy)
    return _preview_payload(fy, pl_rows, re_acc, net_profit, bs_rows, difference, nxt, next_exists)


@router.post("/{fy_id}/close", dependencies=[Depends(require(*CAN_AMEND))])
async def close_fiscal_year(
    fy_id: UUID,
    request: Request,
    payload: ReasonPayload = ReasonPayload(reason="Year-end closing"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Year-end closing.

    Posts the 'Closing' journal (P&L into Retained Earnings, dated the last
    day of the year), locks and closes the year, creates the next year if it
    does not exist, posts the 'Opening' journal into it (dated its first
    day) and, if the closed year was the active one, activates the next.
    All in one transaction: a failure anywhere leaves the year open.
    """
    user_id, company_id, ip, sid = _ctx(request, current_user)
    await set_audit_context(db, user_id, sid, ip, payload.reason)
    try:
        fy = await _get_year(db, company_id, fy_id, for_update=True)
        if fy["is_closed"]:
            raise HTTPException(status_code=409, detail=f"{fy['year_label']} is already closed.")
        if date.today() <= fy["end_date"]:
            raise HTTPException(
                status_code=409,
                detail=f"{fy['year_label']} runs until {fy['end_date']}; a year can only be closed after it has ended.",
            )

        re_acc, pl_rows, cl_lines, net_profit, bs_rows, op_lines, difference, nxt, next_exists = \
            await _closing_figures(db, company_id, fy)

        if difference != 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Balance-sheet accounts do not balance by {difference} (debits minus credits) as at "
                    f"{fy['end_date']}; the inception opening balances were entered unbalanced. Correct them "
                    "under Accounting > Chart of Accounts before closing. Nothing was saved."
                ),
            )

        closing_je_id = None
        if cl_lines:
            no_res = await db.execute(
                text("SELECT 'CLS/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
                {"fy": fy["year_label"]},
            )
            total = sum((l["dr"] for l in cl_lines), Decimal("0"))
            closing_je_id = await post_journal(
                db, company_id, str(fy["id"]), no_res.scalar(), fy["end_date"], "Closing",
                f"Year-end closing of {fy['year_label']}: P&L transferred to {re_acc['code']} {re_acc['name']}",
                fy["year_label"], total, user_id, ip, sid, cl_lines,
                ref_type="FiscalYear", ref_id=fy["id"],
            )

        # Next year: create if absent.
        next_start, next_end, next_label = nxt
        if next_exists is None:
            ins = await db.execute(
                text(
                    "INSERT INTO caratloop.fiscal_years (company_id, year_label, start_date, end_date, is_active) "
                    "VALUES (:cid, :label, :start, :end, FALSE) "
                    "ON CONFLICT (company_id, year_label) DO NOTHING RETURNING id"
                ),
                {"cid": company_id, "label": next_label, "start": next_start, "end": next_end},
            )
            next_id = ins.scalar()
            if next_id is None:
                raise HTTPException(
                    status_code=409,
                    detail=f"A fiscal year labelled {next_label} exists with different dates; fix it before closing.",
                )
            next_year = {"id": next_id, "year_label": next_label, "start_date": next_start, "end_date": next_end,
                         "is_locked": False, "is_closed": False}
        else:
            next_year = next_exists
            if next_year.get("is_closed") or next_year.get("is_locked"):
                raise HTTPException(
                    status_code=409,
                    detail=f"The following year {next_year['year_label']} is locked; unlock it so the opening balances can be posted.",
                )

        opening_je_id = None
        if op_lines:
            # Recompute after the closing journal is in the ledger so the
            # carried Retained Earnings figure is read, not inferred.
            bs_after = await _bs_balances(db, company_id, fy["end_date"])
            op_lines, difference_after = opening_lines(bs_after)
            if difference_after != 0:
                raise HTTPException(
                    status_code=500,
                    detail=f"Opening balances do not balance after closing ({difference_after}). Nothing was saved.",
                )
            no_res = await db.execute(
                text("SELECT 'OPN/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
                {"fy": next_year["year_label"]},
            )
            total = sum((l["dr"] for l in op_lines), Decimal("0"))
            opening_je_id = await post_journal(
                db, company_id, str(next_year["id"]), no_res.scalar(), next_year["start_date"], "Opening",
                f"Opening balances brought forward from {fy['year_label']}",
                fy["year_label"], total, user_id, ip, sid, op_lines,
                ref_type="FiscalYear", ref_id=next_year["id"],
            )

        # Lock and close the year; hand the active flag to the next year.
        await db.execute(
            text("""
                UPDATE caratloop.fiscal_years
                SET is_locked = TRUE, locked_at = COALESCE(locked_at, NOW()), locked_by = COALESCE(locked_by, CAST(:uid AS UUID)),
                    is_closed = TRUE, closed_at = NOW(), closed_by = CAST(:uid AS UUID),
                    closing_journal_entry_id = :cls, is_active = FALSE
                WHERE id = CAST(:id AS UUID) AND company_id = :cid
            """),
            {"uid": user_id, "cls": closing_je_id, "id": str(fy_id), "cid": company_id},
        )
        await db.execute(
            text(
                "UPDATE caratloop.fiscal_years SET opening_journal_entry_id = COALESCE(:opn, opening_journal_entry_id) "
                "WHERE id = CAST(:id AS UUID) AND company_id = :cid"
            ),
            {"opn": opening_je_id, "id": str(next_year["id"]), "cid": company_id},
        )
        active_res = await db.execute(
            text("SELECT COUNT(*) FROM caratloop.fiscal_years WHERE company_id = :cid AND is_active"),
            {"cid": company_id},
        )
        if (active_res.scalar() or 0) == 0:
            await db.execute(
                text("UPDATE caratloop.fiscal_years SET is_active = TRUE WHERE id = CAST(:id AS UUID) AND company_id = :cid"),
                {"id": str(next_year["id"]), "cid": company_id},
            )

        await db.commit()
        return {
            "status": "success",
            "closed": fy["year_label"],
            "net_profit": net_profit,
            "retained_earnings_account": re_acc["code"],
            "closing_journal_entry_id": closing_je_id,
            "accounts_closed": len([l for l in cl_lines if str(l["acc"]) != str(re_acc["id"])]),
            "next_year": {"id": str(next_year["id"]), "year_label": next_year["year_label"],
                          "created": next_exists is None, "opening_journal_entry_id": opening_je_id,
                          "balances_carried": len(op_lines)},
        }
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Year-end closing failed")
        raise HTTPException(status_code=500, detail="Year-end closing failed. The operation was rolled back and nothing was saved.") from e
