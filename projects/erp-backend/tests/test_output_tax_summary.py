"""The output tax register's summary must net credit notes off, not add them.

Cancelling a sales invoice marks its register row is_credit_note rather than
deleting it, so the evidence survives a filed period. The summary then summed
every row indiscriminately, so a cancelled invoice still counted as tax
payable: the GST dashboard showed a liability the business did not owe, and
paying against it would have been real money out the door.

Every other endpoint on the router already filters NOT is_credit_note; this one
is the register, so it must still LIST them -- it is the arithmetic that was
wrong, not the disclosure.
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.api.v1.gst import get_output_tax_register


class _StubResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return self

    def all(self):
        return self._rows


class _StubSession:
    def __init__(self, rows):
        self._rows = rows

    async def execute(self, *_args, **_kwargs):
        return _StubResult(self._rows)


def row(total_tax, *, credit_note=False, material=Decimal("0"), making=Decimal("0")):
    return {
        "invoice_no": "CL/2026-27/00001",
        "invoice_date": None,
        "supply_type": "B2B",
        "party_gstin": "27AAACM5678F1ZQ",
        "place_of_supply": "27",
        "is_inter_state": True,
        "party_name": "Mumbai Retail Gems",
        "taxable_material_value": material,
        "material_gst_rate": Decimal("3"),
        "taxable_making_value": making,
        "making_gst_rate": Decimal("5"),
        "igst_amount": total_tax,
        "cgst_amount": Decimal("0"),
        "sgst_amount": Decimal("0"),
        "total_tax": total_tax,
        "is_credit_note": credit_note,
    }


USER = {"company_id": "c1", "id": "u1"}


@pytest.mark.asyncio
async def test_a_cancelled_invoice_is_not_a_liability():
    """One invoice, then its credit note: the net liability is nil."""
    rows = [
        row(Decimal("9678.00"), material=Decimal("297600"), making=Decimal("15000")),
        row(Decimal("9678.00"), credit_note=True,
            material=Decimal("297600"), making=Decimal("15000")),
    ]
    out = await get_output_tax_register(
        period="2026-09", db=_StubSession(rows), current_user=USER
    )
    s = out["summary"]
    assert s["total_output_tax"] == Decimal("0")
    assert s["total_taxable_material"] == Decimal("0")
    assert s["total_taxable_making"] == Decimal("0")


@pytest.mark.asyncio
async def test_the_netting_is_disclosed_not_hidden():
    """A nil net must not be indistinguishable from no trade at all."""
    rows = [
        row(Decimal("9678.00")),
        row(Decimal("9678.00"), credit_note=True),
    ]
    out = await get_output_tax_register(
        period="2026-09", db=_StubSession(rows), current_user=USER
    )
    s = out["summary"]
    assert s["gross_output_tax"] == Decimal("9678.00")
    assert s["credit_note_tax"] == Decimal("9678.00")
    assert s["invoice_count"] == 1
    assert s["credit_note_count"] == 1


@pytest.mark.asyncio
async def test_the_register_still_lists_the_credit_note():
    """GSTR-1 Table 9B reports credit notes; the register must show them."""
    rows = [row(Decimal("100")), row(Decimal("40"), credit_note=True)]
    out = await get_output_tax_register(
        period="2026-09", db=_StubSession(rows), current_user=USER
    )
    assert len(out["records"]) == 2
    assert any(r["is_credit_note"] for r in out["records"])


@pytest.mark.asyncio
async def test_a_plain_period_is_summed_as_before():
    rows = [row(Decimal("100")), row(Decimal("250"))]
    out = await get_output_tax_register(
        period="2026-09", db=_StubSession(rows), current_user=USER
    )
    assert out["summary"]["total_output_tax"] == Decimal("350")
    assert out["summary"]["credit_note_tax"] == 0
