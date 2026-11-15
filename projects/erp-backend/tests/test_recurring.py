"""Recurring documents (app/api/v1/recurring.py, migration 0016)."""

import io
import re
from datetime import date
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api.v1 import recurring
from app.api.v1.recurring import FREQUENCIES, KINDS, CreateProfile, nth_run

ROOT = Path(__file__).resolve().parents[1]
SRC = io.open(ROOT / "app" / "api" / "v1" / "recurring.py", encoding="utf-8").read()
SQL = io.open(ROOT / "migrations" / "sql" / "0016_recurring_profiles.sql", encoding="utf-8").read()


def test_monthly_dates_do_not_drift_past_short_months():
    start = date(2026, 1, 31)
    assert [nth_run(start, "Monthly", 1, n) for n in range(5)] == [
        date(2026, 1, 31), date(2026, 2, 28), date(2026, 3, 31), date(2026, 4, 30), date(2026, 5, 31)]
    assert nth_run(date(2024, 2, 29), "Yearly", 1, 1) == date(2025, 2, 28)
    assert nth_run(date(2024, 2, 29), "Yearly", 1, 4) == date(2028, 2, 29)


def test_other_frequencies_and_intervals():
    assert nth_run(date(2026, 11, 15), "Weekly", 1, 1) == date(2026, 11, 22)
    assert nth_run(date(2026, 11, 15), "Weekly", 2, 3) == date(2026, 12, 27)
    assert nth_run(date(2026, 11, 1), "Quarterly", 1, 1) == date(2027, 2, 1)
    assert nth_run(date(2026, 11, 1), "Monthly", 2, 1) == date(2027, 1, 1)      # crosses the year end
    assert nth_run(date(2026, 12, 15), "Monthly", 1, 1) == date(2027, 1, 15)


def test_vocabularies_match_the_migration():
    assert set(KINDS) == {"Expense", "PurchaseBill", "SalesInvoice"}
    assert set(FREQUENCIES) == {"Weekly", "Monthly", "Quarterly", "Yearly"}
    for word in list(KINDS) + list(FREQUENCIES) + ["Active", "Paused", "Ended"]:
        assert f"'{word}'::character varying" in SQL, word
    with pytest.raises(ValidationError):
        CreateProfile(kind="Expense", name="x", frequency="Monthly", start_date="2026-11-01", template={})   # name too short
    with pytest.raises(ValidationError):
        CreateProfile(kind="Expense", name="Rent", frequency="Monthly", every_n=0, start_date="2026-11-01", template={})


def test_only_an_expense_posts_itself_and_through_the_shared_routine():
    assert "Only an expense can post itself" in SRC
    body = SRC.split("async def run_due_expenses(")[1].split("@router.post(")[0]
    assert "kind = 'Expense' AND auto_post" in body
    assert "await record_expense(" in body                      # same checks as a typed expense
    assert "expense_date=profile[\"next_run_date\"]" in body      # dated the day it fell due, not today
    assert "MAX_CATCH_UP" in body
    assert "SET status = 'Paused', last_error = :err" in body     # a refused posting pauses the profile
    for forbidden in ("post_journal(", "INSERT INTO caratloop.journal", "INSERT INTO caratloop.sales_invoices", "INSERT INTO caratloop.purchase_invoices"):
        assert forbidden not in SRC, forbidden


def test_routes_and_scoping():
    assert {r.path for r in recurring.router.routes} == {"", "/{profile_id}/status", "/{profile_id}/advance", "/run-due"}
    assert "FOR UPDATE" in SRC
    main = io.open(ROOT / "app" / "main.py", encoding="utf-8").read()
    assert "asyncio.create_task(recurring_loop())" in main and "recurring_task.cancel()" in main


def test_migration_matches_the_columns_the_code_names():
    m = re.search(r"CREATE TABLE IF NOT EXISTS caratloop\.recurring_profiles \((.*?)\n\);", SQL, re.S)
    cols = {ln.strip().split(" ")[0] for ln in m.group(1).splitlines() if ln.strip() and not ln.strip().startswith(("CONSTRAINT", "'", ")", "]"))}
    insert = SRC.split("INSERT INTO caratloop.recurring_profiles (")[1].split(") VALUES")[0]
    for col in re.findall(r"\w+", insert):
        assert col in cols, col
    for col in re.findall(r"\w+", SRC.split("_COLUMNS = \"\"\"")[1].split("FROM caratloop")[0].replace("SELECT", "")):
        assert col in cols, col
    version = io.open(ROOT / "migrations" / "versions" / "0016_recurring_profiles.py", encoding="utf-8").read()
    assert 'revision = "0016"' in version and 'down_revision = "0015"' in version
