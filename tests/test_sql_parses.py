"""Every raw SQL statement in the application must parse.

The ERP issues ~240 hand-written SQL statements. Python does not check them and
neither did anything else, so a syntax error surfaced only when a user reached
that endpoint in production. libpg_query is PostgreSQL's own parser, so this
rejects exactly what the server would.

Statements are found by walking the AST rather than by regex. Python folds
adjacent string literals at parse time, so an implicitly concatenated query --

    text(
        "SELECT ... "
        "WHERE ..."
    )

-- arrives as a single constant. A regex over the source missed all eleven of
those, silently shrinking coverage without failing.

This does not check that tables, columns or functions exist: that is
test_schema_covers_queries.py for relations, and a live database for the rest.
"""

from __future__ import annotations

import ast
import io
import re
from pathlib import Path

import pytest
from pglast import parse_sql
from pglast.parser import ParseError

APP = Path("app")

SQL_FILES = sorted(p for p in APP.rglob("*.py") if "__pycache__" not in str(p))

BIND = re.compile(r"(?<![:\w]):\w+")


def _sql_calls(tree: ast.AST):
    """Yield (lineno, sql, is_dynamic) for every ``text(...)`` call."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
        if name != "text" or not node.args:
            continue

        arg = node.args[0]
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            yield node.lineno, arg.value, False
        elif isinstance(arg, ast.JoinedStr):
            # An f-string in SQL is how the audit-path injection existed.
            parts = [
                p.value if isinstance(p, ast.Constant) else "'x'" for p in arg.values
            ]
            yield node.lineno, "".join(str(p) for p in parts), True


def _statements():
    for path in SQL_FILES:
        src = io.open(path, encoding="utf-8").read()
        try:
            tree = ast.parse(src)
        except SyntaxError:  # the compile check covers this case
            continue
        for lineno, sql, dynamic in _sql_calls(tree):
            yield path, lineno, sql, dynamic


CASES = list(_statements())


def test_there_are_statements_to_check():
    """Guard against the extractor silently matching nothing."""
    assert len(CASES) > 200, (
        f"only {len(CASES)} SQL statements found; the extractor may be broken"
    )


def test_no_sql_is_built_by_f_string():
    """f-string interpolation into SQL is how the audit-path injection arose."""
    dynamic = [f"{p.as_posix()}:{ln}" for p, ln, _, is_dyn in CASES if is_dyn]
    assert not dynamic, (
        "SQL assembled with an f-string (use bound parameters): " + ", ".join(dynamic)
    )


@pytest.mark.parametrize(
    "path,line,sql",
    [(p, ln, s) for p, ln, s, _ in CASES],
    ids=[f"{p.name}:{ln}" for p, ln, _, _ in CASES],
)
def test_statement_parses(path, line, sql):
    # Bind parameters become literals so the parser sees well-formed SQL.
    candidate = BIND.sub("'x'", sql)
    candidate = candidate.replace("::'x'", "::text")

    try:
        parse_sql(candidate)
    except ParseError as e:
        pytest.fail(
            f"{path.as_posix()}:{line} does not parse: {e}\n---\n{sql.strip()[:400]}"
        )
