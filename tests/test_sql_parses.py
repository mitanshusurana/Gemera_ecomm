"""Every raw SQL statement in the application must parse.

The ERP issues ~90 hand-written SQL statements. Python does not check them, and
neither did anything else, so a syntax error surfaced only when a user hit that
endpoint in production. libpg_query is PostgreSQL's own parser, so this catches
exactly what the server would reject.

It does not check that tables, columns or functions exist -- that is
test_schema_covers_queries.py for relations, and a live database for the rest.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

import pytest
from pglast import parse_sql
from pglast.parser import ParseError

APP = Path("app")

SQL_FILES = sorted(
    p for p in APP.rglob("*.py") if "__pycache__" not in str(p)
)

# text(""" ... """) and text(" ... ")
TRIPLE = re.compile(r'text\(\s*"""(.*?)"""\s*[,)]', re.S)
SINGLE = re.compile(r'text\(\s*"((?:[^"\\]|\\.)+)"\s*[,)]')

BIND = re.compile(r"(?<![:\w]):\w+")
# f-string interpolations inside SQL (should be none left, but do not crash on one)
FSTRING = re.compile(r"\{[^}]*\}")


def _statements():
    for path in SQL_FILES:
        src = io.open(path, encoding="utf-8").read()
        for m in TRIPLE.finditer(src):
            yield path, src[: m.start()].count("\n") + 1, m.group(1)
        for m in SINGLE.finditer(src):
            # No keyword filter: everything inside SQLAlchemy's text() is SQL
            # by definition. Filtering on a leading SELECT/INSERT meant a typo
            # in that very keyword removed the statement from checking instead
            # of failing it -- the suite silently shrank rather than going red.
            yield path, src[: m.start()].count(chr(10)) + 1, m.group(1)


CASES = list(_statements())


def test_there_are_statements_to_check():
    """Guard against the extractor silently matching nothing."""
    assert len(CASES) > 50, f"only {len(CASES)} SQL statements found; extractor may be broken"


@pytest.mark.parametrize(
    "path,line,sql",
    CASES,
    ids=[f"{p.name}:{ln}" for p, ln, _ in CASES],
)
def test_statement_parses(path, line, sql):
    # Bind parameters and any interpolation are replaced with a literal so the
    # parser sees well-formed SQL.
    candidate = FSTRING.sub("'x'", sql)
    candidate = BIND.sub("'x'", candidate)
    candidate = candidate.replace("::'x'", "::text")

    try:
        parse_sql(candidate)
    except ParseError as e:
        pytest.fail(f"{path.as_posix()}:{line} does not parse: {e}\n---\n{sql.strip()[:400]}")
