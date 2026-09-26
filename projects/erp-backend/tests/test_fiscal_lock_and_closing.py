"""Fiscal-year lock, year-end closing arithmetic, and migration 0008.

is_locked was stored and never read. These pin the date logic that every
posting path now calls, the closing/opening journal arithmetic, and the
shape of the migration that carries the new columns.
"""

from __future__ import annotations

import io
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException
from pglast import parse_sql

from app.core.periods import (
    LOCKED,
    NO_FISCAL_YEAR,
    OPEN,
    assert_period_open,
    check_period_open,
    fiscal_year_for,
    period_state,
)
from app.core.year_end import (
    RETAINED_EARNINGS_CODE,
    closing_lines,
    next_year_bounds,
    opening_lines,
    overlaps,
    signed_debit_balance,
)
from conftest import StubResult

ROOT = Path(__file__).resolve().parents[1]
SQL_FILE = ROOT / "migrations" / "sql" / "0008_fiscal_lock_amend_2b_brs.sql"
VERSION_FILE = ROOT / "migrations" / "versions" / "0008_fiscal_lock_amend_2b_brs.py"

FY_25 = {"id": "a", "year_label": "2025-26", "start_date": date(2025, 4, 1), "end_date": date(2026, 3, 31),
         "is_locked": True, "is_closed": True}
FY_26 = {"id": "b", "year_label": "2026-27", "start_date": "2026-04-01", "end_date": "2027-03-31",
         "is_locked": False, "is_closed": False}
YEARS = [FY_25, FY_26]


# ─── Period lock ─────────────────────────────────────────────────────────────

def test_date_inside_open_year_is_open():
    state, fy = period_state(YEARS, date(2026, 9, 15))
    assert state == OPEN and fy["year_label"] == "2026-27"


def test_date_inside_locked_year_is_locked():
    state, fy = period_state(YEARS, "2026-03-31")
    assert state == LOCKED and fy["year_label"] == "2025-26"


def test_boundaries_are_inclusive():
    assert fiscal_year_for(YEARS, date(2026, 4, 1))["year_label"] == "2026-27"
    assert fiscal_year_for(YEARS, date(2027, 3, 31))["year_label"] == "2026-27"
    assert fiscal_year_for(YEARS, date(2025, 4, 1))["year_label"] == "2025-26"


def test_date_outside_every_year_has_no_fiscal_year():
    state, fy = period_state(YEARS, date(2030, 1, 1))
    assert state == NO_FISCAL_YEAR and fy is None
    assert period_state([], date(2026, 6, 1))[0] == NO_FISCAL_YEAR


def test_closed_but_not_locked_is_still_locked():
    """A year closed by hand in the database must not accept postings."""
    odd = {"id": "c", "year_label": "2024-25", "start_date": date(2024, 4, 1), "end_date": date(2025, 3, 31),
           "is_locked": False, "is_closed": True}
    assert period_state([odd], date(2024, 8, 1))[0] == LOCKED


def test_check_raises_423_with_the_year_named():
    with pytest.raises(HTTPException) as exc:
        check_period_open(YEARS, date(2026, 1, 10), what="This purchase bill")
    assert exc.value.status_code == 423
    assert "2025-26" in exc.value.detail
    assert "This purchase bill" in exc.value.detail
    assert "2026-01-10" in exc.value.detail


def test_check_raises_423_outside_every_year():
    with pytest.raises(HTTPException) as exc:
        check_period_open(YEARS, date(2031, 1, 10))
    assert exc.value.status_code == 423
    assert "outside every fiscal year" in exc.value.detail


def test_check_returns_the_open_year():
    assert check_period_open(YEARS, date(2026, 5, 5))["year_label"] == "2026-27"


@pytest.mark.asyncio
async def test_assert_period_open_reads_the_company_years(stub_session):
    stub_session.queue(StubResult(YEARS))
    fy = await assert_period_open(stub_session, "cid", date(2026, 7, 1))
    assert fy["year_label"] == "2026-27"
    sql, params = stub_session.executed[0]
    assert "fiscal_years" in sql and params["cid"] == "cid"


@pytest.mark.asyncio
async def test_assert_period_open_refuses_locked(stub_session):
    stub_session.queue(StubResult(YEARS))
    with pytest.raises(HTTPException) as exc:
        await assert_period_open(stub_session, "cid", date(2025, 7, 1))
    assert exc.value.status_code == 423


def test_every_posting_path_i_own_calls_the_lock():
    src = io.open(ROOT / "app" / "api" / "v1" / "purchases.py", encoding="utf-8").read()
    assert src.count("await assert_period_open(") >= 3  # create + both dates on amend
    vouchers = io.open(ROOT / "app" / "api" / "v1" / "vouchers.py", encoding="utf-8").read()
    assert vouchers.count("await assert_period_open(") == 6  # receipt, payment, contra, journal, CN, DN
    banking = io.open(ROOT / "app" / "api" / "v1" / "banking.py", encoding="utf-8").read()
    assert "await assert_period_open(" in banking


# ─── Year-end arithmetic ─────────────────────────────────────────────────────

RE = "re-acc"


def test_closing_transfers_profit_to_retained_earnings():
    rows = [
        {"id": "sal", "code": "SAL-001", "name": "Sales", "dr": Decimal("0"), "cr": Decimal("500000")},
        {"id": "cogs", "code": "COGS-001", "name": "COGS", "dr": Decimal("300000"), "cr": Decimal("0")},
        {"id": "adm", "code": "ADM-001", "name": "Rent", "dr": Decimal("50000"), "cr": Decimal("2000")},
    ]
    lines, net = closing_lines(rows, RE)
    assert net == Decimal("152000.00")
    by_acc = {l["acc"]: l for l in lines}
    assert by_acc["sal"]["dr"] == Decimal("500000.00") and by_acc["sal"]["cr"] == 0
    assert by_acc["cogs"]["cr"] == Decimal("300000.00")
    assert by_acc["adm"]["cr"] == Decimal("48000.00")
    assert by_acc[RE]["cr"] == Decimal("152000.00")
    assert sum(l["dr"] for l in lines) == sum(l["cr"] for l in lines)


def test_closing_a_loss_debits_retained_earnings():
    rows = [
        {"id": "sal", "code": "SAL-001", "name": "Sales", "dr": Decimal("0"), "cr": Decimal("100")},
        {"id": "exp", "code": "EXP", "name": "Exp", "dr": Decimal("400"), "cr": Decimal("0")},
    ]
    lines, net = closing_lines(rows, RE)
    assert net == Decimal("-300.00")
    re_line = next(l for l in lines if l["acc"] == RE)
    assert re_line["dr"] == Decimal("300.00")
    assert sum(l["dr"] for l in lines) == sum(l["cr"] for l in lines)


def test_closing_skips_zero_accounts_and_omits_re_when_flat():
    rows = [
        {"id": "a", "code": "A", "name": "", "dr": Decimal("10"), "cr": Decimal("10")},
        {"id": "b", "code": "B", "name": "", "dr": Decimal("0"), "cr": Decimal("25")},
        {"id": "c", "code": "C", "name": "", "dr": Decimal("25"), "cr": Decimal("0")},
    ]
    lines, net = closing_lines(rows, RE)
    assert net == 0
    assert {l["acc"] for l in lines} == {"b", "c"}


def test_signed_debit_balance_respects_normal_side():
    debit_acc = {"normal_balance": "D", "opening_balance": "1000", "dr": "500", "cr": "200"}
    credit_acc = {"normal_balance": "C", "opening_balance": "1000", "dr": "200", "cr": "500"}
    assert signed_debit_balance(debit_acc) == Decimal("1300.00")
    assert signed_debit_balance(credit_acc) == Decimal("-1300.00")


def test_opening_lines_carry_balances_and_report_difference():
    rows = [
        {"id": "bank", "code": "BNK-001", "name": "Bank", "normal_balance": "D", "opening_balance": "0", "dr": "1000", "cr": "300"},
        {"id": "cap", "code": "CAP-001", "name": "Capital", "normal_balance": "C", "opening_balance": "700", "dr": "0", "cr": "0"},
        {"id": "zero", "code": "Z", "name": "", "normal_balance": "D", "opening_balance": "0", "dr": "5", "cr": "5"},
    ]
    lines, diff = opening_lines(rows)
    assert diff == 0
    assert {l["acc"] for l in lines} == {"bank", "cap"}
    assert next(l for l in lines if l["acc"] == "bank")["dr"] == Decimal("700.00")
    assert next(l for l in lines if l["acc"] == "cap")["cr"] == Decimal("700.00")

    rows[1]["opening_balance"] = "650"
    _, diff = opening_lines(rows)
    assert diff == Decimal("50.00")


def test_next_year_bounds_follow_the_indian_fy_label():
    start, end, label = next_year_bounds(date(2026, 3, 31))
    assert (start, end, label) == (date(2026, 4, 1), date(2027, 3, 31), "2026-27")
    start, end, label = next_year_bounds(date(2027, 12, 31))
    assert (start, end, label) == (date(2028, 1, 1), date(2028, 12, 31), "2028-28")


def test_overlap_detection():
    assert overlaps(YEARS, date(2026, 3, 1), date(2026, 5, 1)) == YEARS
    assert overlaps(YEARS, date(2027, 4, 1), date(2028, 3, 31)) == []
    assert overlaps(YEARS, date(2027, 3, 31), date(2028, 3, 30)) == [FY_26]


# ─── Migration 0008 ──────────────────────────────────────────────────────────

def _sql() -> str:
    return io.open(SQL_FILE, encoding="utf-8").read()


def _all_sql() -> str:
    return "\n".join(io.open(f, encoding="utf-8").read() for f in sorted((ROOT / "migrations" / "sql").glob("*.sql")))


def _permitted(constraint: str) -> set[str]:
    """The LAST definition of a CHECK: a later migration re-adds it wider."""
    found = list(re.finditer(rf"CONSTRAINT\s+{re.escape(constraint)}\s+CHECK\s*\((.*?)\)\s*\)\s*\)", _all_sql(), re.I | re.S))
    assert found, f"{constraint} is not in the migrations"
    return set(re.findall(r"'([A-Za-z0-9_]+)'::character varying", found[-1].group(1)))


def test_migration_sql_parses():
    statements = parse_sql(_sql())
    assert len(statements) >= 30


def test_version_file_chains_from_0007():
    src = io.open(VERSION_FILE, encoding="utf-8").read()
    assert 'revision = "0008"' in src
    assert 'down_revision = "0007"' in src
    assert "0008_fiscal_lock_amend_2b_brs.sql" in src


def test_migration_adds_the_agreed_columns():
    sql = _sql()
    assert re.search(r"ALTER TABLE caratloop\.purchase_invoices\s+ADD COLUMN IF NOT EXISTS amends_invoice_id\s", sql)
    for table in ("itc_register", "rcm_liability_register", "tds_tcs_register"):
        assert re.search(rf"ALTER TABLE caratloop\.{table}\s+ADD COLUMN IF NOT EXISTS is_reversal\s", sql), table
    for col in ("closed_at", "closed_by", "closing_journal_entry_id", "opening_journal_entry_id"):
        assert re.search(rf"ALTER TABLE caratloop\.fiscal_years\s+ADD COLUMN IF NOT EXISTS {col}\s", sql), col
    assert re.search(r"CREATE TABLE caratloop\.gstr2b_entries\s*\(", sql)
    assert re.search(r"ALTER TABLE caratloop\.bank_statement_lines\s+ADD COLUMN IF NOT EXISTS reconciled_entry_line_id BIGINT", sql)
    assert re.search(r"ALTER TABLE caratloop\.reconciliation_matches\s+ADD COLUMN IF NOT EXISTS book_entry_line_id BIGINT", sql)
    assert "trg_audit_gstr2b_entries AFTER INSERT OR UPDATE OR DELETE" in sql
    assert f"'{RETAINED_EARNINGS_CODE}'" in sql


def test_purchase_status_vocabulary_gains_amended():
    permitted = _permitted("chk_pi_status")
    assert permitted == {"Draft", "Approved", "Posted", "Cancelled", "Amended"}
    from app.api.v1.purchases import INACTIVE_STATUSES
    assert set(INACTIVE_STATUSES) <= permitted


def test_gstr2b_match_statuses_match_the_check():
    from app.tax.gstr2b import MATCH_STATUSES
    assert _permitted("chk_gstr2b_match_status") == MATCH_STATUSES


def test_closing_and_opening_entry_types_are_permitted():
    """fiscal_years.py posts them as bind parameters, which the literal
    vocabulary test cannot see."""
    permitted = _permitted("chk_je_type")
    assert {"Closing", "Opening", "Reversal"} <= permitted
    src = io.open(ROOT / "app" / "api" / "v1" / "fiscal_years.py", encoding="utf-8").read()
    assert '"Closing"' in src and '"Opening"' in src


def test_retained_earnings_is_the_account_0003_provisions():
    old = io.open(ROOT / "migrations" / "sql" / "0003_provision_company.sql", encoding="utf-8").read()
    assert f"('{RETAINED_EARNINGS_CODE}', 'Retained Earnings'" in old
