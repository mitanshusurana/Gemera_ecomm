"""Books of account: day book, cash book, bank book.

The cash and bank books are ledgers of the Cash / Bank accounts and are built
the same way as every other ledger (app.core.balances): Posted entries only,
no 'Opening' journals, an opening balance as at the first day of the range,
a running balance from that figure in voucher order. The cash book used to
select any account whose NAME contained "cash" (which caught a "Cash
Discount" expense head), summed unposted entries, and started every range at
zero.
"""

from datetime import date
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.balances import side_of, signed_opening, split_sides, with_running_balance
from app.core.database import get_db
from app.core.money import to_decimal
from app.core.security import get_current_user

router = APIRouter(tags=["Books of Accounts"])


@router.get("/daybook")
async def get_daybook(
    entry_date: Optional[date] = None,
    voucher_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Every Posted voucher of the day, in posting order, with its lines."""
    target_date = entry_date if entry_date else date.today()
    company_id = current_user["company_id"]
    query = """
        SELECT id, entry_uuid, entry_no, entry_date, entry_type AS voucher_type, narration,
               reference_no, reference_type, reference_id, status,
               total_debit, total_credit, sequence_no
        FROM caratloop.journal_entries
        WHERE company_id = :cid AND entry_date = :date AND status = 'Posted'
    """
    params = {"cid": company_id, "date": target_date}
    if voucher_type:
        query += " AND entry_type = :vtype"
        params["vtype"] = voucher_type
    query += " ORDER BY sequence_no, id"

    res = await db.execute(text(query), params)
    entries = []
    for r in res.mappings().all():
        e = dict(r)
        for k in ("entry_uuid", "reference_id"):
            if e.get(k) is not None:
                e[k] = str(e[k])
        l_res = await db.execute(
            text("""
                SELECT jel.id, jel.sequence_no, jel.account_id, a.code AS account_code, a.name AS account_name,
                       jel.party_id, p.name AS party_name,
                       jel.dr_amount, jel.cr_amount, jel.narration
                FROM caratloop.journal_entry_lines jel
                JOIN caratloop.accounts a ON a.id = jel.account_id
                LEFT JOIN caratloop.parties p ON p.id = jel.party_id
                WHERE jel.journal_entry_id = :jeid
                ORDER BY jel.sequence_no, jel.id
            """),
            {"jeid": e['id']},
        )
        lines = []
        for ln in l_res.mappings().all():
            d = dict(ln)
            d["account_id"] = str(d["account_id"])
            d["party_id"] = str(d["party_id"]) if d.get("party_id") else None
            lines.append(d)
        e['lines'] = lines
        entries.append(e)

    return entries


BOOK_OPENING_SQL = """
    SELECT a.id, a.code, a.name, a.account_type, a.normal_balance,
           COALESCE(a.opening_balance, 0) AS opening_balance, a.opening_balance_type,
           COALESCE(t.dr, 0) AS prior_dr, COALESCE(t.cr, 0) AS prior_cr
    FROM caratloop.accounts a
    LEFT JOIN (
        SELECT jel.account_id, SUM(jel.dr_amount) AS dr, SUM(jel.cr_amount) AS cr
        FROM caratloop.journal_entry_lines jel
        JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.company_id = CAST(:cid AS UUID) AND je.status = 'Posted'
          AND je.entry_type <> 'Opening'
          AND (CAST(:from_date AS DATE) IS NOT NULL AND je.entry_date < CAST(:from_date AS DATE))
        GROUP BY jel.account_id
    ) t ON t.account_id = a.id
    WHERE a.company_id = CAST(:cid AS UUID) AND a.is_active = TRUE
      AND (
            (CAST(:acc AS UUID) IS NOT NULL AND a.id = CAST(:acc AS UUID))
         OR (CAST(:acc AS UUID) IS NULL AND a.account_type = :account_type)
      )
    ORDER BY a.code
"""

BOOK_LINES_SQL = """
    SELECT
        je.id AS journal_entry_id, je.entry_uuid, je.sequence_no AS entry_sequence,
        je.entry_date AS date, jel.narration AS particulars, je.narration AS entry_narration,
        je.entry_type AS voucher_type, je.entry_no AS voucher_no,
        je.reference_no, je.reference_no AS instrument_no, je.reference_type, je.reference_id,
        jel.account_id, a.code AS account_code, a.name AS account_name,
        jel.dr_amount AS debit, jel.cr_amount AS credit
    FROM caratloop.journal_entry_lines jel
    JOIN caratloop.journal_entries je ON je.id = jel.journal_entry_id
    JOIN caratloop.accounts a ON a.id = jel.account_id
    WHERE je.company_id = CAST(:cid AS UUID) AND je.status = 'Posted'
      AND je.entry_type <> 'Opening'
      AND (
            (CAST(:acc AS UUID) IS NOT NULL AND a.id = CAST(:acc AS UUID))
         OR (CAST(:acc AS UUID) IS NULL AND a.account_type = :account_type)
      )
      AND (CAST(:from_date AS DATE) IS NULL OR je.entry_date >= CAST(:from_date AS DATE))
      AND (CAST(:to_date AS DATE) IS NULL OR je.entry_date <= CAST(:to_date AS DATE))
    ORDER BY je.entry_date, je.sequence_no, je.id, jel.sequence_no, jel.id
"""


async def _book(db: AsyncSession, company_id, *, account_id: Optional[str], account_type: str,
                from_date: Optional[date], to_date: Optional[date]) -> dict:
    params = {
        "cid": str(company_id),
        "acc": str(account_id) if account_id else None,
        "account_type": account_type,
        # Real dates: asyncpg types CAST(:p AS DATE) as a date and refuses a str.
        "from_date": from_date,
        "to_date": to_date,
    }
    acc_res = await db.execute(text(BOOK_OPENING_SQL), params)
    accounts = [dict(r) for r in acc_res.mappings().all()]
    if account_id and not accounts:
        raise HTTPException(status_code=404, detail="Account not found")
    opening = sum(
        (signed_opening(a) + to_decimal(a["prior_dr"]) - to_decimal(a["prior_cr"]) for a in accounts),
        Decimal("0"),
    )

    res = await db.execute(text(BOOK_LINES_SQL), params)
    rows = []
    for r in res.mappings().all():
        d = dict(r)
        for k in ("entry_uuid", "reference_id", "account_id"):
            if d.get(k) is not None:
                d[k] = str(d[k])
        d["debit"] = to_decimal(d["debit"])
        d["credit"] = to_decimal(d["credit"])
        rows.append(d)
    entries = with_running_balance(opening, rows)
    for e in entries:
        # The books page has always read `balance`; keep it as the signed figure.
        e["balance"] = e["running_balance"]
    closing = entries[-1]["running_balance"] if entries else opening
    opening_dr, opening_cr = split_sides(opening)
    closing_dr, closing_cr = split_sides(closing)
    return {
        "accounts": [{"id": str(a["id"]), "code": a["code"], "name": a["name"]} for a in accounts],
        "from_date": str(from_date) if from_date else None,
        "to_date": str(to_date) if to_date else None,
        "opening_balance": opening,
        "opening_abs": abs(opening),
        "opening_side": side_of(opening),
        "opening_debit": opening_dr,
        "opening_credit": opening_cr,
        "entries": entries,
        "total_debit": sum((e["debit"] for e in entries), Decimal("0")),
        "total_credit": sum((e["credit"] for e in entries), Decimal("0")),
        "closing_balance": closing,
        "closing_abs": abs(closing),
        "closing_side": side_of(closing),
        "closing_debit": closing_dr,
        "closing_credit": closing_cr,
    }


@router.get("/cashbook")
async def get_cashbook(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    account_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Cash book: the ledger of every account of type Cash (or one of them)."""
    return await _book(db, current_user["company_id"], account_id=account_id, account_type="Cash",
                       from_date=from_date, to_date=to_date)


@router.get("/bankbook")
async def get_bankbook(
    account_id: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """Bank book: the ledger of one bank account."""
    return await _book(db, current_user["company_id"], account_id=account_id, account_type="Bank",
                       from_date=from_date, to_date=to_date)
