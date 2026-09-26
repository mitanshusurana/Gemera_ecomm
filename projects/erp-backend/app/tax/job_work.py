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


# ─── What the returned pieces cost ───────────────────────────────────────────
#
# Stock came back from the karigar valued at the metal alone, so a finished
# bangle sat in the register at the price of its gold and the making charges
# vanished into expense. AS 2 puts conversion cost into inventory: the pieces
# should carry the metal that went into them (including the metal lost making
# them) plus what the karigar was paid to make them.

@dataclass(frozen=True)
class ReceiptCostLine:
    """One receipt line before costing.

    ``unit_issue_cost`` is what a unit of the material cost when it left on
    the challan (the Job_Work_Out row's amount / quantity, else the weighted
    average), so the metal comes back at the value it went out at.
    """

    key: object
    quantity_received: Decimal
    quantity_wastage: Decimal = ZERO
    unit_issue_cost: Decimal = ZERO


@dataclass(frozen=True)
class ReceiptLineCost:
    key: object
    metal_cost: Decimal          # (received + wastage) x issue cost
    making_charge_share: Decimal  # this line's slice of the karigar's bill
    total_cost: Decimal          # what the Job_Work_In row carries
    unit_cost: Decimal           # total_cost / quantity received, 4 dp


def roll_up_receipt_cost(lines, making_charges) -> list[ReceiptLineCost]:
    """Cost each received line: issued metal (received plus wastage) at issue
    cost, plus a share of the making charges.

    Wastage is loaded onto the pieces it was lost making: the gold that
    became polishing dust is part of what the bangle cost. A line that
    received nothing (pure wastage write-off) keeps its metal cost for the
    statement but takes no making charge, because there is nothing to carry
    it; if no line received anything, the making charges are left unallocated
    (returned as zero shares) for the caller to expense.

    The making charges are split in proportion to metal cost, or to quantity
    received when nothing was costed, and rounded to the paisa with the
    remainder on the last receiving line so the shares re-sum exactly.
    """
    items = [
        ReceiptCostLine(
            key=ln.key,
            quantity_received=to_decimal(ln.quantity_received),
            quantity_wastage=to_decimal(ln.quantity_wastage),
            unit_issue_cost=to_decimal(ln.unit_issue_cost),
        )
        for ln in lines
    ]
    charges = round_money(making_charges)

    metal = {
        it.key: round_money((it.quantity_received + it.quantity_wastage) * it.unit_issue_cost)
        for it in items
    }
    receiving = [it for it in items if it.quantity_received > 0]

    weights = {it.key: metal[it.key] for it in receiving}
    if sum(weights.values(), ZERO) <= 0:
        weights = {it.key: it.quantity_received for it in receiving}
    weight_total = sum(weights.values(), ZERO)

    shares: dict = {it.key: ZERO for it in items}
    if receiving and charges > 0 and weight_total > 0:
        allocated = ZERO
        for it in receiving[:-1]:
            share = round_money(charges * weights[it.key] / weight_total)
            shares[it.key] = share
            allocated += share
        shares[receiving[-1].key] = round_money(charges - allocated)

    out: list[ReceiptLineCost] = []
    for it in items:
        total = round_money(metal[it.key] + shares[it.key])
        unit = (
            (total / it.quantity_received).quantize(Decimal("0.0001"))
            if it.quantity_received > 0
            else ZERO
        )
        out.append(
            ReceiptLineCost(
                key=it.key,
                metal_cost=metal[it.key],
                making_charge_share=shares[it.key],
                total_cost=total,
                unit_cost=unit,
            )
        )
    return out


def unit_issue_cost(amount, quantity) -> Decimal:
    """Cost per unit of what went out on the challan; zero when unknown."""
    qty = to_decimal(quantity)
    if qty <= 0:
        return ZERO
    return (to_decimal(amount) / qty).quantize(Decimal("0.0001"))
