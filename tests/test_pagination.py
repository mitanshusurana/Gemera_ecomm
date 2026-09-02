"""Pagination bounds, and a guard that every list endpoint stays bounded.

Seven of the eight list endpoints returned their entire table. The sales
register returned every invoice ever raised, which on a real ledger is a slow
query, a large response, and eventually a timeout that takes the worker with
it.
"""

from __future__ import annotations

import ast
import io
import re
from pathlib import Path

import pytest

from app.core.pagination import DEFAULT_LIMIT, MAX_LIMIT, Page, paginate

ENDPOINTS = sorted(
    p for p in Path("app/api/v1").glob("*.py") if p.name != "__init__.py"
)


def test_apply_appends_bounds():
    page = Page(limit=50, offset=100)
    assert page.apply("SELECT 1") == "SELECT 1 LIMIT :_limit OFFSET :_offset"


def test_apply_strips_a_trailing_semicolon():
    """LIMIT after a semicolon is a syntax error."""
    assert Page(10, 0).apply("SELECT 1;").endswith("LIMIT :_limit OFFSET :_offset")
    assert ";" not in Page(10, 0).apply("SELECT 1;")


def test_apply_tolerates_trailing_whitespace():
    sql = "SELECT 1\n    ORDER BY x  \n"
    assert Page(10, 0).apply(sql).endswith("LIMIT :_limit OFFSET :_offset")
    assert "ORDER BY x LIMIT" in Page(10, 0).apply(sql)


def test_params_are_bound_not_interpolated():
    page = Page(limit=25, offset=75)
    assert page.params == {"_limit": 25, "_offset": 75}


def test_envelope_reports_whether_more_rows_exist():
    page = Page(limit=3, offset=0)
    assert page.envelope([1, 2, 3])["has_more"] is True
    assert page.envelope([1, 2])["has_more"] is False
    assert page.envelope([])["count"] == 0


def test_defaults_are_modest_and_the_cap_is_hard():
    assert DEFAULT_LIMIT <= 200
    assert MAX_LIMIT <= 1000


def test_paginate_declares_the_right_bounds():
    """Inspect the declared Query metadata.

    Calling the dependency directly returns FastAPI Query objects rather than
    resolved values -- FastAPI substitutes them per request -- so assert on the
    declaration instead of the call result.
    """
    import inspect

    params = inspect.signature(paginate).parameters
    limit_q = params["limit"].default
    offset_q = params["offset"].default

    def bounds(q):
        # Pydantic v2 carries the constraints in annotated-types metadata
        # (Ge/Le) rather than as attributes on the Query object.
        out = {}
        for item in getattr(q, "metadata", []) or []:
            for attr in ("ge", "le", "gt", "lt"):
                if hasattr(item, attr):
                    out[attr] = getattr(item, attr)
        return out

    assert limit_q.default == DEFAULT_LIMIT
    lb = bounds(limit_q)
    assert lb.get("le") == MAX_LIMIT, "the cap must be enforced by FastAPI, not by convention"
    assert lb.get("ge") == 1, "a limit of 0 or negative must be rejected"

    assert offset_q.default == 0
    assert bounds(offset_q).get("ge") == 0


@pytest.mark.parametrize("path", ENDPOINTS, ids=lambda p: p.name)
def test_every_list_endpoint_is_bounded(path):
    """A new unbounded list endpoint must fail here rather than in production."""
    src = io.open(path, encoding="utf-8").read()
    unbounded = []

    for node in ast.walk(ast.parse(src)):
        if not isinstance(node, (ast.AsyncFunctionDef, ast.FunctionDef)):
            continue
        if not re.match(r"(list_|get_all)", node.name):
            continue
        seg = ast.get_source_segment(src, node) or ""
        if "page.apply" not in seg and "LIMIT" not in seg.upper():
            unbounded.append(node.name)

    assert not unbounded, (
        f"{path.name}: list endpoint(s) {unbounded} return every row. "
        "Add `page: Page = Depends(paginate)` and apply it to the query."
    )
