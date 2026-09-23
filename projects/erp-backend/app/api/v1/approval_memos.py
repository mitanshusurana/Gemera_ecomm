"""Approval memos (jangad) — goods sent on approval, returnable, later invoiced.

In the Jaipur gem trade a dealer takes stones on jangad: a memo lists what went
out and at what value, the goods stay the sender's property, and within a
fortnight or so they are either returned or the dealer keeps some and a tax
invoice is raised for those. The dispatch itself is not a supply, so no GST is
charged and nothing is posted to the books of account; only the stock moves.

Stock leaves the default location into a per-company 'APPROVAL' location
(type Transit) as a Stock_Transfer, so on-hand stock is correct and the
register shows what is out with whom. A return reverses that. A conversion
moves the converted quantity back first, then raises the ordinary sales
invoice through sales.create_sales_invoice, so the sale's own availability
check, COGS and GST all run exactly as for a counter sale.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.sales import (
    CreateSalesInvoiceRequest,
    InvoiceLineRequest,
    create_sales_invoice,
)
from app.core.aging import bucket_open_value
from app.core.costing import cost_of_goods_sold
from app.core.database import get_db, set_audit_context
from app.core.money import round_money, to_decimal
from app.core.pagination import Page, paginate
from app.core.roles import CAN_AMEND, CAN_MOVE_STOCK, CAN_POST, require
from app.core.security import get_current_user
from app.core.stock import assert_stock_available
from app.core.tenancy import resolve_fiscal_year, resolve_stock_location

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/approval-memos", tags=["Approval Memos (Jangad)"])

# The vocabulary chk_apm_status permits; the vocabulary test compares the two.
STATUS_OPEN = "Open"
STATUS_PARTIAL = "Partially_Returned"
STATUS_CLOSED = "Closed"
STATUS_CANCELLED = "Cancelled"
MEMO_STATUSES = frozenset({STATUS_OPEN, STATUS_PARTIAL, STATUS_CLOSED, STATUS_CANCELLED})
# Statuses under which goods are still out with the party.
LIVE_STATUSES = (STATUS_OPEN, STATUS_PARTIAL)

APPROVAL_LOCATION_CODE = "APPROVAL"
APPROVAL_LOCATION_NAME = "Goods on Approval"
SOURCE_DOCUMENT_TYPE = "ApprovalMemo"
DEFAULT_APPROVAL_DAYS = 15

QTY = Decimal("0.0001")


def _as_uuid(value) -> str | None:
    """The value if it is a UUID, else None -- so a material CODE can be
    compared against the code column without first failing the uuid cast."""
    try:
        return str(UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        return None


def _q(value) -> Decimal:
    return to_decimal(value).quantize(QTY)


# ─── Schemas ─────────────────────────────────────────────────────────────────

class MemoLineRequest(BaseModel):
    material_id: str = Field(min_length=1, description="Material UUID or code")
    description: Optional[str] = None
    quantity: Decimal = Field(gt=0)
    gross_weight: Optional[Decimal] = Field(default=None, ge=0)
    net_weight: Optional[Decimal] = Field(default=None, ge=0)
    rate: Decimal = Field(default=Decimal("0"), ge=0)

    @model_validator(mode="after")
    def _net_not_more_than_gross(self):
        if (
            self.gross_weight is not None
            and self.net_weight is not None
            and self.net_weight > self.gross_weight
        ):
            raise ValueError("net_weight cannot exceed gross_weight")
        return self


class CreateMemoRequest(BaseModel):
    party_id: UUID
    memo_date: date
    due_date: Optional[date] = None
    narration: Optional[str] = None
    lines: List[MemoLineRequest] = Field(min_length=1)
    reason: str = "Approval memo issued"

    @model_validator(mode="after")
    def _due_not_before_memo(self):
        if self.due_date is not None and self.due_date < self.memo_date:
            raise ValueError("due_date cannot be before memo_date")
        return self


class ReturnLineRequest(BaseModel):
    line_id: UUID
    quantity: Decimal = Field(gt=0)


class ReturnMemoRequest(BaseModel):
    lines: List[ReturnLineRequest] = Field(min_length=1)
    return_date: Optional[date] = None
    reason: str = "Approval memo goods returned"


class ConvertLineRequest(BaseModel):
    line_id: UUID
    quantity: Decimal = Field(gt=0)
    material_value: Decimal = Field(ge=0)
    making_charges: Decimal = Field(default=Decimal("0"), ge=0)
    discount_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)


class ConvertMemoRequest(BaseModel):
    lines: List[ConvertLineRequest] = Field(min_length=1)
    invoice_date: date
    place_of_supply: Optional[str] = None
    payment_terms: Optional[str] = "Immediate"
    reason: str = "Approval memo converted to sales invoice"


class CancelMemoRequest(BaseModel):
    reason: str = "Approval memo cancelled"


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def resolve_approval_location(db: AsyncSession, company_id) -> str:
    """The company's 'Goods on Approval' transit location, created on first use.

    Per company, like every other stock location: goods out on approval belong
    to the entity that sent them, and its stock register must show them.
    """
    res = await db.execute(
        text(
            "SELECT id FROM caratloop.stock_locations "
            "WHERE company_id = :cid AND code = :code LIMIT 1"
        ),
        {"cid": str(company_id), "code": APPROVAL_LOCATION_CODE},
    )
    loc_id = res.scalar()
    if loc_id:
        return str(loc_id)

    await db.execute(
        text(
            "INSERT INTO caratloop.stock_locations "
            "(company_id, code, name, location_type, is_default, is_active) "
            "VALUES (:cid, :code, :name, 'Transit', FALSE, TRUE) "
            "ON CONFLICT (company_id, code) DO NOTHING"
        ),
        {"cid": str(company_id), "code": APPROVAL_LOCATION_CODE, "name": APPROVAL_LOCATION_NAME},
    )
    res = await db.execute(
        text(
            "SELECT id FROM caratloop.stock_locations "
            "WHERE company_id = :cid AND code = :code LIMIT 1"
        ),
        {"cid": str(company_id), "code": APPROVAL_LOCATION_CODE},
    )
    loc_id = res.scalar()
    if not loc_id:
        raise HTTPException(
            status_code=500,
            detail="Could not create the 'Goods on Approval' stock location.",
        )
    return str(loc_id)


async def _transfer_stock(
    db: AsyncSession,
    *,
    company_id,
    fiscal_year_id,
    from_location,
    to_location,
    material_id,
    quantity: Decimal,
    gross_weight,
    net_weight,
    entry_date: date,
    memo_id,
    memo_no: str,
    user_id: str,
    ip_address: str,
    remarks: str,
) -> None:
    """One Stock_Transfer: 'O' out of ``from_location``, 'I' into ``to_location``.

    Both legs carry the same amount -- weighted average cost at the moment of
    the move -- so the transfer neither creates nor destroys stock value and
    leaves the average untouched.
    """
    amount = await cost_of_goods_sold(db, company_id, material_id, quantity)
    for direction, loc in (("O", from_location), ("I", to_location)):
        await db.execute(
            text(
                "INSERT INTO caratloop.stock_ledger_entries "
                "(company_id, fiscal_year_id, location_id, material_id, entry_date, "
                " direction, transaction_type, quantity, amount, gross_weight, net_weight, "
                " source_document_type, source_document_id, source_document_no, remarks, "
                " sequence_no, created_by, ip_address) "
                "VALUES (:cid, :fyid, :loc, :mid, :edate, "
                "        :direction, 'Stock_Transfer', :qty, :amt, :gw, :nw, "
                "        'ApprovalMemo', :doc_id, :doc_no, :remarks, "
                "        COALESCE((SELECT MAX(sequence_no) FROM caratloop.stock_ledger_entries), 0) + 1, "
                "        CAST(:cb AS UUID), CAST(:ip AS INET))"
            ),
            {
                "cid": str(company_id),
                "fyid": str(fiscal_year_id),
                "loc": str(loc),
                "mid": str(material_id),
                "edate": entry_date,
                "direction": direction,
                "qty": quantity,
                "amt": amount,
                "gw": gross_weight,
                "nw": net_weight,
                "doc_id": str(memo_id),
                "doc_no": memo_no,
                "remarks": remarks,
                "cb": user_id,
                "ip": ip_address,
            },
        )


async def _load_memo_for_update(db: AsyncSession, memo_id: UUID, company_id):
    """The memo header, locked for the rest of the transaction."""
    res = await db.execute(
        text(
            "SELECT id, company_id, fiscal_year_id, memo_no, memo_date, party_id, "
            "       due_date, status, total_quantity, total_value "
            "FROM caratloop.approval_memos "
            "WHERE id = :id AND company_id = :cid FOR UPDATE"
        ),
        {"id": str(memo_id), "cid": str(company_id)},
    )
    memo = res.mappings().first()
    if memo is None:
        raise HTTPException(status_code=404, detail="Approval memo not found")
    return memo


async def _load_lines(db: AsyncSession, memo_id) -> dict[str, dict]:
    """The memo's lines keyed by id, each with its outstanding quantity."""
    res = await db.execute(
        text(
            "SELECT l.id, l.sequence_no, l.material_id, l.description, l.quantity, "
            "       l.gross_weight, l.net_weight, l.rate, l.value, "
            "       l.quantity_returned, l.quantity_invoiced, l.invoice_id, "
            "       m.code AS material_code, m.name AS material_name "
            "FROM caratloop.approval_memo_lines l "
            "JOIN caratloop.materials m ON m.id = l.material_id "
            "WHERE l.memo_id = :mid ORDER BY l.sequence_no FOR UPDATE OF l"
        ),
        {"mid": str(memo_id)},
    )
    out = {}
    for r in res.mappings().all():
        row = dict(r)
        row["outstanding_quantity"] = (
            to_decimal(row["quantity"])
            - to_decimal(row["quantity_returned"])
            - to_decimal(row["quantity_invoiced"])
        )
        out[str(row["id"])] = row
    return out


def _derive_status(lines: dict[str, dict]) -> str:
    """Closed when nothing is outstanding, Partially_Returned when something
    has come back or been billed, Open otherwise."""
    outstanding = sum((l["outstanding_quantity"] for l in lines.values()), Decimal("0"))
    if outstanding <= 0:
        return STATUS_CLOSED
    settled = sum(
        (to_decimal(l["quantity_returned"]) + to_decimal(l["quantity_invoiced"]) for l in lines.values()),
        Decimal("0"),
    )
    return STATUS_PARTIAL if settled > 0 else STATUS_OPEN


async def _refresh_status(db: AsyncSession, memo_id) -> str:
    lines = await _load_lines(db, memo_id)
    status = _derive_status(lines)
    await db.execute(
        text(
            "UPDATE caratloop.approval_memos "
            "SET status = :status, "
            "    closed_at = CASE WHEN :status = 'Closed' THEN NOW() ELSE NULL END "
            "WHERE id = :id"
        ),
        {"status": status, "id": str(memo_id)},
    )
    return status


def _scaled(weight, part: Decimal, whole: Decimal):
    """A line weight apportioned to ``part`` of its ``whole`` quantity."""
    if weight is None or whole <= 0:
        return weight
    return (to_decimal(weight) * part / whole).quantize(QTY)


def _request_context(request: Request, current_user: dict) -> tuple[str, str, str, str]:
    user_id = str(current_user["id"])
    company_id = str(current_user["company_id"])
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    return user_id, company_id, ip_address, session_id


# ─── Issue ───────────────────────────────────────────────────────────────────

@router.post("", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def create_approval_memo(
    payload: CreateMemoRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Issue a jangad and move the goods out of the default location.

    No GST, no journal: sending goods on approval is not a supply. The memo
    number is APM/{fy}/{00001}, allocated atomically like every other document.
    """
    user_id, company_id, ip_address, session_id = _request_context(request, current_user)

    party_res = await db.execute(
        text(
            "SELECT id, name FROM caratloop.parties "
            "WHERE id = :id AND company_id = :cid AND is_active = TRUE LIMIT 1"
        ),
        {"id": str(payload.party_id), "cid": company_id},
    )
    party = party_res.mappings().first()
    if party is None:
        raise HTTPException(status_code=404, detail="Party not found")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        fy = await resolve_fiscal_year(db, company_id)
        default_loc = await resolve_stock_location(db, company_id)
        approval_loc = await resolve_approval_location(db, company_id)

        # Resolve every material before writing anything, and aggregate the
        # quantity per material so two lines of the same stone are checked
        # against the balance together rather than each passing alone.
        resolved = []
        wanted: dict[str, Decimal] = {}
        for idx, line in enumerate(payload.lines, 1):
            m_res = await db.execute(
                text(
                    "SELECT id, code, name FROM caratloop.materials "
                    "WHERE company_id = :cid AND is_active = TRUE "
                    "  AND (id = CAST(:mid AS UUID) OR code = :mcode) LIMIT 1"
                ),
                {"cid": company_id, "mid": _as_uuid(line.material_id), "mcode": str(line.material_id)},
            )
            m = m_res.mappings().first()
            if m is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"Line {idx}: material '{line.material_id}' not found. No data was saved.",
                )
            qty = _q(line.quantity)
            mid = str(m["id"])
            wanted[mid] = wanted.get(mid, Decimal("0")) + qty
            resolved.append((line, m, qty))

        for mid, qty in wanted.items():
            label = next(m["code"] for _, m, _ in resolved if str(m["id"]) == mid)
            await assert_stock_available(
                db, company_id, mid, qty,
                location_id=default_loc,
                context="approval memo",
                material_label=label,
            )

        seq_res = await db.execute(
            text("SELECT caratloop.next_document_number(:cid, :fyid, 'ApprovalMemo')"),
            {"cid": company_id, "fyid": str(fy["id"])},
        )
        memo_no = f"APM/{fy['year_label']}/{seq_res.scalar():05d}"
        due_date = payload.due_date or (payload.memo_date + timedelta(days=DEFAULT_APPROVAL_DAYS))

        total_qty = sum((q for _, _, q in resolved), Decimal("0"))
        total_value = sum((round_money(q * to_decimal(l.rate)) for l, _, q in resolved), Decimal("0.00"))

        head = await db.execute(
            text(
                "INSERT INTO caratloop.approval_memos "
                "(company_id, fiscal_year_id, memo_no, memo_date, party_id, due_date, "
                " status, narration, total_quantity, total_value, created_by) "
                "VALUES (:cid, :fyid, :no, :mdate, :party, :due, "
                "        'Open', :narr, :tqty, :tval, CAST(:cb AS UUID)) "
                "RETURNING id"
            ),
            {
                "cid": company_id, "fyid": str(fy["id"]), "no": memo_no,
                "mdate": payload.memo_date, "party": str(payload.party_id), "due": due_date,
                "narr": payload.narration, "tqty": total_qty, "tval": total_value, "cb": user_id,
            },
        )
        memo_id = head.scalar()

        for seq, (line, m, qty) in enumerate(resolved, 1):
            value = round_money(qty * to_decimal(line.rate))
            await db.execute(
                text(
                    "INSERT INTO caratloop.approval_memo_lines "
                    "(memo_id, sequence_no, material_id, description, quantity, "
                    " gross_weight, net_weight, rate, value) "
                    "VALUES (:mid, :seq, :mat, :descr, :qty, :gw, :nw, :rate, :value)"
                ),
                {
                    "mid": str(memo_id), "seq": seq, "mat": str(m["id"]),
                    "descr": line.description or m["name"], "qty": qty,
                    "gw": line.gross_weight, "nw": line.net_weight,
                    "rate": round_money(line.rate), "value": value,
                },
            )
            await _transfer_stock(
                db,
                company_id=company_id, fiscal_year_id=fy["id"],
                from_location=default_loc, to_location=approval_loc,
                material_id=m["id"], quantity=qty,
                gross_weight=line.gross_weight, net_weight=line.net_weight,
                entry_date=payload.memo_date, memo_id=memo_id, memo_no=memo_no,
                user_id=user_id, ip_address=ip_address,
                remarks=f"Sent on approval to {party['name']}",
            )

        await db.commit()
        return {
            "status": "success",
            "memo_id": str(memo_id),
            "memo_no": memo_no,
            "due_date": due_date,
            "total_quantity": total_qty,
            "total_value": total_value,
        }

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Approval memo creation failed")
        raise HTTPException(
            status_code=500,
            detail="Approval memo creation failed. The operation was rolled back and nothing was saved.",
        ) from e


# ─── Register ────────────────────────────────────────────────────────────────

@router.get("")
async def list_approval_memos(
    status: Optional[str] = Query(default=None, description="Open, Partially_Returned, Closed or Cancelled"),
    party_id: Optional[UUID] = None,
    overdue: bool = Query(default=False, description="Only live memos past their due date"),
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The jangad register, newest first, with each memo's outstanding value."""
    if status is not None and status not in MEMO_STATUSES:
        raise HTTPException(
            status_code=422,
            detail="status must be one of " + ", ".join(sorted(MEMO_STATUSES)),
        )

    query = """
        SELECT
            am.id, am.memo_no, am.memo_date, am.due_date, am.status, am.narration,
            am.total_quantity, am.total_value, am.created_at, am.closed_at,
            am.party_id, p.name AS party_name, p.city AS party_city, p.gstin AS party_gstin,
            (am.due_date < CURRENT_DATE AND am.status IN ('Open', 'Partially_Returned')) AS is_overdue,
            GREATEST(CURRENT_DATE - am.memo_date, 0) AS days_out,
            COALESCE(o.outstanding_quantity, 0) AS outstanding_quantity,
            COALESCE(o.outstanding_value, 0) AS outstanding_value
        FROM caratloop.approval_memos am
        JOIN caratloop.parties p ON p.id = am.party_id
        LEFT JOIN LATERAL (
            SELECT SUM(l.quantity - l.quantity_returned - l.quantity_invoiced) AS outstanding_quantity,
                   SUM((l.quantity - l.quantity_returned - l.quantity_invoiced) * l.rate) AS outstanding_value
            FROM caratloop.approval_memo_lines l
            WHERE l.memo_id = am.id
        ) o ON TRUE
        WHERE am.company_id = :cid
    """
    params: dict = {"cid": str(current_user["company_id"])}
    if status:
        query += " AND am.status = :status"
        params["status"] = status
    if party_id:
        query += " AND am.party_id = :party_id"
        params["party_id"] = str(party_id)
    if overdue:
        query += " AND am.due_date < CURRENT_DATE AND am.status IN ('Open', 'Partially_Returned')"
    query += " ORDER BY am.memo_date DESC, am.memo_no DESC"

    query = page.apply(query)
    params.update(page.params)
    res = await db.execute(text(query), params)
    rows = [dict(r) for r in res.mappings().all()]
    for r in rows:
        r["id"] = str(r["id"])
        r["party_id"] = str(r["party_id"])
    return {"memos": rows, **page.envelope(rows)}


@router.get("/aging")
async def approval_memo_aging(
    as_of: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Open approval value by age: 0-15, 16-30, 31-60 and 61+ days, per party
    and overall. The value is the outstanding quantity at the memo rate."""
    as_of = as_of or date.today()
    res = await db.execute(
        text(
            "SELECT am.id AS memo_id, am.memo_no, am.memo_date, am.party_id, p.name AS party_name, "
            "       COALESCE(SUM((l.quantity - l.quantity_returned - l.quantity_invoiced) * l.rate), 0) AS open_value "
            "FROM caratloop.approval_memos am "
            "JOIN caratloop.parties p ON p.id = am.party_id "
            "LEFT JOIN caratloop.approval_memo_lines l ON l.memo_id = am.id "
            "WHERE am.company_id = :cid AND am.status IN ('Open', 'Partially_Returned') "
            "  AND am.memo_date <= :as_of "
            "GROUP BY am.id, am.memo_no, am.memo_date, am.party_id, p.name"
        ),
        {"cid": str(current_user["company_id"]), "as_of": as_of},
    )
    rows = [dict(r) for r in res.mappings().all()]
    report = bucket_open_value(rows, as_of)
    report["open_memos"] = len(rows)
    return report


@router.get("/{memo_id}")
async def get_approval_memo(
    memo_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """One memo: header, party, lines with what is still out, and the sender,
    so the printed jangad needs no second request."""
    cid = str(current_user["company_id"])
    head = await db.execute(
        text(
            "SELECT am.id, am.memo_no, am.memo_date, am.due_date, am.status, am.narration, "
            "       am.total_quantity, am.total_value, am.created_at, am.closed_at, "
            "       (am.due_date < CURRENT_DATE AND am.status IN ('Open', 'Partially_Returned')) AS is_overdue, "
            "       GREATEST(CURRENT_DATE - am.memo_date, 0) AS days_out, "
            "       fy.year_label AS fiscal_year, "
            "       p.id AS party_id, p.name AS party_name, p.trade_name AS party_trade_name, "
            "       p.gstin AS party_gstin, p.pan AS party_pan, "
            "       p.address_line1 AS party_address1, p.address_line2 AS party_address2, "
            "       p.city AS party_city, p.state_code AS party_state_code, "
            "       p.state_name AS party_state_name, p.pincode AS party_pincode, "
            "       p.phone AS party_phone, p.email AS party_email "
            "FROM caratloop.approval_memos am "
            "JOIN caratloop.parties p ON p.id = am.party_id "
            "JOIN caratloop.fiscal_years fy ON fy.id = am.fiscal_year_id "
            "WHERE am.id = :id AND am.company_id = :cid"
        ),
        {"id": str(memo_id), "cid": cid},
    )
    memo = head.mappings().first()
    if memo is None:
        raise HTTPException(status_code=404, detail="Approval memo not found")

    lines_res = await db.execute(
        text(
            "SELECT l.id, l.sequence_no, l.material_id, l.description, l.quantity, "
            "       l.gross_weight, l.net_weight, l.rate, l.value, "
            "       l.quantity_returned, l.quantity_invoiced, "
            "       (l.quantity - l.quantity_returned - l.quantity_invoiced) AS outstanding_quantity, "
            "       (l.quantity - l.quantity_returned - l.quantity_invoiced) * l.rate AS outstanding_value, "
            "       l.invoice_id, si.invoice_no, "
            "       m.code AS material_code, m.name AS material_name, m.hsn_code, u.code AS uom "
            "FROM caratloop.approval_memo_lines l "
            "JOIN caratloop.materials m ON m.id = l.material_id "
            "LEFT JOIN caratloop.units_of_measure u ON u.id = m.uom_id "
            "LEFT JOIN caratloop.sales_invoices si ON si.id = l.invoice_id "
            "WHERE l.memo_id = :id ORDER BY l.sequence_no"
        ),
        {"id": str(memo_id)},
    )
    lines = []
    for r in lines_res.mappings().all():
        row = dict(r)
        for k in ("id", "material_id", "invoice_id"):
            if row.get(k) is not None:
                row[k] = str(row[k])
        lines.append(row)

    company = await db.execute(
        text(
            "SELECT id, name, legal_name, trade_name, gstin, pan, "
            "       address_line1, address_line2, city, state_code, state_name, pincode, phone, email "
            "FROM caratloop.companies WHERE id = :cid"
        ),
        {"cid": cid},
    )
    c = dict(company.mappings().first() or {})
    if c:
        c["id"] = str(c["id"])

    out = dict(memo)
    out["id"] = str(out["id"])
    out["party_id"] = str(out["party_id"])
    out["outstanding_quantity"] = sum((to_decimal(l["outstanding_quantity"]) for l in lines), Decimal("0"))
    out["outstanding_value"] = sum((to_decimal(l["outstanding_value"]) for l in lines), Decimal("0"))
    out["lines"] = lines
    out["company"] = c or None
    return out


# ─── Return ──────────────────────────────────────────────────────────────────

@router.post("/{memo_id}/return", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def return_approval_memo(
    memo_id: UUID,
    payload: ReturnMemoRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Goods come back: stock returns to the default location and the memo
    closes when nothing remains out. Refuses more than is outstanding."""
    user_id, company_id, ip_address, session_id = _request_context(request, current_user)
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        memo = await _load_memo_for_update(db, memo_id, company_id)
        if memo["status"] not in LIVE_STATUSES:
            raise HTTPException(
                status_code=409,
                detail=f"Memo {memo['memo_no']} is {memo['status']}; nothing can be returned against it.",
            )
        lines = await _load_lines(db, memo_id)
        default_loc = await resolve_stock_location(db, company_id)
        approval_loc = await resolve_approval_location(db, company_id)
        return_date = payload.return_date or date.today()

        returned = []
        for req in payload.lines:
            line = lines.get(str(req.line_id))
            if line is None:
                raise HTTPException(status_code=422, detail=f"Line {req.line_id} is not on this memo.")
            qty = _q(req.quantity)
            if qty > line["outstanding_quantity"]:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Line {line['sequence_no']} ({line['material_code']}): "
                        f"{line['outstanding_quantity']} outstanding, {qty} offered for return. "
                        "No data was saved."
                    ),
                )
            # The goods must actually be sitting in the approval location.
            await assert_stock_available(
                db, company_id, line["material_id"], qty,
                location_id=approval_loc,
                context=f"return against {memo['memo_no']}",
                material_label=line["material_code"],
            )
            await db.execute(
                text(
                    "UPDATE caratloop.approval_memo_lines "
                    "SET quantity_returned = quantity_returned + :qty WHERE id = :id"
                ),
                {"qty": qty, "id": str(req.line_id)},
            )
            whole = to_decimal(line["quantity"])
            await _transfer_stock(
                db,
                company_id=company_id, fiscal_year_id=memo["fiscal_year_id"],
                from_location=approval_loc, to_location=default_loc,
                material_id=line["material_id"], quantity=qty,
                gross_weight=_scaled(line["gross_weight"], qty, whole),
                net_weight=_scaled(line["net_weight"], qty, whole),
                entry_date=return_date, memo_id=memo_id, memo_no=memo["memo_no"],
                user_id=user_id, ip_address=ip_address,
                remarks=f"Returned from approval: {payload.reason}"[:500],
            )
            # Keep the in-memory view current so the status derivation below
            # sees this return.
            line["quantity_returned"] = to_decimal(line["quantity_returned"]) + qty
            line["outstanding_quantity"] -= qty
            returned.append({"line_id": str(req.line_id), "quantity": qty})

        status = await _refresh_status(db, memo_id)
        await db.commit()
        return {"status": "success", "memo_no": memo["memo_no"], "memo_status": status, "returned": returned}

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Approval memo return failed")
        raise HTTPException(
            status_code=500,
            detail="Recording the return failed. The operation was rolled back and nothing was saved.",
        ) from e


# ─── Convert to sales invoice ────────────────────────────────────────────────

@router.post("/{memo_id}/convert", dependencies=[Depends(require(*CAN_POST))])
async def convert_approval_memo(
    memo_id: UUID,
    payload: ConvertMemoRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The party keeps some or all of the goods: raise the tax invoice.

    The converted quantity is first moved back from APPROVAL to the default
    location so the sale's own availability check passes, then the ordinary
    sales invoice is created (GST, COGS, journal, all as for a counter sale).
    The sale commits itself; only then are the memo lines marked invoiced.
    """
    user_id, company_id, ip_address, session_id = _request_context(request, current_user)
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    memo_no = None
    invoice_lines: list[InvoiceLineRequest] = []
    conversions: list[tuple[str, Decimal]] = []
    try:
        memo = await _load_memo_for_update(db, memo_id, company_id)
        memo_no = memo["memo_no"]
        if memo["status"] not in LIVE_STATUSES:
            raise HTTPException(
                status_code=409,
                detail=f"Memo {memo_no} is {memo['status']}; nothing can be invoiced against it.",
            )
        lines = await _load_lines(db, memo_id)
        default_loc = await resolve_stock_location(db, company_id)
        approval_loc = await resolve_approval_location(db, company_id)

        for req in payload.lines:
            line = lines.get(str(req.line_id))
            if line is None:
                raise HTTPException(status_code=422, detail=f"Line {req.line_id} is not on this memo.")
            qty = _q(req.quantity)
            if qty > line["outstanding_quantity"]:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Line {line['sequence_no']} ({line['material_code']}): "
                        f"{line['outstanding_quantity']} outstanding, {qty} offered for invoicing. "
                        "No data was saved."
                    ),
                )
            await assert_stock_available(
                db, company_id, line["material_id"], qty,
                location_id=approval_loc,
                context=f"conversion of {memo_no}",
                material_label=line["material_code"],
            )
            whole = to_decimal(line["quantity"])
            gw = _scaled(line["gross_weight"], qty, whole)
            nw = _scaled(line["net_weight"], qty, whole)
            await _transfer_stock(
                db,
                company_id=company_id, fiscal_year_id=memo["fiscal_year_id"],
                from_location=approval_loc, to_location=default_loc,
                material_id=line["material_id"], quantity=qty,
                gross_weight=gw, net_weight=nw,
                entry_date=payload.invoice_date, memo_id=memo_id, memo_no=memo_no,
                user_id=user_id, ip_address=ip_address,
                remarks=f"Approved and invoiced against {memo_no}",
            )
            invoice_lines.append(
                InvoiceLineRequest(
                    material_id=UUID(str(line["material_id"])),
                    description=line["description"] or line["material_name"],
                    quantity=qty,
                    gross_weight=gw,
                    net_weight=nw,
                    material_value=req.material_value,
                    making_charges=req.making_charges,
                    discount_pct=req.discount_pct,
                )
            )
            line["outstanding_quantity"] -= qty
            conversions.append((str(req.line_id), qty))

        # Nothing is committed yet: the transfers above ride in the sale's
        # transaction. create_sales_invoice commits on success and rolls back
        # on failure, taking the transfers with it either way.
        sale = await create_sales_invoice(
            CreateSalesInvoiceRequest(
                customer_id=UUID(str(memo["party_id"])),
                invoice_date=payload.invoice_date,
                place_of_supply=payload.place_of_supply,
                lines=invoice_lines,
                payment_terms=payload.payment_terms,
                narration=f"Against approval memo {memo_no}",
                reason=payload.reason,
            ),
            request,
            db,
            current_user,
        )
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Approval memo conversion failed before the invoice was raised")
        raise HTTPException(
            status_code=500,
            detail="Conversion failed. The operation was rolled back and nothing was saved.",
        ) from e

    # The invoice exists and is committed. Record it on the memo in a second,
    # short transaction; if this fails the invoice stands and the memo needs
    # a manual fix, so the message names both.
    try:
        await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
        for line_id, qty in conversions:
            await db.execute(
                text(
                    "UPDATE caratloop.approval_memo_lines "
                    "SET quantity_invoiced = quantity_invoiced + :qty, invoice_id = :inv "
                    "WHERE id = :id"
                ),
                {"qty": qty, "inv": str(sale["invoice_id"]), "id": line_id},
            )
        status = await _refresh_status(db, memo_id)
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception(
            "Invoice %s was raised but memo %s could not be marked invoiced",
            sale.get("invoice_no"), memo_no,
        )
        raise HTTPException(
            status_code=500,
            detail=(
                f"Invoice {sale.get('invoice_no')} was raised, but approval memo {memo_no} "
                "could not be updated. Reconcile the memo manually."
            ),
        ) from e

    return {
        "status": "success",
        "memo_no": memo_no,
        "memo_status": status,
        "invoice_id": str(sale["invoice_id"]),
        "invoice_no": sale["invoice_no"],
        "journal_entry_no": sale.get("journal_entry_no"),
        "tax_summary": sale.get("tax_summary"),
        "converted": [{"line_id": lid, "quantity": q} for lid, q in conversions],
    }


# ─── Cancel ──────────────────────────────────────────────────────────────────

@router.post("/{memo_id}/cancel", dependencies=[Depends(require(*CAN_AMEND))])
async def cancel_approval_memo(
    memo_id: UUID,
    payload: CancelMemoRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Void a memo issued in error. Only while nothing has been returned or
    invoiced against it; all stock goes back to the default location."""
    user_id, company_id, ip_address, session_id = _request_context(request, current_user)
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        memo = await _load_memo_for_update(db, memo_id, company_id)
        if memo["status"] != STATUS_OPEN:
            raise HTTPException(
                status_code=409,
                detail=f"Memo {memo['memo_no']} is {memo['status']} and cannot be cancelled.",
            )
        lines = await _load_lines(db, memo_id)
        touched = [
            l for l in lines.values()
            if to_decimal(l["quantity_returned"]) > 0 or to_decimal(l["quantity_invoiced"]) > 0
        ]
        if touched:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Memo {memo['memo_no']} has returns or invoices recorded against it; "
                    "return the balance instead of cancelling."
                ),
            )
        default_loc = await resolve_stock_location(db, company_id)
        approval_loc = await resolve_approval_location(db, company_id)

        for line in lines.values():
            qty = to_decimal(line["quantity"])
            await assert_stock_available(
                db, company_id, line["material_id"], qty,
                location_id=approval_loc,
                context=f"cancellation of {memo['memo_no']}",
                material_label=line["material_code"],
            )
            await _transfer_stock(
                db,
                company_id=company_id, fiscal_year_id=memo["fiscal_year_id"],
                from_location=approval_loc, to_location=default_loc,
                material_id=line["material_id"], quantity=qty,
                gross_weight=line["gross_weight"], net_weight=line["net_weight"],
                entry_date=date.today(), memo_id=memo_id, memo_no=memo["memo_no"],
                user_id=user_id, ip_address=ip_address,
                remarks=f"Approval memo cancelled: {payload.reason}"[:500],
            )

        await db.execute(
            text(
                "UPDATE caratloop.approval_memos "
                "SET status = 'Cancelled', closed_at = NOW() WHERE id = :id"
            ),
            {"id": str(memo_id)},
        )
        await db.commit()
        return {"status": "success", "memo_no": memo["memo_no"], "memo_status": STATUS_CANCELLED}

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Approval memo cancellation failed")
        raise HTTPException(
            status_code=500,
            detail="Cancellation failed. The operation was rolled back and nothing was saved.",
        ) from e
