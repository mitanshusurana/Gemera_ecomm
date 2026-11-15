"""Expenses (app/api/v1/expenses.py, migration 0014) and payment terms (app/core/terms.py)."""

import io
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api.v1 import expenses
from app.api.v1.expenses import CreateExpenseRequest, ReverseExpenseRequest, expense_narration
from app.core.terms import PAYMENT_TERMS, due_date_for, net_days

ROOT = Path(__file__).resolve().parents[1]
SRC = io.open(ROOT / "app" / "api" / "v1" / "expenses.py", encoding="utf-8").read()
SQL = io.open(ROOT / "migrations" / "sql" / "0014_expenses.sql", encoding="utf-8").read()
SALES = io.open(ROOT / "app" / "api" / "v1" / "sales.py", encoding="utf-8").read()
ACC = "4c6a0f7e-1111-4222-8333-444455556666"
BANK = "4c6a0f7e-1111-4222-8333-444455557777"


# ── payment terms ────────────────────────────────────────────────────────────
def test_terms_decide_the_due_date():
    d = date(2026, 11, 11)
    assert due_date_for(d, "Immediate") == d
    assert due_date_for(d, None) == d
    assert due_date_for(d, "Net 30") == date(2026, 12, 11)
    assert due_date_for(d, "net 7") == date(2026, 11, 18)
    assert due_date_for(date(2027, 2, 15), "Net 15") == date(2027, 3, 2)
    assert [net_days(t) for t in PAYMENT_TERMS] == [0, 7, 15, 30, 45, 60, 0]


def test_an_explicit_due_date_wins_but_cannot_precede_the_invoice():
    d = date(2026, 11, 11)
    assert due_date_for(d, "Net 30", date(2026, 11, 20)) == date(2026, 11, 20)
    with pytest.raises(ValueError):
        due_date_for(d, "Custom", date(2026, 11, 10))


def test_the_sales_invoice_stores_its_due_date():
    assert "due_date: Optional[date] = None" in SALES
    assert "invoice_due_date = due_date_for(payload.invoice_date, payload.payment_terms, payload.due_date)" in SALES
    assert "payment_terms, due_date," in SALES and ":payment_terms, :due_date," in SALES
    assert '"due_date": invoice_due_date' in SALES


# ── expenses ─────────────────────────────────────────────────────────────────
def test_amount_must_be_positive_and_text_fields_fit_their_columns():
    ok = CreateExpenseRequest(expense_date="2026-11-05", expense_account_id=ACC, paid_through_account_id=BANK, amount="29500.00")
    assert ok.amount == Decimal("29500.00") and ok.vendor_id is None
    for bad in ("0", "-5"):
        with pytest.raises(ValidationError):
            CreateExpenseRequest(expense_date="2026-11-05", expense_account_id=ACC, paid_through_account_id=BANK, amount=bad)
    with pytest.raises(ValidationError):   # journal_entries.reference_no is VARCHAR(50)
        CreateExpenseRequest(expense_date="2026-11-05", expense_account_id=ACC, paid_through_account_id=BANK, amount="1", reference_no="x" * 51)
    with pytest.raises(ValidationError):
        ReverseExpenseRequest(reason="")


def test_narration_reads_like_the_day_book():
    assert expense_narration("Shop Rent", "Ramesh Kumar", "November") == "Shop Rent paid to Ramesh Kumar: November"
    assert expense_narration("Courier", None, None) == "Courier"
    assert expense_narration("Courier", None, "   ") == "Courier"
    assert len(expense_narration("A" * 400, "B" * 200, "C" * 200)) == 500


def test_expense_posts_a_balanced_payment_and_keeps_the_document():
    body = SRC.split("async def create_expense(")[1].split("@router.post(")[0]
    assert "assert_period_open(db, company_id, payload.expense_date" in body
    assert 'exp_acc["nature"] != "Expenses"' in body                 # only an expense ledger is debited
    assert 'paid_acc["account_type"] not in ("Bank", "Cash")' in body  # only cash or bank is credited
    assert "NEXTVAL('caratloop.journal_entry_seq')" in body            # the voucher number comes from the sequence
    assert '"Payment", narration' in body and 'ref_type="Expense"' in body
    assert "INSERT INTO caratloop.expenses" in body
    # one debit and one credit of the same amount
    assert '"dr": amount, "cr": Decimal("0")' in body and '"dr": Decimal("0"), "cr": amount' in body


def test_reversal_mirrors_the_entry_and_never_deletes():
    body = SRC.split("async def reverse_expense(")[1]
    assert "FOR UPDATE" in body and "already reversed" in body
    assert '"Reversal", narration' in body
    assert "SET status = 'Reversed', reversal_entry_id = :rev" in body
    assert "DELETE FROM" not in SRC.upper()


def test_expense_numbers_are_gapless_per_year():
    assert "pg_advisory_xact_lock" in SRC and "SUBSTRING(expense_no FROM '^EXP/[^/]+/([0-9]+)$')" in SRC
    assert {r.path for r in expenses.router.routes} == {"", "/{expense_id}/reverse"}


def test_migration_creates_the_table_the_code_writes():
    assert "CREATE TABLE IF NOT EXISTS caratloop.expenses" in SQL
    assert "CONSTRAINT chk_expense_amount CHECK (amount > 0)" in SQL
    assert "'Posted'::character varying" in SQL and "'Reversed'::character varying" in SQL
    assert "trg_audit_expenses" in SQL and "fn_audit_trigger()" in SQL
    cols = set(re.findall(r"^\s{4}(\w+)\s", SQL, re.M))
    insert = SRC.split("INSERT INTO caratloop.expenses (")[1].split(")")[0]
    for col in re.findall(r"\w+", insert):
        assert col in cols, col
    for col in set(re.findall(r"(?<![\w.])e\.(\w+)", SRC)):
        assert col in cols, col
    version = io.open(ROOT / "migrations" / "versions" / "0014_expenses.py", encoding="utf-8").read()
    assert 'revision = "0014"' in version and 'down_revision = "0013"' in version
