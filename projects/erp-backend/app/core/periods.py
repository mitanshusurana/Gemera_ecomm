"""Fiscal-period lock.

fiscal_years.is_locked has been stored since the baseline and nothing ever
read it: a bill dated inside a closed year posted straight into that year's
books, after the trial balance had been handed to the auditor and the return
filed. Every posting path must call :func:`assert_period_open` with the
document's date before it writes anything.

The decision itself is pure (:func:`period_state`) so it can be tested
without a database, and so the fiscal-year router can reuse it when it
decides whether a year may be locked or closed.

Which paths call it
-------------------
    purchases.py     create and amend (bill date)
    vouchers.py      receipt, payment, contra, journal, credit note, debit note
    banking.py       reconciliation match (the book line's entry date)
    fiscal_years.py  the closing journal bypasses it deliberately -- it is
                     dated the last day of the year being closed, and the lock
                     is applied in the same transaction, after it posts.

Not yet calling it (owned by other work streams; add the call at the top of
each posting handler, right after set_audit_context):
    sales.py         create_sales_invoice, delete_sales_invoice (reversal date)
    inventory.py     stock adjustments and transfers
    production.py    order completion / consumption postings
    job_work.py      challan and receipt postings
    approval_memos.py, integrations.py  (they post through sales/purchases)

Opening journals
----------------
Year-end closing writes an 'Opening' journal into the new year carrying every
balance-sheet account's closing balance. The cumulative readers (trial
balance, balance sheet, chart-of-accounts balances, the BRS book balance) sum
every posting since inception plus accounts.opening_balance, so they must
skip entry_type 'Opening' or count each balance twice. A ledger read FROM a
year's first day includes it, which is exactly the opening line an accountant
expects to see. :data:`CUMULATIVE_EXCLUDES_OPENING` is the SQL fragment.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Iterable, Mapping, Optional

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Appended to a cumulative balance query's join condition on journal_entries.
CUMULATIVE_EXCLUDES_OPENING = "AND je.entry_type <> 'Opening'"

OPEN = "open"
LOCKED = "locked"
NO_FISCAL_YEAR = "none"


def _as_date(value: Any) -> date:
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def fiscal_year_for(fiscal_years: Iterable[Mapping[str, Any]], on: Any) -> Optional[Mapping[str, Any]]:
    """The fiscal year whose [start_date, end_date] contains ``on``, or None.

    Years are not allowed to overlap (the router refuses to create one that
    does), so at most one matches; the first is returned.
    """
    d = _as_date(on)
    for fy in fiscal_years:
        if _as_date(fy["start_date"]) <= d <= _as_date(fy["end_date"]):
            return fy
    return None


def period_state(fiscal_years: Iterable[Mapping[str, Any]], on: Any) -> tuple[str, Optional[Mapping[str, Any]]]:
    """(state, fiscal_year) for a posting dated ``on``.

    state is OPEN, LOCKED, or NO_FISCAL_YEAR. A closed year is locked by
    definition -- closing sets is_locked -- but is_closed is checked too so a
    year closed by hand in the database cannot be posted into.
    """
    fy = fiscal_year_for(fiscal_years, on)
    if fy is None:
        return NO_FISCAL_YEAR, None
    if bool(fy.get("is_locked")) or bool(fy.get("is_closed")):
        return LOCKED, fy
    return OPEN, fy


def check_period_open(fiscal_years: Iterable[Mapping[str, Any]], on: Any, *, what: str = "This document") -> Mapping[str, Any]:
    """Raise 423 unless ``on`` falls in an open fiscal year; return that year."""
    state, fy = period_state(fiscal_years, on)
    d = _as_date(on)
    if state == NO_FISCAL_YEAR:
        raise HTTPException(
            status_code=423,
            detail=(
                f"{what} is dated {d.isoformat()}, which falls outside every fiscal year "
                "on record. Create the fiscal year under Accounting > Fiscal Years before posting."
            ),
        )
    if state == LOCKED:
        raise HTTPException(
            status_code=423,
            detail=(
                f"{what} is dated {d.isoformat()}, inside fiscal year {fy['year_label']}, "
                "which is locked. Unlock the year (owner or admin) to post into it, or date "
                "the document in an open year."
            ),
        )
    return fy  # type: ignore[return-value]


async def load_fiscal_years(db: AsyncSession, company_id: Any) -> list[dict]:
    res = await db.execute(
        text(
            "SELECT id, year_label, start_date, end_date, is_active, is_locked, is_closed "
            "FROM caratloop.fiscal_years WHERE company_id = :cid ORDER BY start_date"
        ),
        {"cid": str(company_id)},
    )
    return [dict(r) for r in res.mappings().fetchall()]


async def assert_period_open(db: AsyncSession, company_id: Any, entry_date: Any, *, what: str = "This document") -> dict:
    """Refuse (423) a posting dated in a locked year or outside every year.

    Returns the fiscal year row the date falls in, so callers that want the
    document's OWN year rather than the active one can use it.
    """
    years = await load_fiscal_years(db, company_id)
    return dict(check_period_open(years, entry_date, what=what))
