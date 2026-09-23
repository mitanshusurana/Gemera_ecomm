"""Monetary primitives.

Money in this system is NUMERIC(18,2) in Postgres and must be Decimal in
Python. A binary float cannot represent 0.10, so accumulating line totals in
float drifts, and the drift lands in an invoice.

Use :func:`to_decimal` at every boundary where a value arrives as float, str or
int, and :func:`round_money` before persisting or comparing.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Union

Numeric = Union[Decimal, int, str, float, None]

ZERO = Decimal("0.00")
PAISA = Decimal("0.01")
RUPEE = Decimal("1")


def to_decimal(value: Numeric) -> Decimal:
    """Coerce to Decimal without introducing binary-float error.

    Decimal, int and str convert exactly. A float is routed through ``str`` so
    that 0.1 becomes Decimal('0.1') rather than its 55-bit expansion.
    """
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def round_money(value: Numeric) -> Decimal:
    """Round to paise, half-up. GST amounts are expressed to 2dp."""
    return to_decimal(value).quantize(PAISA, rounding=ROUND_HALF_UP)


def round_rupees(value: Numeric) -> Decimal:
    """Round to the nearest rupee, half-up.

    Section 15 read with the rounding rule requires the tax payable on an
    invoice to be rounded to the nearest rupee. Not yet applied at invoice
    level -- posting a round-off difference needs a dedicated ledger account.
    """
    return to_decimal(value).quantize(RUPEE, rounding=ROUND_HALF_UP)


def split_half(total: Numeric) -> tuple[Decimal, Decimal]:
    """Split a tax amount into two equal halves without losing a paisa.

    CGST and SGST are each half the tax. An odd number of paise cannot be
    halved exactly, so the remainder is assigned to the second half and
    ``first + second == total`` always holds.
    """
    amount = round_money(total)
    first = round_money(amount / 2)
    return first, amount - first
