"""GSTR-1 ``fp`` and GSTR-3B ``ret_period`` are MMYYYY, the portal's format.

The register stores periods as YYYY-MM. The GSTR-1 export wrote ``fp`` as
YYYYMM ('202609'), which the offline tool rejects; GSTR-3B already wrote
'092026'. One helper now serves both.
"""

from __future__ import annotations

import io
import re
from pathlib import Path

import pytest

from app.api.v1.gst import portal_period

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("period, expected", [
    ("2026-09", "092026"),
    ("2026-04", "042026"),
    ("2027-03", "032027"),
    ("202609", "092026"),       # already digits: still YYYY first
])
def test_portal_period_is_mmyyyy(period, expected):
    assert portal_period(period) == expected


@pytest.mark.parametrize("bad", ["2026-13", "2026-00", "2026", "", "09/2026/1"])
def test_malformed_periods_are_refused(bad):
    with pytest.raises(ValueError):
        portal_period(bad)


def test_both_exports_use_the_helper():
    src = io.open(ROOT / "app" / "api" / "v1" / "gst.py", encoding="utf-8").read()
    assert re.search(r'"fp":\s*portal_period\(period\)', src)
    assert re.search(r'"ret_period":\s*portal_period\(period\)', src)
    assert 'period.replace("-", "")' not in src
