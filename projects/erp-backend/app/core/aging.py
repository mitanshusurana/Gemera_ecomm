"""Age buckets for goods out on approval.

A jangad that has been out for a week is normal trade; one out for two months
is either a sale nobody invoiced or stock that is not coming back. The report
groups the open value by how long it has been out, per party and overall, so
the oldest are visible before they become a dispute.

Pure functions: the endpoint fetches the open lines and hands them here, so
the bucketing can be tested without a database.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Iterable, Mapping

from app.core.money import round_money, to_decimal

# Upper bound (inclusive, in days) of each bucket; the last is open-ended.
AGING_BUCKETS: tuple[tuple[str, int | None], ...] = (
    ("0-15", 15),
    ("16-30", 30),
    ("31-60", 60),
    ("61+", None),
)

BUCKET_LABELS: tuple[str, ...] = tuple(label for label, _ in AGING_BUCKETS)


def days_out(memo_date: date, as_of: date) -> int:
    """Days since the memo was issued, never negative.

    A memo dated tomorrow (a pre-dated dispatch, or a clock skew) is treated
    as issued today rather than given a negative age that would land in no
    bucket.
    """
    return max((as_of - memo_date).days, 0)


def aging_bucket(days: int) -> str:
    """The bucket label a memo of this age falls into."""
    if days < 0:
        days = 0
    for label, upper in AGING_BUCKETS:
        if upper is None or days <= upper:
            return label
    return AGING_BUCKETS[-1][0]  # pragma: no cover -- the None bucket catches all


def _empty_buckets() -> dict[str, Decimal]:
    return {label: Decimal("0.00") for label in BUCKET_LABELS}


def bucket_open_value(rows: Iterable[Mapping], as_of: date) -> dict:
    """Group open approval value into age buckets, per party and overall.

    Each row is one open memo (or memo line) carrying ``party_id``,
    ``party_name``, ``memo_date`` and ``open_value``. Rows with nothing
    outstanding contribute nothing but still register the party.
    """
    overall = _empty_buckets()
    parties: dict[str, dict] = {}

    for row in rows:
        value = round_money(to_decimal(row.get("open_value")))
        label = aging_bucket(days_out(row["memo_date"], as_of))
        pid = str(row["party_id"])

        party = parties.get(pid)
        if party is None:
            party = {
                "party_id": pid,
                "party_name": row.get("party_name"),
                "buckets": _empty_buckets(),
                "total": Decimal("0.00"),
                "memos": 0,
            }
            parties[pid] = party

        party["buckets"][label] += value
        party["total"] += value
        party["memos"] += 1
        overall[label] += value

    total = sum(overall.values(), Decimal("0.00"))
    ordered = sorted(parties.values(), key=lambda p: p["total"], reverse=True)
    return {
        "as_of": as_of,
        "bucket_labels": list(BUCKET_LABELS),
        "overall": overall,
        "total_open_value": total,
        "parties": ordered,
    }
