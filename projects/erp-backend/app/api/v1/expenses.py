"""
Caratloop ERP — Expenses

A running cost paid from cash or bank (rent, electricity, courier, bank
charges), recorded in one step: Dr the expense ledger, Cr the cash or bank
ledger, posted as a Payment journal. The expense document (who was paid, the
supplier's reference, notes) is kept in caratloop.expenses beside the journal.

No input tax credit is taken here. A cost on which GST credit is to be
claimed is a purchase bill with a service item: that route feeds the ITC
register and the GSTR-2B reconciliation, and this one deliberately does not.

Posted expenses are not edited or deleted. A wrong one is reversed (a
Reversal journal that mirrors it) and recorded again.
"""
import logging
from datetime import date
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.vouchers import get_fy, post_journal
from app.core.database import get_db, set_audit_context
from app.core.money import round_money, to_decimal
from app.core.periods import assert_period_open
from app.core.roles import CAN_AMEND, CAN_POST, require
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Expenses"])


class CreateExpenseRequest(BaseModel):
    expense_date: date
    expense_account_id: UUID
    paid_through_account_id: UUID
    amount: Decimal = Field(gt=0)
    vendor_id: Optional[UUID] = None
    reference_no: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=1000)
    reason: str = "Expense recorded"


class ReverseExpenseRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


def expense_narration(account_name: str, vendor_name: Optional[str], notes: Optional[str]) -> str:
    """'Shop Rent paid to Ramesh Kumar: November' — what the day book shows."""
    text_ = account_name
    if vendor_name:
        text_ += f" paid to {vendor_name}"
    if notes and notes.strip():
        text_ += f": {notes.strip()}"
    return text_[:500]


async def next_expense_no(db: AsyncSession, company_id, fy_label: str) -> str:
    """EXP/<FY>/<n>: the highest number used in the year plus one, under a lock."""
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"expense:{company_id}:{fy_label}"})
    res = await db.execute(
        text("""
            SELECT COALESCE(MAX(CAST(SUBSTRING(expense_no FROM '^EXP/[^/]+/([0-9]+)$') AS INTEGER)), 0) + 1
            FROM caratloop.expenses
            WHERE company_id = :cid AND expense_no LIKE :pattern
        """),
        {"cid": company_id, "pattern": f"EXP/{fy_label}/%"},
    )
    return f"EXP/{fy_label}/{int(res.scalar() or 1):05d}"


_EXPENSE_COLUMNS = """
    SELECT e.id, e.expense_no, e.expense_date, e.amount, e.reference_no, e.notes, e.status,
           e.expense_account_id, ea.code AS expense_account_code, ea.name AS expense_account_name,
           e.paid_through_account_id, pa.name AS paid_through_name,
           e.vendor_id, COALESCE(NULLIF(v.trade_name, ''), v.name) AS vendor_name,
           e.journal_entry_id, je.entry_no AS voucher_no, e.reversal_entry_id, e.created_at
    FROM caratloop.expenses e
    JOIN caratloop.accounts ea ON ea.id = e.expense_account_id
    JOIN caratloop.accounts pa ON pa.id = e.paid_through_account_id
    JOIN caratloop.journal_entries je ON je.id = e.journal_entry_id
    LEFT JOIN caratloop.parties v ON v.id = e.vendor_id
"""


def _row(r) -> dict:
    d = dict(r)
    for k in ("id", "expense_account_id", "paid_through_account_id", "vendor_id"):
        d[k] = str(d[k]) if d.get(k) is not None else None
    d["amount"] = float(to_decimal(d["amount"]))
    return d


@router.get("")
async def list_expenses(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    expense_account_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Expenses of a period, newest first, with the total of those not reversed."""
    cid = current_user["company_id"]
    to_date = to_date or date.today()
    from_date = from_date or date(to_date.year if to_date.month >= 4 else to_date.year - 1, 4, 1)
    res = await db.execute(
        text(_EXPENSE_COLUMNS + """
            WHERE e.company_id = :cid
              AND e.expense_date >= CAST(:from_date AS DATE) AND e.expense_date <= CAST(:to_date AS DATE)
              AND (CAST(:acc AS UUID) IS NULL OR e.expense_account_id = CAST(:acc AS UUID))
            ORDER BY e.expense_date DESC, e.created_at DESC
            LIMIT 500
        """),
        {"cid": cid, "from_date": from_date, "to_date": to_date,
         "acc": str(expense_account_id) if expense_account_id else None},
    )
    rows = [_row(r) for r in res.mappings().all()]
    total = sum(r["amount"] for r in rows if r["status"] == "Posted")
    return {"from_date": from_date.isoformat(), "to_date": to_date.isoformat(), "expenses": rows, "total": round(total, 2)}


@router.post("", dependencies=[Depends(require(*CAN_POST))])
async def create_expense(
    payload: CreateExpenseRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Record an expense: Dr the expense ledger, Cr cash or bank."""
    user_id, company_id = str(current_user["id"]), current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
    amount = round_money(payload.amount)
    try:
        await assert_period_open(db, company_id, payload.expense_date, what="This expense")

        acc_res = await db.execute(
            text("""
                SELECT a.id, a.name, a.account_type, a.is_active, ag.nature
                FROM caratloop.accounts a
                JOIN caratloop.account_groups ag ON ag.id = a.group_id
                WHERE a.company_id = :cid
                  AND a.id IN (CAST(:exp AS UUID), CAST(:paid AS UUID))
            """),
            {"cid": company_id, "exp": str(payload.expense_account_id), "paid": str(payload.paid_through_account_id)},
        )
        accounts = {str(r["id"]): r for r in acc_res.mappings().all()}
        exp_acc = accounts.get(str(payload.expense_account_id))
        paid_acc = accounts.get(str(payload.paid_through_account_id))
        if exp_acc is None:
            raise HTTPException(status_code=404, detail="Expense account not found")
        if paid_acc is None:
            raise HTTPException(status_code=404, detail="Paid-through account not found")
        if exp_acc["nature"] != "Expenses":
            raise HTTPException(status_code=422, detail=f"{exp_acc['name']} is not an expense ledger. Pick an account from an Expenses group.")
        if paid_acc["account_type"] not in ("Bank", "Cash"):
            raise HTTPException(status_code=422, detail=f"{paid_acc['name']} is not a cash or bank ledger.")

        vendor_name = None
        if payload.vendor_id:
            v_res = await db.execute(
                text("SELECT COALESCE(NULLIF(trade_name, ''), name) FROM caratloop.parties WHERE id = :pid AND company_id = :cid"),
                {"pid": str(payload.vendor_id), "cid": company_id},
            )
            vendor_name = v_res.scalar()
            if vendor_name is None:
                raise HTTPException(status_code=404, detail="Vendor not found")

        fy = await get_fy(db, company_id)
        no_res = await db.execute(
            text("SELECT 'PAY/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
            {"fy": fy["year_label"]},
        )
        voucher_no = no_res.scalar()
        expense_no = await next_expense_no(db, company_id, fy["year_label"])
        narration = expense_narration(exp_acc["name"], vendor_name, payload.notes)
        lines = [
            {"acc": str(payload.expense_account_id), "dr": amount, "cr": Decimal("0"), "narr": narration},
            {"acc": str(payload.paid_through_account_id), "dr": Decimal("0"), "cr": amount, "narr": narration},
        ]
        je_id = await post_journal(
            db, company_id, str(fy["id"]), voucher_no, payload.expense_date, "Payment", narration,
            (payload.reference_no or expense_no)[:50], amount, user_id, ip_address, session_id, lines,
            ref_type="Expense",
        )
        ins = await db.execute(
            text("""
                INSERT INTO caratloop.expenses (
                    company_id, fiscal_year_id, expense_no, expense_date, expense_account_id,
                    paid_through_account_id, vendor_id, amount, reference_no, notes, journal_entry_id, created_by
                ) VALUES (
                    :cid, :fyid, :eno, :edate, CAST(:exp AS UUID),
                    CAST(:paid AS UUID), CAST(:vendor AS UUID), :amount, :ref, :notes, :jeid, CAST(:cb AS UUID)
                ) RETURNING id
            """),
            {"cid": company_id, "fyid": str(fy["id"]), "eno": expense_no, "edate": payload.expense_date,
             "exp": str(payload.expense_account_id), "paid": str(payload.paid_through_account_id),
             "vendor": str(payload.vendor_id) if payload.vendor_id else None, "amount": amount,
             "ref": payload.reference_no, "notes": payload.notes, "jeid": je_id, "cb": user_id},
        )
        expense_id = ins.scalar()
        await db.commit()
        return {"status": "success", "id": str(expense_id), "expense_no": expense_no, "voucher_no": voucher_no}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Recording the expense failed")
        raise HTTPException(status_code=500, detail="Recording the expense failed. Nothing was saved.") from e


@router.post("/{expense_id}/reverse", dependencies=[Depends(require(*CAN_AMEND))])
async def reverse_expense(
    expense_id: UUID,
    payload: ReverseExpenseRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Undo an expense with a mirror-image journal; the original stays on file."""
    user_id, company_id = str(current_user["id"]), current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
    try:
        res = await db.execute(
            text("""
                SELECT e.id, e.expense_no, e.expense_date, e.amount, e.status,
                       e.expense_account_id, e.paid_through_account_id
                FROM caratloop.expenses e
                WHERE e.id = :id AND e.company_id = :cid
                FOR UPDATE
            """),
            {"id": str(expense_id), "cid": company_id},
        )
        exp = res.mappings().first()
        if exp is None:
            raise HTTPException(status_code=404, detail="Expense not found")
        if exp["status"] == "Reversed":
            raise HTTPException(status_code=409, detail=f"{exp['expense_no']} is already reversed.")
        # The reversal is dated like the expense, so the period it corrects
        # must still be open.
        await assert_period_open(db, company_id, exp["expense_date"], what=f"The expense being reversed ({exp['expense_no']})")

        fy = await get_fy(db, company_id)
        no_res = await db.execute(
            text("SELECT 'REV/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
            {"fy": fy["year_label"]},
        )
        rev_no = no_res.scalar()
        amount = to_decimal(exp["amount"])
        narration = f"Reversal of {exp['expense_no']}: {payload.reason}"[:500]
        lines = [
            {"acc": str(exp["paid_through_account_id"]), "dr": amount, "cr": Decimal("0"), "narr": narration},
            {"acc": str(exp["expense_account_id"]), "dr": Decimal("0"), "cr": amount, "narr": narration},
        ]
        rev_id = await post_journal(
            db, company_id, str(fy["id"]), rev_no, exp["expense_date"], "Reversal", narration,
            exp["expense_no"], amount, user_id, ip_address, session_id, lines, ref_type="Expense",
        )
        await db.execute(
            text("UPDATE caratloop.expenses SET status = 'Reversed', reversal_entry_id = :rev WHERE id = :id AND company_id = :cid"),
            {"rev": rev_id, "id": str(expense_id), "cid": company_id},
        )
        await db.commit()
        return {"status": "success", "expense_no": exp["expense_no"], "reversal_voucher_no": rev_no}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Reversing the expense failed")
        raise HTTPException(status_code=500, detail="Reversing the expense failed. Nothing was saved.") from e
