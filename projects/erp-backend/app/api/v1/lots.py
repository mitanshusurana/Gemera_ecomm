"""
Caratloop ERP — Loose gemstone lots and parcels
[CGST Rule 56(2)] Stock register: the lot is the unit of gemstone stock

A gemstone dealer does not hold "12.40 carats of emerald"; it holds lot
EM-0417: 12.40 ct, 31 pieces, 3 mm sieve, oval, medium green, eye-clean,
Zambian, oiled, bought at Rs 8,200 a carat. Lots are split into parcels for a
setting job or a sale, parcels are merged back, and every cutting or
re-weighing loses a little. stock_batches existed for this and was never
written.

Carats move only through stock_ledger_entries, tagged with batch_id, so a
lot's balance is the sum of its own entries and the material's balance is the
sum of all of them. Splitting and merging re-tag carats between lots with
paired Adjustment_Out / Adjustment_In entries at the same location; the
material's total moves only by the recorded loss. Cost per carat is carried
into every child of a split and averaged on a merge, so stock value is neither
created nor destroyed by re-parcelling.
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, set_audit_context
from app.core.money import round_money, to_decimal
from app.core.pagination import Page, paginate
from app.core.roles import CAN_MOVE_STOCK, require
from app.core.security import get_current_user
from app.core.stock import assert_stock_available
from app.core.tenancy import resolve_fiscal_year, resolve_stock_location
from app.core.periods import assert_period_open

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Gemstone Lots"])

LOT_STATUSES = ("Open", "Split", "Merged", "Sold", "Closed")

# A split may lose a little weight to the balance and to cutting: the larger
# of a hundredth of a carat and half a percent of the parent. Anything more
# is not a split, it is a loss, and must be recorded as one through /adjust
# so the register says what happened.
SPLIT_TOLERANCE_CT = Decimal("0.01")
SPLIT_TOLERANCE_PCT = Decimal("0.5")

CARAT = Decimal("0.001")


def _ct(v) -> Decimal:
    return to_decimal(v).quantize(CARAT, rounding=ROUND_HALF_UP)


# ─── Pure arithmetic (unit-tested without a database) ────────────────────────

def split_loss(parent_carats, children_carats, *, tolerance_ct=SPLIT_TOLERANCE_CT, tolerance_pct=SPLIT_TOLERANCE_PCT) -> Decimal:
    """The carats a split loses, after checking the children add up.

    Raises ValueError when there are no children, a child is not positive, the
    children weigh more than the parent (a split cannot create carats), or the
    shortfall exceeds the tolerance.
    """
    parent = _ct(parent_carats)
    weights = [_ct(w) for w in children_carats]
    if not weights:
        raise ValueError("A split needs at least one child parcel.")
    if any(w <= 0 for w in weights):
        raise ValueError("Every child parcel must weigh more than zero carats.")
    total = sum(weights, Decimal("0"))
    if total > parent:
        raise ValueError(
            f"Children weigh {total} ct but the parent holds {parent} ct; a split cannot create carats."
        )
    loss = parent - total
    allowed = max(_ct(tolerance_ct), _ct(parent * _ct(tolerance_pct) / 100))
    if loss > allowed:
        raise ValueError(
            f"Children weigh {total} ct against a parent of {parent} ct: {loss} ct short, "
            f"more than the {allowed} ct tolerance. Record the loss with /adjust first."
        )
    return loss


def merged_cost_per_carat(parts) -> Optional[Decimal]:
    """Weighted-average cost per carat of ``[(carats, cost_per_carat), ...]``.

    None when no part carries a cost. Parts without a cost weigh into the
    carats but contribute nothing to the value, which understates the average
    rather than inventing a figure.
    """
    carats = Decimal("0")
    value = Decimal("0")
    any_cost = False
    for c, cost in parts:
        c = _ct(c)
        carats += c
        if cost is not None:
            any_cost = True
            value += c * to_decimal(cost)
    if not any_cost or carats <= 0:
        return None
    return round_money(value / carats)


def child_lot_no(parent_lot_no: str, index: int) -> str:
    return f"{parent_lot_no}-{index}"


# ─── Payloads ────────────────────────────────────────────────────────────────

class CreateLotRequest(BaseModel):
    material_id: UUID
    carat_weight: Decimal = Field(gt=0)
    piece_count: Optional[int] = Field(default=None, gt=0)
    sieve_size: Optional[str] = Field(default=None, max_length=20)
    shape: Optional[str] = Field(default=None, max_length=30)
    colour: Optional[str] = Field(default=None, max_length=30)
    clarity: Optional[str] = Field(default=None, max_length=20)
    origin: Optional[str] = Field(default=None, max_length=60)
    treatment: Optional[str] = Field(default=None, max_length=60)
    cost_per_carat: Optional[Decimal] = Field(default=None, ge=0)
    certificate_no: Optional[str] = Field(default=None, max_length=50)
    location_id: Optional[UUID] = None
    # Allocated as LOT/<FY>/<n> when absent.
    lot_no: Optional[str] = Field(default=None, max_length=30)
    # 'opening': the carats are new to the books (an Opening entry).
    # 'purchase': the carats were already received through a purchase invoice
    #             and are being tagged into this lot (a re-tag, quantity-neutral).
    source: str = Field(default="opening", pattern="^(opening|purchase)$")
    purchase_invoice_id: Optional[UUID] = None
    entry_date: Optional[date] = None
    remarks: Optional[str] = None
    reason: str = "Gemstone lot opened"


class SplitChild(BaseModel):
    carat_weight: Decimal = Field(gt=0)
    piece_count: Optional[int] = Field(default=None, gt=0)
    sieve_size: Optional[str] = Field(default=None, max_length=20)
    shape: Optional[str] = Field(default=None, max_length=30)
    colour: Optional[str] = Field(default=None, max_length=30)
    clarity: Optional[str] = Field(default=None, max_length=20)
    lot_no: Optional[str] = Field(default=None, max_length=30)


class SplitLotRequest(BaseModel):
    children: List[SplitChild] = Field(min_length=1)
    entry_date: Optional[date] = None
    reason: str = "Gemstone lot split"


class MergeLotsRequest(BaseModel):
    lot_ids: List[UUID] = Field(min_length=2)
    lot_no: Optional[str] = Field(default=None, max_length=30)
    sieve_size: Optional[str] = Field(default=None, max_length=20)
    entry_date: Optional[date] = None
    reason: str = "Gemstone lots merged"


class AdjustLotRequest(BaseModel):
    # The weight the lot now has after re-weighing or cutting. The difference
    # from the balance on the ledger is the adjustment.
    carat_weight: Decimal = Field(ge=0)
    entry_date: Optional[date] = None
    reason: str = Field(min_length=3)


# ─── Helpers ─────────────────────────────────────────────────────────────────

LOT_SELECT = """
    SELECT b.id, b.company_id, b.material_id, b.lot_no, b.batch_no, b.carat_weight, b.piece_count,
           b.sieve_size, b.shape, b.colour, b.clarity, b.origin, b.treatment,
           b.cost_per_carat, b.parent_lot_id, b.merged_into_lot_id, b.status,
           b.location_id, b.certificate_no, b.source_document_type, b.source_document_id,
           b.remarks, b.created_at, b.updated_at,
           m.code AS material_code, m.name AS material_name, m.category AS material_category,
           u.code AS uom,
           loc.code AS location_code, loc.name AS location_name,
           p.lot_no AS parent_lot_no,
           COALESCE((SELECT SUM(CASE WHEN e.direction = 'I' THEN e.quantity ELSE -e.quantity END)
                     FROM caratloop.stock_ledger_entries e WHERE e.batch_id = b.id), 0) AS balance_carats,
           (SELECT COUNT(*) FROM caratloop.stock_batches c WHERE c.parent_lot_id = b.id) AS children_count
    FROM caratloop.stock_batches b
    JOIN caratloop.materials m ON m.id = b.material_id
    JOIN caratloop.units_of_measure u ON u.id = m.uom_id
    LEFT JOIN caratloop.stock_locations loc ON loc.id = b.location_id
    LEFT JOIN caratloop.stock_batches p ON p.id = b.parent_lot_id
"""


def _row(r) -> dict:
    out = dict(r)
    for k in ("id", "company_id", "material_id", "parent_lot_id", "merged_into_lot_id",
              "location_id", "source_document_id"):
        if out.get(k) is not None:
            out[k] = str(out[k])
    return out


async def _load_lot(db: AsyncSession, lot_id, company_id, *, for_update: bool = False):
    sql = LOT_SELECT + " WHERE b.id = :id AND b.company_id = :cid"
    if for_update:
        sql += " FOR UPDATE OF b"
    res = await db.execute(text(sql), {"id": str(lot_id), "cid": str(company_id)})
    lot = res.mappings().first()
    if lot is None:
        raise HTTPException(status_code=404, detail="Lot not found")
    return lot


async def _allocate_lot_no(db: AsyncSession, company_id, fy) -> str:
    res = await db.execute(
        text("SELECT caratloop.next_document_number(:cid, :fyid, 'StockLot')"),
        {"cid": str(company_id), "fyid": str(fy["id"])},
    )
    return f"LOT/{fy['year_label']}/{res.scalar():05d}"


async def _lot_no_is_free(db: AsyncSession, company_id, lot_no: str) -> None:
    res = await db.execute(
        text("SELECT 1 FROM caratloop.stock_batches WHERE company_id = :cid AND lot_no = :no"),
        {"cid": str(company_id), "no": lot_no},
    )
    if res.scalar():
        raise HTTPException(status_code=409, detail=f"Lot number {lot_no} is already in use.")


async def _insert_lot(db: AsyncSession, *, company_id, material_id, lot_no, carats, piece_count,
                      sieve_size, shape, colour, clarity, origin, treatment, cost_per_carat,
                      location_id, certificate_no, parent_lot_id, source_type, source_id,
                      remarks, user_id) -> str:
    # batch_no and qty_received are the baseline's NOT NULL columns; the lot
    # number and the carats are their meaning here.
    res = await db.execute(
        text("""
            INSERT INTO caratloop.stock_batches (
                company_id, material_id, batch_no, lot_no, carat_weight, piece_count,
                sieve_size, shape, colour, clarity, origin, treatment, cost_per_carat,
                purchase_rate, qty_received, location_id, certificate_no,
                parent_lot_id, status, source_document_type, source_document_id,
                remarks, created_by
            ) VALUES (
                :cid, :mid, :lot_no, :lot_no, :carats, :pieces,
                :sieve, :shape, :colour, :clarity, :origin, :treatment, :cpc,
                :cpc, :carats, :loc, :cert,
                :parent, 'Open', :src_type, :src_id,
                :remarks, CAST(:cb AS UUID)
            ) RETURNING id
        """),
        {
            "cid": str(company_id), "mid": str(material_id), "lot_no": lot_no,
            "carats": carats, "pieces": piece_count, "sieve": sieve_size, "shape": shape,
            "colour": colour, "clarity": clarity, "origin": origin, "treatment": treatment,
            "cpc": cost_per_carat, "loc": str(location_id) if location_id else None,
            "cert": certificate_no, "parent": str(parent_lot_id) if parent_lot_id else None,
            "src_type": source_type, "src_id": str(source_id) if source_id else None,
            "remarks": remarks, "cb": user_id,
        },
    )
    return str(res.scalar())


async def _post_carats(db: AsyncSession, *, company_id, fiscal_year_id, location_id, material_id,
                       batch_id, direction: str, transaction_type: str, carats: Decimal,
                       amount: Decimal, entry_date: date, doc_type: str, doc_id, doc_no: str,
                       remarks: str, user_id: str, ip_address: str) -> None:
    """One stock ledger entry, tagged with the lot. sequence_no is per company."""
    await db.execute(
        text("""
            INSERT INTO caratloop.stock_ledger_entries (
                company_id, fiscal_year_id, location_id, material_id, batch_id, entry_date,
                direction, transaction_type, quantity, amount,
                source_document_type, source_document_id, source_document_no, remarks,
                sequence_no, created_by, ip_address
            ) VALUES (
                :cid, :fyid, :loc, :mid, :bid, :edate,
                :direction, :ttype, :qty, :amt,
                :doc_type, :doc_id, :doc_no, :remarks,
                COALESCE((SELECT MAX(sequence_no) FROM caratloop.stock_ledger_entries WHERE company_id = :cid), 0) + 1,
                CAST(:cb AS UUID), CAST(:ip AS INET)
            )
        """),
        {
            "cid": str(company_id), "fyid": str(fiscal_year_id), "loc": str(location_id),
            "mid": str(material_id), "bid": str(batch_id) if batch_id else None, "edate": entry_date,
            "direction": direction, "ttype": transaction_type, "qty": carats, "amt": amount,
            "doc_type": doc_type, "doc_id": str(doc_id) if doc_id else None, "doc_no": doc_no,
            "remarks": remarks, "cb": user_id, "ip": ip_address,
        },
    )


def _value(carats: Decimal, cost_per_carat) -> Decimal:
    return round_money(_ct(carats) * to_decimal(cost_per_carat)) if cost_per_carat is not None else Decimal("0")


def _ctx(request: Request, current_user: dict):
    return (
        str(current_user["id"]),
        current_user["company_id"],
        request.client.host if request.client else "0.0.0.0",
        current_user.get("session_id", "0"),
    )


# ─── Read ────────────────────────────────────────────────────────────────────

@router.get("")
async def list_lots(
    material_id: Optional[UUID] = None,
    status: Optional[str] = None,
    parent_lot_id: Optional[UUID] = None,
    q: Optional[str] = None,
    open_only: bool = False,
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Lots with their balance, filterable by material, status or parent.

    Returns every lot flat (with parent_lot_id) so the client can build the
    split tree; roots are the lots with no parent.
    """
    sql = LOT_SELECT + " WHERE b.company_id = :cid"
    params: dict = {"cid": str(current_user["company_id"])}
    if material_id:
        sql += " AND b.material_id = :mid"
        params["mid"] = str(material_id)
    if status:
        if status not in LOT_STATUSES:
            raise HTTPException(status_code=422, detail=f"status must be one of {', '.join(LOT_STATUSES)}")
        sql += " AND b.status = :status"
        params["status"] = status
    if open_only:
        sql += " AND b.status = 'Open'"
    if parent_lot_id:
        sql += " AND b.parent_lot_id = :parent"
        params["parent"] = str(parent_lot_id)
    if q:
        sql += " AND (b.lot_no ILIKE :q OR m.name ILIKE :q OR m.code ILIKE :q OR b.sieve_size ILIKE :q)"
        params["q"] = f"%{q}%"
    sql += " ORDER BY b.created_at DESC, b.lot_no"
    sql = page.apply(sql)
    params.update(page.params)
    res = await db.execute(text(sql), params)
    return {"lots": [_row(r) for r in res.mappings().all()]}


@router.get("/{lot_id}")
async def get_lot(
    lot_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """One lot, its children, and every carat that moved through it."""
    cid = str(current_user["company_id"])
    lot = await _load_lot(db, lot_id, cid)
    children = await db.execute(
        text(LOT_SELECT + " WHERE b.parent_lot_id = :id AND b.company_id = :cid ORDER BY b.lot_no"),
        {"id": str(lot_id), "cid": cid},
    )
    moves = await db.execute(
        text("""
            SELECT e.id, e.entry_date, e.direction, e.transaction_type, e.quantity, e.amount,
                   e.source_document_type, e.source_document_id, e.source_document_no,
                   e.remarks, e.sequence_no, e.created_at, loc.code AS location_code
            FROM caratloop.stock_ledger_entries e
            LEFT JOIN caratloop.stock_locations loc ON loc.id = e.location_id
            WHERE e.batch_id = :id AND e.company_id = :cid
            ORDER BY e.sequence_no, e.created_at
        """),
        {"id": str(lot_id), "cid": cid},
    )
    entries = []
    running = Decimal("0")
    for e in moves.mappings().all():
        d = dict(e)
        qty = to_decimal(d["quantity"])
        running += qty if d["direction"] == "I" else -qty
        d["running_balance"] = running
        if d.get("source_document_id") is not None:
            d["source_document_id"] = str(d["source_document_id"])
        entries.append(d)
    out = _row(lot)
    out["children"] = [_row(r) for r in children.mappings().all()]
    out["movements"] = entries
    return out


# ─── Write ───────────────────────────────────────────────────────────────────

@router.post("", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def create_lot(
    payload: CreateLotRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Open a lot from opening stock or from carats already received.

    Opening stock writes one inward entry tagged with the lot. Tagging a
    purchase re-parcels carats the material already holds: an untagged
    outward and a tagged inward of the same carats and value at the same
    location, so the material's balance is unchanged and the lot's balance
    appears.
    """
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, payload.reason)
    await assert_period_open(db, company_id, getattr(payload, "entry_date", None) or date.today(), what="This lot movement")
    try:
        mat = await db.execute(
            text("SELECT id, name FROM caratloop.materials WHERE id = :mid AND company_id = :cid AND is_active"),
            {"mid": str(payload.material_id), "cid": company_id},
        )
        material = mat.mappings().first()
        if material is None:
            raise HTTPException(status_code=404, detail="Material not found")

        fy = await resolve_fiscal_year(db, company_id)
        loc_id = str(payload.location_id) if payload.location_id else str(await resolve_stock_location(db, company_id))
        entry_date = payload.entry_date or date.today()
        carats = _ct(payload.carat_weight)

        if payload.lot_no:
            lot_no = payload.lot_no.strip()
            await _lot_no_is_free(db, company_id, lot_no)
        else:
            lot_no = await _allocate_lot_no(db, company_id, fy)

        if payload.source == "purchase":
            # The carats must already be there, untagged, at this location.
            await assert_stock_available(
                db, company_id, payload.material_id, carats,
                location_id=loc_id, context=f"lot {lot_no}", material_label=material["name"],
            )

        lot_id = await _insert_lot(
            db, company_id=company_id, material_id=payload.material_id, lot_no=lot_no, carats=carats,
            piece_count=payload.piece_count, sieve_size=payload.sieve_size, shape=payload.shape,
            colour=payload.colour, clarity=payload.clarity, origin=payload.origin,
            treatment=payload.treatment, cost_per_carat=payload.cost_per_carat, location_id=loc_id,
            certificate_no=payload.certificate_no, parent_lot_id=None,
            source_type="PurchaseInvoice" if payload.source == "purchase" else "Opening",
            source_id=payload.purchase_invoice_id if payload.source == "purchase" else None,
            remarks=payload.remarks, user_id=user_id,
        )
        value = _value(carats, payload.cost_per_carat)
        common = dict(
            company_id=company_id, fiscal_year_id=fy["id"], location_id=loc_id,
            material_id=payload.material_id, carats=carats, amount=value, entry_date=entry_date,
            doc_type="StockLot", doc_id=lot_id, doc_no=lot_no, user_id=user_id, ip_address=ip,
        )
        if payload.source == "purchase":
            await _post_carats(db, batch_id=None, direction="O", transaction_type="Adjustment_Out",
                               remarks=f"Carats tagged into lot {lot_no}", **common)
            await _post_carats(db, batch_id=lot_id, direction="I", transaction_type="Adjustment_In",
                               remarks=f"Lot {lot_no} opened from purchase", **common)
        else:
            await _post_carats(db, batch_id=lot_id, direction="I", transaction_type="Opening",
                               remarks=f"Lot {lot_no} opening stock", **common)

        await db.commit()
        return {"status": "success", "id": lot_id, "lot_no": lot_no, "carat_weight": str(carats)}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Lot creation failed")
        raise HTTPException(
            status_code=500,
            detail="Lot creation failed. The operation was rolled back and nothing was saved.",
        ) from e


@router.post("/{lot_id}/split", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def split_lot(
    lot_id: UUID,
    payload: SplitLotRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Divide an open lot into child parcels.

    The children must weigh what the parent holds, within tolerance; the
    difference is booked as the parent's loss. The parent is emptied and
    marked Split; each child inherits the parent's stone attributes unless
    the payload overrides them, and the parent's cost per carat.
    """
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, payload.reason)
    await assert_period_open(db, company_id, getattr(payload, "entry_date", None) or date.today(), what="This lot movement")
    try:
        parent = await _load_lot(db, lot_id, company_id, for_update=True)
        if parent["status"] != "Open":
            raise HTTPException(status_code=409, detail=f"Lot {parent['lot_no']} is {parent['status']}; only an Open lot can be split.")
        balance = _ct(parent["balance_carats"])
        if balance <= 0:
            raise HTTPException(status_code=409, detail=f"Lot {parent['lot_no']} holds no carats.")
        try:
            loss = split_loss(balance, [c.carat_weight for c in payload.children])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        fy = await resolve_fiscal_year(db, company_id)
        loc_id = str(parent["location_id"]) if parent["location_id"] else str(await resolve_stock_location(db, company_id))
        entry_date = payload.entry_date or date.today()
        cpc = parent["cost_per_carat"]

        # Parent out, in full.
        await _post_carats(
            db, company_id=company_id, fiscal_year_id=fy["id"], location_id=loc_id,
            material_id=parent["material_id"], batch_id=str(parent["id"]), direction="O",
            transaction_type="Adjustment_Out", carats=balance, amount=_value(balance, cpc),
            entry_date=entry_date, doc_type="StockLot", doc_id=parent["id"], doc_no=parent["lot_no"],
            remarks=f"Split into {len(payload.children)} parcel(s)" + (f"; {loss} ct lost" if loss > 0 else ""),
            user_id=user_id, ip_address=ip,
        )

        children_out = []
        for idx, child in enumerate(payload.children, 1):
            c_carats = _ct(child.carat_weight)
            c_no = child.lot_no.strip() if child.lot_no else child_lot_no(parent["lot_no"], idx)
            await _lot_no_is_free(db, company_id, c_no)
            c_id = await _insert_lot(
                db, company_id=company_id, material_id=parent["material_id"], lot_no=c_no, carats=c_carats,
                piece_count=child.piece_count, sieve_size=child.sieve_size or parent["sieve_size"],
                shape=child.shape or parent["shape"], colour=child.colour or parent["colour"],
                clarity=child.clarity or parent["clarity"], origin=parent["origin"],
                treatment=parent["treatment"], cost_per_carat=cpc, location_id=loc_id,
                certificate_no=None, parent_lot_id=parent["id"], source_type="StockLot",
                source_id=parent["id"], remarks=f"Split from {parent['lot_no']}", user_id=user_id,
            )
            await _post_carats(
                db, company_id=company_id, fiscal_year_id=fy["id"], location_id=loc_id,
                material_id=parent["material_id"], batch_id=c_id, direction="I",
                transaction_type="Adjustment_In", carats=c_carats, amount=_value(c_carats, cpc),
                entry_date=entry_date, doc_type="StockLot", doc_id=c_id, doc_no=c_no,
                remarks=f"Split from {parent['lot_no']}", user_id=user_id, ip_address=ip,
            )
            children_out.append({"id": c_id, "lot_no": c_no, "carat_weight": str(c_carats)})

        await db.execute(
            text("UPDATE caratloop.stock_batches SET status = 'Split', updated_at = NOW() WHERE id = :id AND company_id = :cid"),
            {"id": str(parent["id"]), "cid": str(company_id)},
        )
        await db.commit()
        return {
            "status": "success",
            "parent": {"id": str(parent["id"]), "lot_no": parent["lot_no"], "carat_weight": str(balance)},
            "children": children_out,
            "loss_carats": str(loss),
        }
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Lot split failed")
        raise HTTPException(
            status_code=500,
            detail="Lot split failed. The operation was rolled back and nothing was saved.",
        ) from e


@router.post("/merge", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def merge_lots(
    payload: MergeLotsRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Combine open lots of one material into a new lot.

    The new lot holds the sum of the balances and pieces at the weighted
    average cost per carat. Sources are emptied and marked Merged, pointing
    at the new lot.
    """
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, payload.reason)
    await assert_period_open(db, company_id, getattr(payload, "entry_date", None) or date.today(), what="This lot movement")
    try:
        ids = list(dict.fromkeys(str(i) for i in payload.lot_ids))
        if len(ids) < 2:
            raise HTTPException(status_code=422, detail="A merge needs at least two distinct lots.")
        sources = []
        for lid in ids:
            lot = await _load_lot(db, lid, company_id, for_update=True)
            if lot["status"] != "Open":
                raise HTTPException(status_code=409, detail=f"Lot {lot['lot_no']} is {lot['status']}; only Open lots can be merged.")
            if _ct(lot["balance_carats"]) <= 0:
                raise HTTPException(status_code=409, detail=f"Lot {lot['lot_no']} holds no carats.")
            sources.append(lot)
        materials = {str(s["material_id"]) for s in sources}
        if len(materials) != 1:
            raise HTTPException(status_code=422, detail="Lots of different materials cannot be merged.")
        locations = {str(s["location_id"]) for s in sources if s["location_id"]}
        if len(locations) > 1:
            raise HTTPException(status_code=422, detail="Lots at different locations cannot be merged; transfer them first.")

        fy = await resolve_fiscal_year(db, company_id)
        material_id = sources[0]["material_id"]
        loc_id = next(iter(locations)) if locations else str(await resolve_stock_location(db, company_id))
        entry_date = payload.entry_date or date.today()

        total = sum((_ct(s["balance_carats"]) for s in sources), Decimal("0"))
        pieces = [s["piece_count"] for s in sources]
        piece_count = sum(pieces) if all(p is not None for p in pieces) else None
        cpc = merged_cost_per_carat([(s["balance_carats"], s["cost_per_carat"]) for s in sources])

        first = sources[0]
        def _common(attr):
            vals = {s[attr] for s in sources}
            return first[attr] if len(vals) == 1 else None

        if payload.lot_no:
            new_no = payload.lot_no.strip()
            await _lot_no_is_free(db, company_id, new_no)
        else:
            new_no = await _allocate_lot_no(db, company_id, fy)
        new_id = await _insert_lot(
            db, company_id=company_id, material_id=material_id, lot_no=new_no, carats=total,
            piece_count=piece_count, sieve_size=payload.sieve_size or _common("sieve_size"),
            shape=_common("shape"), colour=_common("colour"), clarity=_common("clarity"),
            origin=_common("origin"), treatment=_common("treatment"), cost_per_carat=cpc,
            location_id=loc_id, certificate_no=None, parent_lot_id=None, source_type="StockLot",
            source_id=None, remarks="Merged from " + ", ".join(s["lot_no"] or "?" for s in sources),
            user_id=user_id,
        )

        for s in sources:
            bal = _ct(s["balance_carats"])
            await _post_carats(
                db, company_id=company_id, fiscal_year_id=fy["id"], location_id=loc_id,
                material_id=material_id, batch_id=str(s["id"]), direction="O",
                transaction_type="Adjustment_Out", carats=bal, amount=_value(bal, s["cost_per_carat"]),
                entry_date=entry_date, doc_type="StockLot", doc_id=new_id, doc_no=new_no,
                remarks=f"Merged into {new_no}", user_id=user_id, ip_address=ip,
            )
            await db.execute(
                text(
                    "UPDATE caratloop.stock_batches SET status = 'Merged', merged_into_lot_id = :new, updated_at = NOW() "
                    "WHERE id = :id AND company_id = :cid"
                ),
                {"new": new_id, "id": str(s["id"]), "cid": str(company_id)},
            )
        await _post_carats(
            db, company_id=company_id, fiscal_year_id=fy["id"], location_id=loc_id,
            material_id=material_id, batch_id=new_id, direction="I",
            transaction_type="Adjustment_In", carats=total, amount=_value(total, cpc),
            entry_date=entry_date, doc_type="StockLot", doc_id=new_id, doc_no=new_no,
            remarks="Merged from " + ", ".join(s["lot_no"] or "?" for s in sources),
            user_id=user_id, ip_address=ip,
        )
        await db.commit()
        return {
            "status": "success",
            "id": new_id, "lot_no": new_no, "carat_weight": str(total),
            "piece_count": piece_count,
            "cost_per_carat": str(cpc) if cpc is not None else None,
            "merged": [{"id": str(s["id"]), "lot_no": s["lot_no"]} for s in sources],
        }
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Lot merge failed")
        raise HTTPException(
            status_code=500,
            detail="Lot merge failed. The operation was rolled back and nothing was saved.",
        ) from e


@router.post("/{lot_id}/adjust", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def adjust_lot(
    lot_id: UUID,
    payload: AdjustLotRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Re-weigh a lot: book the difference as a loss (or, rarely, a gain).

    Loss on cutting, polishing dust, a stone that turned out lighter on the
    balance -- the new weight is given and the ledger moves by the
    difference. A lot brought to zero is Closed.
    """
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, payload.reason)
    await assert_period_open(db, company_id, getattr(payload, "entry_date", None) or date.today(), what="This lot movement")
    try:
        lot = await _load_lot(db, lot_id, company_id, for_update=True)
        if lot["status"] != "Open":
            raise HTTPException(status_code=409, detail=f"Lot {lot['lot_no']} is {lot['status']}; only an Open lot can be adjusted.")
        balance = _ct(lot["balance_carats"])
        new_weight = _ct(payload.carat_weight)
        delta = new_weight - balance
        if delta == 0:
            return {"status": "unchanged", "lot_no": lot["lot_no"], "carat_weight": str(balance)}

        fy = await resolve_fiscal_year(db, company_id)
        loc_id = str(lot["location_id"]) if lot["location_id"] else str(await resolve_stock_location(db, company_id))
        entry_date = payload.entry_date or date.today()
        qty = abs(delta)
        await _post_carats(
            db, company_id=company_id, fiscal_year_id=fy["id"], location_id=loc_id,
            material_id=lot["material_id"], batch_id=str(lot["id"]),
            direction="O" if delta < 0 else "I",
            transaction_type="Adjustment_Out" if delta < 0 else "Adjustment_In",
            carats=qty, amount=_value(qty, lot["cost_per_carat"]), entry_date=entry_date,
            doc_type="StockLot", doc_id=lot["id"], doc_no=lot["lot_no"],
            remarks=payload.reason, user_id=user_id, ip_address=ip,
        )
        new_status = "Closed" if new_weight <= 0 else "Open"
        await db.execute(
            text(
                "UPDATE caratloop.stock_batches SET carat_weight = :w, status = :st, updated_at = NOW() "
                "WHERE id = :id AND company_id = :cid"
            ),
            {"w": new_weight, "st": new_status, "id": str(lot["id"]), "cid": str(company_id)},
        )
        await db.commit()
        return {
            "status": "success",
            "lot_no": lot["lot_no"],
            "previous_carats": str(balance),
            "carat_weight": str(new_weight),
            "delta_carats": str(delta),
            "lot_status": new_status,
        }
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Lot adjustment failed")
        raise HTTPException(
            status_code=500,
            detail="Lot adjustment failed. The operation was rolled back and nothing was saved.",
        ) from e
