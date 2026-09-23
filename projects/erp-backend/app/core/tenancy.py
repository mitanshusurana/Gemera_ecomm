"""Resolve a company's own fiscal year, stock location and unit of measure.

Every posting module used to do the same two-step lookup:

    SELECT id FROM caratloop.fiscal_years WHERE company_id = :cid AND is_active
    -- and if that found nothing --
    SELECT id FROM caratloop.fiscal_years LIMIT 1

The second query has no company filter. On a database with more than one
company -- which the schema is built for, company_id is on every table -- a
company with no active fiscal year silently posted into *another company's*
fiscal year. The same fallback existed for stock_locations, so stock moved into
a vault belonging to a different legal entity, and the stock ledger of both
companies became wrong with nothing in the audit log to show it.

Separate books per entity are not optional: each company is a separate GSTIN
and a separate set of books of account. So these resolvers refuse rather than
guess. A company that is not set up fails loudly on the first posting attempt,
which is recoverable; cross-posted ledgers are not.

units_of_measure is a global table (no company_id), so there is no tenancy
problem there -- but falling back to "any UoM" was its own bug: a material
declared in carats was recorded in kilograms, off by a factor of 5000. It also
refuses.
"""

from __future__ import annotations

from typing import Any, Mapping

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def resolve_fiscal_year(db: AsyncSession, company_id: Any) -> Mapping[str, Any]:
    """The company's active fiscal year, as a mapping with id and year_label.

    Raises 409 if the company has none: posting cannot pick a period on the
    caller's behalf, because the period determines which return the document
    lands in and whether it is locked.
    """
    res = await db.execute(
        text(
            "SELECT id, year_label FROM caratloop.fiscal_years "
            "WHERE company_id = :cid AND is_active = TRUE LIMIT 1"
        ),
        {"cid": str(company_id)},
    )
    fy = res.mappings().first()
    if fy is None:
        raise HTTPException(
            status_code=409,
            detail=(
                "No active fiscal year for this company. Open one under "
                "Masters > Fiscal Years before posting."
            ),
        )
    return fy


async def resolve_stock_location(db: AsyncSession, company_id: Any) -> Any:
    """The company's default stock location id.

    Prefers the location the company marked as its default. Falling back to
    "first by code" alone picked KW-01, the karigar's workshop, so received
    goods were booked as if already issued to an outworker. Code order is kept
    only as a tie-break for companies predating is_default, so the answer is at
    least stable between calls.
    """
    res = await db.execute(
        text(
            "SELECT id FROM caratloop.stock_locations "
            "WHERE company_id = :cid AND is_active = TRUE "
            "ORDER BY is_default DESC, code LIMIT 1"
        ),
        {"cid": str(company_id)},
    )
    loc_id = res.scalar()
    if loc_id is None:
        raise HTTPException(
            status_code=409,
            detail=(
                "No active stock location for this company. Create one under "
                "Masters > Stock Locations before posting stock."
            ),
        )
    return loc_id


async def resolve_uom(db: AsyncSession, code: str | None) -> Any:
    """The unit of measure with this code.

    Refuses an unknown code instead of substituting an arbitrary unit: grams
    and carats differ by a factor of five, and the substitution is invisible
    once the stock ledger is written.
    """
    if not code or not str(code).strip():
        raise HTTPException(status_code=422, detail="Unit of measure is required.")
    res = await db.execute(
        text("SELECT id FROM caratloop.units_of_measure WHERE code = :code LIMIT 1"),
        {"code": str(code).strip()},
    )
    uom_id = res.scalar()
    if uom_id is None:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown unit of measure '{code}'.",
        )
    return uom_id


async def resolve_default_uom(db: AsyncSession) -> Any:
    """The unit a line falls back to when the document carries no unit.

    Purchase lines have no UoM field in the payload, so the material's own unit
    is used where there is a material and 'pcs' otherwise -- an explicit,
    documented default rather than "whichever row came back first".
    """
    res = await db.execute(
        text("SELECT id FROM caratloop.units_of_measure WHERE code = 'pcs' LIMIT 1")
    )
    uom_id = res.scalar()
    if uom_id is None:
        raise HTTPException(
            status_code=500,
            detail="Units of measure are not seeded; run database migrations.",
        )
    return uom_id
