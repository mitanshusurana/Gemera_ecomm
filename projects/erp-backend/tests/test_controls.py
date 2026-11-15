"""Lock date, budgets, bank rules, salesperson (app/api/v1/controls.py, migration 0018)."""

import io
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.v1 import controls
from app.api.v1.controls import pick_rule, variance
from app.core.periods import check_period_open

ROOT = Path(__file__).resolve().parents[1]
SRC = io.open(ROOT / "app" / "api" / "v1" / "controls.py", encoding="utf-8").read()
SQL = io.open(ROOT / "migrations" / "sql" / "0018_lock_date_budgets_bank_rules.sql", encoding="utf-8").read()
PERIODS = io.open(ROOT / "app" / "core" / "periods.py", encoding="utf-8").read()
SALES = io.open(ROOT / "app" / "api" / "v1" / "sales.py", encoding="utf-8").read()

YEAR = {"id": "fy", "year_label": "2026-27", "start_date": date(2026, 4, 1), "end_date": date(2027, 3, 31),
        "is_active": True, "is_locked": False, "is_closed": False}


def test_a_document_on_or_before_the_lock_date_is_refused():
    locked = [dict(YEAR, books_locked_until=date(2026, 10, 31))]
    for d in (date(2026, 10, 31), date(2026, 6, 1)):
        with pytest.raises(HTTPException) as exc:
            check_period_open(locked, d, what="This expense")
        assert exc.value.status_code == 423 and "locked up to 2026-10-31" in exc.value.detail and "This expense" in exc.value.detail
    assert check_period_open(locked, date(2026, 11, 1))["year_label"] == "2026-27"


def test_no_lock_date_changes_nothing():
    assert check_period_open([YEAR], date(2026, 5, 5))["year_label"] == "2026-27"
    assert check_period_open([dict(YEAR, books_locked_until=None)], date(2026, 5, 5))["year_label"] == "2026-27"


def test_the_lock_date_rides_on_the_query_every_posting_path_already_runs():
    assert "books_locked_until" in PERIODS
    assert "SELECT id, year_label, start_date, end_date, is_active, is_locked, is_closed" in PERIODS
    assert "cannot be in the future" in SRC and "require(*CAN_AMEND)" in SRC


def test_variance_is_favourable_under_budget_for_expenses_and_over_for_income():
    assert variance("Expenses", Decimal("100000"), Decimal("80000")) == {"variance": 20000.0, "favourable": True, "used_pct": 80.0}
    assert variance("Expenses", Decimal("100000"), Decimal("120000"))["favourable"] is False
    assert variance("Income", Decimal("500000"), Decimal("600000")) == {"variance": 100000.0, "favourable": True, "used_pct": 120.0}
    assert variance("Income", Decimal("0"), Decimal("5"))["used_pct"] is None


def test_bank_rule_matching():
    rules = [
        {"name": "Electricity", "match_text": "BESCOM", "direction": "Debit", "priority": 50, "is_active": True},
        {"name": "Any bescom", "match_text": "bescom", "direction": "Any", "priority": 10, "is_active": True},
        {"name": "Off", "match_text": "rent", "direction": "Any", "priority": 1, "is_active": False},
    ]
    assert pick_rule(rules, "NEFT-BESCOM BILL 4411", "Debit")["name"] == "Any bescom"      # lowest priority number wins
    assert pick_rule(rules[:1], "neft-bescom bill", "Credit") is None                      # direction must agree
    assert pick_rule(rules, "RENT NOV", "Debit") is None                                   # switched-off rules never match
    assert pick_rule(rules, "", "Any") is None


def test_rules_only_suggest_and_are_switched_off_not_deleted():
    assert "DELETE FROM caratloop.bank_rules" not in SRC
    for forbidden in ("post_journal", "journal_entries (", "INSERT INTO caratloop.journal"):
        assert forbidden not in SRC, forbidden
    assert {r.path for r in controls.router.routes} == {
        "/lock-date", "/budgets", "/bank-rules", "/bank-rules/match", "/bank-rules/{rule_id}/active"}


def test_salesperson_is_stored_on_the_invoice():
    assert "salesperson: Optional[str] = Field(default=None, max_length=80)" in SALES
    assert "payment_terms, due_date, salesperson," in SALES and ":payment_terms, :due_date, :salesperson," in SALES


def test_migration_matches_the_code():
    assert "ADD COLUMN IF NOT EXISTS books_locked_until DATE" in SQL
    assert "ADD COLUMN IF NOT EXISTS salesperson VARCHAR(80)" in SQL
    for table, marker in (("budgets", "INSERT INTO caratloop.budgets ("), ("bank_rules", "INSERT INTO caratloop.bank_rules (")):
        m = re.search(r"CREATE TABLE IF NOT EXISTS caratloop\." + table + r" \((.*?)\n\);", SQL, re.S)
        cols = {ln.strip().split(" ")[0] for ln in m.group(1).splitlines() if ln.strip() and not ln.strip().startswith(("CONSTRAINT", "'", ")", "]"))}
        for col in re.findall(r"\w+", SRC.split(marker)[1].split(")")[0]):
            assert col in cols, (table, col)
    for word in ("Any", "Debit", "Credit"):
        assert f"'{word}'::character varying" in SQL
