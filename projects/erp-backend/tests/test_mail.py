"""E-mailing documents (app/core/mailer.py, app/api/v1/mail.py, migration 0017)."""

import io
import re
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.api.v1 import mail
from app.core import mailer
from app.core.mailer import inr, invoice_email, order_email, split_addresses, statement_email, valid_address

ROOT = Path(__file__).resolve().parents[1]
SRC = io.open(ROOT / "app" / "api" / "v1" / "mail.py", encoding="utf-8").read()
SQL = io.open(ROOT / "migrations" / "sql" / "0017_email_log.sql", encoding="utf-8").read()
COMPANY = {"name": "Caratloop Jewels", "trade_name": "Caratloop", "address_line1": "S149 Mahaveer Nagar", "city": "Jaipur",
           "pincode": "302018", "gstin": "08AAACC1234A1ZI",
           "bank": {"bank_name": "SBI", "account_no": "1234567890", "ifsc": "SBIN0001234", "upi_id": None}}


def test_indian_digit_grouping():
    assert inr("0") == "Rs. 0.00"
    assert inr("999.5") == "Rs. 999.50"
    assert inr("1000") == "Rs. 1,000.00"
    assert inr("123456.78") == "Rs. 1,23,456.78"
    assert inr(Decimal("12345678.5")) == "Rs. 1,23,45,678.50"
    assert inr("-2500") == "-Rs. 2,500.00"


def test_addresses_are_validated_before_anything_is_sent():
    assert valid_address("a.b@example.co.in") and not valid_address("nope") and not valid_address("a@b") and not valid_address(None)
    assert split_addresses("a@x.com, b@y.com;c@z.org") == ["a@x.com", "b@y.com", "c@z.org"]
    assert split_addresses("") == [] and split_addresses(None) == []
    with pytest.raises(ValueError):
        split_addresses("a@x.com, not-an-address")


def test_invoice_mail_states_the_balance_and_escapes_what_people_typed():
    inv = {"invoice_no": "CL/2026-27/0061", "invoice_date": date(2026, 11, 9), "due_date": date(2026, 12, 9),
           "grand_total": Decimal("147500"), "amount_paid": Decimal("47500"), "total_gst": Decimal("4296.12"),
           "party_name": "Gems <b>& Co</b>"}
    subject, html, text = invoice_email(COMPANY, inv, [{"description": "22K chain <script>", "quantity": 1, "line_total": Decimal("147500")}], "See you soon")
    assert subject == "Invoice CL/2026-27/0061 from Caratloop"
    assert "Rs. 1,00,000.00" in html and "Rs. 1,00,000.00" in text            # balance, not the invoice total
    assert "due 09 Dec 2026" in html
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "Gems &lt;b&gt;&amp; Co&lt;/b&gt;" in html
    assert "IFSC SBIN0001234" in html and "See you soon" in html


def test_quote_mail_says_it_is_not_a_tax_invoice():
    doc = {"doc_type": "Quote", "doc_no": "QT/2026-27/00001", "doc_date": date(2026, 11, 15), "valid_until": date(2026, 11, 30),
           "grand_total": Decimal("102150"), "party_name": "Jaipur Gems", "terms": None}
    subject, html, _ = order_email(COMPANY, doc, [{"description": "Chain", "quantity": 1, "taxable": 99000, "gst_amount": 3150, "line_total": 102150}])
    assert subject.startswith("Quotation QT/2026-27/00001") and "not a tax invoice" in html and "valid until 30 Nov 2026" in html
    po = dict(doc, doc_type="PurchaseOrder", doc_no="PO/2026-27/00001")
    assert "not a tax invoice" not in order_email(COMPANY, po, [])[1]


def test_reminder_lists_only_what_is_passed_and_totals_it():
    rows = [{"invoice_no": "A1", "invoice_date": date(2026, 9, 1), "due_date": date(2026, 10, 1), "days_overdue": 45, "balance": Decimal("1000")},
            {"invoice_no": "A2", "invoice_date": date(2026, 10, 1), "due_date": date(2026, 10, 31), "days_overdue": 15, "balance": Decimal("2500.50")}]
    subject, html, _ = statement_email(COMPANY, "Jaipur Gems", rows, date(2026, 11, 15), reminder=True)
    assert subject == "Payment reminder: Rs. 3,500.50 overdue to Caratloop"
    assert "45 days" in html and "Total overdue: Rs. 3,500.50" in html
    subject, html, _ = statement_email(COMPANY, "Jaipur Gems", rows, date(2026, 11, 15), reminder=False)
    assert subject.startswith("Statement of account") and "Total outstanding" in html


def test_nothing_is_sent_when_mail_is_not_configured(monkeypatch):
    monkeypatch.setattr(mailer.settings, "SMTP_HOST", "")
    assert mailer.is_configured() is False
    assert "_require_configured()" in SRC and "status_code=503" in SRC


def test_a_failed_send_is_logged_and_reported_not_swallowed():
    body = SRC.split("async def _deliver(")[1].split("@router.get(")[0]
    assert "INSERT INTO caratloop.email_log" in body
    assert '"Failed" if error else "Sent"' in body
    assert "status_code=502" in body
    assert "str(e)" not in SRC                       # the SMTP error text never reaches the client


def test_no_unattended_sending_and_everything_scoped_to_the_company():
    assert {r.path for r in mail.router.routes} == {
        "/status", "/invoice/{invoice_id}", "/order/{doc_id}", "/statement/{party_id}", "/overdue", "/reminders", "/log"}
    assert "create_task" not in SRC and "asyncio.sleep" not in SRC
    for stmt in re.findall(r'text\("""(.*?)"""\)', SRC, re.S):
        if "sales_invoice_lines sil" in stmt or "order_document_lines l" in stmt:
            continue                                  # lines are reached through a document already checked
        assert ":cid" in stmt, stmt[:70]


def test_migration_matches_the_insert():
    m = re.search(r"CREATE TABLE IF NOT EXISTS caratloop\.email_log \((.*?)\n\);", SQL, re.S)
    cols = {ln.strip().split(" ")[0] for ln in m.group(1).splitlines() if ln.strip() and not ln.strip().startswith(("CONSTRAINT", "'", ")", "]"))}
    insert = SRC.split("INSERT INTO caratloop.email_log (")[1].split(")")[0]
    for col in re.findall(r"\w+", insert):
        assert col in cols, col
    assert "'Sent'::character varying" in SQL and "'Failed'::character varying" in SQL
