"""TDS s.194Q and TCS s.206C(1H): the threshold arithmetic and the register.

The threshold is per party per financial year and the deduction is only on
the excess, so the bill that crosses it is split. Each case here is a number
an accountant would check by hand.
"""

from __future__ import annotations

import io
import re
from decimal import Decimal
from pathlib import Path

import pytest

from app.tax.tds_tcs import (
    REGISTER_KINDS,
    TCS_206C1H_NO_PAN_RATE,
    TCS_SECTION,
    TDS_SECTION,
    has_valid_pan,
    tcs_on_sale,
    tds_on_purchase,
)

ROOT = Path(__file__).resolve().parents[1]

THRESHOLD = Decimal("5000000")
RATE = Decimal("0.10")
NO_PAN = Decimal("5.00")


def tds(before, this, *, has_pan=True, lower=None):
    return tds_on_purchase(before, this, THRESHOLD, RATE, has_pan, NO_PAN, lower)


# ─── Threshold ───────────────────────────────────────────────────────────────

def test_below_threshold_nothing_is_deducted():
    w = tds("1000000", "2000000")
    assert w.amount == Decimal("0.00")
    assert w.base == Decimal("0.00")
    assert not w.applies


def test_exactly_at_threshold_nothing_is_deducted():
    """Rs 50 lakh exactly is not 'exceeding' Rs 50 lakh."""
    w = tds("4000000", "1000000")
    assert w.base == Decimal("0.00")
    assert w.amount == Decimal("0.00")


def test_the_crossing_bill_is_split_at_the_threshold():
    """Rs 48 lakh so far, a Rs 5 lakh bill: TDS on the Rs 3 lakh above the line."""
    w = tds("4800000", "500000")
    assert w.base == Decimal("300000.00")
    assert w.rate == RATE
    assert w.amount == Decimal("300.00")
    assert w.section == TDS_SECTION


def test_after_the_threshold_the_whole_bill_is_deducted_on():
    w = tds("6000000", "250000")
    assert w.base == Decimal("250000.00")
    assert w.amount == Decimal("250.00")


def test_one_rupee_over_the_threshold():
    w = tds("5000000", "1")
    assert w.base == Decimal("1.00")
    # 0.1% of one rupee rounds to zero paise: base is recorded, nothing to deduct.
    assert w.amount == Decimal("0.00")
    assert not w.applies


def test_zero_or_negative_bill_deducts_nothing():
    assert tds("9000000", "0").amount == Decimal("0.00")
    assert tds("9000000", "-500").amount == Decimal("0.00")


# ─── PAN and certificates ────────────────────────────────────────────────────

def test_no_pan_uses_the_section_206aa_rate():
    w = tds("6000000", "100000", has_pan=False)
    assert w.rate == NO_PAN
    assert w.amount == Decimal("5000.00")


def test_lower_deduction_certificate_replaces_the_rate():
    w = tds("6000000", "100000", lower="0.05")
    assert w.rate == Decimal("0.05")
    assert w.amount == Decimal("50.00")


def test_nil_deduction_certificate():
    w = tds("6000000", "100000", lower="0")
    assert w.rate == Decimal("0")
    assert w.amount == Decimal("0.00")
    assert not w.applies


def test_a_certificate_cannot_raise_the_rate():
    w = tds("6000000", "100000", lower="2")
    assert w.rate == RATE


def test_without_pan_the_certificate_is_irrelevant():
    """s.206AA overrides: no PAN, higher rate, whatever paper is held."""
    w = tds("6000000", "100000", has_pan=False, lower="0")
    assert w.rate == NO_PAN


def test_pan_shape():
    assert has_valid_pan("ABCDE1234F")
    assert has_valid_pan(" abcde1234f ")
    for bad in (None, "", "NA", "-", "PANNOTAVBL", "ABCDE12345", "ABCDE1234FG"):
        assert not has_valid_pan(bad), bad


# ─── TCS mirror ──────────────────────────────────────────────────────────────

def test_tcs_is_on_the_invoice_value_including_gst_above_the_threshold():
    w = tcs_on_sale("4950000", "103000", THRESHOLD, RATE, has_pan=True)
    assert w.section == TCS_SECTION
    assert w.base == Decimal("53000.00")
    assert w.amount == Decimal("53.00")


def test_tcs_without_pan_is_one_percent():
    w = tcs_on_sale("6000000", "100000", THRESHOLD, RATE, has_pan=False)
    assert w.rate == TCS_206C1H_NO_PAN_RATE == Decimal("1.00")
    assert w.amount == Decimal("1000.00")


def test_tcs_below_threshold_collects_nothing():
    assert not tcs_on_sale("0", "4999999.99", THRESHOLD, RATE, has_pan=True).applies


# ─── Register vocabulary and chart of accounts ───────────────────────────────

def _all_sql() -> str:
    return "\n".join(
        io.open(f, encoding="utf-8").read()
        for f in sorted((ROOT / "migrations" / "sql").glob("*.sql"))
    )


def _permitted(constraint: str) -> set[str]:
    m = re.search(
        rf"CONSTRAINT\s+{re.escape(constraint)}\s+CHECK\s*\((.*?)\)\s*\)\s*\)", _all_sql(), re.I | re.S
    )
    assert m, f"{constraint} is not in the migrations"
    return set(re.findall(r"'([A-Za-z_()0-9]+)'::character varying", m.group(1)))


def test_register_kind_vocabulary_matches_the_check():
    assert _permitted("chk_tds_tcs_kind") == REGISTER_KINDS


def test_register_document_types_are_the_two_the_writers_use():
    assert _permitted("chk_tds_tcs_document_type") == {"PurchaseInvoice", "SalesInvoice"}
    sales = io.open(ROOT / "app" / "api" / "v1" / "sales.py", encoding="utf-8").read()
    purchases = io.open(ROOT / "app" / "api" / "v1" / "purchases.py", encoding="utf-8").read()
    assert "'SalesInvoice', :doc_id" in sales
    assert "'PurchaseInvoice', CAST(:doc_id AS UUID)" in purchases


@pytest.mark.parametrize("code", ["TDS-194Q", "TCS-206C"])
def test_payable_accounts_are_seeded_for_existing_and_new_companies(code):
    sql = io.open(ROOT / "migrations" / "sql" / "0007_einvoice_tds_tcs.sql", encoding="utf-8").read()
    # Once in the backfill for existing companies, once inside the
    # re-created provisioning function for new ones.
    assert sql.count(f"'{code}'") == 2, f"{code} must be seeded twice (backfill + fn_provision_company_accounts)"
    fn_start = sql.index("CREATE OR REPLACE FUNCTION caratloop.fn_provision_company_accounts()")
    assert f"'{code}'" in sql[fn_start:]


def test_provisioning_function_keeps_the_legacy_chart_and_adds_the_group():
    """Re-creating the function must not lose a single legacy account."""
    old = io.open(ROOT / "migrations" / "sql" / "0003_provision_company.sql", encoding="utf-8").read()
    new = io.open(ROOT / "migrations" / "sql" / "0007_einvoice_tds_tcs.sql", encoding="utf-8").read()
    legacy_codes = set(re.findall(r"\('([A-Z]{3,4}-\d{3})',", old))
    assert len(legacy_codes) >= 50
    new_fn = new[new.index("CREATE OR REPLACE FUNCTION caratloop.fn_provision_company_accounts()"):]
    missing = sorted(c for c in legacy_codes if f"('{c}'," not in new_fn)
    assert not missing, f"legacy accounts dropped from the provisioning function: {missing}"
    # Group in both VALUES lists (top-level pass and the parented pass).
    assert new_fn.count("('DUTIES_TAXES', 'Duties & Taxes', 'Liabilities', 'LIAB')") == 2
    assert "'Provision'" in new_fn


def test_the_journal_legs_name_the_seeded_codes():
    sales = io.open(ROOT / "app" / "api" / "v1" / "sales.py", encoding="utf-8").read()
    purchases = io.open(ROOT / "app" / "api" / "v1" / "purchases.py", encoding="utf-8").read()
    assert '"TCS-206C"' in sales
    assert "a.code = 'TDS-194Q'" in purchases
    # The supplier is credited net of the TDS, in both the create and the amend path.
    assert purchases.count('"cr": grand_total - tds_amount') == 2
