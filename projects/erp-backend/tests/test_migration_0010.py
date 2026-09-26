"""Migration 0010: export invoices, gemstone lots, per-location stock.

The SQL twin must parse, sit at the right point in the chain, and the CHECK
vocabularies it adds must be exactly what the application writes.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

from pglast import parse_sql

from tests.test_check_constraint_vocabularies import permitted

ROOT = Path(__file__).resolve().parents[1]
SQL_FILE = ROOT / "migrations" / "sql" / "0010_export_lots_locations.sql"
PY_FILE = ROOT / "migrations" / "versions" / "0010_export_lots_locations.py"


def test_sql_twin_exists_and_parses():
    assert SQL_FILE.exists()
    sql = io.open(SQL_FILE, encoding="utf-8").read()
    statements = parse_sql(sql)
    assert len(statements) > 20


def test_revision_chain():
    src = io.open(PY_FILE, encoding="utf-8").read()
    assert re.search(r'^revision\s*=\s*"0010"', src, re.M)
    assert re.search(r'^down_revision\s*=\s*"0009"', src, re.M)
    assert "0010_export_lots_locations.sql" in src


def test_columns_added():
    sql = io.open(SQL_FILE, encoding="utf-8").read()
    for col in ("export_type", "shipping_bill_no", "shipping_bill_date", "port_code",
                "buyer_country", "lut_no", "fc_grand_total"):
        assert re.search(rf"ALTER TABLE caratloop\.sales_invoices\s+ADD COLUMN IF NOT EXISTS {col}\b", sql), col
    for col in ("lot_no", "carat_weight", "piece_count", "sieve_size", "shape", "colour", "clarity",
                "origin", "treatment", "cost_per_carat", "parent_lot_id", "status"):
        assert re.search(rf"ALTER TABLE caratloop\.stock_batches\s+ADD COLUMN IF NOT EXISTS {col}\b", sql), col
    assert re.search(r"ALTER TABLE caratloop\.stock_ledger_entries\s+ADD COLUMN IF NOT EXISTS batch_id\b", sql)
    assert re.search(r"ALTER TABLE caratloop\.sales_invoice_lines\s+ADD COLUMN IF NOT EXISTS lot_id\b", sql)
    assert "uq_stock_batch_lot_no" in sql


def test_export_type_vocabulary_matches_engine():
    from app.tax.gst_engine import EXPORT_TYPES, SUPPLY_TYPE_FOR_EXPORT

    assert set(EXPORT_TYPES) == permitted("chk_invoice_export_type")
    assert set(SUPPLY_TYPE_FOR_EXPORT) == set(EXPORT_TYPES)
    assert set(SUPPLY_TYPE_FOR_EXPORT.values()) == {"Export_WPAY", "Export_WOPAY"}


def test_invoice_types_are_permitted_by_the_baseline_check():
    from app.tax.gst_engine import INVOICE_TYPES

    assert set(INVOICE_TYPES) <= permitted("chk_invoice_type")


def test_lot_status_vocabulary_matches_module():
    from app.api.v1.lots import LOT_STATUSES

    assert set(LOT_STATUSES) == permitted("chk_lot_status")


def test_location_type_vocabulary_matches_module():
    from app.api.v1.locations import LOCATION_TYPES

    assert set(LOCATION_TYPES) == permitted("chk_location_type")


def test_stock_ledger_sequence_is_per_company():
    """No INSERT into stock_ledger_entries may take MAX(sequence_no) over the
    whole table: one tenant's numbering must not depend on another's."""
    offenders = []
    for path in ("app/api/v1/sales.py", "app/api/v1/inventory.py", "app/api/v1/lots.py", "app/api/v1/locations.py"):
        src = io.open(ROOT / path, encoding="utf-8").read()
        for m in re.finditer(r"SELECT MAX\((?:\w+\.)?sequence_no\) FROM caratloop\.stock_ledger_entries(?:\s+\w+)?\s*\)", src):
            offenders.append(f"{path}: {m.group(0)}")
    assert not offenders, "table-wide sequence_no:\n  " + "\n  ".join(offenders)
