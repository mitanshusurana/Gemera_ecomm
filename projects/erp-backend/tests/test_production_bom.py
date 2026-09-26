"""Bill of materials: scaling a recipe to an order's output quantity.

The BOM tables existed since the baseline and were never read; an order now
takes its consumption plan from one, scaled to the quantity ordered.
"""

from decimal import Decimal

from app.api.v1.production import scale_bom_lines


def _bom_line(qty, loss="0", **extra):
    return {"material_id": "m", "quantity_per_unit": Decimal(qty), "standard_loss_pct": Decimal(loss), **extra}


def test_lines_scale_linearly_with_output_quantity():
    [ln] = scale_bom_lines([_bom_line("12.5")], Decimal("1"), Decimal("4"))
    assert ln["net_required"] == "50.0000"
    assert ln["qty_issued"] == "50.0000"
    assert ln["expected_loss"] == "0.0000"


def test_batch_boms_scale_from_their_own_output_quantity():
    """A BOM written for 10 pieces ordered as 5 halves its lines."""
    [ln] = scale_bom_lines([_bom_line("100")], Decimal("10"), Decimal("5"))
    assert ln["net_required"] == "50.0000"


def test_standard_loss_grosses_up_the_issue():
    """2% melting loss on 98 g needed means 100 g must go to the bench."""
    [ln] = scale_bom_lines([_bom_line("98", "2")], Decimal("1"), Decimal("1"))
    assert ln["qty_issued"] == "100.0000"
    assert ln["expected_loss"] == "2.0000"
    assert ln["loss_pct"] == "2"


def test_other_line_fields_are_carried_through():
    [ln] = scale_bom_lines([_bom_line("1", material_code="GOLD-22K", notes="melt")], 1, 1)
    assert ln["material_code"] == "GOLD-22K"
    assert ln["notes"] == "melt"
    assert ln["quantity_per_unit"] == "1"
