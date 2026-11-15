"""
Caratloop ERP — Recurring documents

A profile says what repeats (an expense, a purchase bill, a sales invoice),
how often, and when it is next due.

* An **expense** profile with ``auto_post`` posts itself on the due date,
  through the same routine as a typed expense. A background task runs the
  due ones a minute after start-up and every six hours after that.
* A **purchase bill** or **sales invoice** is never posted unattended: a
  bill needs the supplier's invoice number and an invoice relieves stock.
  A due profile is listed, opens its form prefilled (the bill's "Repeat",
  the invoice from a saved order document), and is advanced when saved.

Dates are worked out from the start date and the count of periods done, so a
profile on the 31st falls on the 30th in a short month and back on the 31st
after it, instead of drifting.
"""
import asyncio
import calendar
import json
import logging
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.expenses import CreateExpenseRequest, record_expense
from app.core.database import AsyncSessionLocal, get_db, set_audit_context
from app.core.money import to_decimal
from app.core.roles import CAN_AMEND, CAN_POST, require
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Recurring Documents"])

KINDS = ("Expense", "PurchaseBill", "SalesInvoice")
MONTHS_PER = {"Monthly": 1, "Quarterly": 3, "Yearly": 12}
FREQUENCIES = ("Weekly",) + tuple(MONTHS_PER)
MAX_CATCH_UP = 12            # a profile left unattended posts at most this many periods in one run


def nth_run(start: date, frequency: str, every_n: int, n: int) -> date:
    """The date of the n-th occurrence (0 = the start date itself)."""
    if frequency == "Weekly":
        return date.fromordinal(start.toordinal() + 7 * every_n * n)
    months = MONTHS_PER[frequency] * every_n * n
    y, m = divmod(start.year * 12 + (start.month - 1) + months, 12)
    return date(y, m + 1, min(start.day, calendar.monthrange(y, m + 1)[1]))


class CreateProfile(BaseModel):
    kind: str
    name: str = Field(min_length=2, max_length=120)
    frequency: str
    every_n: int = Field(default=1, ge=1, le=24)
    start_date: date
    end_date: Optional[date] = None
    auto_post: bool = False
    # Expense: {expense_account_id, paid_through_account_id, amount, vendor_id?, reference_no?, notes?}
    # PurchaseBill: {source_invoice_id}     SalesInvoice: {order_document_id}
    template: dict
    reason: str = "Recurring profile created"


class StatusChange(BaseModel):
    status: str
    reason: str = "Recurring profile status changed"


class Advance(BaseModel):
    document_no: Optional[str] = Field(default=None, max_length=60)
    reason: str = "Recurring document raised"


def _row(r) -> dict:
    d = dict(r)
    d["id"] = str(d["id"])
    d["amount"] = float(to_decimal(d["amount"]))
    if isinstance(d.get("template"), str):
        d["template"] = json.loads(d["template"])
    d["is_due"] = d["status"] == "Active" and d["next_run_date"] <= date.today()
    return d


_COLUMNS = """
    SELECT id, kind, name, frequency, every_n, start_date, end_date, next_run_date, periods_done,
           auto_post, amount, template, status, last_run_at, last_document_no, last_error
    FROM caratloop.recurring_profiles
"""


async def _validate_template(db: AsyncSession, company_id, payload: CreateProfile) -> Decimal:
    """Check the template names real things of this company; return the amount it will raise."""
    t = payload.template or {}
    if payload.kind == "Expense":
        try:
            exp = CreateExpenseRequest(expense_date=payload.start_date, **{k: t.get(k) for k in (
                "expense_account_id", "paid_through_account_id", "amount", "vendor_id", "reference_no", "notes")})
        except (ValidationError, TypeError) as e:
            raise HTTPException(status_code=422, detail="An expense profile needs an expense account, a paid-through account and an amount.") from e
        res = await db.execute(
            text("""
                SELECT COUNT(*) FROM caratloop.accounts
                WHERE company_id = :cid AND id IN (CAST(:a AS UUID), CAST(:b AS UUID))
            """),
            {"cid": company_id, "a": str(exp.expense_account_id), "b": str(exp.paid_through_account_id)},
        )
        if int(res.scalar() or 0) != 2:
            raise HTTPException(status_code=404, detail="The expense or paid-through account was not found.")
        return to_decimal(exp.amount)
    if payload.kind == "PurchaseBill":
        res = await db.execute(
            text("SELECT grand_total FROM caratloop.purchase_invoices WHERE id = CAST(:id AS UUID) AND company_id = :cid"),
            {"id": str(t.get("source_invoice_id") or ""), "cid": company_id},
        )
    else:
        res = await db.execute(
            text("SELECT grand_total FROM caratloop.order_documents WHERE id = CAST(:id AS UUID) AND company_id = :cid"),
            {"id": str(t.get("order_document_id") or ""), "cid": company_id},
        )
    amount = res.scalar()
    if amount is None:
        raise HTTPException(status_code=404, detail="The bill or order this profile repeats was not found.")
    if payload.auto_post:
        raise HTTPException(status_code=422, detail="Only an expense can post itself. A bill or an invoice is raised from its form.")
    return to_decimal(amount)


@router.get("")
async def list_profiles(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    res = await db.execute(
        text(_COLUMNS + " WHERE company_id = :cid ORDER BY (status = 'Active') DESC, next_run_date, name LIMIT 500"),
        {"cid": current_user["company_id"]},
    )
    rows = [_row(r) for r in res.mappings().all()]
    return {"profiles": rows, "due": sum(1 for r in rows if r["is_due"])}


@router.post("", dependencies=[Depends(require(*CAN_POST))])
async def create_profile(
    payload: CreateProfile, request: Request,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user),
):
    if payload.kind not in KINDS:
        raise HTTPException(status_code=422, detail="kind must be Expense, PurchaseBill or SalesInvoice")
    if payload.frequency not in FREQUENCIES:
        raise HTTPException(status_code=422, detail="frequency must be Weekly, Monthly, Quarterly or Yearly")
    if payload.end_date and payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="The end date cannot be before the start date.")
    user_id, company_id = str(current_user["id"]), current_user["company_id"]
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, user_id, current_user.get("session_id", "0"), ip, payload.reason)
    try:
        amount = await _validate_template(db, company_id, payload)
        ins = await db.execute(
            text("""
                INSERT INTO caratloop.recurring_profiles (
                    company_id, kind, name, frequency, every_n, start_date, end_date, next_run_date,
                    auto_post, amount, template, created_by
                ) VALUES (
                    :cid, :kind, :name, :freq, :every, :start, :end, :start,
                    :auto, :amount, CAST(:template AS JSONB), CAST(:cb AS UUID)
                ) RETURNING id
            """),
            {"cid": company_id, "kind": payload.kind, "name": payload.name.strip(), "freq": payload.frequency,
             "every": payload.every_n, "start": payload.start_date, "end": payload.end_date,
             "auto": payload.auto_post, "amount": amount, "template": json.dumps(payload.template, default=str), "cb": user_id},
        )
        pid = ins.scalar()
        await db.commit()
        return {"status": "success", "id": str(pid), "next_run_date": payload.start_date.isoformat()}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Creating the recurring profile failed")
        raise HTTPException(status_code=500, detail="Saving the profile failed. Nothing was saved.") from e


async def _advance(db: AsyncSession, profile: dict, document_no: Optional[str], *, error: Optional[str] = None) -> date:
    """Move a profile to its next period (or end it) after a document was raised."""
    done = int(profile["periods_done"]) + 1
    nxt = nth_run(profile["start_date"], profile["frequency"], int(profile["every_n"]), done)
    ended = profile["end_date"] is not None and nxt > profile["end_date"]
    await db.execute(
        text("""
            UPDATE caratloop.recurring_profiles
            SET periods_done = :done, next_run_date = :nxt, last_run_at = NOW(),
                last_document_no = COALESCE(CAST(:doc AS VARCHAR), last_document_no), last_error = CAST(:err AS TEXT),
                status = CASE WHEN CAST(:ended AS BOOLEAN) THEN 'Ended' ELSE status END
            WHERE id = :id AND company_id = :cid
        """),
        {"done": done, "nxt": nxt, "doc": document_no, "err": error, "ended": ended,
         "id": str(profile["id"]), "cid": profile["company_id"]},
    )
    return nxt


async def _locked(db: AsyncSession, company_id, profile_id) -> dict:
    res = await db.execute(
        text("""
            SELECT id, company_id, kind, name, frequency, every_n, start_date, end_date, next_run_date,
                   periods_done, auto_post, template, status, created_by
            FROM caratloop.recurring_profiles
            WHERE id = :id AND company_id = :cid
            FOR UPDATE
        """),
        {"id": str(profile_id), "cid": company_id},
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Recurring profile not found")
    d = dict(row)
    if isinstance(d["template"], str):
        d["template"] = json.loads(d["template"])
    return d


@router.post("/{profile_id}/status", dependencies=[Depends(require(*CAN_POST))])
async def set_status(
    profile_id: UUID, payload: StatusChange, request: Request,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user),
):
    if payload.status not in ("Active", "Paused", "Ended"):
        raise HTTPException(status_code=422, detail="status must be Active, Paused or Ended")
    company_id = current_user["company_id"]
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, str(current_user["id"]), current_user.get("session_id", "0"), ip, payload.reason)
    try:
        profile = await _locked(db, company_id, profile_id)
        if profile["status"] == "Ended":
            raise HTTPException(status_code=409, detail=f"{profile['name']} has ended. Create a new profile to start again.")
        await db.execute(
            text("UPDATE caratloop.recurring_profiles SET status = :st, last_error = NULL WHERE id = :id AND company_id = :cid"),
            {"st": payload.status, "id": str(profile_id), "cid": company_id},
        )
        await db.commit()
        return {"status": "success", "new_status": payload.status}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Changing the recurring profile failed")
        raise HTTPException(status_code=500, detail="Changing the profile failed. Nothing was saved.") from e


@router.post("/{profile_id}/advance", dependencies=[Depends(require(*CAN_POST))])
async def advance_profile(
    profile_id: UUID, payload: Advance, request: Request,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user),
):
    """The period's document was raised by hand (or is being skipped): move to the next period."""
    company_id = current_user["company_id"]
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, str(current_user["id"]), current_user.get("session_id", "0"), ip, payload.reason)
    try:
        profile = await _locked(db, company_id, profile_id)
        if profile["status"] != "Active":
            raise HTTPException(status_code=409, detail=f"{profile['name']} is {profile['status']}.")
        nxt = await _advance(db, profile, payload.document_no)
        await db.commit()
        return {"status": "success", "next_run_date": nxt.isoformat()}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Advancing the recurring profile failed")
        raise HTTPException(status_code=500, detail="Advancing the profile failed. Nothing was saved.") from e


async def run_due_expenses(db: AsyncSession, *, company_id=None, today: Optional[date] = None) -> dict:
    """Post every auto-post expense that has fallen due. One transaction per profile.

    A profile whose posting is refused (a locked period, a ledger since
    deactivated) is paused with the reason, so one bad profile neither stops
    the others nor retries for ever.
    """
    today = today or date.today()
    res = await db.execute(
        text("""
            SELECT id, company_id FROM caratloop.recurring_profiles
            WHERE status = 'Active' AND kind = 'Expense' AND auto_post
              AND next_run_date <= CAST(:today AS DATE)
              AND (CAST(:cid AS UUID) IS NULL OR company_id = CAST(:cid AS UUID))
            ORDER BY next_run_date
        """),
        {"today": today, "cid": str(company_id) if company_id else None},
    )
    due = [dict(r) for r in res.mappings().all()]
    await db.rollback()          # release the read snapshot before the per-profile transactions
    posted, paused = [], []
    for ref in due:
        try:
            profile = await _locked(db, ref["company_id"], ref["id"])
            runs = 0
            while profile["status"] == "Active" and profile["next_run_date"] <= today and runs < MAX_CATCH_UP:
                user_id = str(profile["created_by"]) if profile["created_by"] else None
                await set_audit_context(db, user_id, "0", "127.0.0.1", f"Recurring expense: {profile['name']}")
                t = profile["template"]
                payload = CreateExpenseRequest(
                    expense_date=profile["next_run_date"],
                    **{k: t.get(k) for k in ("expense_account_id", "paid_through_account_id", "amount", "vendor_id", "reference_no", "notes")},
                    reason=f"Recurring expense: {profile['name']}",
                )
                created = await record_expense(db, company_id=profile["company_id"], user_id=user_id, ip_address="127.0.0.1", session_id="0", payload=payload)
                nxt = await _advance(db, profile, created["expense_no"])
                posted.append({"profile": profile["name"], "expense_no": created["expense_no"], "date": profile["next_run_date"].isoformat()})
                profile["periods_done"] += 1
                profile["next_run_date"] = nxt
                if profile["end_date"] is not None and nxt > profile["end_date"]:
                    profile["status"] = "Ended"
                runs += 1
            await db.commit()
        except HTTPException as e:
            await db.rollback()
            reason = str(e.detail)[:500]
            await db.execute(
                text("UPDATE caratloop.recurring_profiles SET status = 'Paused', last_error = :err WHERE id = :id AND company_id = :cid"),
                {"err": reason, "id": str(ref["id"]), "cid": ref["company_id"]},
            )
            await db.commit()
            paused.append({"profile_id": str(ref["id"]), "reason": reason})
        except Exception:
            await db.rollback()
            logger.exception("Recurring expense %s failed", ref["id"])
            paused.append({"profile_id": str(ref["id"]), "reason": "unexpected error; see the server log"})
    return {"posted": posted, "paused": paused}


@router.post("/run-due", dependencies=[Depends(require(*CAN_AMEND))])
async def run_due_now(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Post this company's due auto-post expenses now instead of waiting for the background run."""
    return await run_due_expenses(db, company_id=current_user["company_id"])


async def recurring_loop(interval_seconds: int = 6 * 3600, first_delay: int = 60) -> None:
    """Background task started with the application (app/main.py)."""
    await asyncio.sleep(first_delay)
    while True:
        try:
            async with AsyncSessionLocal() as db:
                out = await run_due_expenses(db)
                if out["posted"] or out["paused"]:
                    logger.info("Recurring expenses: %d posted, %d paused", len(out["posted"]), len(out["paused"]))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Recurring run failed")
        await asyncio.sleep(interval_seconds)
