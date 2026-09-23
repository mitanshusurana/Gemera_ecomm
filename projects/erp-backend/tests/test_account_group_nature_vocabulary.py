"""Every `nature` literal the application compares against must be a value
chk_account_group_nature permits.

The profit-and-loss report filtered `ag.nature IN ('Revenue', 'Expenses')`
and the dashboard revenue series summed `ag.nature = 'Revenue'`. The CHECK on
account_groups permits Assets, Liabilities, Income, Expenses and Equity only,
so the revenue side of both reports was always zero -- with no error anywhere,
because a literal that matches nothing is perfectly valid SQL.

This reads the permitted values out of the migrations and every quoted
capitalised word on a source line that mentions `nature`, offline, and
compares them. It is deliberately broad: it looks at Python comparisons
(`r["nature"] == "Income"`, `group_by_nature("Assets", rows)`) as well as SQL
inside text() literals, since the same drift can happen on either side.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

from tests.test_check_constraint_vocabularies import permitted

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "app"

# Columns that happen to contain the word but are not account_groups.nature.
NOT_ACCOUNT_GROUP_NATURE = ("nature_of_work",)


def nature_literals():
    """(file, line, word) for every quoted capitalised word on a `nature` line."""
    for f in sorted(APP.rglob("*.py")):
        if "__pycache__" in str(f):
            continue
        for lineno, line in enumerate(io.open(f, encoding="utf-8").read().split("\n"), 1):
            scrubbed = line
            for other in NOT_ACCOUNT_GROUP_NATURE:
                scrubbed = scrubbed.replace(other, "")
            if not re.search(r"\bnature\b", scrubbed):
                continue
            for word in re.findall(r"""['"]([A-Z][A-Za-z]+)['"]""", scrubbed):
                yield f.relative_to(ROOT).as_posix(), lineno, word


def test_the_extractor_reads_the_constraint():
    assert permitted("chk_account_group_nature") == {
        "Assets", "Liabilities", "Income", "Expenses", "Equity",
    }


def test_the_scan_sees_the_reports_that_drifted():
    """If the scan found nothing the assertion below would be vacuous."""
    seen = {(path, word) for path, _, word in nature_literals()}
    assert ("app/api/v1/reports.py", "Income") in seen
    assert ("app/api/v1/reports.py", "Expenses") in seen


def test_every_nature_literal_is_permitted():
    """Catches 'Revenue', which chk_account_group_nature rejects."""
    allowed = permitted("chk_account_group_nature")
    offenders = sorted({
        f"{path}:{lineno} compares nature against '{word}'"
        for path, lineno, word in nature_literals()
        if word not in allowed
    })
    assert not offenders, (
        "account group natures the CHECK rejects:\n  "
        + "\n  ".join(offenders)
        + f"\n\npermitted: {', '.join(sorted(allowed))}"
    )
