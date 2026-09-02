"""
Caratloop ERP — Inventory API
[CGST Rule 56(2)] Stock Register for Manufacturers
"""
import logging
from typing import Optional, List
from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.core.database import get_db, set_audit_context
from app.core.roles import CAN_AMEND, CAN_MOVE_STOCK, require
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter()

class CreateItemRequest(BaseModel):
    code: str
    name: str
    category: str = "Gold"
    uom: str = "gm"
    hsn_code: str = "71131910"
    gst_tax_rate: float = 3.00
    making_gst_rate: float = 5.00
    purity_standard: Optional[str] = "916 BIS"
    opening_qty: float = 0.0
    reason: str = "Stock item creation"

class UpdateItemRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    hsn_code: Optional[str] = None
    gst_tax_rate: Optional[float] = None
    reason: str = "Stock item update"


@router.get("/stock-register")
async def get_stock_register(
    as_of_date: Optional[date] = None,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    [CGST Rule 56(2)] Commodity-wise Stock Register.
    """
    if not as_of_date:
        as_of_date = date.today()

    query = """
        WITH stock_agg AS (
            SELECT
                material_id,
                COALESCE(SUM(CASE WHEN direction = 'I' THEN quantity ELSE 0 END), 0) AS inward_qty,
                COALESCE(SUM(CASE WHEN direction = 'O' THEN quantity ELSE 0 END), 0) AS outward_qty,
                COALESCE(SUM(CASE WHEN direction = 'I' THEN quantity ELSE -quantity END), 0) AS current_stock,
                COALESCE(SUM(CASE WHEN direction = 'I' THEN COALESCE(net_weight, quantity) ELSE -COALESCE(net_weight, quantity) END), 0) AS closing_weight_gm,
                CASE
                    WHEN SUM(CASE WHEN direction = 'I' THEN quantity ELSE 0 END) > 0
                    THEN SUM(CASE WHEN direction = 'I' THEN amount ELSE 0 END) / SUM(CASE WHEN direction = 'I' THEN quantity ELSE 0 END)
                    ELSE 0
                END AS standard_rate
            FROM caratloop.stock_ledger_entries
            WHERE entry_date <= :as_of_date
            GROUP BY material_id
        )
        SELECT
            m.id,
            m.code AS material_code,
            m.name AS material_name,
            m.name,
            m.code,
            m.category,
            m.category AS group_name,
            m.hsn_code,
            m.gst_tax_rate,
            m.purity_standard,
            uom.code AS uom,
            uom.code AS unit,
            COALESCE(sa.inward_qty, 0) AS inward_qty,
            COALESCE(sa.outward_qty, 0) AS outward_qty,
            COALESCE(sa.current_stock, 0) AS current_stock,
            COALESCE(sa.closing_weight_gm, 0) AS closing_weight_gm,
            COALESCE(sa.standard_rate, 0) AS standard_rate,
            COALESCE(sa.current_stock, 0) * COALESCE(sa.standard_rate, 0) AS stock_value
        FROM caratloop.materials m
        JOIN caratloop.units_of_measure uom ON uom.id = m.uom_id
        LEFT JOIN stock_agg sa ON sa.material_id = m.id
        WHERE m.company_id = :cid AND m.is_active = TRUE
    """
    params = {"cid": current_user["company_id"], "as_of_date": as_of_date}
    if category:
        query += " AND m.category = :category"
        params["category"] = category
    query += " ORDER BY m.category, m.name"

    try:
        result = await db.execute(text(query), params)
        rows = [dict(r) for r in result.mappings().all()]
    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        logger.exception("Stock register query error")
        raise HTTPException(
            status_code=500,
            detail="Stock register query error. The operation was rolled back and nothing was saved.",
        ) from e

    total_stock_value = sum(float(r.get("stock_value") or 0) for r in rows)
    total_gold_weight = sum(float(r.get("closing_weight_gm") or 0) for r in rows if r.get("category") == "Gold")

    return {
        "as_of_date": str(as_of_date),
        "cgst_rule": "56(2)",
        "register_type": "Commodity-wise Stock Register",
        "items": rows,
        "stock": rows,
        "total_stock_value": total_stock_value,
        "total_gold_weight_gm": total_gold_weight,
    }


@router.get("/items")
@router.get("/materials")
async def list_materials(
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all material master records."""
    query = """
        SELECT m.id, m.code, m.name, m.category, m.hsn_code,
               m.purity_standard, uom.code AS uom, m.gst_tax_rate,
               COALESCE((
                    SELECT SUM(CASE WHEN direction = 'I' THEN quantity ELSE -quantity END)
                    FROM caratloop.stock_ledger_entries
                    WHERE material_id = m.id
               ), 0) AS current_stock
        FROM caratloop.materials m
        JOIN caratloop.units_of_measure uom ON uom.id = m.uom_id
        WHERE m.company_id = :cid AND m.is_active = TRUE
    """
    params = {"cid": current_user["company_id"]}
    if category:
        query += " AND m.category = :cat"
        params["cat"] = category
    query += " ORDER BY m.category, m.name"

    result = await db.execute(text(query), params)
    return {"materials": [dict(r) for r in result.mappings().all()]}


@router.get("/items/search")
async def search_items(q: str = "", limit: int = 20, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    query = """
        SELECT m.id, m.code, m.name, uom.code as unit, uom.code as uom,
               m.gst_tax_rate as gst_tax_rate, m.gst_tax_rate as material_gst_rate, m.hsn_code,
               COALESCE((
                    SELECT SUM(CASE WHEN direction = 'I' THEN quantity ELSE -quantity END)
                    FROM caratloop.stock_ledger_entries
                    WHERE material_id = m.id
               ), 0) AS current_stock
        FROM caratloop.materials m
        JOIN caratloop.units_of_measure uom ON uom.id = m.uom_id
        WHERE m.company_id = :cid AND m.is_active = TRUE
    """
    params = {"cid": current_user["company_id"], "limit": limit}
    if q:
        query += " AND (m.name ILIKE :q OR m.code ILIKE :q OR m.hsn_code ILIKE :q)"
        params["q"] = f"%{q}%"
    query += " ORDER BY m.name LIMIT :limit"

    res = await db.execute(text(query), params)
    return [dict(r) for r in res.mappings().all()]


@router.post("/items", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def create_item(
    payload: CreateItemRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        # Fetch uom_id
        uom_res = await db.execute(
            text("SELECT id FROM caratloop.units_of_measure WHERE code = :code LIMIT 1"),
            {"code": payload.uom}
        )
        uom_id = uom_res.scalar()
        if not uom_id:
            uom_res = await db.execute(text("SELECT id FROM caratloop.units_of_measure LIMIT 1"))
            uom_id = uom_res.scalar()

        item_res = await db.execute(
            text("""
                INSERT INTO caratloop.materials (
                    company_id, uom_id, code, name, category, hsn_code,
                    gst_tax_rate, purity_standard, reorder_level
                ) VALUES (
                    :cid, :uom_id, :code, :name, :cat, :hsn,
                    :gst_rate, :purity, 10.0
                ) RETURNING id
            """),
            {
                "cid": company_id,
                "uom_id": uom_id,
                "code": payload.code,
                "name": payload.name,
                "cat": payload.category,
                "hsn": payload.hsn_code,
                "gst_rate": payload.gst_tax_rate,
                "purity": payload.purity_standard
            }
        )
        item_id = item_res.scalar()

        # If opening stock specified
        if payload.opening_qty > 0:
            fy_res = await db.execute(
                text("SELECT id FROM caratloop.fiscal_years WHERE company_id = :cid AND is_active = TRUE LIMIT 1"),
                {"cid": company_id}
            )
            fy_id = fy_res.scalar()
            if not fy_id:
                fy_res = await db.execute(text("SELECT id FROM caratloop.fiscal_years LIMIT 1"))
                fy_id = fy_res.scalar()
            
            loc_res = await db.execute(
                text("SELECT id FROM caratloop.stock_locations WHERE company_id = :cid LIMIT 1"),
                {"cid": company_id}
            )
            loc_id = loc_res.scalar()
            if not loc_id:
                loc_res = await db.execute(text("SELECT id FROM caratloop.stock_locations LIMIT 1"))
                loc_id = loc_res.scalar()

            if loc_id and fy_id:
                await db.execute(
                    text("""
                        INSERT INTO caratloop.stock_ledger_entries (
                            company_id, fiscal_year_id, location_id, material_id, entry_date,
                            direction, transaction_type, quantity, amount, sequence_no, created_by
                        ) VALUES (
                            :cid, :fyid, :loc_id, :mat_id, CURRENT_DATE,
                            'I', 'Opening', :qty, 0, COALESCE((SELECT MAX(sequence_no) FROM caratloop.stock_ledger_entries), 0) + 1, CAST(:created_by AS UUID)
                        )
                    """),
                    {
                        "cid": company_id,
                        "fyid": fy_id,
                        "loc_id": loc_id,
                        "mat_id": item_id,
                        "qty": payload.opening_qty,
                        "created_by": user_id
                    }
                )

        # Auto-assign stock/purchase/sales accounts based on category
        category_stock_map = {
            'Gold': 'STK-001', 'Silver': 'STK-003', 'Diamond': 'STK-004',
            'Ruby': 'STK-005', 'Emerald': 'STK-006', 'Sapphire': 'STK-007',
        }
        stk_code = category_stock_map.get(payload.category, 'STK-008')

        stk_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = :code AND company_id = :cid LIMIT 1"), {"code": stk_code, "cid": company_id})
        sal_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'SAL-001' AND company_id = :cid LIMIT 1"), {"cid": company_id})
        stk_id = stk_res.scalar()
        sal_id = sal_res.scalar()

        if stk_id:
            await db.execute(text("UPDATE caratloop.materials SET stock_account_id = :sid, purchase_account_id = :sid, sales_account_id = :salid WHERE id = :mid"), {"sid": stk_id, "salid": sal_id, "mid": item_id})

        await db.commit()
        return {"status": "success", "id": str(item_id), "code": payload.code}
    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to create stock item")
        raise HTTPException(
            status_code=500,
            detail="Failed to create stock item. The operation was rolled back and nothing was saved.",
        ) from e


@router.patch("/items/{id}", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def update_item(
    id: UUID,
    payload: UpdateItemRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        update_fields = []
        params = {"id": str(id), "cid": company_id}
        for field, value in payload.dict(exclude_unset=True).items():
            if field != "reason" and value is not None:
                update_fields.append(f"{field} = :{field}")
                params[field] = value

        if update_fields:
            query = f"UPDATE caratloop.materials SET {', '.join(update_fields)} WHERE id = :id AND company_id = :cid RETURNING id"
            result = await db.execute(text(query), params)
            if not result.scalar():
                raise HTTPException(status_code=404, detail="Item not found")
            await db.commit()

        return {"status": "success"}
    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to update stock item")
        raise HTTPException(
            status_code=500,
            detail="Failed to update stock item. The operation was rolled back and nothing was saved.",
        ) from e


@router.get("/items/{id}/ledger")
async def get_item_ledger(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    [CGST Rule 56(2)] Stock Movement Ledger for a specific stock item with running balances.
    """
    # 1. Fetch Item details
    item_res = await db.execute(
        text("""
            SELECT m.id, m.code, m.name, m.category, m.hsn_code, m.gst_tax_rate, uom.code AS uom_code, uom.name AS uom_name
            FROM caratloop.materials m
            JOIN caratloop.units_of_measure uom ON uom.id = m.uom_id
            WHERE m.id = :id AND m.company_id = :cid
        """),
        {"id": str(id), "cid": current_user["company_id"]}
    )
    item = item_res.mappings().first()
    if not item:
        raise HTTPException(status_code=404, detail="Stock item not found")

    # 2. Fetch Stock Ledger Entries with running balance
    entries_res = await db.execute(
        text("""
            SELECT
                sle.id, sle.entry_date, sle.direction, sle.transaction_type,
                sle.quantity, sle.amount, sle.gross_weight, sle.net_weight,
                sle.source_document_type, sle.source_document_id, sle.source_document_no, sle.sequence_no,
                sle.remarks, sle.created_at
            FROM caratloop.stock_ledger_entries sle
            WHERE sle.material_id = :mid AND sle.company_id = :cid
            ORDER BY sle.sequence_no ASC, sle.created_at ASC
        """),
        {"mid": str(id), "cid": current_user["company_id"]}
    )
    entries = [dict(r) for r in entries_res.mappings().all()]

    # Compute running balance line-by-line
    running_balance = 0.0
    for e in entries:
        qty = float(e["quantity"] or 0)
        if e["direction"] == 'I':
            running_balance += qty
        else:
            running_balance -= qty
        e["running_balance"] = round(running_balance, 4)

    return {
        "item": dict(item),
        "closing_stock": round(running_balance, 4),
        "uom_code": item["uom_code"],
        "entries": entries
    }



@router.get("/items/{id}")
async def get_item(id: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    res = await db.execute(text("SELECT * FROM caratloop.materials WHERE id = :id AND company_id = :cid"), {"id": id, "cid": current_user["company_id"]})
    row = res.mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Item not found")
    return dict(row)


class OpeningStockItem(BaseModel):
    material_id: UUID
    quantity: float
    rate: float = 0.0
    gross_weight: Optional[float] = None
    net_weight: Optional[float] = None
    location_id: Optional[UUID] = None
    entry_date: Optional[date] = None

class BatchOpeningStockRequest(BaseModel):
    items: List[OpeningStockItem]
    reason: str = "Opening stock initialization"


@router.post("/opening-stock", dependencies=[Depends(require(*CAN_AMEND))])
async def record_opening_stock(
    payload: BatchOpeningStockRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    """
    [CGST Rule 56(2)] Record Opening Stock entries in stock ledger.
    """
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        fy_res = await db.execute(
            text("SELECT id FROM caratloop.fiscal_years WHERE company_id = :cid AND is_active = TRUE LIMIT 1"),
            {"cid": company_id}
        )
        fy_id = fy_res.scalar()
        if not fy_id:
            fy_res = await db.execute(text("SELECT id FROM caratloop.fiscal_years LIMIT 1"))
            fy_id = fy_res.scalar()

        loc_res = await db.execute(
            text("SELECT id FROM caratloop.stock_locations WHERE company_id = :cid LIMIT 1"),
            {"cid": company_id}
        )
        loc_id = loc_res.scalar()
        if not loc_id:
            loc_res = await db.execute(text("SELECT id FROM caratloop.stock_locations LIMIT 1"))
            loc_id = loc_res.scalar()

        inserted_count = 0
        for item in payload.items:
            if item.quantity <= 0:
                continue
            entry_date = item.entry_date or date.today()
            target_loc = str(item.location_id) if item.location_id else str(loc_id)
            total_amt = float(item.quantity) * float(item.rate or 0.0)

            await db.execute(
                text("""
                    INSERT INTO caratloop.stock_ledger_entries (
                        company_id, fiscal_year_id, location_id, material_id, entry_date,
                        direction, transaction_type, quantity, amount, gross_weight, net_weight,
                        sequence_no, created_by
                    ) VALUES (
                        :cid, :fyid, :loc_id, :mat_id, :edate,
                        'I', 'Opening', :qty, :amt, :gw, :nw,
                        COALESCE((SELECT MAX(sequence_no) FROM caratloop.stock_ledger_entries), 0) + 1, CAST(:created_by AS UUID)
                    )
                """),
                {
                    "cid": company_id,
                    "fyid": str(fy_id),
                    "loc_id": target_loc,
                    "mat_id": str(item.material_id),
                    "edate": entry_date,
                    "qty": float(item.quantity),
                    "amt": total_amt,
                    "gw": float(item.gross_weight or 0.0),
                    "nw": float(item.net_weight or 0.0),
                    "created_by": user_id
                }
            )
            inserted_count += 1

        await db.commit()
        return {"status": "success", "inserted_count": inserted_count}
    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to record opening stock")
        raise HTTPException(
            status_code=500,
            detail="Failed to record opening stock. The operation was rolled back and nothing was saved.",
        ) from e