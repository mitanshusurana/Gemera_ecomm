"""Stock availability guards.

No endpoint checked available quantity before recording an outward movement, so
the ledger happily went negative: a sale could ship stock that was never
purchased, and production could consume raw gold the business does not hold.
For physical gold and gemstone inventory an unexplained negative balance is
also an unauditable shrinkage vector.

The balance is derived from the ledger rather than a cached column, so it
cannot drift from the movements that produced it.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.money import to_decimal

logger = logging.getLogger(__name__)


async def current_balance(
    db: AsyncSession,
    company_id,
    material_id,
    location_id=None,
) -> Decimal:
    """Net quantity on hand for a material, optionally at one location."""
    sql = (
        "SELECT COALESCE(SUM(CASE WHEN direction = 'I' THEN quantity "
        "                         ELSE -quantity END), 0) "
        "FROM caratloop.stock_ledger_entries "
        "WHERE company_id = :cid AND material_id = :mid"
    )
    params = {"cid": str(company_id), "mid": str(material_id)}
    if location_id:
        sql += " AND location_id = :loc"
        params["loc"] = str(location_id)

    res = await db.execute(text(sql), params)
    return to_decimal(res.scalar())


async def assert_stock_available(
    db: AsyncSession,
    company_id,
    material_id,
    quantity,
    *,
    location_id=None,
    context: str = "this movement",
    material_label: str | None = None,
) -> Decimal:
    """Refuse an outward movement that would drive the balance negative.

    Returns the balance before the movement. Raises HTTP 409 (conflict) rather
    than 400: the request is well-formed, the stock simply is not there.
    """
    wanted = to_decimal(quantity)
    if wanted <= 0:
        return await current_balance(db, company_id, material_id, location_id)

    available = await current_balance(db, company_id, material_id, location_id)

    if wanted > available:
        label = material_label or str(material_id)
        logger.warning(
            "Refusing %s: material %s has %s available, %s requested.",
            context, label, available, wanted,
        )
        raise HTTPException(
            status_code=409,
            detail=(
                f"Insufficient stock for {label}: {available} available, "
                f"{wanted} required for {context}. No data was saved."
            ),
        )

    return available
