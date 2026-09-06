"""Job work rules under CGST s.143.

Sending goods to a karigar is not a supply — until it is. If the goods do not
come back within the statutory window, the original dispatch is *retrospectively*
treated as a supply made on the day it left, which means tax plus interest from
that date rather than from the day the deadline passed.

That retrospective character is the whole reason this needs tracking rather
than a reminder: by the time anyone notices, the liability has already been
accruing for a year.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from app.core.money import ZERO, round_money, split_half, to_decimal

# s.143(1): inputs must return within one year, capital goods within three.
INPUT_RETURN_YEARS = 1
CAPITAL_GOODS_RETURN_YEARS = 3

GOODS_TYPE_INPUT = "Input"
GOODS_TYPE_CAPITAL = "CapitalGoods"

# Making charges / job work on jewellery.
#
# SAC 9988 is "manufacturing services on physical inputs owned by others". The
# six-digit code matters: this was 998821, which is TEXTILE manufacturing
# services. Every making-charges line, every job work challan and the GSTR-1
# Table 12 HSN summary reported jewellery work under a textile code, so the
# return did not describe the business that filed it.
#
# 998892 is "Jewellery manufacturing services", within group 99889 (other
# manufacturing services). Imitation jewellery is 998893 and would be wrong
# here for hallmarked gold.
JOB_WORK_SAC = "998892"
JOB_WORK_GST_RATE = Decimal("5")


def return_due_date(challan_date: date, goods_type: str = GOODS_TYPE_INPUT) -> date:
    """The date by which the goods must be back.

    Uses calendar years rather than 365 days so a leap year does not silently
    shorten the window by a day.
    """
    years = (
        CAPITAL_GOODS_RETURN_YEARS
        if goods_type == GOODS_TYPE_CAPITAL
        else INPUT_RETURN_YEARS
    )
    try:
        return challan_date.replace(year=challan_date.year + years)
    except ValueError:
        # 29 February with no 29 February in the target year.
        return challan_date.replace(year=challan_date.year + years, day=28)


def is_overdue(due: date, as_of: date | None = None) -> bool:
    """True once the deadline has passed. The due date itself is still in time."""
    return (as_of or date.today()) > due


def days_remaining(due: date, as_of: date | None = None) -> int:
    """Negative once overdue."""
    return (due - (as_of or date.today())).days


@dataclass(frozen=True)
class JobWorkTax:
    taxable_value: Decimal
    rate: Decimal
    cgst: Decimal
    sgst: Decimal
    igst: Decimal

    @property
    def total(self) -> Decimal:
        return self.cgst + self.sgst + self.igst


def _normalise_state(code: str | None) -> str:
    cleaned = (code or "").strip()
    return cleaned.zfill(2) if cleaned.isdigit() else cleaned.upper()


def job_work_tax(
    making_charges,
    seller_state_code: str = "08",
    job_worker_state_code: str = "08",
    rate=JOB_WORK_GST_RATE,
    job_worker_registered: bool = True,
) -> JobWorkTax:
    """GST on the karigar's making charges.

    The karigar supplies a service to the principal, so the tax follows their
    registration, not the principal's. An unregistered karigar charges nothing;
    whether reverse charge applies to the principal is a separate determination
    and is not assumed here.

    State codes are zero-padded before comparison: '8' and '08' are the same
    state, and a raw string compare would call that an inter-state supply and
    charge IGST.
    """
    value = round_money(making_charges)
    rate_d = to_decimal(rate)

    if not job_worker_registered or value <= 0:
        return JobWorkTax(taxable_value=value, rate=rate_d, cgst=ZERO, sgst=ZERO, igst=ZERO)

    total_tax = round_money(value * rate_d / 100)

    if _normalise_state(seller_state_code) != _normalise_state(job_worker_state_code):
        return JobWorkTax(value, rate_d, ZERO, ZERO, total_tax)

    cgst, sgst = split_half(total_tax)
    return JobWorkTax(value, rate_d, cgst, sgst, ZERO)


def net_of_wastage(sent, received, wastage) -> Decimal:
    """Quantity still outstanding with the job worker.

    Wastage counts as accounted for: metal lost in melting or polishing is
    normal in this trade, and treating it as still-outstanding would make every
    challan look permanently open.
    """
    return to_decimal(sent) - to_decimal(received) - to_decimal(wastage)


def wastage_pct(sent, wastage) -> Decimal:
    sent_d = to_decimal(sent)
    if sent_d <= 0:
        return ZERO
    return round_money(to_decimal(wastage) / sent_d * 100)
