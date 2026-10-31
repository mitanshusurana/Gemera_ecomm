"""Parse a bank statement export into statement lines.

Indian banks export "Excel" statements that are rarely Excel. SBI's online
banking "xls" download is a tab-separated text file with ~18 header lines
(account name, IFSC, period) before the column row; HDFC and ICICI ship
comma- or tab-delimited text with their own column names; some give a real
.xlsx. The importer used to hand everything to openpyxl, which rejected the
SBI file with "File is not a zip file" and a 500, and even for real
workbooks it assumed ISO dates (anything else became *today*) and plain
numbers (``4,100.00`` failed).

This module recognises the format from the bytes, finds the header row by
its column names, maps the columns through a synonym table, and parses
Indian date and amount formats. Rows without a parseable date (the account
header, blank separators, the "computer generated statement" footer) are
skipped and counted. No database access: the endpoint owns persistence.
"""

from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Iterable, Optional, Sequence


class UnsupportedStatement(ValueError):
    """The file cannot be read; the message is safe to show to the user."""


@dataclass
class StatementLine:
    txn_date: date
    value_date: date
    description: str
    ref_no: str
    debit: Decimal
    credit: Decimal
    balance: Decimal


@dataclass
class ParsedStatement:
    format: str                     # "xlsx", "tsv", "csv"
    lines: list[StatementLine] = field(default_factory=list)
    skipped_rows: int = 0           # rows after the header with no usable date
    columns: dict[str, int] = field(default_factory=dict)


# ─── column synonyms ──────────────────────────────────────────────────────────
# Keys are canonical names; values are header texts as banks print them,
# compared after lower-casing and collapsing punctuation/whitespace.
SYNONYMS: dict[str, tuple[str, ...]] = {
    "txn_date": ("txn date", "transaction date", "tran date", "trans date", "date", "posting date", "txn posted date"),
    "value_date": ("value date", "val date", "value dt"),
    "description": ("description", "narration", "particulars", "remarks", "transaction remarks", "details",
                    "transaction details", "transaction description"),
    "ref_no": ("ref no cheque no", "ref no", "reference no", "reference", "cheque no", "chq no", "chq ref no",
               "chq ref number", "cheque number", "utr", "utr no", "ref number"),
    "debit": ("debit", "debit amount", "withdrawal", "withdrawals", "withdrawal amt", "withdrawal amount",
              "withdrawal amt inr", "dr", "dr amount", "debit amt"),
    "credit": ("credit", "credit amount", "deposit", "deposits", "deposit amt", "deposit amount",
               "deposit amt inr", "cr", "cr amount", "credit amt"),
    "balance": ("balance", "closing balance", "running balance", "available balance", "balance inr",
                "closing balance inr", "bal"),
    "amount": ("amount", "transaction amount", "amount inr", "txn amount"),
    "dr_cr": ("dr cr", "type", "cr dr", "dr cr indicator", "transaction type"),
}

_NORMALISE = re.compile(r"[^a-z0-9]+")


def _norm(text: object) -> str:
    return _NORMALISE.sub(" ", str(text or "").lower()).strip()


def _lookup(cell: str) -> Optional[str]:
    n = _norm(cell)
    if not n:
        return None
    for canon, names in SYNONYMS.items():
        if n in names:
            return canon
    return None


def map_columns(row: Sequence[object]) -> dict[str, int]:
    """Canonical column -> index for a header row; empty when it is not one."""
    found: dict[str, int] = {}
    for i, cell in enumerate(row):
        canon = _lookup(str(cell) if cell is not None else "")
        if canon and canon not in found:
            found[canon] = i
    # A header has a date and at least one money column.
    if "txn_date" in found and ({"debit", "credit", "amount"} & found.keys()):
        return found
    return {}


# ─── value parsing ────────────────────────────────────────────────────────────
_DATE_FORMATS = (
    "%d %b %Y", "%d-%b-%Y", "%d/%b/%Y", "%d %B %Y", "%d-%B-%Y",
    "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y",
    "%Y-%m-%d", "%Y/%m/%d",
    "%d %b %y", "%d-%b-%y", "%d/%m/%y", "%d-%m-%y",
    "%d %b %Y %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M",
)


def parse_date(value: object) -> Optional[date]:
    """A date from an Excel cell or a bank's text; None when it is not one."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip().strip("'\"")
    if not text:
        return None
    text = re.sub(r"\s+", " ", text)
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    # "27 Apr 2026 12:30" and similar: try the leading date token(s).
    m = re.match(r"^(\d{1,2}[ /.-][A-Za-z]{3,9}[ /.-]\d{2,4}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})", text)
    if m and m.group(1) != text:
        return parse_date(m.group(1))
    return None


_AMOUNT_JUNK = re.compile(r"[₹$,\s]|rs\.?|inr", re.I)


def parse_amount(value: object) -> Decimal:
    """``'4,100.00'``, ``'(250.00)'``, ``'1,200.00 Cr'`` and numbers to Decimal; blanks are 0."""
    if value is None:
        return Decimal("0")
    if isinstance(value, bool):
        return Decimal("0")
    if isinstance(value, (int, Decimal)):
        return Decimal(value)
    if isinstance(value, float):
        return Decimal(str(value))
    text = str(value).strip()
    if not text or text in {"-", "--", "nil", "NIL"}:
        return Decimal("0")
    negative = text.startswith("(") and text.endswith(")")
    suffix = text[-2:].lower()
    if suffix in {"dr", "cr"}:
        text = text[:-2]
    text = _AMOUNT_JUNK.sub("", text).strip("()")
    if text.startswith("-"):
        negative = True
        text = text[1:]
    if not text:
        return Decimal("0")
    try:
        amount = Decimal(text)
    except InvalidOperation:
        return Decimal("0")
    return -amount if negative else amount


def _cell(row: Sequence[object], idx: Optional[int]) -> object:
    if idx is None or idx >= len(row):
        return None
    return row[idx]


def _text(value: object) -> str:
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


# ─── row pipeline ─────────────────────────────────────────────────────────────
def parse_rows(rows: Iterable[Sequence[object]], fmt: str) -> ParsedStatement:
    """Shared pipeline for worksheet rows and delimited text rows."""
    result = ParsedStatement(format=fmt)
    cols: dict[str, int] = {}
    for row in rows:
        if not cols:
            cols = map_columns(row)
            if cols:
                result.columns = cols
            continue
        txn = parse_date(_cell(row, cols.get("txn_date")))
        if txn is None:
            # account header noise, blank lines, the footer, wrapped descriptions
            if any(_text(c) for c in row):
                result.skipped_rows += 1
            continue
        value = parse_date(_cell(row, cols.get("value_date"))) or txn
        description = _text(_cell(row, cols.get("description")))[:500]
        ref_no = _text(_cell(row, cols.get("ref_no"))).strip(" /")[:100]
        if "debit" in cols or "credit" in cols:
            debit = parse_amount(_cell(row, cols.get("debit")))
            credit = parse_amount(_cell(row, cols.get("credit")))
        else:
            # Single signed/typed amount column.
            amount = parse_amount(_cell(row, cols.get("amount")))
            kind = _norm(_cell(row, cols.get("dr_cr"))) if "dr_cr" in cols else ""
            raw = _text(_cell(row, cols.get("amount"))).lower()
            is_debit = kind.startswith("dr") or kind.startswith("debit") or raw.endswith("dr") or amount < 0
            debit, credit = (abs(amount), Decimal("0")) if is_debit else (Decimal("0"), abs(amount))
        balance = parse_amount(_cell(row, cols.get("balance")))
        result.lines.append(StatementLine(
            txn_date=txn, value_date=value, description=description, ref_no=ref_no,
            debit=abs(debit), credit=abs(credit), balance=balance,
        ))
    if not result.columns:
        raise UnsupportedStatement(
            "Could not find the transaction table: no row with a Date column and a Debit/Credit "
            "(or Withdrawal/Deposit) column. Export the statement as Excel or CSV from internet banking."
        )
    return result


# ─── format detection ─────────────────────────────────────────────────────────
_ZIP_MAGIC = b"PK\x03\x04"
_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


def _decode(content: bytes) -> str:
    for enc in ("utf-8-sig", "utf-16", "cp1252", "latin-1"):
        try:
            text = content.decode(enc)
        except UnicodeDecodeError:
            continue
        if enc == "utf-16" and "\x00" in text:
            continue
        return text
    return content.decode("latin-1", errors="replace")


def _delimited_rows(text: str) -> tuple[list[list[str]], str]:
    lines = [ln for ln in text.splitlines()]
    sample = "\n".join(lines[:60])
    if "\t" in sample:
        delim, fmt = "\t", "tsv"
    else:
        try:
            delim = csv.Sniffer().sniff(sample, delimiters=",;|").delimiter
        except csv.Error:
            delim = ","
        fmt = "csv"
    reader = csv.reader(io.StringIO(text), delimiter=delim)
    return [[c.strip() for c in row] for row in reader], fmt


def parse_statement(content: bytes, filename: str = "") -> ParsedStatement:
    """Entry point: bytes of the uploaded file to a ParsedStatement."""
    if not content or not content.strip():
        raise UnsupportedStatement("The uploaded file is empty.")
    head = content[:8]
    if head.startswith(_ZIP_MAGIC):
        try:
            import openpyxl  # local import keeps text parsing free of the dependency
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
        except Exception as exc:  # noqa: BLE001 - any workbook error is a user-facing format error
            raise UnsupportedStatement(f"The Excel file could not be read ({exc.__class__.__name__}).") from exc
        sheet = wb.active
        rows = [list(r) for r in sheet.iter_rows(values_only=True)]
        return parse_rows(rows, "xlsx")
    if head.startswith(_OLE_MAGIC):
        raise UnsupportedStatement(
            "This is a legacy binary Excel (.xls) workbook. Open it in Excel and save as .xlsx or CSV, "
            "or download the statement again as CSV/Excel from internet banking."
        )
    lowered = content[:512].lower()
    if b"<html" in lowered or b"<table" in lowered or b"<!doctype" in lowered:
        raise UnsupportedStatement(
            "This file is an HTML page saved as .xls. Download the statement as CSV or Excel instead."
        )
    rows, fmt = _delimited_rows(_decode(content))
    return parse_rows(rows, fmt)
