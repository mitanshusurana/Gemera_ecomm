"""Business overview, analysis reports and global search (app/api/v1/insights.py)."""

import io
from datetime import date
from decimal import Decimal
from pathlib import Path

from app.api.v1 import insights
from app.api.v1.insights import ANALYSIS_REPORTS, fiscal_year_start, month_series, split_dues

ROOT = Path(__file__).resolve().parents[1]
SRC = io.open(ROOT / "app" / "api" / "v1" / "insights.py", encoding="utf-8").read()


def test_endpoints_are_mounted():
    assert {r.path for r in insights.router.routes} == {"/business-overview", "/analysis"}
    assert {r.path for r in insights.search_router.routes} == {"/search"}
    router_src = io.open(ROOT / "app" / "api" / "v1" / "router.py", encoding="utf-8").read()
    assert 'include_router(insights.router,        prefix="/reports"' in router_src
    assert 'include_router(insights.search_router, prefix=""' in router_src


def test_fiscal_year_starts_on_first_april():
    assert fiscal_year_start(date(2026, 11, 11)) == date(2026, 4, 1)
    assert fiscal_year_start(date(2027, 3, 31)) == date(2026, 4, 1)
    assert fiscal_year_start(date(2027, 4, 1)) == date(2027, 4, 1)


def test_month_series_lists_quiet_months_and_crosses_the_year_end():
    rows = [{"yr": 2026, "mo": 12, "incoming": Decimal("100.50"), "outgoing": Decimal("40")},
            {"yr": 2027, "mo": 2, "incoming": Decimal("0"), "outgoing": Decimal("9")}]
    out = month_series(date(2026, 11, 1), date(2027, 2, 15), rows)
    assert [m["month"] for m in out] == ["2026-11", "2026-12", "2027-01", "2027-02"]
    assert [m["name"] for m in out] == ["Nov", "Dec", "Jan", "Feb"]
    assert out[0] == {"name": "Nov", "month": "2026-11", "incoming": 0.0, "outgoing": 0.0}
    assert out[1]["incoming"] == 100.5 and out[1]["outgoing"] == 40.0
    assert out[3]["outgoing"] == 9.0


def test_split_dues_separates_overdue_from_current():
    d = split_dues({"total": Decimal("1500"), "overdue": Decimal("400"), "open_count": 3, "overdue_count": 1})
    assert d == {"total": 1500.0, "overdue": 400.0, "current": 1100.0, "open_count": 3, "overdue_count": 1}
    assert split_dues(None) == {"total": 0.0, "overdue": 0.0, "current": 0.0, "open_count": 0, "overdue_count": 0}


def test_overview_follows_the_rules_the_other_reports_use():
    # open bills as the age-wise outstanding report defines them
    assert "si.payment_status != 'Paid'" in SRC and "si.status != 'Cancelled'" in SRC
    assert "pi.status NOT IN ('Cancelled', 'Amended')" in SRC
    # due date, else the party's credit days from the invoice date
    assert "COALESCE(si.due_date, si.invoice_date + COALESCE(p.credit_days, 0))" in SRC
    # a transfer between cash and bank is not cash flow
    assert "je.entry_type NOT IN ('Opening', 'Contra')" in SRC
    # opening balances come from the account, not from 'Opening' journals
    assert "je.entry_type <> 'Opening'" in SRC


def test_every_analysis_report_has_a_branch_and_rejects_unknown_names():
    assert set(ANALYSIS_REPORTS) == {
        "sales_by_customer", "sales_by_item", "purchases_by_vendor", "purchases_by_item", "expenses_by_account",
    }
    for name in ANALYSIS_REPORTS[:-1]:
        assert f'report == "{name}"' in SRC
    assert "report must be one of" in SRC


def test_search_binds_the_term_and_scopes_every_statement_to_the_company():
    body = SRC.split("async def global_search(")[1]
    assert body.count("company_id = :cid") == 5          # parties, items, sales, purchases, vouchers
    assert body.count(":like") >= 12
    assert "len(q) < 2" in body                           # no table scans for a single letter
    # wildcards in the term match themselves; the term is only ever a bind value
    assert insights.like_pattern("50%_off") == "%50" + chr(92) + "%" + chr(92) + "_off%"
    assert insights.like_pattern("gold") == "%gold%"
    assert '"like": like_pattern(q)' in body
    assert insights._hit("party", 7, "Acme", "Customer", "/ledger?party=7") == {
        "kind": "party", "id": "7", "title": "Acme", "subtitle": "Customer", "href": "/ledger?party=7",
    }


# ── every column the queries name exists in the schema the migrations build ──
import re

ALIASES = {
    "si": "sales_invoices", "sil": "sales_invoice_lines", "pi": "purchase_invoices",
    "pil": "purchase_invoice_lines", "p": "parties", "pr": "products", "m": "materials",
    "a": "accounts", "ag": "account_groups", "je": "journal_entries", "jel": "journal_entry_lines",
}


def _schema_columns(table: str) -> set[str]:
    cols: set[str] = set()
    for f in sorted((ROOT / "migrations" / "sql").glob("*.sql")):
        sql = io.open(f, encoding="utf-8").read()
        m = re.search(r"CREATE TABLE (?:IF NOT EXISTS )?caratloop\." + table + r" \((.*?)\n\);", sql, re.S)
        if m:
            for line in m.group(1).splitlines():
                word = line.strip().split(" ")[0]
                if word and word.upper() not in ("CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN"):
                    cols.add(word.strip('"'))
        for alter in re.finditer(r"ALTER TABLE (?:ONLY )?caratloop\." + table + r"\b(.*?);", sql, re.S):
            cols.update(re.findall(r"ADD COLUMN (?:IF NOT EXISTS )?(\w+)", alter.group(1)))
    return cols


def test_every_aliased_column_exists_in_the_migrations():
    missing = []
    for alias, table in ALIASES.items():
        cols = _schema_columns(table)
        assert cols, f"no CREATE TABLE found for {table}"
        for col in sorted(set(re.findall(r"(?<![\w.])" + alias + r"\.(\w+)", SRC))):
            if col not in cols:
                missing.append(f"{alias}.{col} ({table})")
    assert not missing, "columns not in the schema: " + ", ".join(missing)


def test_unaliased_search_statements_name_real_columns():
    for table, cols in (
        ("parties", ("name", "trade_name", "party_type", "gstin", "phone", "party_code", "is_active")),
        ("materials", ("code", "name", "category", "is_active")),
        ("journal_entries", ("entry_no", "entry_date", "entry_type", "narration", "total_debit")),
    ):
        have = _schema_columns(table)
        assert not [c for c in cols if c not in have], (table, [c for c in cols if c not in have])
