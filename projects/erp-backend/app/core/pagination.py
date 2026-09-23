"""Pagination for list endpoints.

Every list endpoint but one returned its entire table with no LIMIT.
``list_sales_invoices`` returned every invoice ever raised; on a real ledger
that is a slow query, a large response, and eventually a timeout that takes the
worker with it.

Defaults are deliberately modest and the cap is hard, so a client cannot ask
for the whole table by passing a large limit.
"""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Query

DEFAULT_LIMIT = 100
MAX_LIMIT = 1000


@dataclass(frozen=True)
class Page:
    limit: int
    offset: int

    def apply(self, sql: str) -> str:
        """Append LIMIT/OFFSET placeholders to a query."""
        return sql.rstrip().rstrip(";") + " LIMIT :_limit OFFSET :_offset"

    @property
    def params(self) -> dict:
        return {"_limit": self.limit, "_offset": self.offset}

    def envelope(self, rows) -> dict:
        """Wrap results so a caller can tell a full page from the last one."""
        return {
            "limit": self.limit,
            "offset": self.offset,
            "count": len(rows),
            "has_more": len(rows) == self.limit,
        }


def paginate(
    limit: int = Query(
        DEFAULT_LIMIT,
        ge=1,
        le=MAX_LIMIT,
        description=f"Rows to return (max {MAX_LIMIT}).",
    ),
    offset: int = Query(0, ge=0, description="Rows to skip."),
) -> Page:
    """FastAPI dependency supplying validated pagination bounds."""
    return Page(limit=limit, offset=offset)
