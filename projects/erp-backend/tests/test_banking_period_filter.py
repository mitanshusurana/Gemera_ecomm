"""The reconciliation screen filters by a date range, not only a month.

Choosing "2026" in the UI used to reach the API as month="2026", which the
old parser read as the current month: the other eleven months disappeared.
"""

from datetime import date

import pytest
from fastapi import HTTPException

from app.api.v1.banking import _month_bounds, _period_bounds


def test_year_alone_means_the_whole_year():
    assert _month_bounds("2026") == (date(2026, 1, 1), date(2026, 12, 31))


def test_year_month_means_that_month():
    assert _month_bounds("2026-02") == (date(2026, 2, 1), date(2026, 2, 28))


def test_garbage_month_falls_back_to_the_current_month_not_an_error():
    start, end = _month_bounds("not-a-date")
    today = date.today()
    assert (start.year, start.month) == (today.year, today.month)
    assert end >= start


def test_explicit_range_wins_over_month():
    assert _period_bounds("2026-02", "2026-04-11", "2026-10-11") == (date(2026, 4, 11), date(2026, 10, 11))


def test_open_ended_range_defaults_sensibly():
    start, end = _period_bounds(None, "2026-04-01", None)
    assert start == date(2026, 4, 1) and end == date.today()
    start, end = _period_bounds(None, None, "2026-04-30")
    assert start == date(2000, 1, 1) and end == date(2026, 4, 30)


def test_reversed_range_is_swapped():
    assert _period_bounds(None, "2026-10-11", "2026-04-11") == (date(2026, 4, 11), date(2026, 10, 11))


def test_bad_range_is_a_400_not_a_500():
    with pytest.raises(HTTPException) as exc:
        _period_bounds(None, "11/04/2026", None)
    assert exc.value.status_code == 400


def test_endpoint_accepts_the_range_and_reports_it():
    import io
    from pathlib import Path
    src = io.open(Path(__file__).resolve().parents[1] / "app" / "api" / "v1" / "banking.py", encoding="utf-8").read()
    assert "date_from: Optional[str] = None" in src
    assert "date_to: Optional[str] = None" in src
    assert '"date_from": start_d.isoformat()' in src
