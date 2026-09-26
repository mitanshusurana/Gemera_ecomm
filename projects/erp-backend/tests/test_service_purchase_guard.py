"""A purchased service (the karigar's making-charge bill) is not stock.

job_work posts the karigar's bill through the purchase path against an
inactive 'Service' material (MAKING). The purchase path wrote a
Purchase_Receipt stock ledger row for every line, so each bill left a
phantom quantity of "making charges" in stock. The row is now skipped for a
service material and everything else (the line, the ITC, the journal leg to
the material's account) is kept.

These tests read the source: the guard must sit between resolving the
material and the stock ledger INSERT, and only that INSERT may be skipped.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

from app.api.v1.purchases import SERVICE_CATEGORY, is_service_material

ROOT = Path(__file__).resolve().parents[1]
PURCHASES = ROOT / "app" / "api" / "v1" / "purchases.py"
JOB_WORK = ROOT / "app" / "api" / "v1" / "job_work.py"


def _src() -> str:
    return io.open(PURCHASES, encoding="utf-8").read()


def test_service_category_is_the_one_job_work_creates():
    job_work = io.open(JOB_WORK, encoding="utf-8").read()
    assert f"'{SERVICE_CATEGORY}'" in job_work, "job_work's MAKING material must use the guarded category"
    assert is_service_material("Service")
    assert is_service_material(" service ")
    assert not is_service_material("Gold")
    assert not is_service_material(None)


def test_resolve_material_reports_whether_the_line_is_a_service():
    src = _src()
    assert re.search(r'return row\["id"\], uom_id, stock_acc, is_service_material\(row\["category"\]\)', src)
    assert re.search(
        r"mat_id, line_uom_id, stock_acc, is_service = await _resolve_material\(", src
    ), "the create path must unpack the service flag"


def test_the_stock_receipt_is_skipped_for_a_service_and_nothing_else_is():
    src = _src()
    start = src.index("async def _post_purchase(")
    body = src[start:]
    guard = re.search(r"if is_service:\s*\n\s*continue\s*\n", body)
    assert guard, "no `if is_service: continue` guard in the line loop"
    receipt = body.index("'Purchase_Receipt'")
    assert guard.end() < receipt, "the guard must come before the Purchase_Receipt INSERT"
    # Nothing that must be written for every line sits between the guard and
    # the stock INSERT: the invoice line and the journal leg are recorded
    # before it (the leg list) or after the loop (the journal).
    between = body[guard.end():receipt]
    assert "INSERT INTO caratloop.purchase_invoice_lines" not in between
    assert "stock_legs.append" not in between
    line_insert = body.index("INSERT INTO caratloop.purchase_invoice_lines")
    assert line_insert < guard.start(), "the purchase line is written before the guard"
    legs = body.index("stock_legs.append((stock_acc, line_total))")
    assert legs < guard.start(), "the journal leg is collected before the guard"


def test_service_only_invoice_files_under_its_own_sac():
    from decimal import Decimal

    from app.api.v1.sales import service_sac_for_register
    from app.tax.job_work import JOB_WORK_SAC

    repair = [{"taxable_mat": Decimal("0"), "taxable_mak": Decimal("1000"), "mat_hsn": "998722"}]
    assert service_sac_for_register(repair) == "998722"
    jewellery = [{"taxable_mat": Decimal("100000"), "taxable_mak": Decimal("10000"), "mat_hsn": "7113"}]
    assert service_sac_for_register(jewellery) == JOB_WORK_SAC
    mixed = repair + jewellery
    assert service_sac_for_register(mixed) == JOB_WORK_SAC
    assert service_sac_for_register([]) == JOB_WORK_SAC
