"""
Caratloop ERP — Production Order API
[CGST Rule 56(12)] Monthly Production Account
[CGST Rule 56(2)]  Stock Register updates
[S44AA]            Double-entry journal entry for manufacturing
[MCA-11g]          All entries are append-only with full audit trail
"""
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from pydantic import BaseModel

from app.core.database import get_db, set_audit_context
from app.core.security import get_current_user

router = APIRouter(prefix="/production", tags=["Manufacturing"])


# ─── Pydantic Schemas ────────────────────────────────────────────────────────

class MaterialConsumptionLine(BaseModel):
    material_id: UUID
    batch_no: Optional[str] = None
    qty_issued: float
    gross_weight: Optional[float] = None
    net_weight: Optional[float] = None
    purity: Optional[float] = None
    rate: Optional[float] = None
    remarks: Optional[str] = None


class OutputLine(BaseModel):
    material_id: UUID         # Finished good material ID
    qty_produced: float
    gross_weight: Optional[float] = None
    net_weight: Optional[float] = None
    hallmark_no: Optional[str] = None
    quality_grade: Optional[str] = None
    valuation_rate: Optional[float] = None


class WastageLine(BaseModel):
    material_id: UUID
    wastage_type: str         # Melting_Loss, Polishing_Loss, etc.
    qty_lost: float
    loss_pct: Optional[float] = None
    recoverable_qty: Optional[float] = None
    rate: Optional[float] = None
    remarks: Optional[str] = None


class CreateProductionOrderRequest(BaseModel):
    product_name: str = "Gold Jewelry Item"
    order_date: date = date.today()
    planned_qty: float = 1.0
    allowed_wastage_pct: float = 2.5
    remarks: Optional[str] = None
    reason: str = "Production order creation"


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
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """List all production orders [CGST-R56-12]."""
    query = """
        SELECT
            po.id, po.order_no, po.order_date, po.status, po.month_year,
            po.planned_qty, po.actual_qty,
            p.name AS product_name, p.collection_name,
            p.sku AS product_sku
        FROM caratloop.production_orders po
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

    result = await db.execute(text(query), params)
    orders = result.mappings().all()
    return {"orders": [dict(o) for o in orders]}


@router.post("/orders")
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
        # 1. Get or create product
        prod_res = await db.execute(
            text("SELECT id FROM caratloop.products WHERE company_id = :cid LIMIT 1"),
            {"cid": company_id}
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

        # 2. Get or create BOM
        bom_res = await db.execute(
            text("SELECT id FROM caratloop.bom_headers WHERE product_id = :pid LIMIT 1"),
            {"pid": prod_id}
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
        fy_res = await db.execute(
            text("SELECT id, year_label FROM caratloop.fiscal_years WHERE company_id = :cid AND is_active = TRUE LIMIT 1"),
            {"cid": company_id}
        )
        fy = fy_res.mappings().first()
        if not fy:
            fy_res = await db.execute(text("SELECT id, year_label FROM caratloop.fiscal_years LIMIT 1"))
            fy = fy_res.mappings().first()

        # 4. Generate Order No
        cnt_res = await db.execute(
            text("SELECT COUNT(*) FROM caratloop.production_orders WHERE company_id = :cid"),
            {"cid": company_id}
        )
        cnt = cnt_res.scalar() + 1
        order_no = f"PO-{fy['year_label']}-{cnt:04d}"
        month_year = payload.order_date.strftime("%Y-%m")

        po_res = await db.execute(
            text("""
                INSERT INTO caratloop.production_orders (
                    company_id, fiscal_year_id, order_no, order_date, product_id, bom_id,
                    planned_qty, status, month_year, remarks, created_by
                ) VALUES (
                    :cid, :fyid, :ono, :odate, :pid, :bomid,
                    :pqty, 'In_Progress', :my, :rem, CAST(:cb AS UUID)
                ) RETURNING id
            """),
            {
                "cid": company_id,
                "fyid": fy["id"],
                "ono": order_no,
                "odate": payload.order_date,
                "pid": prod_id,
                "bomid": bom_id,
                "pqty": payload.planned_qty,
                "my": month_year,
                "rem": payload.remarks or f"Manufacturing order for {payload.product_name}",
                "cb": user_id
            }
        )
        po_id = po_res.scalar()
        await db.commit()
        return {"status": "success", "id": str(po_id), "order_no": order_no}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to create production order: {str(e)}")


@router.post("/orders/{order_id}/complete")
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
        {"order_id": str(order_id), "company_id": current_user["company_id"]},
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
        # ─── STEP 1: Get next sequence number for stock ledger ────────────────
        seq_result = await db.execute(
            text("SELECT nextval('caratloop.stock_ledger_entries_id_seq')")
        )
        # Not needed — BIGSERIAL handles it

        total_material_cost = Decimal("0")
        consumption_entry_ids = []
        output_entry_ids = []

        # ─── STEP 2: Post Consumption Entries [CGST-R56-12] ──────────────────
        # Record each raw material consumed in production
        for line in payload.consumption_lines:
            fine_wt = (float(line.net_weight) * float(line.purity)) if (line.purity and line.net_weight) else None
            mat_amount = float(line.qty_issued) * float(line.rate or 0)

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
                        COALESCE(po.production_location_id, (SELECT id FROM caratloop.stock_locations WHERE company_id = po.company_id LIMIT 1)),
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
                    "qty": float(line.qty_issued),
                    "rate": float(line.rate or 0),
                    "amount": mat_amount,
                    "gross_wt": float(line.gross_weight) if line.gross_weight is not None else None,
                    "net_wt": float(line.net_weight) if line.net_weight is not None else None,
                    "purity": float(line.purity) if line.purity is not None else None,
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
                    "qty_issued": float(line.qty_issued),
                    "gross_wt": float(line.gross_weight) if line.gross_weight is not None else None,
                    "net_wt": float(line.net_weight) if line.net_weight is not None else None,
                    "purity": float(line.purity) if line.purity is not None else None,
                    "fine_wt": fine_wt,
                    "rate": float(line.rate or 0),
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
        for w_line in (payload.wastage_lines or []):
            w_amount = float(w_line.qty_lost) * float(w_line.rate or 0)
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
                    "qty_lost": float(w_line.qty_lost),
                    "loss_pct": float(w_line.loss_pct) if w_line.loss_pct is not None else None,
                    "recoverable_qty": float(w_line.recoverable_qty or 0),
                    "rate": float(w_line.rate or 0),
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
            out_amount = float(out_line.qty_produced) * float(out_line.valuation_rate or 0)
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
                        COALESCE(po.production_location_id, (SELECT id FROM caratloop.stock_locations WHERE company_id = po.company_id LIMIT 1)),
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
                    "qty": float(out_line.qty_produced),
                    "rate": float(out_line.valuation_rate or 0),
                    "amount": out_amount,
                    "gross_wt": float(out_line.gross_weight) if out_line.gross_weight is not None else None,
                    "net_wt": float(out_line.net_weight) if out_line.net_weight is not None else None,
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
                    nextval('caratloop.journal_entries_id_seq')
                FROM caratloop.production_orders po
                WHERE po.id = :order_id
                RETURNING id
            """),
            {
                "je_no": je_no,
                "entry_date": payload.completion_date,
                "product_name": order["product_name"],
                "total_amount": float(total_material_cost),
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
        mfg_loss_res = await db.execute(text("SELECT id FROM caratloop.accounts WHERE code = 'MFG-LOSS' AND company_id = :cid LIMIT 1"), {"cid": current_user["company_id"]})
        mfg_loss_id = str(mfg_loss_res.scalar()) if mfg_loss_res.scalar() else wip_account_id
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
                "actual_qty": float(total_fg_qty),
                "completed_at": datetime.utcnow(),
                "order_id": str(order_id),
            },
        )

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

    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Production completion failed: {str(e)}")


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
