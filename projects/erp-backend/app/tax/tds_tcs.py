"""Withholding on trade: TDS s.194Q on purchases, TCS s.206C(1H) on sales.

Both sections work the same way and are mirror images of each other:

* A buyer whose turnover exceeded Rs 10 crore in the preceding financial year
  deducts tax at 0.1% on purchases from one seller once those purchases exceed
  Rs 50 lakh in the financial year (s.194Q, from 1 July 2021). The deduction
  is on the value above the threshold, not on the whole bill.
* A seller whose turnover exceeded Rs 10 crore collects tax at 0.1% on sale
  consideration received from one buyer once it exceeds Rs 50 lakh in the year
  (s.206C(1H), from 1 October 2020). CBDT circular 17/2020 says the collection
  is on the amount received including GST, and no adjustment is made for
  returns or discounts.

Where both could apply to one transaction, s.206C(1H) yields to s.194Q: the
buyer deducts and the seller does not collect. That cross-check needs both
parties' facts and is left to the parties' flags on the party master.

Without a PAN the rate is higher: s.206AA makes the TDS rate 5% (the higher of
twice the rate and 5%), and the proviso to s.206CC makes the TCS rate under
206C(1H) 1% (twice the rate or 5%, capped for this sub-section). A lower- or
nil-deduction certificate under s.197 replaces the rate when a PAN is on
record.

This module is pure arithmetic in Decimal. The callers supply the cumulative
figure for the financial year from the database; nothing here reads it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

from app.core.money import ZERO, round_money, to_decimal

_PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")


def has_valid_pan(pan) -> bool:
    """A PAN-shaped value. 'NA', '-' and 'PANNOTAVBL' are not a PAN."""
    return bool(_PAN_RE.match(str(pan or "").strip().upper()))

TDS_SECTION = "194Q"
TCS_SECTION = "206C(1H)"

# Proviso to s.206CC for s.206C(1H): 1% when the collectee has no PAN.
TCS_206C1H_NO_PAN_RATE = Decimal("1.00")

# tds_tcs_register.kind vocabulary. The CHECK in migration 0007 permits
# exactly these; the register writer passes them as bind parameters, so the
# generic literal-vocabulary test cannot see them and test_tds_tcs.py compares
# this constant against the CHECK instead.
REGISTER_KINDS = frozenset({"TDS", "TCS"})


@dataclass(frozen=True)
class Withholding:
    """The outcome for one document."""

    section: str
    base: Decimal          # the part of this document above the threshold
    rate: Decimal          # percent actually applied
    amount: Decimal        # money to withhold / collect

    @property
    def applies(self) -> bool:
        return self.amount > 0


def _portion_above_threshold(cumulative_before, this_value, threshold) -> Decimal:
    """How much of this document lies above the year's threshold.

    Nothing until the running total crosses the threshold; from then on the
    whole document. The document that crosses it is split: only the excess is
    withheld on.
    """
    before = to_decimal(cumulative_before)
    value = to_decimal(this_value)
    limit = to_decimal(threshold)
    if value <= 0:
        return ZERO
    if before >= limit:
        return round_money(value)
    excess = before + value - limit
    if excess <= 0:
        return ZERO
    return round_money(excess)


def _effective_rate(rate, has_pan: bool, no_pan_rate, lower_pct) -> Decimal:
    if not has_pan:
        return to_decimal(no_pan_rate)
    if lower_pct is not None:
        # A s.197 certificate: nil (0) or a lower rate. It cannot raise the rate.
        lower = to_decimal(lower_pct)
        if lower < 0:
            lower = ZERO
        return min(lower, to_decimal(rate))
    return to_decimal(rate)


def tds_on_purchase(
    cumulative_before,
    this_invoice_taxable,
    threshold,
    rate,
    has_pan: bool,
    no_pan_rate,
    lower_pct=None,
) -> Withholding:
    """TDS s.194Q on a purchase bill.

    ``this_invoice_taxable`` is the value before GST: CBDT circular 13/2021
    says s.194Q applies on the amount excluding GST when the GST is shown
    separately on the invoice, which every tax invoice here does.
    """
    base = _portion_above_threshold(cumulative_before, this_invoice_taxable, threshold)
    applied = _effective_rate(rate, has_pan, no_pan_rate, lower_pct)
    amount = round_money(base * applied / 100) if base > 0 else ZERO
    return Withholding(section=TDS_SECTION, base=base, rate=applied, amount=amount)


def tcs_on_sale(
    cumulative_before,
    this_invoice_value,
    threshold,
    rate,
    has_pan: bool,
    no_pan_rate=TCS_206C1H_NO_PAN_RATE,
    lower_pct=None,
) -> Withholding:
    """TCS s.206C(1H) on a sale.

    ``this_invoice_value`` is the invoice value including GST (circular
    17/2020, para 4.6). The section is on receipts; the books collect on the
    invoice so the customer sees the charge and the receipt clears it.
    """
    base = _portion_above_threshold(cumulative_before, this_invoice_value, threshold)
    applied = _effective_rate(rate, has_pan, no_pan_rate, lower_pct)
    amount = round_money(base * applied / 100) if base > 0 else ZERO
    return Withholding(section=TCS_SECTION, base=base, rate=applied, amount=amount)
