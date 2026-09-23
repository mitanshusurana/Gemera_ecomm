"""Inventory costing.

No costing method existed. Two consequences, both structural:

  * No cost of goods sold was ever posted. Sales credited revenue and debited
    the customer, but nothing moved value out of the stock account, so gross
    profit equalled revenue and the balance sheet carried stock that had
    already been sold.
  * The stock ledger recorded the *selling* price on an outward movement
    (``line_total``, tax inclusive). Any average derived from the ledger was
    therefore contaminated by margin and by GST.

METHOD: weighted average cost.

AS 2 / Ind AS 2 permit FIFO or weighted average and prohibit LIFO, and require
the chosen method to be applied consistently. Weighted average is used here
because gold and bullion are fungible -- one gram of 22K is not distinguishable
from another -- and because it is already what the Rule 56(2) stock register
reports, so the ledger, the register and the accounts agree.

Switching to FIFO would be an accounting-policy change with disclosure
consequences, not a refactor. It is deliberately not a runtime toggle.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.money import ZERO, round_money, to_decimal

logger = logging.getLogger(__name__)

COSTING_METHOD = "weighted_average"

# Falls back per material category, mirroring the mapping production uses.
_STOCK_ACCOUNT_BY_CATEGORY = (
    "CASE m.category "
    "WHEN 'Gold' THEN 'STK-001' "
    "WHEN 'Silver' THEN 'STK-003' "
    "WHEN 'Diamond' THEN 'STK-004' "
    "WHEN 'Ruby' THEN 'STK-005' "
    "WHEN 'Emerald' THEN 'STK-006' "
    "WHEN 'Sapphire' THEN 'STK-007' "
    "ELSE 'STK-008' END"
)


async def weighted_average_cost(
    db: AsyncSession,
    company_id,
    material_id,
) -> Decimal:
    """Cost per unit, averaged over inward movements only.

    Outward rows are excluded deliberately: an issue does not create cost, and
    including them would fold the sale price back into the average.
    """
    res = await db.execute(
        text(
            "SELECT COALESCE(SUM(amount), 0) AS total_amount, "
            "       COALESCE(SUM(quantity), 0) AS total_qty "
            "FROM caratloop.stock_ledger_entries "
            "WHERE company_id = :cid AND material_id = :mid AND direction = 'I'"
        ),
        {"cid": str(company_id), "mid": str(material_id)},
    )
    row = res.mappings().first()
    if not row:
        return ZERO

    qty = to_decimal(row["total_qty"])
    if qty <= 0:
        return ZERO

    return to_decimal(row["total_amount"]) / qty


async def cost_of_goods_sold(
    db: AsyncSession,
    company_id,
    material_id,
    quantity,
) -> Decimal:
    """Value of an outward movement at weighted average cost."""
    rate = await weighted_average_cost(db, company_id, material_id)
    return round_money(to_decimal(quantity) * rate)


async def resolve_stock_account(db: AsyncSession, company_id, material_id) -> str | None:
    """The material's stock account, else the category default."""
    res = await db.execute(
        text(
            "SELECT m.stock_account_id, a.id AS fallback_id "
            "FROM caratloop.materials m "
            "LEFT JOIN caratloop.accounts a "
            "  ON a.company_id = m.company_id AND a.code = " + _STOCK_ACCOUNT_BY_CATEGORY + " "
            "WHERE m.id = :mid AND m.company_id = :cid LIMIT 1"
        ),
        {"mid": str(material_id), "cid": str(company_id)},
    )
    row = res.mappings().first()
    if not row:
        return None
    return str(row["stock_account_id"] or row["fallback_id"] or "") or None


async def account_id_for_code(db: AsyncSession, company_id, code: str) -> str | None:
    res = await db.execute(
        text(
            "SELECT id FROM caratloop.accounts "
            "WHERE company_id = :cid AND code = :code LIMIT 1"
        ),
        {"cid": str(company_id), "code": code},
    )
    found = res.scalar()
    return str(found) if found else None
