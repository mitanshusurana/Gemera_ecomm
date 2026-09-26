"""
Caratloop ERP — Stock locations and transfers
[CGST Rule 56(2)] Stock register per place of storage

stock_locations existed from the baseline with no way to list, create or edit
one, and the only stock transfer in the system was the approval-memo module
moving goods into its own APPROVAL location. A business with a vault, a
showroom, a production floor and a karigar's workshop moves stock between
them every day; each move is a paired Stock_Transfer -- 'O' out of one
location, 'I' into the other, same quantity, same cost -- so the total is
unchanged and each location's balance is right.
"""
from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.costing import cost_of_goods_sold
from app.core.database import get_db, set_audit_context
from app.core.money import to_decimal
from app.core.pagination import Page, paginate
from app.core.roles import CAN_AMEND, CAN_MOVE_STOCK, require
from app.core.security import get_current_user
from app.core.stock import assert_stock_available
from app.core.tenancy import resolve_fiscal_year
from app.core.periods import assert_period_open

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Stock Locations"])

# caratloop.stock_locations.location_type CHECK (chk_location_type). Any
# value not in this tuple is refused before it reaches the database.
LOCATION_TYPES = ("Vault", "Production_Floor", "Showroom", "Transit", "Godown", "Other")


class CreateLocationRequest(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    location_type: str = Field(default="Godown", max_length=30)
    address: Optional[str] = None
    is_default: bool = False
    reason: str = "Stock location created"

    @model_validator(mode="after")
    def _type_is_permitted(self):
        self.code = self.code.strip().upper()
        self.name = self.name.strip()
        if self.location_type not in LOCATION_TYPES:
            raise ValueError(f"location_type must be one of {', '.join(LOCATION_TYPES)}")
        return self


class UpdateLocationRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    location_type: Optional[str] = Field(default=None, max_length=30)
    address: Optional[str] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    reason: str = "Stock location updated"

    @model_validator(mode="after")
    def _type_is_permitted(self):
        if self.location_type is not None and self.location_type not in LOCATION_TYPES:
            raise ValueError(f"location_type must be one of {', '.join(LOCATION_TYPES)}")
        return self


class TransferLine(BaseModel):
    material_id: UUID
    quantity: Decimal = Field(gt=0)
    gross_weight: Optional[Decimal] = Field(default=None, ge=0)
    net_weight: Optional[Decimal] = Field(default=None, ge=0)
    remarks: Optional[str] = None


class CreateTransferRequest(BaseModel):
    from_location_id: UUID
    to_location_id: UUID
    lines: List[TransferLine] = Field(min_length=1)
    transfer_date: Optional[date] = None
    reason: str = Field(default="Stock transfer", min_length=3)

    @model_validator(mode="after")
    def _distinct_locations(self):
        if self.from_location_id == self.to_location_id:
            raise ValueError("from_location_id and to_location_id must differ")
        return self


def _ctx(request: Request, current_user: dict):
    return (
        str(current_user["id"]),
        current_user["company_id"],
        request.client.host if request.client else "0.0.0.0",
        current_user.get("session_id", "0"),
    )


def _row(r) -> dict:
    out = dict(r)
    for k in ("id", "company_id", "material_id", "location_id", "from_location_id", "to_location_id"):
        if out.get(k) is not None:
            out[k] = str(out[k])
    return out


# ─── Locations ───────────────────────────────────────────────────────────────

@router.get("")
async def list_locations(
    include_inactive: bool = False,
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The company's stock locations, default first, with stock value on hand."""
    sql = """
        SELECT l.id, l.company_id, l.code, l.name, l.location_type, l.address, l.is_active, l.is_default,
               COALESCE((SELECT COUNT(DISTINCT e.material_id) FROM caratloop.stock_ledger_entries e
                         WHERE e.location_id = l.id AND e.company_id = l.company_id), 0) AS materials_moved,
               COALESCE((SELECT SUM(CASE WHEN e.direction = 'I' THEN e.amount ELSE -e.amount END)
                         FROM caratloop.stock_ledger_entries e
                         WHERE e.location_id = l.id AND e.company_id = l.company_id), 0) AS stock_value
        FROM caratloop.stock_locations l
        WHERE l.company_id = :cid
    """
    if not include_inactive:
        sql += " AND l.is_active = TRUE"
    sql += " ORDER BY l.is_default DESC, l.code"
    sql = page.apply(sql)
    params = {"cid": str(current_user["company_id"])}
    params.update(page.params)
    res = await db.execute(text(sql), params)
    return {"locations": [_row(r) for r in res.mappings().all()], "location_types": list(LOCATION_TYPES)}


@router.post("", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def create_location(
    payload: CreateLocationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, payload.reason)
    try:
        dup = await db.execute(
            text("SELECT 1 FROM caratloop.stock_locations WHERE company_id = :cid AND code = :code"),
            {"cid": str(company_id), "code": payload.code},
        )
        if dup.scalar():
            raise HTTPException(status_code=409, detail=f"Location code {payload.code} already exists.")
        if payload.is_default:
            # One default per company (uq_stock_location_default).
            await db.execute(
                text("UPDATE caratloop.stock_locations SET is_default = FALSE WHERE company_id = :cid AND is_default"),
                {"cid": str(company_id)},
            )
        res = await db.execute(
            text("""
                INSERT INTO caratloop.stock_locations (company_id, code, name, location_type, address, is_default, is_active)
                VALUES (:cid, :code, :name, :ltype, :address, :is_default, TRUE)
                RETURNING id
            """),
            {
                "cid": str(company_id), "code": payload.code, "name": payload.name,
                "ltype": payload.location_type, "address": payload.address, "is_default": payload.is_default,
            },
        )
        loc_id = str(res.scalar())
        await db.commit()
        return {"status": "success", "id": loc_id, "code": payload.code}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Stock location creation failed")
        raise HTTPException(
            status_code=500,
            detail="Stock location creation failed. The operation was rolled back and nothing was saved.",
        ) from e


@router.patch("/{location_id}", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def update_location(
    location_id: UUID,
    payload: UpdateLocationRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, payload.reason)
    try:
        cur = await db.execute(
            text("SELECT id, is_default FROM caratloop.stock_locations WHERE id = :id AND company_id = :cid FOR UPDATE"),
            {"id": str(location_id), "cid": str(company_id)},
        )
        row = cur.mappings().first()
        if row is None:
            raise HTTPException(status_code=404, detail="Location not found")
        if payload.is_active is False and row["is_default"] and payload.is_default is not False:
            raise HTTPException(status_code=409, detail="The default location cannot be deactivated; make another one the default first.")
        if payload.is_default is False and row["is_default"]:
            raise HTTPException(status_code=409, detail="Set another location as the default instead of clearing this one.")

        is_active = payload.is_active
        if payload.is_default:
            await db.execute(
                text("UPDATE caratloop.stock_locations SET is_default = FALSE WHERE company_id = :cid AND is_default AND id <> :id"),
                {"cid": str(company_id), "id": str(location_id)},
            )
            if is_active is None:
                is_active = True

        # Bound parameters throughout; an absent field keeps its value.
        await db.execute(
            text("""
                UPDATE caratloop.stock_locations SET
                    name = COALESCE(:name, name),
                    location_type = COALESCE(:ltype, location_type),
                    address = COALESCE(:address, address),
                    is_active = COALESCE(:is_active, is_active),
                    is_default = COALESCE(:is_default, is_default)
                WHERE id = :id AND company_id = :cid
            """),
            {
                "name": payload.name.strip() if payload.name else None,
                "ltype": payload.location_type,
                "address": payload.address,
                "is_active": is_active,
                "is_default": True if payload.is_default else None,
                "id": str(location_id), "cid": str(company_id),
            },
        )
        await db.commit()
        return {"status": "success", "id": str(location_id)}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Stock location update failed")
        raise HTTPException(
            status_code=500,
            detail="Stock location update failed. The operation was rolled back and nothing was saved.",
        ) from e


# ─── Balances ────────────────────────────────────────────────────────────────

@router.get("/balances")
async def location_balances(
    location_id: Optional[UUID] = None,
    material_id: Optional[UUID] = None,
    as_of_date: Optional[date] = None,
    include_zero: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Quantity and value on hand per material at each location."""
    sql = """
        SELECT e.location_id, l.code AS location_code, l.name AS location_name, l.location_type,
               e.material_id, m.code AS material_code, m.name AS material_name, m.category, u.code AS uom,
               SUM(CASE WHEN e.direction = 'I' THEN e.quantity ELSE -e.quantity END) AS quantity,
               SUM(CASE WHEN e.direction = 'I' THEN COALESCE(e.net_weight, 0) ELSE -COALESCE(e.net_weight, 0) END) AS net_weight,
               SUM(CASE WHEN e.direction = 'I' THEN COALESCE(e.amount, 0) ELSE -COALESCE(e.amount, 0) END) AS value
        FROM caratloop.stock_ledger_entries e
        JOIN caratloop.stock_locations l ON l.id = e.location_id
        JOIN caratloop.materials m ON m.id = e.material_id
        JOIN caratloop.units_of_measure u ON u.id = m.uom_id
        WHERE e.company_id = :cid
          AND (CAST(:loc AS UUID) IS NULL OR e.location_id = CAST(:loc AS UUID))
          AND (CAST(:mid AS UUID) IS NULL OR e.material_id = CAST(:mid AS UUID))
          AND (CAST(:asof AS DATE) IS NULL OR e.entry_date <= CAST(:asof AS DATE))
        GROUP BY e.location_id, l.code, l.name, l.location_type, e.material_id, m.code, m.name, m.category, u.code
    """
    if not include_zero:
        sql += " HAVING SUM(CASE WHEN e.direction = 'I' THEN e.quantity ELSE -e.quantity END) <> 0"
    sql += " ORDER BY l.code, m.category, m.name"
    res = await db.execute(
        text(sql),
        {
            "cid": str(current_user["company_id"]),
            "loc": str(location_id) if location_id else None,
            "mid": str(material_id) if material_id else None,
            "asof": as_of_date,
        },
    )
    rows = [_row(r) for r in res.mappings().all()]
    return {
        "as_of_date": str(as_of_date) if as_of_date else None,
        "balances": rows,
        "total_value": sum((to_decimal(r["value"]) for r in rows), Decimal("0")),
    }


# ─── Transfers ───────────────────────────────────────────────────────────────

@router.get("/transfers")
async def list_transfers(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    location_id: Optional[UUID] = None,
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Transfer documents, one row per document, from the paired ledger entries."""
    sql = """
        SELECT e.source_document_no AS transfer_no,
               MIN(e.entry_date) AS transfer_date,
               MIN(CASE WHEN e.direction = 'O' THEN e.location_id END) AS from_location_id,
               MIN(CASE WHEN e.direction = 'I' THEN e.location_id END) AS to_location_id,
               MIN(CASE WHEN e.direction = 'O' THEN lf.code END) AS from_location_code,
               MIN(CASE WHEN e.direction = 'I' THEN lt.code END) AS to_location_code,
               COUNT(DISTINCT e.material_id) AS line_count,
               SUM(CASE WHEN e.direction = 'O' THEN e.quantity ELSE 0 END) AS total_quantity,
               SUM(CASE WHEN e.direction = 'O' THEN COALESCE(e.amount, 0) ELSE 0 END) AS total_value,
               MIN(e.remarks) AS remarks,
               MIN(e.created_at) AS created_at
        FROM caratloop.stock_ledger_entries e
        LEFT JOIN caratloop.stock_locations lf ON lf.id = e.location_id AND e.direction = 'O'
        LEFT JOIN caratloop.stock_locations lt ON lt.id = e.location_id AND e.direction = 'I'
        WHERE e.company_id = :cid AND e.source_document_type = 'StockTransfer'
          AND (CAST(:from_date AS DATE) IS NULL OR e.entry_date >= CAST(:from_date AS DATE))
          AND (CAST(:to_date AS DATE) IS NULL OR e.entry_date <= CAST(:to_date AS DATE))
          AND (CAST(:loc AS UUID) IS NULL OR e.location_id = CAST(:loc AS UUID))
        GROUP BY e.source_document_no
        ORDER BY MIN(e.entry_date) DESC, MIN(e.created_at) DESC
    """
    sql = page.apply(sql)
    params = {
        "cid": str(current_user["company_id"]),
        "from_date": from_date, "to_date": to_date,
        "loc": str(location_id) if location_id else None,
    }
    params.update(page.params)
    res = await db.execute(text(sql), params)
    return {"transfers": [_row(r) for r in res.mappings().all()]}


@router.get("/transfers/{transfer_no:path}")
async def get_transfer(
    transfer_no: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The lines of one transfer: each material's outward leg with its inward twin."""
    res = await db.execute(
        text("""
            SELECT e.id, e.entry_date, e.direction, e.material_id, m.code AS material_code, m.name AS material_name,
                   u.code AS uom, e.quantity, e.gross_weight, e.net_weight, e.amount,
                   e.location_id, l.code AS location_code, l.name AS location_name, e.remarks, e.created_at
            FROM caratloop.stock_ledger_entries e
            JOIN caratloop.materials m ON m.id = e.material_id
            JOIN caratloop.units_of_measure u ON u.id = m.uom_id
            JOIN caratloop.stock_locations l ON l.id = e.location_id
            WHERE e.company_id = :cid AND e.source_document_type = 'StockTransfer' AND e.source_document_no = :no
            ORDER BY e.sequence_no
        """),
        {"cid": str(current_user["company_id"]), "no": transfer_no},
    )
    rows = [_row(r) for r in res.mappings().all()]
    if not rows:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return {"transfer_no": transfer_no, "entries": rows}


@router.post("/transfers", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def create_transfer(
    payload: CreateTransferRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Move stock between two of the company's locations.

    Each line is refused if the source location does not hold the quantity.
    Both legs carry the weighted average cost at the moment of the move, so
    the transfer neither creates nor destroys stock value.
    """
    user_id, company_id, ip, session_id = _ctx(request, current_user)
    await set_audit_context(db, user_id, session_id, ip, payload.reason)
    await assert_period_open(db, company_id, payload.transfer_date or date.today(), what="This stock transfer")
    try:
        locs = await db.execute(
            text(
                "SELECT id, code, is_active FROM caratloop.stock_locations "
                "WHERE company_id = :cid AND id IN (CAST(:f AS UUID), CAST(:t AS UUID))"
            ),
            {"cid": str(company_id), "f": str(payload.from_location_id), "t": str(payload.to_location_id)},
        )
        found = {str(r["id"]): r for r in locs.mappings().all()}
        for which, lid in (("from", payload.from_location_id), ("to", payload.to_location_id)):
            loc = found.get(str(lid))
            if loc is None:
                raise HTTPException(status_code=404, detail=f"The {which} location does not belong to this company.")
            if not loc["is_active"]:
                raise HTTPException(status_code=409, detail=f"Location {loc['code']} is inactive.")

        fy = await resolve_fiscal_year(db, company_id)
        entry_date = payload.transfer_date or date.today()
        n = await db.execute(
            text("SELECT caratloop.next_document_number(:cid, :fyid, 'StockTransfer')"),
            {"cid": str(company_id), "fyid": str(fy["id"])},
        )
        transfer_no = f"TRF/{fy['year_label']}/{n.scalar():05d}"

        lines_out = []
        for idx, line in enumerate(payload.lines, 1):
            mat = await db.execute(
                text("SELECT id, code, name FROM caratloop.materials WHERE id = :mid AND company_id = :cid"),
                {"mid": str(line.material_id), "cid": str(company_id)},
            )
            material = mat.mappings().first()
            if material is None:
                raise HTTPException(status_code=404, detail=f"Line {idx}: material not found.")
            qty = to_decimal(line.quantity)
            await assert_stock_available(
                db, company_id, line.material_id, qty,
                location_id=payload.from_location_id,
                context=f"transfer {transfer_no} out of {found[str(payload.from_location_id)]['code']}",
                material_label=material["code"],
            )
            amount = await cost_of_goods_sold(db, company_id, line.material_id, qty)
            for direction, loc in (("O", payload.from_location_id), ("I", payload.to_location_id)):
                await db.execute(
                    text("""
                        INSERT INTO caratloop.stock_ledger_entries (
                            company_id, fiscal_year_id, location_id, material_id, entry_date,
                            direction, transaction_type, quantity, amount, gross_weight, net_weight,
                            source_document_type, source_document_no, remarks,
                            sequence_no, created_by, ip_address
                        ) VALUES (
                            :cid, :fyid, :loc, :mid, :edate,
                            :direction, 'Stock_Transfer', :qty, :amt, :gw, :nw,
                            'StockTransfer', :doc_no, :remarks,
                            COALESCE((SELECT MAX(sequence_no) FROM caratloop.stock_ledger_entries WHERE company_id = :cid), 0) + 1,
                            CAST(:cb AS UUID), CAST(:ip AS INET)
                        )
                    """),
                    {
                        "cid": str(company_id), "fyid": str(fy["id"]), "loc": str(loc),
                        "mid": str(line.material_id), "edate": entry_date, "direction": direction,
                        "qty": qty, "amt": amount, "gw": line.gross_weight, "nw": line.net_weight,
                        "doc_no": transfer_no, "remarks": line.remarks or payload.reason,
                        "cb": user_id, "ip": ip,
                    },
                )
            lines_out.append({"material_id": str(line.material_id), "material_code": material["code"],
                              "quantity": str(qty), "amount": str(amount)})

        await db.commit()
        return {
            "status": "success",
            "transfer_no": transfer_no,
            "transfer_date": str(entry_date),
            "from_location_id": str(payload.from_location_id),
            "to_location_id": str(payload.to_location_id),
            "lines": lines_out,
        }
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Stock transfer failed")
        raise HTTPException(
            status_code=500,
            detail="Stock transfer failed. The operation was rolled back and nothing was saved.",
        ) from e
