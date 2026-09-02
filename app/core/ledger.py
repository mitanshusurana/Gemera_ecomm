"""
Double-entry integrity guards.

The single invariant of a double-entry ledger is that every journal entry's
debits equal its credits. Nothing in this codebase enforced it: only the manual
journal endpoint checked, and sales, purchases and production all posted
entries with no check at all.

Verifying against the *database* rather than the in-memory values is deliberate.
It catches three distinct failure modes with one query:

  1. Arithmetic that simply does not balance (e.g. the customer debited for
     other_charges with no corresponding credit leg).
  2. Legs that silently vanished. Several inserts are shaped as
     ``INSERT ... SELECT ... FROM accounts WHERE code = :code``; when the chart
     of accounts is missing that code the statement inserts zero rows and
     raises nothing, so the entry commits short a credit.
  3. A header whose total_debit/total_credit disagree with the sum of its own
     lines, which corrupts every report reading the header.

Call :func:`assert_journal_balanced` after the lines are inserted and before
``commit()``. Raising leaves the surrounding transaction to roll back, so an
unbalanced entry is never persisted.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Money is stored to 2dp. A tolerance of half a paisa absorbs representation
# noise from the float call sites that still exist, without letting a real
# imbalance through.
TOLERANCE = Decimal("0.005")


def _dec(value) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


async def assert_journal_balanced(
    db: AsyncSession,
    journal_entry_id,
    *,
    context: str = "journal entry",
    sync_header: bool = True,
) -> tuple[Decimal, Decimal]:
    """Verify a posted journal entry balances. Raises HTTP 500 if it does not.

    Returns the (debit, credit) totals actually stored, so callers may log them.
    """
    je_id = str(journal_entry_id)

    res = await db.execute(
        text(
            "SELECT COUNT(*) AS line_count, "
            "       COALESCE(SUM(dr_amount), 0) AS total_dr, "
            "       COALESCE(SUM(cr_amount), 0) AS total_cr "
            "FROM caratloop.journal_entry_lines "
            "WHERE journal_entry_id = :je_id"
        ),
        {"je_id": je_id},
    )
    row = res.mappings().first()

    line_count = int(row["line_count"]) if row else 0
    total_dr = _dec(row["total_dr"]) if row else Decimal("0")
    total_cr = _dec(row["total_cr"]) if row else Decimal("0")

    # A single-sided entry is never valid double entry.
    if line_count < 2:
        logger.error(
            "Refusing %s %s: only %d line(s) posted. A missing chart-of-accounts "
            "code causes the INSERT...SELECT legs to insert zero rows silently.",
            context, je_id, line_count,
        )
        raise HTTPException(
            status_code=500,
            detail=(
                f"Refusing to post {context}: only {line_count} ledger line(s) were "
                "created. This usually means a required account code is missing from "
                "the chart of accounts. No data was saved."
            ),
        )

    difference = total_dr - total_cr
    if abs(difference) > TOLERANCE:
        logger.error(
            "Refusing %s %s: debits %s != credits %s (difference %s).",
            context, je_id, total_dr, total_cr, difference,
        )
        raise HTTPException(
            status_code=500,
            detail=(
                f"Refusing to post {context}: debits ({total_dr}) do not equal "
                f"credits ({total_cr}), a difference of {difference}. "
                "No data was saved."
            ),
        )

    if sync_header:
        # The header must agree with its own lines; production.py set the header
        # from one component only, so it permanently disagreed.
        await db.execute(
            text(
                "UPDATE caratloop.journal_entries "
                "SET total_debit = :dr, total_credit = :cr "
                "WHERE id = :je_id"
            ),
            {"dr": total_dr, "cr": total_cr, "je_id": je_id},
        )

    return total_dr, total_cr


async def assert_accounts_exist(db: AsyncSession, company_id, codes) -> None:
    """Fail early and by name when required account codes are absent.

    Without this the caller's ``INSERT ... SELECT ... WHERE code = :code``
    quietly inserts nothing, and the imbalance is only discovered later.
    """
    wanted = sorted({c for c in codes if c})
    if not wanted:
        return

    res = await db.execute(
        text(
            "SELECT code FROM caratloop.accounts "
            "WHERE company_id = :cid AND code = ANY(:codes)"
        ),
        {"cid": str(company_id), "codes": wanted},
    )
    found = {r[0] for r in res.fetchall()}
    missing = [c for c in wanted if c not in found]

    if missing:
        raise HTTPException(
            status_code=400,
            detail=(
                "Chart of accounts is incomplete: missing "
                + ", ".join(missing)
                + ". Create these accounts before posting this document."
            ),
        )
