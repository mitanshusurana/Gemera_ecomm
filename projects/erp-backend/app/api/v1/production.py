"""
Caratloop ERP — Production Order API
[CGST Rule 56(12)] Monthly Production Account
[CGST Rule 56(2)]  Stock Register updates
[S44AA]            Double-entry journal entry for manufacturing
[MCA-11g]          All entries are append-only with full audit trail
"""
import logging
from uuid import UUID
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from pydantic import BaseModel, Field

from app.core.database import get_db, set_audit_context
from app.core.ledger import assert_journal_balanced
from app.core.money import ZERO, round_money, to_decimal
from app.core.stock import assert_stock_available
from app.core.roles import CAN_MOVE_STOCK, require
from app.core.pagination import Page, paginate
from app.core.periods import assert_period_open
from app.core.security import get_current_user
from app.core.tenancy import resolve_fiscal_year

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/production", tags=["Manufacturing"])


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class MaterialConsumptionLine(BaseModel):
    material_id: UUID
    batch_no: Optional[str] = None
    qty_issued: Decimal = Field(ge=0)
    gross_weight: Optional[Decimal] = Field(default=None, ge=0)
    net_weight: Optional[Decimal] = Field(default=None, ge=0)
    # Fraction (0.916), not millesimal (916): fine weight is net * purity, so
    # 916 would inflate the weight a thousandfold. The DB CHECK agrees.
    purity: Optional[Decimal] = Field(default=None, gt=0, le=1)
    rate: Optional[Decimal] = Field(default=None, ge=0)
    remarks: Optional[str] = None


class OutputLine(BaseModel):
    material_id: UUID         # Finished good material ID
    qty_produced: Decimal = Field(ge=0)
    gross_weight: Optional[Decimal] = Field(default=None, ge=0)
    net_weight: Optional[Decimal] = Field(default=None, ge=0)
    hallmark_no: Optional[str] = None
    quality_grade: Optional[str] = None
    valuation_rate: Optional[Decimal] = Field(default=None, ge=0)


class WastageLine(BaseModel):
    material_id: UUID
    wastage_type: str         # Melting_Loss, Polishing_Loss, etc.
    qty_lost: Decimal = Field(ge=0)
    loss_pct: Optional[Decimal] = Field(default=None, ge=0, le=100)
    recoverable_qty: Optional[Decimal] = Field(default=None, ge=0)
    rate: Optional[Decimal] = Field(default=None, ge=0)
    remarks: Optional[str] = None


class CreateProductionOrderRequest(BaseModel):
    product_name: str = "Gold Jewelry Item"
    order_date: date = Field(default_factory=date.today)
    planned_qty: Decimal = Field(default=Decimal("1"), gt=0)
    # From a bill of materials: the order takes the BOM's product, and the
    # response carries the consumption and output lines scaled to
    # output_quantity (planned_qty when absent) for the completion form.
    bom_id: Optional[UUID] = None
    output_quantity: Optional[Decimal] = Field(default=None, gt=0)
    product_id: Optional[UUID] = None
    allowed_wastage_pct: Decimal = Field(default=Decimal("2.5"), ge=0, le=100)
    remarks: Optional[str] = None
    reason: str = "Production order creation"


# ─── Bill of materials ───────────────────────────────────────────────────────
#
# bom_headers and bom_lines were in the baseline and never read: every
# production order created a one-line stub BOM per product and then ignored
# it, so the operator typed the recipe again at completion. A BOM is per
# output_quantity of the finished material; an order scales its lines.

class BomLineRequest(BaseModel):
    material_id: UUID
    quantity_per_unit: Decimal = Field(gt=0)
    standard_loss_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    loss_type: Optional[str] = Field(default=None, max_length=30)
    notes: Optional[str] = None


class BomRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    # The finished material the BOM produces.
    output_material_id: UUID
    output_quantity: Decimal = Field(default=Decimal("1"), gt=0)
    # An existing product, else one is created from the name so the
    # baseline's NOT NULL product_id is satisfied.
    product_id: Optional[UUID] = None
    product_type: str = Field(default="Necklace", max_length=30)
    bom_version: str = Field(default="1.0", max_length=10)
    effective_from: Optional[date] = None
    effective_to: Optional[date] = None
    is_active: bool = True
    remarks: Optional[str] = None
    lines: List[BomLineRequest]
    reason: str = "Bill of materials"


def scale_bom_lines(lines, bom_output_quantity, output_quantity) -> list[dict]:
    """Consumption lines for ``output_quantity`` of output.

    quantity_per_unit is per ``bom_output_quantity`` of output (1 unless the
    BOM was written for a batch). Expected loss is the standard loss on the
    gross issue, so qty_issued includes it and expected_loss says how much of
    it the order expects to lose.
    """
    factor = to_decimal(output_quantity) / to_decimal(bom_output_quantity or 1)
    out = []
    for ln in lines:
        net = (to_decimal(ln["quantity_per_unit"]) * factor).quantize(Decimal("0.0001"))
        loss_pct = to_decimal(ln.get("standard_loss_pct") or 0)
        gross = (net / (1 - loss_pct / 100)).quantize(Decimal("0.0001")) if loss_pct < 100 else net
        out.append({
            **{k: v for k, v in ln.items() if k not in ("quantity_per_unit",)},
            "quantity_per_unit": str(ln["quantity_per_unit"]),
            "qty_issued": str(gross),
            "net_required": str(net),
            "expected_loss": str((gross - net).quantize(Decimal("0.0001"))),
            "loss_pct": str(loss_pct),
        })
    return out


async def _load_bom(db: AsyncSession, company_id, bom_id) -> dict | None:
    head_res = await db.execute(
        text("""
            SELECT b.id, b.name, b.product_id, p.name AS product_name, p.sku AS product_sku,
                   b.bom_version, b.effective_from, b.effective_to, b.is_active, b.remarks,
                   b.output_material_id, om.code AS output_material_code, om.name AS output_material_name,
                   b.output_quantity, b.created_at
            FROM caratloop.bom_headers b
            JOIN caratloop.products p ON p.id = b.product_id
            LEFT JOIN caratloop.materials om ON om.id = b.output_material_id
            WHERE b.id = :id AND b.company_id = :cid
        """),
        {"id": str(bom_id), "cid": company_id},
    )
    head = head_res.mappings().first()
    if not head:
        return None
    line_res = await db.execute(
        text("""
            SELECT l.id, l.sequence_no, l.material_id, m.code AS material_code, m.name AS material_name,
                   m.category, u.code AS uom, l.quantity_per_unit, l.standard_loss_pct, l.loss_type, l.notes
            FROM caratloop.bom_lines l
            JOIN caratloop.materials m ON m.id = l.material_id
            LEFT JOIN caratloop.units_of_measure u ON u.id = l.uom_id
            WHERE l.bom_id = :id
            ORDER BY l.sequence_no
        """),
        {"id": str(bom_id)},
    )
    out = dict(head)
    out["lines"] = [dict(r) for r in line_res.mappings().all()]
    return out


async def _write_bom_lines(db: AsyncSession, company_id, bom_id, lines: List[BomLineRequest]) -> None:
    for seq, ln in enumerate(lines, 1):
        ins = await db.execute(
            text("""
                INSERT INTO caratloop.bom_lines
                    (bom_id, sequence_no, material_id, quantity_per_unit, uom_id,
                     standard_loss_pct, loss_type, notes)
                SELECT CAST(:bid AS UUID), :seq, m.id, :qty, m.uom_id, :loss, :ltype, :notes
                FROM caratloop.materials m
                WHERE m.id = CAST(:mid AS UUID) AND m.company_id = :cid
                RETURNING id
            """),
            {
                "bid": str(bom_id), "seq": seq, "mid": str(ln.material_id), "qty": ln.quantity_per_unit,
                "loss": ln.standard_loss_pct, "ltype": ln.loss_type, "notes": ln.notes, "cid": company_id,
            },
        )
        if ins.scalar() is None:
            raise HTTPException(status_code=400, detail=f"Material {ln.material_id} is not in this company's item master.")


async def _resolve_bom_product(db: AsyncSession, company_id, payload: BomRequest) -> str:
    if payload.product_id:
        res = await db.execute(
            text("SELECT id FROM caratloop.products WHERE id = :id AND company_id = :cid"),
            {"id": str(payload.product_id), "cid": company_id},
        )
        found = res.scalar()
        if not found:
            raise HTTPException(status_code=404, detail="Product not found")
        return str(found)
    res = await db.execute(
        text("""
            INSERT INTO caratloop.products (company_id, material_id, sku, name, product_type)
            SELECT :cid, m.id, 'BOM-' || LPAD(FLOOR(RANDOM()*100000)::TEXT, 5, '0'), :name, :ptype
            FROM caratloop.materials m WHERE m.id = CAST(:mid AS UUID) AND m.company_id = :cid
            RETURNING id
        """),
        {"cid": company_id, "mid": str(payload.output_material_id), "name": payload.name[:200], "ptype": payload.product_type},
    )
    pid = res.scalar()
    if not pid:
        raise HTTPException(status_code=400, detail="Output material is not in this company's item master.")
    return str(pid)


@router.get("/boms")
async def list_boms(
    active_only: bool = True,
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = """
        SELECT b.id, b.name, b.product_id, p.name AS product_name, b.bom_version,
               b.effective_from, b.effective_to, b.is_active, b.output_material_id,
               om.code AS output_material_code, om.name AS output_material_name, b.output_quantity,
               (SELECT COUNT(*) FROM caratloop.bom_lines l WHERE l.bom_id = b.id) AS line_count,
               (SELECT COUNT(*) FROM caratloop.production_orders po WHERE po.bom_id = b.id) AS orders_count
        FROM caratloop.bom_headers b
        JOIN caratloop.products p ON p.id = b.product_id
        LEFT JOIN caratloop.materials om ON om.id = b.output_material_id
        WHERE b.company_id = :cid
    """
    params = {"cid": current_user["company_id"]}
    if active_only:
        query += " AND b.is_active = TRUE"
    query += " ORDER BY COALESCE(b.name, p.name), b.bom_version"
    query = page.apply(query)
    params.update(page.params)
    res = await db.execute(text(query), params)
    rows = [dict(r) for r in res.mappings().all()]
    return {"boms": rows, **page.envelope(rows)}


@router.post("/boms", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def create_bom(
    payload: BomRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
    if not payload.lines:
        raise HTTPException(status_code=422, detail="A bill of materials needs at least one line.")
    try:
        product_id = await _resolve_bom_product(db, company_id, payload)
        res = await db.execute(
            text("""
                INSERT INTO caratloop.bom_headers
                    (company_id, product_id, name, bom_version, effective_from, effective_to,
                     is_active, remarks, output_material_id, output_quantity, created_by)
                VALUES (:cid, CAST(:pid AS UUID), :name, :ver, :efrom, :eto, :active, :remarks,
                        CAST(:omid AS UUID), :oqty, CAST(:cb AS UUID))
                RETURNING id
            """),
            {
                "cid": company_id, "pid": product_id, "name": payload.name, "ver": payload.bom_version,
                "efrom": payload.effective_from or date.today(), "eto": payload.effective_to,
                "active": payload.is_active, "remarks": payload.remarks,
                "omid": str(payload.output_material_id), "oqty": payload.output_quantity, "cb": user_id,
            },
        )
        bom_id = res.scalar()
        await _write_bom_lines(db, company_id, bom_id, payload.lines)
        await db.commit()
        return {"status": "success", "id": str(bom_id), "product_id": product_id}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to create BOM")
        raise HTTPException(status_code=500, detail="Failed to save the bill of materials. Nothing was saved.") from e


@router.get("/boms/{bom_id}")
async def get_bom(
    bom_id: UUID,
    output_quantity: Optional[Decimal] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    bom = await _load_bom(db, current_user["company_id"], bom_id)
    if not bom:
        raise HTTPException(status_code=404, detail="Bill of materials not found")
    if output_quantity is not None and output_quantity > 0:
        bom["plan"] = scale_bom_lines(bom["lines"], bom["output_quantity"], output_quantity)
    return bom


@router.put("/boms/{bom_id}", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def update_bom(
    bom_id: UUID,
    payload: BomRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Replace the header fields and the lines. A BOM is master data, not a
    ledger: the audit trigger records the old rows, and orders already raised
    keep the plan they were raised with."""
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
    if not payload.lines:
        raise HTTPException(status_code=422, detail="A bill of materials needs at least one line.")
    try:
        existing = await _load_bom(db, company_id, bom_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Bill of materials not found")
        product_id = str(existing["product_id"])
        if payload.product_id:
            product_id = await _resolve_bom_product(db, company_id, payload)
        await db.execute(
            text("""
                UPDATE caratloop.bom_headers
                SET product_id = CAST(:pid AS UUID), name = :name, bom_version = :ver,
                    effective_from = :efrom, effective_to = :eto, is_active = :active,
                    remarks = :remarks, output_material_id = CAST(:omid AS UUID), output_quantity = :oqty
                WHERE id = :id AND company_id = :cid
            """),
            {
                "id": str(bom_id), "cid": company_id, "pid": product_id, "name": payload.name,
                "ver": payload.bom_version, "efrom": payload.effective_from or existing["effective_from"],
                "eto": payload.effective_to, "active": payload.is_active, "remarks": payload.remarks,
                "omid": str(payload.output_material_id), "oqty": payload.output_quantity,
            },
        )
        await db.execute(text("DELETE FROM caratloop.bom_lines WHERE bom_id = :id"), {"id": str(bom_id)})
        await _write_bom_lines(db, company_id, bom_id, payload.lines)
        await db.commit()
        return {"status": "success", "id": str(bom_id)}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to update BOM")
        raise HTTPException(status_code=500, detail="Failed to save the bill of materials. Nothing was saved.") from e


class CompleteProductionOrderRequest(BaseModel):
    completion_date: date
    consumption_lines: List[MaterialConsumptionLine]
    output_lines: List[OutputLine]
    wastage_lines: Optional[List[WastageLine]] = []
    reason: str = "Production order completion"


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("/orders")
async def list_production_orders(
    status: Optional[str] = None,
    month_year: Optional[str] = None,
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all production orders [CGST-R56-12]."""
    query = """
        SELECT
            po.id, po.order_no, po.order_date, po.status, po.month_year,
            po.planned_qty, po.actual_qty, po.allowed_wastage_pct, po.bom_id,
            b.name AS bom_name, b.output_material_id,
            p.name AS product_name, p.collection_name,
            p.sku AS product_sku
        FROM caratloop.production_orders po
        LEFT JOIN caratloop.bom_headers b ON b.id = po.bom_id
        JOIN caratloop.products p ON p.id = po.product_id
        WHERE po.company_id = :company_id
    """
    params = {"company_id": current_user["company_id"]}
    if status:
        query += " AND po.status = :status"
        params["status"] = status
    if month_year:
        query += " AND po.month_year = :month_year"
        params["month_year"] = month_year
    query += " ORDER BY po.order_date DESC"

    # Bound the result set. These endpoints previously returned the whole
    # table; the sales register returned every invoice ever raised.
    query = page.apply(query)
    params.update(page.params)

    result = await db.execute(text(query), params)
    orders = result.mappings().all()
    return {"orders": [dict(o) for o in orders]}


@router.get("/orders/{order_id}")
async def get_production_order(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """One order with its BOM plan scaled to planned_qty, so the completion
    form starts from the recipe rather than a blank line."""
    company_id = current_user["company_id"]
    res = await db.execute(
        text("""
            SELECT po.id, po.order_no, po.order_date, po.status, po.month_year, po.planned_qty,
                   po.actual_qty, po.allowed_wastage_pct, po.remarks, po.bom_id, po.completed_at,
                   p.name AS product_name, p.sku AS product_sku
            FROM caratloop.production_orders po
            JOIN caratloop.products p ON p.id = po.product_id
            WHERE po.id = :id AND po.company_id = :cid
        """),
        {"id": str(order_id), "cid": company_id},
    )
    order = res.mappings().first()
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    out = dict(order)
    bom = await _load_bom(db, company_id, order["bom_id"]) if order["bom_id"] else None
    out["bom"] = bom
    out["plan"] = (
        scale_bom_lines(bom["lines"], bom["output_quantity"], order["planned_qty"]) if bom and bom["lines"] else []
    )
    return out


@router.post("/orders", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def create_production_order(
    payload: CreateProductionOrderRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a new production order [CGST Rule 56(12)]."""
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        await assert_period_open(db, company_id, payload.order_date, what="This production order")

        planned_qty = to_decimal(payload.output_quantity or payload.planned_qty)
        bom: dict | None = None
        bom_id = None
        if payload.bom_id:
            bom = await _load_bom(db, company_id, payload.bom_id)
            if not bom:
                raise HTTPException(status_code=404, detail="Bill of materials not found")
            if not bom["is_active"]:
                raise HTTPException(status_code=409, detail=f"BOM '{bom['name'] or bom['product_name']}' is inactive.")
            prod_id = str(bom["product_id"])
            bom_id = str(bom["id"])
        elif payload.product_id:
            prod_res = await db.execute(
                text("SELECT id FROM caratloop.products WHERE id = :id AND company_id = :cid"),
                {"id": str(payload.product_id), "cid": company_id},
            )
            prod_id = prod_res.scalar()
            if not prod_id:
                raise HTTPException(status_code=404, detail="Product not found")
        else:
            prod_id = None

        # 1. Get or create product (legacy path: no BOM and no product given)
        if not prod_id:
            prod_res = await db.execute(
                text("SELECT id FROM caratloop.products WHERE company_id = :cid AND name = :name LIMIT 1"),
                {"cid": company_id, "name": payload.product_name}
            )
            prod_id = prod_res.scalar()
        if not prod_id:
            mat_res = await db.execute(text("SELECT id FROM caratloop.materials WHERE company_id = :cid LIMIT 1"), {"cid": company_id})
            mat_id = mat_res.scalar()
            if not mat_id:
                raise HTTPException(status_code=400, detail="No raw materials configured. Please add stock items first.")
            new_prod = await db.execute(
                text("""
                    INSERT INTO caratloop.products (company_id, material_id, sku, name, product_type)
                    VALUES (:cid, :mat_id, 'SKU-' || LPAD(FLOOR(RANDOM()*10000)::TEXT, 4, '0'), :name, 'Necklace')
                    RETURNING id
                """),
                {"cid": company_id, "mat_id": mat_id, "name": payload.product_name}
            )
            prod_id = new_prod.scalar()

        # 2. Get or create BOM (the baseline requires one on every order)
        if bom is None:
            bom_res = await db.execute(
                text("SELECT id FROM caratloop.bom_headers WHERE product_id = :pid AND company_id = :cid ORDER BY is_active DESC, created_at DESC LIMIT 1"),
                {"pid": prod_id, "cid": company_id}
            )
            bom_id = bom_res.scalar()
        if not bom_id:
            new_bom = await db.execute(
                text("""
                    INSERT INTO caratloop.bom_headers (company_id, product_id, bom_version, effective_from, created_by)
                    VALUES (:cid, :pid, '1.0', CURRENT_DATE, CAST(:cb AS UUID))
                    RETURNING id
                """),
                {"cid": company_id, "pid": prod_id, "cb": user_id}
            )
            bom_id = new_bom.scalar()

        # 3. Get Fiscal Year
        fy = await resolve_fiscal_year(db, company_id)

        # 4. Generate Order No
        cnt_res = await db.execute(
            text("SELECT caratloop.next_document_number(:cid, :fyid, 'ProductionOrder')"),
            {"cid": company_id, "fyid": str(fy["id"])}
        )
        cnt = cnt_res.scalar()
        order_no = f"PO-{fy['year_label']}-{cnt:04d}"
        month_year = payload.order_date.strftime("%Y-%m")

        po_res = await db.execute(
            text("""
                INSERT INTO caratloop.production_orders (
                    company_id, fiscal_year_id, order_no, order_date, product_id, bom_id,
                    planned_qty, allowed_wastage_pct, status, month_year, remarks, created_by
                ) VALUES (
                    :cid, :fyid, :ono, :odate, :pid, :bomid,
                    :pqty, :wpct, 'In_Progress', :my, :rem, CAST(:cb AS UUID)
                ) RETURNING id
            """),
            {
                "cid": company_id,
                "fyid": fy["id"],
                "ono": order_no,
                # Was accepted in the request and then dropped, so the ceiling
                # enforced at completion had nothing to enforce against.
                "wpct": to_decimal(payload.allowed_wastage_pct),
                "odate": payload.order_date,
                "pid": prod_id,
                "bomid": bom_id,
                "pqty": planned_qty,
                "my": month_year,
                "rem": payload.remarks or f"Manufacturing order for {payload.product_name}",
                "cb": user_id
            }
        )
        po_id = po_res.scalar()
        await db.commit()
        plan = scale_bom_lines(bom["lines"], bom["output_quantity"], planned_qty) if bom and bom["lines"] else []
        return {
            "status": "success",
            "id": str(po_id),
            "order_no": order_no,
            "bom_id": str(bom_id),
            "planned_qty": str(planned_qty),
            "output_material_id": str(bom["output_material_id"]) if bom and bom["output_material_id"] else None,
            "plan": plan,
        }
    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to create production order")
        raise HTTPException(
            status_code=500,
            detail="Failed to create production order. The operation was rolled back and nothing was saved.",
        ) from e


@router.post("/orders/{order_id}/complete", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def complete_production_order(
    order_id: UUID,
    payload: CompleteProductionOrderRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Complete a production order — posts all manufacturing entries.

    This is the core manufacturing journal entry endpoint.

    Operations performed atomically:
    1. [CGST-R56-12] Insert production_consumption_entries (raw materials consumed)
    2. [CGST-R56-12] Insert production_output_entries (finished goods produced)
    3. [CGST-R56-12] Insert production_wastage_entries (melting/polishing loss)
    4. [CGST-R56-2]  Insert stock_ledger_entries for all stock movements
    5. [S44AA][DENTRY] Post double-entry journal entry:
           Dr. WIP Account
           Cr. Raw Material Stock Accounts (gold, gems)
           Dr. Finished Goods Account
           Cr. WIP Account
           Dr. Mfg Loss Account (wastage)
           Cr. Raw Material Stock (for wastage)
    6. [MCA-11g] Set audit context (user, session, IP, reason)

    All changes are APPEND-ONLY. No DELETE or UPDATE on any ledger table.
    """
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    session_id = current_user.get("session_id", "0")
    ip_address = request.client.host if request.client else "0.0.0.0"

    # Verify order exists and belongs to this company
    order_result = await db.execute(
        text("""
            SELECT po.*, p.name AS product_name
            FROM caratloop.production_orders po
            JOIN caratloop.products p ON p.id = po.product_id
            WHERE po.id = :order_id AND po.company_id = :company_id
        """),
        {"order_id": str(order_id), "company_id": company_id},
    )
    order = order_result.mappings().first()
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    if order["status"] not in ("Released", "In_Progress"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot complete order in '{order['status']}' status"
        )

    # ─── Set MCA Rule 11(g) Audit Context ────────────────────────────────────
    await set_audit_context(
        db,
        user_id=user_id,
        session_id=session_id,
        ip_address=ip_address,
        reason=payload.reason,
    )

    try:
        # The completion date is when the stock moves and the journal posts;
        # a locked year refuses it before anything is written.
        await assert_period_open(db, company_id, payload.completion_date, what="This production completion")

        total_material_cost = Decimal("0")
        consumption_entry_ids = []
        output_entry_ids = []

        # ─── STEP 2: Post Consumption Entries [CGST-R56-12] ──────────────────
        # Record each raw material consumed in production
        for line in payload.consumption_lines:
            # The docstring claimed "Verify raw material stock" but nothing did.
            await assert_stock_available(
                db, company_id, line.material_id, line.qty_issued,
                context=f"production order {order['order_no']}",
                material_label=str(line.material_id),
            )

            # Purity is a fraction (0.916), not millesimal (916); fine weight is
            # net weight times purity. The DB CHECK enforces the convention.
            purity = to_decimal(line.purity)
            net_wt = to_decimal(line.net_weight)
            fine_wt = (net_wt * purity) if (line.purity and line.net_weight) else None
            mat_amount = to_decimal(line.qty_issued) * to_decimal(line.rate or 0)

            # [CGST-R56-2] Stock outward entry — raw material to production
            sle_result = await db.execute(
                text("""
                    INSERT INTO caratloop.stock_ledger_entries (
                        company_id, fiscal_year_id, entry_date, material_id,
                        location_id, batch_no, transaction_type,
                        quantity, direction, rate, amount,
                        gross_weight, net_weight, purity, fine_weight,
                        source_document_type, source_document_id, source_document_no,
                        remarks, created_by, ip_address, sequence_no
                    )
                    SELECT
                        po.company_id, po.fiscal_year_id, :entry_date, :material_id,
                        COALESCE(po.production_location_id,
                                 (SELECT id FROM caratloop.stock_locations
                                   WHERE company_id = po.company_id AND is_active
                                   ORDER BY is_default DESC, code LIMIT 1)),
                        :batch_no, 'Production_Consumption',
                        :qty, 'O', :rate, :amount,
                        :gross_wt, :net_wt, :purity, :fine_wt,
                        'ProductionOrder', po.id, po.order_no,
                        :remarks, CAST(:created_by AS UUID), CAST(:ip AS INET),
                        nextval('caratloop.stock_ledger_entries_id_seq')
                    FROM caratloop.production_orders po
                    WHERE po.id = :order_id
                    RETURNING id
                """),
                {
                    "entry_date": payload.completion_date,
                    "material_id": str(line.material_id),
                    "batch_no": line.batch_no,
                    "qty": line.qty_issued,
                    "rate": line.rate or 0,
                    "amount": mat_amount,
                    "gross_wt": line.gross_weight if line.gross_weight is not None else None,
                    "net_wt": line.net_weight if line.net_weight is not None else None,
                    "purity": line.purity if line.purity is not None else None,
                    "fine_wt": fine_wt,
                    "remarks": line.remarks,
                    "created_by": user_id,
                    "ip": ip_address,
                    "order_id": str(order_id),
                },
            )
            sle_id = sle_result.scalar()

            # [CGST-R56-12] Production consumption entry
            pce_result = await db.execute(
                text("""
                    INSERT INTO caratloop.production_consumption_entries (
                        production_order_id, company_id, entry_date,
                        material_id, batch_no, qty_issued, uom_id,
                        gross_weight, net_weight, purity, fine_weight,
                        rate, amount, remarks, created_by, ip_address,
                        stock_ledger_entry_id
                    )
                    SELECT
                        :order_id, po.company_id, :entry_date,
                        :material_id, :batch_no, :qty_issued,
                        m.uom_id,
                        :gross_wt, :net_wt, :purity, :fine_wt,
                        :rate, :amount, :remarks, CAST(:created_by AS UUID), CAST(:ip AS INET),
                        :sle_id
                    FROM caratloop.production_orders po
                    JOIN caratloop.materials m ON m.id = :material_id
                    WHERE po.id = :order_id
                    RETURNING id
                """),
                {
                    "order_id": str(order_id),
                    "entry_date": payload.completion_date,
                    "material_id": str(line.material_id),
                    "batch_no": line.batch_no,
                    "qty_issued": line.qty_issued,
                    "gross_wt": line.gross_weight if line.gross_weight is not None else None,
                    "net_wt": line.net_weight if line.net_weight is not None else None,
                    "purity": line.purity if line.purity is not None else None,
                    "fine_wt": fine_wt,
                    "rate": line.rate or 0,
                    "amount": mat_amount,
                    "remarks": line.remarks,
                    "created_by": user_id,
                    "ip": ip_address,
                    "sle_id": sle_id,
                },
            )
            pce_id = pce_result.scalar()
            consumption_entry_ids.append(pce_id)
            total_material_cost += Decimal(str(mat_amount))

        # ─── STEP 3: Post Wastage Entries [CGST-R56-12] ──────────────────────
        # CGST Rule 56(12): Must record waste/by-products with quantitative details
        #
        # Enforce the order's own wastage ceiling. allowed_wastage_pct was
        # captured when the order was raised and then never checked, so any
        # quantity of gold could be written off to MFG-002 with no limit and
        # no approval step.
        total_consumed = sum(to_decimal(c.qty_issued) for c in payload.consumption_lines)
        total_lost = sum(to_decimal(w.qty_lost) for w in (payload.wastage_lines or []))
        allowed_pct = to_decimal(order["allowed_wastage_pct"] if order["allowed_wastage_pct"] is not None else 0)

        if total_lost > 0 and total_consumed > 0:
            actual_pct = (total_lost / total_consumed) * 100
            if actual_pct > allowed_pct:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Wastage of {actual_pct.quantize(Decimal('0.01'))}% exceeds the "
                        f"{allowed_pct}% allowed on order {order['order_no']}. "
                        "Raise the allowance on the order if this loss is genuine. "
                        "No data was saved."
                    ),
                )
        elif total_lost > 0 and total_consumed == 0:
            raise HTTPException(
                status_code=409,
                detail=(
                    "Wastage cannot be recorded against an order with no material "
                    "consumption. No data was saved."
                ),
            )

        for w_line in (payload.wastage_lines or []):
            w_amount = to_decimal(w_line.qty_lost) * to_decimal(w_line.rate or 0)
            await db.execute(
                text("""
                    INSERT INTO caratloop.production_wastage_entries (
                        production_order_id, company_id, entry_date,
                        wastage_type, material_id, qty_lost, uom_id,
                        loss_pct, recoverable_qty, rate, amount,
                        remarks, created_by, ip_address
                    )
                    SELECT
                        :order_id, po.company_id, :entry_date,
                        :wastage_type, :material_id, :qty_lost, m.uom_id,
                        :loss_pct, :recoverable_qty, :rate, :amount,
                        :remarks, CAST(:created_by AS UUID), CAST(:ip AS INET)
                    FROM caratloop.production_orders po
                    JOIN caratloop.materials m ON m.id = :material_id
                    WHERE po.id = :order_id
                """),
                {
                    "order_id": str(order_id),
                    "entry_date": payload.completion_date,
                    "wastage_type": w_line.wastage_type,
                    "material_id": str(w_line.material_id),
                    "qty_lost": w_line.qty_lost,
                    "loss_pct": w_line.loss_pct if w_line.loss_pct is not None else None,
                    "recoverable_qty": w_line.recoverable_qty or 0,
                    "rate": w_line.rate or 0,
                    "amount": w_amount,
                    "remarks": w_line.remarks,
                    "created_by": user_id,
                    "ip": ip_address,
                },
            )

        # ─── STEP 4: Post Output Entries [CGST-R56-12] ───────────────────────
        # Record finished goods produced
        total_fg_qty = Decimal("0")
        for out_line in payload.output_lines:
            out_amount = out_line.qty_produced * (out_line.valuation_rate or 0)
            # [CGST-R56-2] Stock inward entry — finished goods received
            sle_out_result = await db.execute(
                text("""
                    INSERT INTO caratloop.stock_ledger_entries (
                        company_id, fiscal_year_id, entry_date, material_id,
                        location_id, transaction_type,
                        quantity, direction, rate, amount,
                        gross_weight, net_weight,
                        source_document_type, source_document_id, source_document_no,
                        created_by, ip_address, sequence_no
                    )
                    SELECT
                        po.company_id, po.fiscal_year_id, :entry_date, :material_id,
                        COALESCE(po.production_location_id,
                                 (SELECT id FROM caratloop.stock_locations
                                   WHERE company_id = po.company_id AND is_active
                                   ORDER BY is_default DESC, code LIMIT 1)),
                        'Production_Output',
                        :qty, 'I', :rate, :amount,
                        :gross_wt, :net_wt,
                        'ProductionOrder', po.id, po.order_no,
                        CAST(:created_by AS UUID), CAST(:ip AS INET),
                        nextval('caratloop.stock_ledger_entries_id_seq')
                    FROM caratloop.production_orders po
                    WHERE po.id = :order_id
                    RETURNING id
                """),
                {
                    "entry_date": payload.completion_date,
                    "material_id": str(out_line.material_id),
                    "qty": out_line.qty_produced,
                    "rate": out_line.valuation_rate or 0,
                    "amount": out_amount,
                    "gross_wt": out_line.gross_weight if out_line.gross_weight is not None else None,
                    "net_wt": out_line.net_weight if out_line.net_weight is not None else None,
                    "created_by": user_id,
                    "ip": ip_address,
                    "order_id": str(order_id),
                },
            )
            sle_out_id = sle_out_result.scalar()

            poe_result = await db.execute(
                text("""
                    INSERT INTO caratloop.production_output_entries (
                        production_order_id, company_id, entry_date,
                        material_id, qty_produced, uom_id,
                        gross_weight, net_weight, hallmark_no, quality_grade,
                        valuation_rate, created_by, ip_address, stock_ledger_entry_id
                    )
                    SELECT
                        :order_id, po.company_id, :entry_date,
                        :material_id, :qty_produced, m.uom_id,
                        :gross_wt, :net_wt, :hallmark, :quality,
                        :val_rate, CAST(:created_by AS UUID), CAST(:ip AS INET), :sle_id
                    FROM caratloop.production_orders po
                    JOIN caratloop.materials m ON m.id = :material_id
                    WHERE po.id = :order_id
                    RETURNING id
                """),
                {
                    "order_id": str(order_id),
                    "entry_date": payload.completion_date,
                    "material_id": str(out_line.material_id),
                    "qty_produced": out_line.qty_produced,
                    "gross_wt": out_line.gross_weight,
                    "net_wt": out_line.net_weight,
                    "hallmark": out_line.hallmark_no,
                    "quality": out_line.quality_grade,
                    "val_rate": out_line.valuation_rate or 0,
                    "created_by": user_id,
                    "ip": ip_address,
                    "sle_id": sle_out_id,
                },
            )
            output_entry_ids.append(poe_result.scalar())
            total_fg_qty += Decimal(str(out_line.qty_produced))

        # ─── STEP 5: Post Accounting Journal Entry [S44AA] [DENTRY] ──────────
        # Get next journal entry number
        je_no_result = await db.execute(
            text("""
                SELECT 'JV/' || fy.year_label || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')
                FROM caratloop.production_orders po
                JOIN caratloop.fiscal_years fy ON fy.id = po.fiscal_year_id
                WHERE po.id = :order_id
            """),
            {"order_id": str(order_id)},
        )
        je_no = je_no_result.scalar()

        # Insert journal entry header
        je_result = await db.execute(
            text("""
                INSERT INTO caratloop.journal_entries (
                    company_id, fiscal_year_id, entry_no, entry_date,
                    entry_type, narration, reference_no, reference_type, reference_id,
                    total_debit, total_credit,
                    created_by, ip_address, session_id, sequence_no
                )
                SELECT
                    po.company_id, po.fiscal_year_id, :je_no, :entry_date,
                    'Journal',
                    'Manufacturing: Production Order ' || po.order_no || ' — ' || :product_name,
                    po.order_no, 'ProductionOrder', po.id,
                    :total_amount, :total_amount,
                    CAST(:created_by AS UUID), CAST(:ip AS INET), :session_id,
                    nextval('caratloop.journal_entry_seq')
                FROM caratloop.production_orders po
                WHERE po.id = :order_id
                RETURNING id
            """),
            {
                "je_no": je_no,
                "entry_date": payload.completion_date,
                "product_name": order["product_name"],
                "total_amount": total_material_cost,
                "created_by": user_id,
                "ip": ip_address,
                "session_id": int(session_id) if (session_id and str(session_id).isdigit() and int(session_id) > 0) else None,
                "order_id": str(order_id),
            },
        )
        je_id = je_result.scalar()

        # Post journal lines (double-entry) using system account codes
        wip_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'STK-009' AND company_id = :cid LIMIT 1"), {"cid": current_user["company_id"]})
        wip_account_id = str(wip_res.scalar())

        async def get_material_stock_account(db, mat_id, cid):
            res = await db.execute(
                text("SELECT m.stock_account_id, m.category, a.id AS fallback_id FROM caratloop.materials m LEFT JOIN caratloop.accounts a ON a.company_id = m.company_id AND a.code = CASE m.category WHEN 'Gold' THEN 'STK-001' WHEN 'Silver' THEN 'STK-003' WHEN 'Diamond' THEN 'STK-004' WHEN 'Ruby' THEN 'STK-005' WHEN 'Emerald' THEN 'STK-006' WHEN 'Sapphire' THEN 'STK-007' ELSE 'STK-008' END WHERE m.id = :mid AND m.company_id = :cid LIMIT 1"),
                {"mid": str(mat_id), "cid": cid}
            )
            row = res.mappings().first()
            if row and row['stock_account_id']:
                return str(row['stock_account_id'])
            elif row and row['fallback_id']:
                return str(row['fallback_id'])
            return wip_account_id  # last resort

        seq = 1
        
        # 1. Consumption leg
        for line in payload.consumption_lines:
            mat_cost = line.qty_issued * (line.rate or 0)
            stk_acc = await get_material_stock_account(db, line.material_id, current_user["company_id"])
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :amount, 0, 'Transfer to WIP — ' || :order_no)"), {"jid": je_id, "seq": seq, "aid": wip_account_id, "amount": mat_cost, "order_no": order["order_no"]})
            seq += 1
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, 0, :amount, 'Raw material consumed in production — ' || :order_no)"), {"jid": je_id, "seq": seq, "aid": stk_acc, "amount": mat_cost, "order_no": order["order_no"]})
            seq += 1

        # 2. Output leg
        for out_line in payload.output_lines:
            out_val = out_line.qty_produced * (out_line.valuation_rate or 0)
            fg_stk_acc = await get_material_stock_account(db, out_line.material_id, current_user["company_id"])
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :amount, 0, 'Finished goods produced — ' || :order_no)"), {"jid": je_id, "seq": seq, "aid": fg_stk_acc, "amount": out_val, "order_no": order["order_no"]})
            seq += 1
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, 0, :amount, 'Transfer from WIP — ' || :order_no)"), {"jid": je_id, "seq": seq, "aid": wip_account_id, "amount": out_val, "order_no": order["order_no"]})
            seq += 1

        # 3. Wastage leg
        mfg_loss_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'MFG-002' AND company_id = :cid LIMIT 1"), {"cid": current_user["company_id"]})
        # .scalar() consumes the cursor; calling it twice raises ResourceClosedError.
        _mfg_loss_row = mfg_loss_res.scalar()
        mfg_loss_id = str(_mfg_loss_row) if _mfg_loss_row else wip_account_id
        for w_line in (payload.wastage_lines or []):
            w_val = w_line.qty_lost * (w_line.rate or 0)
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, :amount, 0, 'Manufacturing Loss — ' || :order_no)"), {"jid": je_id, "seq": seq, "aid": mfg_loss_id, "amount": w_val, "order_no": order["order_no"]})
            seq += 1
            await db.execute(text("INSERT INTO caratloop.journal_entry_lines (journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) VALUES (:jid, :seq, :aid, 0, :amount, 'Wastage from WIP — ' || :order_no)"), {"jid": je_id, "seq": seq, "aid": wip_account_id, "amount": w_val, "order_no": order["order_no"]})
            seq += 1

        # ─── STEP 6: Mark order as Completed ─────────────────────────────────
        await db.execute(
            text("""
                UPDATE caratloop.production_orders
                SET status = 'Completed',
                    actual_qty = :actual_qty,
                    completed_at = :completed_at
                WHERE id = :order_id
            """),
            {
                "actual_qty": total_fg_qty,
                "completed_at": datetime.now(timezone.utc),
                "order_id": str(order_id),
            },
        )

        # The header previously recorded only total_material_cost while the
        # lines also carried the finished-goods and wastage legs, so header and
        # lines permanently disagreed. assert_journal_balanced re-derives the
        # header from its own lines.
        await assert_journal_balanced(db, je_id, context="production completion journal entry")

        await db.commit()

        return {
            "status": "success",
            "message": f"Production order {order['order_no']} completed",
            "order_id": str(order_id),
            "journal_entry_no": je_no,
            "journal_entry_id": je_id,
            "consumption_entries": consumption_entry_ids,
            "output_entries": output_entry_ids,
            "total_material_cost": float(total_material_cost),
            "finished_goods_qty": float(total_fg_qty),
            "compliance": {
                "cgst_rule_56_12": "Monthly production account entry posted",
                "cgst_rule_56_2": "Stock ledger updated (inward/outward)",
                "section_44aa": f"Journal entry {je_no} posted (double-entry)",
                "mca_rule_11g": "Audit trail captured",
            },
        }

    except HTTPException:
        # Deliberate 4xx responses (validation, authorisation,
        # insufficient stock, unbalanced entry) must not be
        # rewritten as a 500.
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Production completion failed")
        raise HTTPException(
            status_code=500,
            detail="Production completion failed. The operation was rolled back and nothing was saved.",
        ) from e


@router.get("/monthly-account")
async def get_monthly_production_account(
    month_year: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    [CGST Rule 56(12)] Monthly Production Account Report.
    Returns quantitative details of raw materials used and finished goods produced.
    """
    result = await db.execute(
        text("""
            SELECT
                po.order_no,
                p.name AS product_name,
                p.collection_name,
                po.planned_qty,
                po.actual_qty,
                po.status,
                -- Raw materials consumed
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'material', m2.name,
                        'category', m2.category,
                        'qty_issued', pce.qty_issued,
                        'weight_gm', pce.net_weight,
                        'fine_weight', pce.fine_weight,
                        'rate', pce.rate,
                        'amount', pce.amount
                    ))
                    FROM caratloop.production_consumption_entries pce
                    JOIN caratloop.materials m2 ON m2.id = pce.material_id
                    WHERE pce.production_order_id = po.id
                ), '[]'::json) AS raw_materials_consumed,
                -- Finished goods produced
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'material', m3.name,
                        'qty_produced', poe.qty_produced,
                        'gross_weight', poe.gross_weight,
                        'hallmark_no', poe.hallmark_no
                    ))
                    FROM caratloop.production_output_entries poe
                    JOIN caratloop.materials m3 ON m3.id = poe.material_id
                    WHERE poe.production_order_id = po.id
                ), '[]'::json) AS finished_goods_produced,
                -- Wastage [CGST-R56-12]: Must record waste and by-products
                COALESCE((
                    SELECT json_agg(json_build_object(
                        'wastage_type', pwe.wastage_type,
                        'material', m4.name,
                        'qty_lost', pwe.qty_lost,
                        'loss_pct', pwe.loss_pct,
                        'recoverable_qty', pwe.recoverable_qty,
                        'amount', pwe.amount
                    ))
                    FROM caratloop.production_wastage_entries pwe
                    JOIN caratloop.materials m4 ON m4.id = pwe.material_id
                    WHERE pwe.production_order_id = po.id
                ), '[]'::json) AS wastage_details
            FROM caratloop.production_orders po
            JOIN caratloop.products p ON p.id = po.product_id
            WHERE po.month_year = :month_year
              AND po.company_id = :company_id
            ORDER BY po.order_date
        """),
        {"month_year": month_year, "company_id": current_user["company_id"]},
    )
    rows = result.mappings().all()
    return {
        "month_year": month_year,
        "cgst_rule": "56(12)",
        "production_orders": [dict(r) for r in rows],
    }
