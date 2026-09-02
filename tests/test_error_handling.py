"""Exception handling invariants.

Two defects recurred across the endpoints:

  * ``except Exception`` that converts the error into an ``HTTPException(500)``
    without a preceding ``except HTTPException: raise`` rewrites deliberate 4xx
    responses as 500. With role guards, stock checks and the balance invariant
    now raising 4xx, this would mask all of them -- an "insufficient stock"
    refusal would reach the operator as a generic server error.
  * ``detail=str(e)`` returns the raw exception, leaking table and column names.

A narrow handler that merely falls back to a default (a failed bcrypt check, an
unparseable date, a third-party lookup) cannot swallow a 4xx and is not flagged.

These are structural checks over the source, cheap enough to run on every
commit without a database.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

import pytest

ENDPOINTS = sorted(
    p for p in Path("app/api/v1").glob("*.py") if p.name != "__init__.py"
)


def handler_body(src: str, header_pos: int, indent: str) -> str:
    """Body of the except block whose header starts at ``header_pos``.

    ``header_pos`` points into the 'except Exception' header line, so skip past
    that line first. Reading from the match end instead makes the first
    fragment the remainder of the header (' as e:'), which dedents immediately
    and leaves every body looking empty.
    """
    nl = src.find("\n", header_pos)
    if nl == -1:
        return ""
    lines = []
    for line in src[nl + 1:].split("\n"):
        if line.strip() and not line.startswith((indent + " ", indent + "\t")):
            break
        lines.append(line)
    return "\n".join(lines)


@pytest.mark.parametrize("path", ENDPOINTS, ids=lambda p: p.name)
def test_converting_handlers_guard_httpexception_first(path):
    src = io.open(path, encoding="utf-8").read()
    offenders = []

    for m in re.finditer(r"^([ \t]*)except Exception", src, re.M):
        indent = m.group(1)

        # Only handlers that turn the error into an HTTPException can swallow a
        # deliberate 4xx.
        if "raise HTTPException" not in handler_body(src, m.start(), indent):
            continue

        preceding = src[: m.start()]
        guard = re.search(
            r"\n" + re.escape(indent) + r"except HTTPException:[^\n]*\n"
            r"(?:" + re.escape(indent) + r"[ \t]+[^\n]*\n)*\Z",
            preceding,
        )
        if not guard:
            offenders.append(src[: m.start()].count("\n") + 1)

    assert not offenders, (
        f"{path.name}: 'except Exception' at line(s) {offenders} converts errors "
        "into an HTTPException without an 'except HTTPException: raise' before "
        "it, so deliberate 4xx responses become 500s"
    )


def test_the_guard_check_actually_detects_a_missing_guard():
    """Self-check: the detector above must not be vacuous.

    An earlier version read the handler body from the wrong offset, so every
    body was empty, nothing matched, and the test passed unconditionally.
    """
    sample = (
        "async def f(db):\n"
        "    try:\n"
        "        pass\n"
        "    except Exception as e:\n"
        "        await db.rollback()\n"
        "        raise HTTPException(status_code=500, detail=\"boom\") from e\n"
    )
    m = re.search(r"^([ \t]*)except Exception", sample, re.M)
    assert m is not None
    body = handler_body(sample, m.start(), m.group(1))
    assert "raise HTTPException" in body, "detector cannot see the handler body"


@pytest.mark.parametrize("path", ENDPOINTS, ids=lambda p: p.name)
def test_no_raw_exception_text_is_returned_to_the_client(path):
    src = io.open(path, encoding="utf-8").read()
    leaks = [
        src[: m.start()].count("\n") + 1
        for m in re.finditer(r"detail\s*=\s*(?:f?\"[^\"]*\{?str\(e\)|str\(e\))", src)
    ]
    assert not leaks, (
        f"{path.name}: raw exception text returned at line(s) {leaks}; "
        "this leaks schema details"
    )


def test_no_print_used_for_logging():
    offenders = []
    for path in ENDPOINTS:
        src = io.open(path, encoding="utf-8").read()
        for m in re.finditer(r"^\s*print\(", src, re.M):
            offenders.append(f"{path.name}:{src[: m.start()].count(chr(10)) + 1}")
    assert not offenders, f"print() used instead of the logger at {offenders}"
