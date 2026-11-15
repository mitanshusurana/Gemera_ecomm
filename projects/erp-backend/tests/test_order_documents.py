"""Quotes, sales orders and purchase orders (app/api/v1/orders.py, migration 0015)."""

import io
import re
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api.v1 import orders
from app.api.v1.orders import DOC_TYPES, TRANSITIONS, CreateOrderDocument, OrderLine, document_totals, line_amounts

ROOT = Path(__file__).resolve().parents[1]
SRC = io.open(ROOT / "app" / "api" / "v1" / "orders.py", encoding="utf-8").read()
SQL = io.open(ROOT / "migrations" / "sql" / "0015_order_documents.sql", encoding="utf-8").read()
PARTY = "4c6a0f7e-1111-4222-8333-444455556666"


def test_line_amounts_discount_both_parts_and_tax_each_at_its_rate():
    ln = OrderLine(material_value="100000", making_charges="10000", discount_pct="10", material_gst_rate="3", making_gst_rate="5")
    a = line_amounts(ln)
    assert a["gross"] == Decimal("110000.00")
    assert a["discount"] == Decimal("11000.00")
    assert a["taxable"] == Decimal("99000.00")
    assert a["gst"] == Decimal("2700.00") + Decimal("450.00")
    assert a["total"] == Decimal("102150.00")


def test_document_totals_add_up_line_by_line():
    lines = [OrderLine(material_value="50000", making_charges="0", material_gst_rate="3"),
             OrderLine(material_value="0", making_charges="2000", making_gst_rate="18")]
    t = document_totals(lines)
    assert t["subtotal"] == Decimal("52000.00") and t["discount_total"] == Decimal("0.00")
    assert t["gst_total"] == Decimal("1500.00") + Decimal("360.00")
    assert t["grand_total"] == t["subtotal"] - t["discount_total"] + t["gst_total"]


def test_payload_refuses_empty_documents_and_bad_discounts():
    with pytest.raises(ValidationError):
        CreateOrderDocument(doc_type="Quote", party_id=PARTY, doc_date="2026-11-15", lines=[])
    with pytest.raises(ValidationError):
        OrderLine(material_value="10", discount_pct="101")
    with pytest.raises(ValidationError):
        OrderLine(material_value="10", quantity="0")


def test_status_rules():
    assert set(DOC_TYPES) == {"Quote", "SalesOrder", "PurchaseOrder"}
    assert TRANSITIONS["Converted"] == set() and TRANSITIONS["Cancelled"] == set()   # final
    assert "Converted" in TRANSITIONS["Open"] and "Converted" in TRANSITIONS["Accepted"]
    assert "Converted" not in TRANSITIONS["Declined"]                                # reopen first
    assert "it cannot become" in SRC and "it cannot be converted" in SRC


def test_nothing_here_posts_to_the_ledger_or_moves_stock():
    for forbidden in ("journal_entries", "journal_entry_lines", "stock_ledger_entries", "post_journal"):
        assert forbidden not in SRC, forbidden


def test_every_statement_is_scoped_to_the_company():
    assert "FOR UPDATE" in SRC
    for stmt in re.findall(r'text\("""(.*?)"""\)', SRC, re.S):
        if "order_document_lines" in stmt and "order_documents" not in stmt:
            continue                      # lines are reached through their document id
        if "pg_advisory" in stmt:
            continue
        assert ":cid" in stmt, stmt[:80]
    assert {r.path for r in orders.router.routes} == {
        "", "/{doc_id}", "/{doc_id}/status", "/{doc_id}/mark-converted", "/{doc_id}/to-sales-order"}


def _cols(table: str) -> set:
    m = re.search(r"CREATE TABLE IF NOT EXISTS caratloop\." + table + r" \((.*?)\n\);", SQL, re.S)
    return {ln.strip().split(" ")[0] for ln in m.group(1).splitlines() if ln.strip() and not ln.strip().startswith(("CONSTRAINT", "'", ")", "]"))}


def test_migration_matches_the_columns_the_code_names():
    head, lines = _cols("order_documents"), _cols("order_document_lines")
    sql_text = " ".join(re.findall(r'"""(.*?)"""', SRC, re.S))    # the SQL, not the Python around it
    for col in set(re.findall(r"(?<![\w.])d\.(\w+)", sql_text)):
        assert col in head, col
    for col in set(re.findall(r"(?<![\w.])l\.(\w+)", sql_text)):
        assert col in lines, col
    for block, cols in ((SRC.split("INSERT INTO caratloop.order_documents (")[1].split(") VALUES")[0], head),
                        (SRC.split("INSERT INTO caratloop.order_document_lines (")[1].split(") VALUES")[0], lines)):
        for col in re.findall(r"\w+", block):
            assert col in cols, col
    for word in ("'Quote'", "'SalesOrder'", "'PurchaseOrder'", "'Open'", "'Accepted'", "'Declined'", "'Converted'", "'Cancelled'"):
        assert word + "::character varying" in SQL
    version = io.open(ROOT / "migrations" / "versions" / "0015_order_documents.py", encoding="utf-8").read()
    assert 'revision = "0015"' in version and 'down_revision = "0014"' in version
