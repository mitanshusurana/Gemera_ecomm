"""Purchase invoice tax computation.

This logic previously existed twice, inline in ``create_purchase_invoice`` and
``update_purchase_invoice``, in float arithmetic. The copies drifted: the update
path never computed reverse-charge totals at all (raising NameError on any RCM
edit) and computed a different grand total for the same invoice, so editing one
silently changed its value.

One pure Decimal function, unit-tested, replaces both.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Iterable, Sequence

from app.core.money import ZERO, round_money, split_half, to_decimal

# Making charges / job work: SAC 9988.
DEFAULT_MAKING_GST_RATE = Decimal("5")
# Old gold from an unregistered supplier: Notification 13/2017-CT(Rate).
DEFAULT_RCM_RATE = Decimal("3")


@dataclass(frozen=True)
class PurchaseLineInput:
    """One line, with its GST rate already resolved from the item master."""

    quantity: Decimal = ZERO
    net_weight: Decimal = ZERO
    rate: Decimal = ZERO
    making_charges: Decimal = ZERO
    gst_rate: Decimal = ZERO

    @property
    def material_value(self) -> Decimal:
        """Weight-based where a net weight is given, else quantity-based."""
        if self.net_weight and self.net_weight > 0:
            return round_money(self.net_weight * self.rate)
        return round_money(self.quantity * self.rate)


@dataclass(frozen=True)
class PurchaseTotals:
    material_subtotal: Decimal
    making_subtotal: Decimal
    total_cgst: Decimal
    total_sgst: Decimal
    total_igst: Decimal
    total_gst: Decimal
    rcm_cgst: Decimal
    rcm_sgst: Decimal
    grand_total: Decimal
    rcm_applicable: bool
    line_values: Sequence[Decimal] = field(default_factory=tuple)

    @property
    def total_rcm(self) -> Decimal:
        return self.rcm_cgst + self.rcm_sgst


def _coerce(lines: Iterable) -> list[PurchaseLineInput]:
    out = []
    for ln in lines:
        if isinstance(ln, PurchaseLineInput):
            out.append(ln)
            continue
        out.append(
            PurchaseLineInput(
                quantity=to_decimal(getattr(ln, "quantity", 0)),
                net_weight=to_decimal(getattr(ln, "net_weight", 0)),
                rate=to_decimal(getattr(ln, "rate", 0)),
                making_charges=to_decimal(getattr(ln, "making_charges", 0)),
                gst_rate=to_decimal(getattr(ln, "gst_rate", 0)),
            )
        )
    return out


def compute_purchase_totals(
    lines: Iterable,
    *,
    is_unregistered: bool,
    is_rcm: bool,
    is_inter_state: bool,
    making_gst_rate: Decimal = DEFAULT_MAKING_GST_RATE,
    rcm_rate: Decimal = DEFAULT_RCM_RATE,
) -> PurchaseTotals:
    """Compute subtotals, GST split, reverse charge and the payable.

    Reverse charge under CGST s.9(4) applies to supplies from UNREGISTERED
    suppliers. Honouring an ``is_rcm`` flag for a registered supplier removed
    the tax from the payable while forward-charge ITC debits were still posted,
    leaving the journal entry out of balance by exactly the tax.
    """
    items = _coerce(lines)
    making_rate = to_decimal(making_gst_rate)

    material_subtotal = ZERO
    making_subtotal = ZERO
    total_cgst = total_sgst = total_igst = ZERO
    rcm_cgst = rcm_sgst = ZERO
    line_values: list[Decimal] = []

    rcm_applicable = bool(is_unregistered and is_rcm)

    for item in items:
        mat_val = item.material_value
        mak_val = round_money(item.making_charges)

        material_subtotal += mat_val
        making_subtotal += mak_val
        line_values.append(mat_val + mak_val)

        if is_unregistered:
            # No forward-charge GST on an unregistered supplier's bill.
            if rcm_applicable:
                rate = item.gst_rate if item.gst_rate > 0 else to_decimal(rcm_rate)
                line_tax = round_money(mat_val * rate / 100) + round_money(
                    mak_val * making_rate / 100
                )
                # Reverse charge is a domestic self-liability; the CGST/SGST
                # split is used regardless of the place of supply here, which
                # matches how the liability register is written.
                half_c, half_s = split_half(line_tax)
                rcm_cgst += half_c
                rcm_sgst += half_s
            continue

        line_tax = round_money(mat_val * item.gst_rate / 100) + round_money(
            mak_val * making_rate / 100
        )

        if is_inter_state:
            total_igst += line_tax
        else:
            half_c, half_s = split_half(line_tax)
            total_cgst += half_c
            total_sgst += half_s

    total_gst = total_cgst + total_sgst + total_igst
    payable_tax = ZERO if rcm_applicable else total_gst
    grand_total = material_subtotal + making_subtotal + payable_tax

    return PurchaseTotals(
        material_subtotal=round_money(material_subtotal),
        making_subtotal=round_money(making_subtotal),
        total_cgst=round_money(total_cgst),
        total_sgst=round_money(total_sgst),
        total_igst=round_money(total_igst),
        total_gst=round_money(total_gst),
        rcm_cgst=round_money(rcm_cgst),
        rcm_sgst=round_money(rcm_sgst),
        grand_total=round_money(grand_total),
        rcm_applicable=rcm_applicable,
        line_values=tuple(line_values),
    )
