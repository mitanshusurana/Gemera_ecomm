"""Year-end closing arithmetic, kept pure so it can be tested without a database.

Closing a year does two things in the ledger:

  1. A 'Closing' journal dated the last day of the year that brings every
     Income and Expenses account to zero and moves the net to Retained
     Earnings (CAP-002). Income accounts carry credit balances, so they are
     debited; expense accounts are credited; the difference is the profit
     (credited to Retained Earnings) or the loss (debited).

  2. An 'Opening' journal dated the first day of the NEXT year carrying every
     balance-sheet account's closing balance forward. accounts.opening_balance
     is a single per-account figure -- the balance at inception -- and is not
     rewritten; the carried balances live in the ledger like every other
     posting. Because cumulative readers (trial balance, balance sheet) sum
     from inception, they skip entry_type 'Opening' (see app.core.periods).

Each function returns (lines, figure): lines as dicts shaped for
vouchers.post_journal, figure as the Decimal the caller reports.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Iterable, Mapping

from app.core.money import round_money, to_decimal

RETAINED_EARNINGS_CODE = "CAP-002"
PL_NATURES = ("Income", "Expenses")
BALANCE_SHEET_NATURES = ("Assets", "Liabilities", "Equity")


def closing_lines(
    pl_balances: Iterable[Mapping[str, Any]],
    retained_earnings_account_id: Any,
) -> tuple[list[dict], Decimal]:
    """Journal lines that close every P&L account into Retained Earnings.

    ``pl_balances`` rows carry id, code, name, dr (total debits for the year)
    and cr (total credits). Returns (lines, net_profit); net_profit is
    positive for a profit, negative for a loss, and the RE line is omitted
    when it is exactly zero because the P&L lines already balance.
    """
    lines: list[dict] = []
    net_profit = Decimal("0")
    for row in pl_balances:
        net_credit = round_money(to_decimal(row.get("cr")) - to_decimal(row.get("dr")))
        if net_credit == 0:
            continue
        net_profit += net_credit
        narr = f"Year-end closing of {row.get('code')} {row.get('name') or ''}".strip()
        if net_credit > 0:
            lines.append({"acc": row["id"], "dr": net_credit, "cr": Decimal("0"), "narr": narr})
        else:
            lines.append({"acc": row["id"], "dr": Decimal("0"), "cr": -net_credit, "narr": narr})
    if net_profit > 0:
        lines.append({"acc": retained_earnings_account_id, "dr": Decimal("0"), "cr": net_profit,
                      "narr": "Net profit for the year transferred to Retained Earnings"})
    elif net_profit < 0:
        lines.append({"acc": retained_earnings_account_id, "dr": -net_profit, "cr": Decimal("0"),
                      "narr": "Net loss for the year transferred to Retained Earnings"})
    return lines, net_profit


def signed_debit_balance(row: Mapping[str, Any]) -> Decimal:
    """A balance-sheet account's closing balance as a signed debit figure.

    accounts.opening_balance is stored in the account's normal direction (the
    trial balance treats it that way), so a credit-normal account's opening
    balance counts as a credit here. Positive means a debit balance.
    """
    opening = to_decimal(row.get("opening_balance"))
    if (row.get("normal_balance") or "D") != "D":
        opening = -opening
    return round_money(opening + to_decimal(row.get("dr")) - to_decimal(row.get("cr")))


def opening_lines(bs_balances: Iterable[Mapping[str, Any]]) -> tuple[list[dict], Decimal]:
    """Journal lines carrying balance-sheet balances into the next year.

    Returns (lines, difference). After the closing journal has zeroed the
    P&L, the balance-sheet accounts must sum to zero; ``difference`` is what
    they actually sum to (debits minus credits). Anything but zero means the
    inception opening balances were entered unbalanced, and the caller must
    refuse rather than post a journal that does not balance.
    """
    lines: list[dict] = []
    total = Decimal("0")
    for row in bs_balances:
        bal = signed_debit_balance(row)
        if bal == 0:
            continue
        total += bal
        narr = f"Opening balance b/f {row.get('code')} {row.get('name') or ''}".strip()
        if bal > 0:
            lines.append({"acc": row["id"], "dr": bal, "cr": Decimal("0"), "narr": narr})
        else:
            lines.append({"acc": row["id"], "dr": Decimal("0"), "cr": -bal, "narr": narr})
    return lines, round_money(total)


def next_year_bounds(end_date: date) -> tuple[date, date, str]:
    """(start, end, label) of the year after one ending on ``end_date``.

    Labelled the way fn_provision_company_accounts labels it: 'YYYY-YY' of
    the start and end years, e.g. 2027-04-01 .. 2028-03-31 is '2027-28'.
    """
    start = end_date + timedelta(days=1)
    try:
        end = date(start.year + 1, start.month, start.day) - timedelta(days=1)
    except ValueError:  # 29 February start
        end = date(start.year + 1, start.month, 28) - timedelta(days=1)
    label = f"{start.year}-{str(end.year)[-2:]}"
    return start, end, label


def overlaps(existing: Iterable[Mapping[str, Any]], start: date, end: date, *, ignore_id: Any = None) -> list[Mapping[str, Any]]:
    """Years in ``existing`` whose range intersects [start, end]."""
    hits = []
    for fy in existing:
        if ignore_id is not None and str(fy.get("id")) == str(ignore_id):
            continue
        s = fy["start_date"] if isinstance(fy["start_date"], date) else date.fromisoformat(str(fy["start_date"])[:10])
        e = fy["end_date"] if isinstance(fy["end_date"], date) else date.fromisoformat(str(fy["end_date"])[:10])
        if s <= end and start <= e:
            hits.append(fy)
    return hits
