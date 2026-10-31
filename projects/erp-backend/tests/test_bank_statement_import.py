"""Bank statement import must read what Indian banks actually export.

The first real statement uploaded to production (an SBI "xls", which is a
tab-separated text file with eighteen header lines) crashed the endpoint
with "File is not a zip file" and a 500. These fixtures mirror that layout
and the common CSV/Excel variants, anonymised.
"""

from __future__ import annotations

import io
from datetime import date
from decimal import Decimal

import openpyxl
import pytest

from app.services.bank_statement_parser import (
    UnsupportedStatement,
    map_columns,
    parse_amount,
    parse_date,
    parse_statement,
)

SBI_TSV = (
    "Account Name       :                \tEXAMPLE TRADERS\n"
    "Address            :\t12 SOME STREET\n"
    "                                    \tJaipur\n"
    "Account Number     :\t_00000000000000000\n"
    "IFS Code                      :\tSBIN0000000\n"
    "Opening Balance as on 11 Apr 2026        :\t0.00\n"
    "Start Date          :\t11 Apr 2026 \n"
    "End Date            :\t11 Oct 2026 \n"
    "Txn Date\tValue Date\tDescription\tRef No./Cheque No.\tBranch Code\t        Debit\tCredit\tBalance\t\n"
    "27 Apr 2026 \t27 Apr 2026 \t   CASH DEPOSIT-CASH DEPOSIT SELF--\t / \t31029\t \t4,100.00\t4,100.00\n"
    "28 Apr 2026 \t28 Apr 2026 \t   BY TRANSFER-NEFT*KKBK0000000*REF123*A SUPPLIER--\tTRANSFER FROM 1234 / \t4430\t \t20,478.00\t24,578.00\n"
    "7 May 2026 \t7 May 2026 \tTO CLEARING-Chq 000001 Sess 2 SOMEONE         00091--76249\t / 76249\t31904\t29,500.00\t \t-4,922.00\n"
    "\n"
    "**This is a computer generated statement and does not require a signature\n"
)

HDFC_CSV = (
    "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance\n"
    "01/05/26,UPI-SOMEONE-ok@upi-12345,0000123456789,01/05/26,1500.00,,98500.00\n"
    "03/05/26,NEFT CR-KKBK0000000-A CUSTOMER,N123,03/05/26,,\"25,000.00\",\"1,23,500.00\"\n"
)


def test_sbi_tab_separated_export_is_read():
    parsed = parse_statement(SBI_TSV.encode("utf-8"), "Account_Statement.xls")
    assert parsed.format == "tsv"
    assert [l.txn_date for l in parsed.lines] == [date(2026, 4, 27), date(2026, 4, 28), date(2026, 5, 7)]
    first, second, third = parsed.lines
    assert first.credit == Decimal("4100.00") and first.debit == Decimal("0")
    assert first.balance == Decimal("4100.00")
    assert second.description.startswith("BY TRANSFER-NEFT")
    assert second.ref_no == "TRANSFER FROM 1234"
    assert third.debit == Decimal("29500.00") and third.credit == Decimal("0")
    assert third.ref_no == "76249"
    assert third.balance == Decimal("-4922.00")
    # The footer and the blank line are not transactions, and not an error.
    assert parsed.skipped_rows == 1


def test_hdfc_style_csv_with_indian_number_grouping():
    parsed = parse_statement(HDFC_CSV.encode("utf-8"), "statement.csv")
    assert parsed.format == "csv"
    assert len(parsed.lines) == 2
    a, b = parsed.lines
    assert a.txn_date == date(2026, 5, 1) and a.debit == Decimal("1500.00")
    assert b.credit == Decimal("25000.00")
    assert b.balance == Decimal("123500.00")  # "1,23,500.00" lakh grouping
    assert b.ref_no == "N123"


def test_real_xlsx_workbook_is_read():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Statement for account 1234"])
    ws.append([])
    ws.append(["Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"])
    ws.append([date(2026, 6, 1), date(2026, 6, 1), "CASH DEPOSIT", "", None, 5000, 5000])
    ws.append(["02-06-2026", "02-06-2026", "ATM WDL", "A1", "1,000.00", "", "4,000.00"])
    buf = io.BytesIO()
    wb.save(buf)
    parsed = parse_statement(buf.getvalue(), "statement.xlsx")
    assert parsed.format == "xlsx"
    assert [(l.txn_date, l.debit, l.credit) for l in parsed.lines] == [
        (date(2026, 6, 1), Decimal("0"), Decimal("5000")),
        (date(2026, 6, 2), Decimal("1000.00"), Decimal("0")),
    ]


def test_legacy_binary_xls_gets_a_clear_message_not_a_500():
    ole = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 64
    with pytest.raises(UnsupportedStatement) as exc:
        parse_statement(ole, "old.xls")
    assert "save as .xlsx or CSV" in str(exc.value)


def test_html_disguised_as_xls_is_refused_with_advice():
    with pytest.raises(UnsupportedStatement) as exc:
        parse_statement(b"<html><table><tr><td>Date</td></tr></table></html>", "stmt.xls")
    assert "HTML" in str(exc.value)


def test_file_without_a_transaction_table_is_refused():
    with pytest.raises(UnsupportedStatement):
        parse_statement(b"Account Name: X\nNothing else here\n", "notes.txt")


def test_single_signed_amount_column_with_dr_cr_marker():
    text = (
        "Date,Particulars,Amount,Dr/Cr,Balance\n"
        "2026-07-01,OPENING,0,,1000\n"
        "2026-07-02,PURCHASE,250.50,Dr,749.50\n"
        "2026-07-03,SALE,1200,Cr,1949.50\n"
    )
    parsed = parse_statement(text.encode(), "x.csv")
    debits = [l.debit for l in parsed.lines]
    credits = [l.credit for l in parsed.lines]
    assert debits == [Decimal("0"), Decimal("250.50"), Decimal("0")]
    assert credits == [Decimal("0"), Decimal("0"), Decimal("1200")]


@pytest.mark.parametrize("text,expected", [
    ("27 Apr 2026 ", date(2026, 4, 27)),
    ("07-May-2026", date(2026, 5, 7)),
    ("01/05/26", date(2026, 5, 1)),
    ("2026-05-01", date(2026, 5, 1)),
    ("01/05/2026 13:45:10", date(2026, 5, 1)),
    ("Opening Balance", None),
    ("", None),
])
def test_parse_date_handles_bank_formats(text, expected):
    assert parse_date(text) == expected


@pytest.mark.parametrize("text,expected", [
    ("4,100.00", Decimal("4100.00")),
    ("1,23,500.00", Decimal("123500.00")),
    (" ", Decimal("0")),
    ("(250.00)", Decimal("-250.00")),
    ("1,200.00 Cr", Decimal("1200.00")),
    ("₹ 99.5", Decimal("99.5")),
    (4100.0, Decimal("4100.0")),
])
def test_parse_amount_handles_bank_formats(text, expected):
    assert parse_amount(text) == expected


def test_header_detection_needs_a_date_and_a_money_column():
    assert map_columns(["Account Name", ":", "EXAMPLE"]) == {}
    assert map_columns(["Txn Date", "Description", "Debit", "Credit", "Balance"]) == {
        "txn_date": 0, "description": 1, "debit": 2, "credit": 3, "balance": 4,
    }


def test_endpoint_uses_the_parser_and_answers_400_for_bad_files():
    """The endpoint must not call openpyxl directly any more, and must turn an
    UnsupportedStatement into a 400 with the parser's message."""
    import io as _io
    from pathlib import Path
    src = _io.open(Path(__file__).resolve().parents[1] / "app" / "api" / "v1" / "banking.py", encoding="utf-8").read()
    assert "openpyxl.load_workbook" not in src
    assert "parse_statement(" in src
    assert "except UnsupportedStatement" in src
    assert "status_code=400" in src
