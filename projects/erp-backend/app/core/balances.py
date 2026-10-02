"""Ledger balance arithmetic, kept pure so the reports can be tested offline.

Every reader of the ledger (trial balance, general ledger, party ledger, cash
and bank books, balance sheet, the reconciliation panel) has to agree on four
things, and until this module existed each of them did its own version:

  * which postings count: status 'Posted', and never an 'Opening' journal in a
    from-inception total (see app.core.periods);
  * what an account's opening balance is: accounts.opening_balance read with
    accounts.opening_balance_type, which may be the opposite side of the
    account's normal balance (a debtor who owed us nothing but was paid an
    advance before the books started has a credit opening balance on a
    debit account). The trial balance and balance sheet used to ignore the
    type and treat every opening figure as being on the normal side;
  * how a running balance is built: in voucher order (date, voucher sequence,
    line sequence) starting from the opening balance as at the first day of
    the range, not from zero at whatever row happens to come first;
  * how a balance is presented: an absolute amount with a Dr/Cr side, never a
    negative debit.

Internally a balance is a signed Decimal, debit positive. Only the
presentation helpers turn that into (amount, side).
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Iterable, Mapping, Optional

from app.core.ledger import TOLERANCE
from app.core.money import round_money, to_decimal

# Status words for the reconciliation panel. "warn" is a difference the
# posting guard tolerates (sub-paisa float noise) but that an accountant
# should still see; "fail" is a real discrepancy.
OK = "ok"
WARN = "warn"
FAIL = "fail"
# A figure shown for the record that has no pass/fail meaning of its own
# (an on-account balance, a count of opening journals).
INFO = "info"

# SQL fragment every cumulative reader appends to its journal filter.
POSTED_NOT_OPENING = "je.status = 'Posted' AND je.entry_type <> 'Opening'"


def signed_opening(row: Mapping[str, Any]) -> Decimal:
    """accounts.opening_balance as a signed (debit-positive) Decimal.

    ``opening_balance_type`` wins when present; otherwise the account's
    ``normal_balance`` decides which side the figure sits on.
    """
    amount = to_decimal(row.get("opening_balance"))
    if amount == 0:
        return Decimal("0")
    side = (row.get("opening_balance_type") or row.get("normal_balance") or "D")
    return amount if str(side).strip().upper().startswith("D") else -amount


def side_of(balance: Any) -> str:
    """'Dr' for a debit (positive) balance, 'Cr' for a credit; zero reads 'Dr'."""
    return "Cr" if to_decimal(balance) < 0 else "Dr"


def split_sides(balance: Any) -> tuple[Decimal, Decimal]:
    """(debit, credit): the balance on one side, zero on the other."""
    b = to_decimal(balance)
    if b >= 0:
        return b, Decimal("0")
    return Decimal("0"), -b


def normal_side_balance(signed: Any, normal_balance: Optional[str]) -> Decimal:
    """A signed debit-positive balance expressed on the account's normal side.

    This is the figure the chart of accounts and trial balance show: positive
    when the account carries its usual balance, negative when it has flipped
    (a debtor in credit, an overdrawn bank account).
    """
    b = to_decimal(signed)
    return b if (normal_balance or "D").upper().startswith("D") else -b


def with_running_balance(opening: Any, rows: Iterable[Mapping[str, Any]],
                         *, debit_key: str = "debit", credit_key: str = "credit") -> list[dict]:
    """Copy ``rows`` (already in voucher order) adding running_balance/side.

    ``running_balance`` is the signed figure (debit positive) after the row;
    ``running_side`` and ``running_abs`` are its presentation. The caller is
    responsible for ordering the rows; this function never re-sorts them,
    because the response order and the ledger order must be the same thing.
    """
    balance = to_decimal(opening)
    out: list[dict] = []
    for r in rows:
        d = dict(r)
        balance += to_decimal(d.get(debit_key)) - to_decimal(d.get(credit_key))
        d["running_balance"] = balance
        d["running_abs"] = abs(balance)
        d["running_side"] = side_of(balance)
        out.append(d)
    return out


def status_for(difference: Any, *, strict: bool = False) -> str:
    """ok / warn / fail for an absolute difference between two figures.

    A difference within the posting tolerance is ``warn``: the books are not
    wrong at the paisa, but something posted a fraction of a paisa and it
    should be found. ``strict`` demands an exact match (used where both sides
    are stored to the paisa and any difference is a defect).
    """
    d = abs(to_decimal(difference))
    if d == 0:
        return OK
    if not strict and d <= TOLERANCE:
        return WARN
    return FAIL


def check(name: str, label: str, expected: Any, actual: Any, *, strict: bool = False,
          detail: Optional[str] = None, **extra: Any) -> dict:
    """One row of the reconciliation panel."""
    exp = to_decimal(expected)
    act = to_decimal(actual)
    diff = act - exp
    row = {
        "name": name,
        "label": label,
        "expected": exp,
        "actual": act,
        "difference": diff,
        "status": status_for(diff, strict=strict),
        "detail": detail,
    }
    row.update(extra)
    return row
