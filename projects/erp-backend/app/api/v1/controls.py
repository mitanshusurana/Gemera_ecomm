"""
Caratloop ERP — Accountant's controls: lock date, budgets, bank rules

* **Lock date** (``/controls/lock-date``): nothing dated on or before it can
  be posted, amended or reversed. It sits beside the fiscal-year lock and is
  enforced by the same check every posting path already calls
  (``periods.assert_period_open``).
* **Budgets** (``/controls/budgets``): an amount per income or expense
  ledger for a fiscal year, shown against the year's actuals.
* **Bank rules** (``/controls/bank-rules``): text that, when found in a
  statement line's description, suggests the ledger or party to book it to.
  A rule only suggests; the entry is still confirmed by a person.
"""
import logging
from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, set_audit_context
from app.core.money import to_decimal
from app.core.roles import CAN_AMEND, CAN_POST, require
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Accountant's Controls"])


# ── lock date ────────────────────────────────────────────────────────────────
class LockDate(BaseModel):
    locked_until: Optional[date] = None           # None removes the lock
    reason: str = Field(default="Books lock date changed", min_length=3, max_length=300)


@router.get("/lock-date")
async def get_lock_date(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    res = await db.execute(
        text("SELECT books_locked_until FROM caratloop.companies WHERE id = :cid"),
        {"cid": current_user["company_id"]},
    )
    d = res.scalar()
    return {"locked_until": d.isoformat() if d else None}


@router.put("/lock-date", dependencies=[Depends(require(*CAN_AMEND))])
async def set_lock_date(payload: LockDate, request: Request, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if payload.locked_until and payload.locked_until > date.today():
        raise HTTPException(status_code=422, detail="The lock date cannot be in the future: it would block today's entries.")
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, str(current_user["id"]), current_user.get("session_id", "0"), ip, payload.reason)
    await db.execute(
        text("UPDATE caratloop.companies SET books_locked_until = :d WHERE id = :cid"),
        {"d": payload.locked_until, "cid": current_user["company_id"]},
    )
    await db.commit()
    return {"status": "success", "locked_until": payload.locked_until.isoformat() if payload.locked_until else None}


# ── budgets ──────────────────────────────────────────────────────────────────
class BudgetItem(BaseModel):
    account_id: UUID
    amount: Decimal = Field(ge=0)


class SaveBudgets(BaseModel):
    fiscal_year_id: Optional[UUID] = None         # blank = the active year
    items: List[BudgetItem]
    reason: str = "Budget updated"


async def _fiscal_year(db: AsyncSession, company_id, fiscal_year_id) -> dict:
    res = await db.execute(
        text("""
            SELECT id, year_label, start_date, end_date
            FROM caratloop.fiscal_years
            WHERE company_id = :cid
              AND (CAST(:fy AS UUID) IS NULL AND is_active OR id = CAST(:fy AS UUID))
            ORDER BY start_date DESC
            LIMIT 1
        """),
        {"cid": company_id, "fy": str(fiscal_year_id) if fiscal_year_id else None},
    )
    fy = res.mappings().first()
    if fy is None:
        raise HTTPException(status_code=404, detail="Fiscal year not found")
    return dict(fy)


def variance(nature: str, budget: Decimal, actual: Decimal) -> dict:
    """How the actual stands against the budget.

    For an expense, spending under budget is favourable; for income, earning
    over it is. ``used_pct`` is None when no budget is set.
    """
    diff = (budget - actual) if nature == "Expenses" else (actual - budget)
    return {
        "variance": float(diff),
        "favourable": diff >= 0,
        "used_pct": round(float(actual / budget * 100), 1) if budget > 0 else None,
    }


@router.get("/budgets")
async def get_budgets(fiscal_year_id: Optional[UUID] = None, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Every income and expense ledger with its budget and the year's actual to date."""
    cid = current_user["company_id"]
    fy = await _fiscal_year(db, cid, fiscal_year_id)
    upto = min(date.today(), fy["end_date"])
    res = await db.execute(
        text("""
            SELECT a.id AS account_id, a.code, a.name, ag.name AS group_name, ag.nature,
                   COALESCE(b.amount, 0) AS budget,
                   COALESCE(t.actual, 0) AS actual
            FROM caratloop.accounts a
            JOIN caratloop.account_groups ag ON ag.id = a.group_id
            LEFT JOIN caratloop.budgets b
                   ON b.account_id = a.id AND b.fiscal_year_id = :fy AND b.company_id = :cid
            LEFT JOIN (
                SELECT jel.account_id,
                       SUM(CASE WHEN ag2.nature = 'Income' THEN jel.cr_amount - jel.dr_amount ELSE jel.dr_amount - jel.cr_amount END) AS actual
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
                JOIN caratloop.accounts a2 ON a2.id = jel.account_id
                JOIN caratloop.account_groups ag2 ON ag2.id = a2.group_id
                WHERE je.company_id = :cid AND je.status = 'Posted'
                  AND je.entry_type NOT IN ('Opening', 'Closing')
                  AND je.entry_date >= CAST(:start AS DATE) AND je.entry_date <= CAST(:upto AS DATE)
                GROUP BY jel.account_id
            ) t ON t.account_id = a.id
            WHERE a.company_id = :cid AND ag.nature IN ('Income', 'Expenses')
              AND (a.is_active = TRUE OR b.amount IS NOT NULL OR t.account_id IS NOT NULL)
            ORDER BY ag.nature DESC, ag.name, a.code
            LIMIT 1000
        """),
        {"cid": cid, "fy": str(fy["id"]), "start": fy["start_date"], "upto": upto},
    )
    rows = []
    totals = {"Income": {"budget": Decimal("0"), "actual": Decimal("0")}, "Expenses": {"budget": Decimal("0"), "actual": Decimal("0")}}
    for r in res.mappings().all():
        budget, actual = to_decimal(r["budget"]), to_decimal(r["actual"])
        totals[r["nature"]]["budget"] += budget
        totals[r["nature"]]["actual"] += actual
        rows.append({"account_id": str(r["account_id"]), "code": r["code"], "name": r["name"], "group_name": r["group_name"],
                     "nature": r["nature"], "budget": float(budget), "actual": float(actual), **variance(r["nature"], budget, actual)})
    return {
        "fiscal_year": {"id": str(fy["id"]), "year_label": fy["year_label"], "start_date": fy["start_date"].isoformat(), "end_date": fy["end_date"].isoformat()},
        "actuals_up_to": upto.isoformat(),
        "rows": rows,
        "totals": {k: {"budget": float(v["budget"]), "actual": float(v["actual"]), **variance(k, v["budget"], v["actual"])} for k, v in totals.items()},
    }


@router.put("/budgets", dependencies=[Depends(require(*CAN_POST))])
async def save_budgets(payload: SaveBudgets, request: Request, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Set budgets for the year. An amount of zero removes that ledger's budget."""
    cid, uid = current_user["company_id"], str(current_user["id"])
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, uid, current_user.get("session_id", "0"), ip, payload.reason)
    try:
        fy = await _fiscal_year(db, cid, payload.fiscal_year_id)
        for item in payload.items:
            ok = await db.execute(
                text("""
                    SELECT 1 FROM caratloop.accounts a
                    JOIN caratloop.account_groups ag ON ag.id = a.group_id
                    WHERE a.id = :acc AND a.company_id = :cid AND ag.nature IN ('Income', 'Expenses')
                """),
                {"acc": str(item.account_id), "cid": cid},
            )
            if ok.scalar() is None:
                raise HTTPException(status_code=422, detail="A budget can only be set on an income or expense ledger of this company.")
            if item.amount == 0:
                await db.execute(
                    text("DELETE FROM caratloop.budgets WHERE company_id = :cid AND fiscal_year_id = :fy AND account_id = :acc"),
                    {"cid": cid, "fy": str(fy["id"]), "acc": str(item.account_id)},
                )
            else:
                await db.execute(
                    text("""
                        INSERT INTO caratloop.budgets (company_id, fiscal_year_id, account_id, amount, updated_by)
                        VALUES (:cid, :fy, :acc, :amount, CAST(:uid AS UUID))
                        ON CONFLICT (company_id, fiscal_year_id, account_id)
                        DO UPDATE SET amount = EXCLUDED.amount, updated_at = clock_timestamp(), updated_by = EXCLUDED.updated_by
                    """),
                    {"cid": cid, "fy": str(fy["id"]), "acc": str(item.account_id), "amount": item.amount, "uid": uid},
                )
        await db.commit()
        return {"status": "success", "fiscal_year": fy["year_label"], "saved": len(payload.items)}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Saving budgets failed")
        raise HTTPException(status_code=500, detail="Saving the budgets failed. Nothing was saved.") from e


# ── bank rules ───────────────────────────────────────────────────────────────
class BankRule(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    match_text: str = Field(min_length=3, max_length=120)
    direction: str = "Any"                         # Any, Debit (money out), Credit (money in)
    account_id: Optional[UUID] = None
    party_id: Optional[UUID] = None
    priority: int = Field(default=100, ge=1, le=999)


def pick_rule(rules: list[dict], description: str, direction: str) -> Optional[dict]:
    """The first active rule (lowest priority number) whose text is in the description."""
    hay = (description or "").lower()
    for r in sorted(rules, key=lambda r: (int(r["priority"]), str(r["name"]))):
        if r.get("is_active", True) and r["direction"] in ("Any", direction) and str(r["match_text"]).lower() in hay:
            return r
    return None


_RULE_COLUMNS = """
    SELECT r.id, r.name, r.match_text, r.direction, r.account_id, a.name AS account_name,
           r.party_id, COALESCE(NULLIF(p.trade_name, ''), p.name) AS party_name, r.priority, r.is_active
    FROM caratloop.bank_rules r
    LEFT JOIN caratloop.accounts a ON a.id = r.account_id
    LEFT JOIN caratloop.parties p ON p.id = r.party_id
"""


def _rule(r) -> dict:
    d = dict(r)
    for k in ("id", "account_id", "party_id"):
        d[k] = str(d[k]) if d.get(k) is not None else None
    return d


async def _rules(db: AsyncSession, company_id, *, active_only: bool) -> list[dict]:
    res = await db.execute(
        text(_RULE_COLUMNS + """
            WHERE r.company_id = :cid AND (NOT CAST(:active AS BOOLEAN) OR r.is_active)
            ORDER BY r.priority, r.name
            LIMIT 500
        """),
        {"cid": company_id, "active": active_only},
    )
    return [_rule(r) for r in res.mappings().all()]


@router.get("/bank-rules")
async def get_bank_rules(db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return {"rules": await _rules(db, current_user["company_id"], active_only=False)}


@router.get("/bank-rules/match")
async def match_bank_rule(description: str = "", direction: str = "Any", db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """The rule that applies to a statement line, if any."""
    return {"rule": pick_rule(await _rules(db, current_user["company_id"], active_only=True), description, direction)}


@router.post("/bank-rules", dependencies=[Depends(require(*CAN_POST))])
async def create_bank_rule(payload: BankRule, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    if payload.direction not in ("Any", "Debit", "Credit"):
        raise HTTPException(status_code=422, detail="direction must be Any, Debit or Credit")
    if not payload.account_id and not payload.party_id:
        raise HTTPException(status_code=422, detail="A rule needs a ledger account or a party to suggest.")
    cid = current_user["company_id"]
    owned = await db.execute(
        text("""
            SELECT (CAST(:acc AS UUID) IS NULL OR EXISTS (SELECT 1 FROM caratloop.accounts WHERE id = CAST(:acc AS UUID) AND company_id = :cid))
               AND (CAST(:pid AS UUID) IS NULL OR EXISTS (SELECT 1 FROM caratloop.parties WHERE id = CAST(:pid AS UUID) AND company_id = :cid))
        """),
        {"acc": str(payload.account_id) if payload.account_id else None, "pid": str(payload.party_id) if payload.party_id else None, "cid": cid},
    )
    if not owned.scalar():
        raise HTTPException(status_code=404, detail="The ledger account or party was not found.")
    ins = await db.execute(
        text("""
            INSERT INTO caratloop.bank_rules (company_id, name, match_text, direction, account_id, party_id, priority, created_by)
            VALUES (:cid, :name, :match, :direction, CAST(:acc AS UUID), CAST(:pid AS UUID), :priority, CAST(:uid AS UUID))
            RETURNING id
        """),
        {"cid": cid, "name": payload.name.strip(), "match": payload.match_text.strip(), "direction": payload.direction,
         "acc": str(payload.account_id) if payload.account_id else None, "pid": str(payload.party_id) if payload.party_id else None,
         "priority": payload.priority, "uid": str(current_user["id"])},
    )
    rid = ins.scalar()
    await db.commit()
    return {"status": "success", "id": str(rid)}


@router.post("/bank-rules/{rule_id}/active", dependencies=[Depends(require(*CAN_POST))])
async def set_bank_rule_active(rule_id: UUID, active: bool = True, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """Switch a rule on or off. Rules are switched off, not deleted."""
    res = await db.execute(
        text("UPDATE caratloop.bank_rules SET is_active = :active WHERE id = :id AND company_id = :cid RETURNING id"),
        {"active": active, "id": str(rule_id), "cid": current_user["company_id"]},
    )
    if res.scalar() is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.commit()
    return {"status": "success", "is_active": active}
