"""Job work rules under CGST s.143.

The deadline maths has real consequence: miss it and the original dispatch is
retrospectively a supply made on the day it left, so tax and interest run from
then, not from the day the deadline passed.
"""

from datetime import date
from decimal import Decimal

import pytest

from app.tax.job_work import (
    CAPITAL_GOODS_RETURN_YEARS,
    GOODS_TYPE_CAPITAL,
    GOODS_TYPE_INPUT,
    INPUT_RETURN_YEARS,
    days_remaining,
    is_overdue,
    job_work_tax,
    net_of_wastage,
    return_due_date,
    wastage_pct,
)


def test_inputs_must_return_within_one_year():
    assert INPUT_RETURN_YEARS == 1
    assert return_due_date(date(2026, 3, 15), GOODS_TYPE_INPUT) == date(2027, 3, 15)


def test_capital_goods_have_three_years():
    assert CAPITAL_GOODS_RETURN_YEARS == 3
    assert return_due_date(date(2026, 3, 15), GOODS_TYPE_CAPITAL) == date(2029, 3, 15)


def test_unknown_goods_type_uses_the_shorter_window():
    """Defaulting to three years would understate the liability."""
    assert return_due_date(date(2026, 3, 15), "Something") == date(2027, 3, 15)


def test_leap_day_dispatch_does_not_crash_or_slip():
    """29 Feb 2028 + 1 year has no 29 Feb; it must land in February, not March."""
    due = return_due_date(date(2028, 2, 29), GOODS_TYPE_INPUT)
    assert due == date(2029, 2, 28)


def test_the_due_date_itself_is_still_in_time():
    due = date(2027, 3, 15)
    assert is_overdue(due, as_of=date(2027, 3, 15)) is False
    assert is_overdue(due, as_of=date(2027, 3, 16)) is True


def test_days_remaining_goes_negative_once_overdue():
    due = date(2027, 3, 15)
    assert days_remaining(due, as_of=date(2027, 3, 10)) == 5
    assert days_remaining(due, as_of=date(2027, 3, 20)) == -5


# ─── Tax on making charges ───────────────────────────────────────────────────

def test_intra_state_job_work_splits_cgst_sgst():
    t = job_work_tax(Decimal("10000"), "08", "08")

    assert t.igst == Decimal("0.00")
    assert t.cgst + t.sgst == Decimal("500.00")  # 5% of 10,000
    assert t.total == Decimal("500.00")


def test_inter_state_job_work_is_igst():
    t = job_work_tax(Decimal("10000"), "08", "27")

    assert t.cgst == Decimal("0.00")
    assert t.igst == Decimal("500.00")


def test_unpadded_state_code_is_not_inter_state():
    """'8' and '08' are Rajasthan; a raw compare charged IGST."""
    t = job_work_tax(Decimal("10000"), "08", "8")

    assert t.igst == Decimal("0.00")
    assert t.cgst + t.sgst == Decimal("500.00")


def test_unregistered_karigar_charges_no_tax():
    """They cannot collect GST. Whether reverse charge applies to the
    principal is a separate determination, deliberately not assumed here."""
    t = job_work_tax(Decimal("10000"), "08", "08", job_worker_registered=False)

    assert t.total == Decimal("0.00")
    assert t.taxable_value == Decimal("10000.00")


def test_halves_always_re_sum_to_the_total():
    for charges in ("333.33", "1.01", "9999.99", "7777.77"):
        t = job_work_tax(Decimal(charges), "08", "08")
        assert t.cgst + t.sgst == t.total, charges


def test_zero_charges_yield_zero_tax():
    assert job_work_tax(Decimal("0"), "08", "08").total == Decimal("0.00")


def test_amounts_are_decimal():
    t = job_work_tax(Decimal("10000"), "08", "08")
    for v in (t.cgst, t.sgst, t.igst, t.total, t.taxable_value):
        assert isinstance(v, Decimal)


# ─── Reconciling what came back ──────────────────────────────────────────────

def test_fully_returned_leaves_nothing_outstanding():
    assert net_of_wastage(Decimal("100"), Decimal("100"), Decimal("0")) == Decimal("0")


def test_wastage_counts_as_accounted_for():
    """Metal lost in melting is normal; treating it as outstanding would leave
    every challan permanently open."""
    assert net_of_wastage(Decimal("100"), Decimal("98"), Decimal("2")) == Decimal("0")


def test_partial_return_leaves_a_balance():
    assert net_of_wastage(Decimal("100"), Decimal("60"), Decimal("1")) == Decimal("39")


def test_over_return_is_negative_and_therefore_visible():
    """More back than went out is a data error, not something to clamp to zero."""
    assert net_of_wastage(Decimal("100"), Decimal("105"), Decimal("0")) == Decimal("-5")


def test_wastage_percentage():
    assert wastage_pct(Decimal("100"), Decimal("2")) == Decimal("2.00")
    assert wastage_pct(Decimal("0"), Decimal("0")) == Decimal("0")


@pytest.mark.parametrize("goods_type", [GOODS_TYPE_INPUT, GOODS_TYPE_CAPITAL])
def test_due_date_is_always_after_dispatch(goods_type):
    """The DB CHECK asserts the same thing; they must not disagree."""
    d = date(2026, 6, 1)
    assert return_due_date(d, goods_type) > d


# ─── Migration 0009 and the Karigar vocabulary ───────────────────────────────

import io
import re
from pathlib import Path

from pglast import parse_sql

ROOT = Path(__file__).resolve().parents[1]
SQL_0009 = ROOT / "migrations" / "sql" / "0009_karigar_job_work_costing.sql"
VERSION_0009 = ROOT / "migrations" / "versions" / "0009_karigar_job_work_costing.py"


def test_migration_0009_sql_parses():
    """libpg_query is PostgreSQL's own parser: this rejects what the server would."""
    statements = parse_sql(io.open(SQL_0009, encoding="utf-8").read())
    assert len(statements) >= 15


def test_migration_0009_revises_0008():
    src = io.open(VERSION_0009, encoding="utf-8").read()
    assert re.search(r"^revision\s*=\s*['\"]0009['\"]", src, re.M)
    assert re.search(r"^down_revision\s*=\s*['\"]0008['\"]", src, re.M)
    assert "0009_karigar_job_work_costing.sql" in src


def test_migration_0009_adds_the_agreed_columns():
    sql = io.open(SQL_0009, encoding="utf-8").read()
    assert "'Karigar'::character varying" in sql
    for table, col in (
        ("parties", "karigar_skills"),
        ("job_work_receipts", "making_charge_bill_id"),
        ("job_work_receipt_lines", "unit_cost"),
        ("job_work_receipt_lines", "making_charge_share"),
        ("bom_headers", "output_material_id"),
        ("bom_headers", "output_quantity"),
    ):
        assert re.search(
            rf"ALTER TABLE caratloop\.{table}\s+ADD COLUMN IF NOT EXISTS {col}\b", sql
        ), f"{table}.{col} missing"


def test_party_type_vocabulary_covers_karigar():
    """Every alias maps onto a value the (latest) CHECK permits, and the
    artisan words map onto Karigar rather than being folded into Vendor."""
    from test_check_constraint_vocabularies import permitted
    from app.api.v1.parties import (
        DEBTOR_TYPES, PARTY_CODE_PREFIX, PARTY_TYPE_ALIASES, normalise_party_type,
        normalise_party_types,
    )

    allowed = permitted("chk_party_type")
    assert "Karigar" in allowed
    assert set(PARTY_TYPE_ALIASES.values()) <= allowed
    assert normalise_party_type("karigar") == "Karigar"
    assert normalise_party_type("Artisan") == "Karigar"
    assert normalise_party_type("Supplier") == "Vendor"
    assert "Karigar" not in DEBTOR_TYPES, "a karigar is paid, so files under Sundry Creditors"
    assert PARTY_CODE_PREFIX["Karigar"] == "KAR"
    assert set(PARTY_CODE_PREFIX) == allowed
    assert normalise_party_types("Karigar,Supplier, karigar") == ["Karigar", "Vendor"]


def test_unknown_party_type_is_a_422_not_a_500():
    from fastapi import HTTPException
    from app.api.v1.parties import normalise_party_type

    with pytest.raises(HTTPException) as exc:
        normalise_party_type("Goldsmith")
    assert exc.value.status_code == 422


# ─── Cost of what comes back ─────────────────────────────────────────────────

from app.tax.job_work import ReceiptCostLine, roll_up_receipt_cost, unit_issue_cost


def _line(key, received, wastage="0", unit="0"):
    return ReceiptCostLine(
        key=key, quantity_received=Decimal(received), quantity_wastage=Decimal(wastage),
        unit_issue_cost=Decimal(unit),
    )


def test_returned_pieces_carry_metal_plus_making():
    """100 g out at 7,000/g, 98 g back + 2 g lost, karigar bills 15,000:
    the 98 g carry 700,000 (all the metal, wastage included) + 15,000."""
    [c] = roll_up_receipt_cost([_line(1, "98", "2", "7000")], Decimal("15000"))

    assert c.metal_cost == Decimal("700000.00")
    assert c.making_charge_share == Decimal("15000.00")
    assert c.total_cost == Decimal("715000.00")
    assert c.unit_cost == Decimal("7295.9184")  # 715,000 / 98


def test_making_charges_split_by_metal_cost_and_re_sum_exactly():
    lines = [
        _line("a", "10", "0", "7000"),   # 70,000
        _line("b", "5", "0", "7000"),    # 35,000
        _line("c", "3", "0", "1000"),    #  3,000  -> awkward thirds
    ]
    costs = roll_up_receipt_cost(lines, Decimal("1000.01"))
    shares = {c.key: c.making_charge_share for c in costs}

    assert sum(shares.values()) == Decimal("1000.01")
    # 70,000 / 108,000 of 1,000.01 = 648.15..., and the last line takes the
    # rounding remainder rather than letting the shares drift from the bill.
    assert shares["a"] == Decimal("648.15")
    assert shares["b"] == Decimal("324.08")
    assert shares["c"] == Decimal("27.78")


def test_pure_wastage_line_takes_no_making_charge():
    """Nothing came back on it, so there is nothing to carry the charge."""
    costs = {c.key: c for c in roll_up_receipt_cost(
        [_line("back", "50", "0", "100"), _line("lost", "0", "1", "100")], Decimal("500"),
    )}

    assert costs["lost"].making_charge_share == Decimal("0.00")
    assert costs["lost"].metal_cost == Decimal("100.00")
    assert costs["lost"].unit_cost == Decimal("0")
    assert costs["back"].making_charge_share == Decimal("500.00")


def test_nothing_received_leaves_charges_unallocated():
    costs = roll_up_receipt_cost([_line(1, "0", "3", "100")], Decimal("900"))
    assert costs[0].making_charge_share == Decimal("0.00")
    assert costs[0].total_cost == Decimal("300.00")


def test_uncosted_metal_splits_charges_by_quantity():
    """Legacy challans carry no cost; fall back to quantity so the charge is
    still spread rather than dumped on one line."""
    costs = {c.key: c for c in roll_up_receipt_cost(
        [_line("x", "30", "0", "0"), _line("y", "10", "0", "0")], Decimal("400"),
    )}
    assert costs["x"].making_charge_share == Decimal("300.00")
    assert costs["y"].making_charge_share == Decimal("100.00")


def test_zero_making_charges_is_metal_only():
    [c] = roll_up_receipt_cost([_line(1, "10", "0", "7000")], Decimal("0"))
    assert c.total_cost == Decimal("70000.00")
    assert c.unit_cost == Decimal("7000.0000")


def test_unit_issue_cost_guards_zero_quantity():
    assert unit_issue_cost(Decimal("700000"), Decimal("100")) == Decimal("7000.0000")
    assert unit_issue_cost(Decimal("700000"), Decimal("0")) == Decimal("0")


def test_cost_amounts_are_decimal():
    [c] = roll_up_receipt_cost([_line(1, "98", "2", "7000")], Decimal("15000"))
    for v in (c.metal_cost, c.making_charge_share, c.total_cost, c.unit_cost):
        assert isinstance(v, Decimal)
