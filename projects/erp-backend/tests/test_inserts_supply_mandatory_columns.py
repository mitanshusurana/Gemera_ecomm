"""Every INSERT the application issues must supply every mandatory column.

test_schema_covers_queries.py asks whether a referenced table or column exists.
That is not enough: the sales-cancellation reversal named only columns that
exist, omitted four that are NOT NULL with no default, and so returned 500 on
every call. The job-work challan and receipt failed the same way on
stock_ledger_entries.sequence_no, which meant goods could not be sent to a
karigar or received back at all.

Nothing catches that class of bug at import time, and it only shows up when
someone exercises the endpoint. This test reads the migrations for the
mandatory columns of each table and the application for the columns each
INSERT names, and compares them -- no database required.
"""

from __future__ import annotations

import ast
import io
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"
SQL = ROOT / "migrations" / "sql"

INSERT_RE = re.compile(
    r"INSERT\s+INTO\s+caratloop\.([a-z_]\w*)\s*\(([^)]*)\)", re.I | re.S
)
CREATE_TABLE_RE = re.compile(
    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?caratloop\.([a-z_]\w*)\s*\((.*?)\n\);",
    re.I | re.S,
)
ADD_COLUMN_RE = re.compile(
    r"ALTER\s+TABLE\s+caratloop\.([a-z_]\w*)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"
    r"([a-z_]\w*)\s+([^;]*);",
    re.I | re.S,
)
# pg_dump writes a serial column as a plain NOT NULL column plus a separate
# statement attaching its sequence. Without reading those, every `id` looks
# mandatory and the real finding is buried under sixty false positives.
SET_DEFAULT_RE = re.compile(
    r"ALTER\s+TABLE\s+(?:ONLY\s+)?caratloop\.([a-z_]\w*)\s+"
    r"ALTER\s+COLUMN\s+([a-z_]\w*)\s+SET\s+DEFAULT",
    re.I,
)


def _strip_comments(sql: str) -> str:
    """Remove -- comments, leaving string literals alone.

    The job-work tables carry commented column definitions inside CREATE TABLE,
    and a naive split read the comment marker itself as a column named '--'.
    """
    out = []
    for line in sql.split("\n"):
        in_str = False
        cut = None
        i = 0
        while i < len(line):
            ch = line[i]
            if ch == "'":
                # '' inside a literal is an escaped quote, not a terminator.
                if in_str and i + 1 < len(line) and line[i + 1] == "'":
                    i += 2
                    continue
                in_str = not in_str
            elif ch == "-" and not in_str and line[i:i + 2] == "--":
                cut = i
                break
            i += 1
        out.append(line[:cut] if cut is not None else line)
    return "\n".join(out)


def _sql_text() -> str:
    raw = "\n".join(io.open(f, encoding="utf-8").read() for f in sorted(SQL.glob("*.sql")))
    return _strip_comments(raw)


def _column_is_mandatory(definition: str) -> bool:
    """NOT NULL and no DEFAULT: the caller has to provide a value."""
    d = " ".join(definition.split())
    if not re.search(r"\bNOT\s+NULL\b", d, re.I):
        return False
    if re.search(r"\bDEFAULT\b", d, re.I):
        return False
    if re.search(r"\b(BIGSERIAL|SERIAL|SMALLSERIAL|GENERATED)\b", d, re.I):
        return False
    return True


def mandatory_columns() -> dict[str, set[str]]:
    sql = _sql_text()
    out: dict[str, set[str]] = {}

    for table, body in CREATE_TABLE_RE.findall(sql):
        cols: set[str] = set()
        depth = 0
        current = ""
        for ch in body:
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            if ch == "," and depth == 0:
                pieces = current.strip()
                current = ""
                if pieces:
                    _collect(pieces, cols)
                continue
            current += ch
        if current.strip():
            _collect(current.strip(), cols)
        out[table.lower()] = cols

    # Columns given a default after the fact are not the caller's to supply.
    for table, col in SET_DEFAULT_RE.findall(sql):
        out.get(table.lower(), set()).discard(col.lower())

    # Columns the delta adds afterwards.
    for table, col, rest in ADD_COLUMN_RE.findall(sql):
        t = table.lower()
        if _column_is_mandatory(rest):
            out.setdefault(t, set()).add(col.lower())
        else:
            out.get(t, set()).discard(col.lower())

    return out


def _collect(piece: str, cols: set[str]) -> None:
    """Add `piece` to `cols` if it declares a mandatory column."""
    head = piece.split(None, 1)
    if not head:
        return
    name = head[0].strip('"').lower()
    if name in {"constraint", "primary", "unique", "foreign", "check", "exclude", "like"}:
        return
    if len(head) < 2:
        return
    if _column_is_mandatory(head[1]):
        cols.add(name)


def app_inserts():
    """(file, line, table, columns) for every INSERT written as a text() literal."""
    for f in sorted(APP.rglob("*.py")):
        if "__pycache__" in str(f):
            continue
        try:
            tree = ast.parse(io.open(f, encoding="utf-8").read())
        except SyntaxError:  # pragma: no cover
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            fname = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
            if fname != "text" or not node.args:
                continue
            arg = node.args[0]
            if not (isinstance(arg, ast.Constant) and isinstance(arg.value, str)):
                continue
            for m in INSERT_RE.finditer(arg.value):
                cols = {
                    c.strip().lower()
                    for c in m.group(2).replace("\n", " ").split(",")
                    if re.fullmatch(r"[a-z_]\w*", c.strip(), re.I)
                }
                yield f.relative_to(ROOT).as_posix(), node.lineno, m.group(1).lower(), cols


def test_the_extractors_actually_found_something():
    """A silent extraction failure would make the real test vacuous."""
    mandatory = mandatory_columns()
    assert len(mandatory) >= 30, f"parsed only {len(mandatory)} tables out of the SQL"
    assert "sequence_no" in mandatory.get("stock_ledger_entries", set())
    assert "sequence_no" in mandatory.get("journal_entries", set())
    # ...and columns the database fills in are not:
    assert "id" not in mandatory.get("journal_entries", set())
    assert "id" not in mandatory.get("stock_ledger_entries", set())
    inserts = list(app_inserts())
    assert len(inserts) >= 50, f"found only {len(inserts)} INSERT statements"


def test_no_insert_omits_a_mandatory_column():
    mandatory = mandatory_columns()
    gaps = []
    for path, lineno, table, supplied in app_inserts():
        need = mandatory.get(table)
        if not need:
            continue
        missing = sorted(need - supplied)
        if missing:
            gaps.append(f"{path}:{lineno} INSERT INTO {table} omits {', '.join(missing)}")
    assert not gaps, "INSERTs that cannot succeed:\n  " + "\n  ".join(gaps)
