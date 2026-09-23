"""Approval memos (jangad): the migration and the aging helper, offline.

Goods sent on approval were entirely unrecorded before 0006. These tests pin
down what can be checked without a database: that the migration's SQL is what
PostgreSQL will accept, that the statuses the endpoint writes are the ones the
CHECK permits, that every INSERT the module issues is covered (the general
mandatory-columns test does that; here the tables are asserted to exist so it
is not vacuous), and that the age buckets behave at their edges.
"""

from __future__ import annotations

import io
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from pglast import parse_sql

from app.core.aging import (
    BUCKET_LABELS,
    aging_bucket,
    bucket_open_value,
    days_out,
)

ROOT = Path(__file__).resolve().parents[1]
SQL_FILE = ROOT / "migrations" / "sql" / "0006_approval_memos.sql"
VERSION_FILE = ROOT / "migrations" / "versions" / "0006_approval_memos.py"


def _sql() -> str:
    return io.open(SQL_FILE, encoding="utf-8").read()


def _all_sql() -> str:
    return "\n".join(
        io.open(f, encoding="utf-8").read()
        for f in sorted((ROOT / "migrations" / "sql").glob("*.sql"))
    )


# ─── Migration ───────────────────────────────────────────────────────────────

def test_migration_sql_parses():
    """libpg_query is PostgreSQL's own parser: this rejects what the server would."""
    statements = parse_sql(_sql())
    assert len(statements) >= 8, "expected two tables, three indexes, two triggers at least"


def test_migration_creates_both_tables_with_the_agreed_columns():
    sql = _sql()
    assert re.search(r"CREATE TABLE caratloop\.approval_memos\s*\(", sql)
    assert re.search(r"CREATE TABLE caratloop\.approval_memo_lines\s*\(", sql)
    for col in (
        "memo_no", "memo_date", "party_id", "due_date", "status", "narration",
        "total_quantity", "total_value", "created_by", "closed_at",
    ):
        assert re.search(rf"^\s+{col}\s", sql, re.M), f"approval_memos lacks {col}"
    for col in (
        "sequence_no", "material_id", "quantity", "gross_weight", "net_weight",
        "rate", "value", "quantity_returned", "quantity_invoiced", "invoice_id",
    ):
        assert re.search(rf"^\s+{col}\s", sql, re.M), f"approval_memo_lines lacks {col}"
    assert "UNIQUE (company_id, memo_no)" in sql


def test_migration_indexes_and_audit_trigger():
    sql = _sql()
    assert "ON caratloop.approval_memos(company_id, status)" in sql
    assert "ON caratloop.approval_memos(party_id)" in sql
    assert "trg_audit_approval_memos AFTER INSERT OR UPDATE OR DELETE" in sql
    assert "trg_audit_approval_memo_lines AFTER INSERT OR UPDATE OR DELETE" in sql
    assert sql.count("caratloop.fn_audit_trigger()") == 2


def test_version_file_chains_from_0005():
    src = io.open(VERSION_FILE, encoding="utf-8").read()
    assert 'revision = "0006"' in src
    assert 'down_revision = "0005"' in src
    assert "0006_approval_memos.sql" in src


def test_status_vocabulary_matches_the_check():
    """The statuses the endpoint writes must be exactly those chk_apm_status permits.

    The value reaches the CHECK as a bind parameter, so the generic vocabulary
    test (which reads literals out of SQL text) cannot see it; compare the
    module's own constant instead.
    """
    from app.api.v1.approval_memos import MEMO_STATUSES

    m = re.search(
        r"CONSTRAINT\s+chk_apm_status\s+CHECK\s*\((.*?)\)\s*\)\s*\)", _all_sql(), re.I | re.S
    )
    assert m, "chk_apm_status is not in the migrations"
    permitted = set(re.findall(r"'([A-Za-z_][A-Za-z0-9_]*)'::character varying", m.group(1)))
    assert permitted == MEMO_STATUSES


def test_stock_movements_use_a_permitted_transaction_type_and_transit_location():
    """Stock_Transfer is in chk_sle_transaction_type; Transit in chk_location_type."""
    src = io.open(ROOT / "app" / "api" / "v1" / "approval_memos.py", encoding="utf-8").read()
    assert "'Stock_Transfer'" in src
    assert "'Transit'" in src
    assert "next_document_number(:cid, :fyid, 'ApprovalMemo')" in src

    sql = _all_sql()
    assert "'Stock_Transfer'::character varying" in sql
    assert "'Transit'::character varying" in sql


def test_router_includes_the_module():
    src = io.open(ROOT / "app" / "api" / "v1" / "router.py", encoding="utf-8").read()
    assert "from app.api.v1 import approval_memos" in src
    assert "approval_memos.router" in src


# ─── Aging buckets ───────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "days,label",
    [
        (0, "0-15"), (1, "0-15"), (15, "0-15"),
        (16, "16-30"), (30, "16-30"),
        (31, "31-60"), (60, "31-60"),
        (61, "61+"), (90, "61+"), (400, "61+"),
    ],
)
def test_bucket_edges(days, label):
    assert aging_bucket(days) == label


def test_negative_age_is_treated_as_today():
    assert aging_bucket(-5) == "0-15"
    assert days_out(date(2026, 9, 30), date(2026, 9, 23)) == 0


def test_days_out_counts_calendar_days():
    assert days_out(date(2026, 9, 1), date(2026, 9, 23)) == 22


def test_bucket_labels_are_ordered_and_complete():
    assert BUCKET_LABELS == ("0-15", "16-30", "31-60", "61+")


def test_bucket_open_value_groups_per_party_and_overall():
    as_of = date(2026, 9, 23)
    rows = [
        {"party_id": "p1", "party_name": "Ratan Gems", "memo_date": date(2026, 9, 20), "open_value": Decimal("1000.00")},
        {"party_id": "p1", "party_name": "Ratan Gems", "memo_date": date(2026, 8, 30), "open_value": Decimal("250.50")},
        {"party_id": "p2", "party_name": "Johari Bazar Traders", "memo_date": date(2026, 6, 1), "open_value": "4000"},
        # Fully settled memo still on the live list: registers the party, adds nothing.
        {"party_id": "p3", "party_name": "Nil Party", "memo_date": date(2026, 9, 1), "open_value": None},
    ]
    report = bucket_open_value(rows, as_of)

    assert report["as_of"] == as_of
    assert report["overall"] == {
        "0-15": Decimal("1000.00"),
        "16-30": Decimal("250.50"),
        "31-60": Decimal("0.00"),
        "61+": Decimal("4000.00"),
    }
    assert report["total_open_value"] == Decimal("5250.50")

    # Largest exposure first.
    assert [p["party_id"] for p in report["parties"]] == ["p2", "p1", "p3"]
    p1 = report["parties"][1]
    assert p1["buckets"]["0-15"] == Decimal("1000.00")
    assert p1["buckets"]["16-30"] == Decimal("250.50")
    assert p1["total"] == Decimal("1250.50")
    assert p1["memos"] == 2
    assert report["parties"][2]["total"] == Decimal("0.00")


def test_bucket_open_value_is_decimal_throughout():
    report = bucket_open_value(
        [{"party_id": "p", "party_name": "P", "memo_date": date(2026, 9, 1), "open_value": 0.1}],
        date(2026, 9, 2),
    )
    # A float 0.1 must arrive as Decimal('0.10'), not its binary expansion.
    assert report["total_open_value"] == Decimal("0.10")
    assert all(isinstance(v, Decimal) for v in report["overall"].values())


def test_empty_report():
    report = bucket_open_value([], date(2026, 9, 23))
    assert report["total_open_value"] == Decimal("0.00")
    assert report["parties"] == []
    assert set(report["overall"]) == set(BUCKET_LABELS)
