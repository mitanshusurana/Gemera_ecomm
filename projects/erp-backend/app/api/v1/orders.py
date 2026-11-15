"""
Caratloop ERP — Quotes, sales orders and purchase orders

Documents of intent. A quote is a price given to a customer; a sales order
is an order taken; a purchase order is an order placed with a supplier. None
of them posts to the ledger or moves stock: that happens when the invoice or
the bill is raised, through the same posting path as any other invoice or
bill. The document here records what it was converted into.

    Quote ──► SalesOrder ──► sales invoice
      └─────────────────────► sales invoice
    PurchaseOrder ──► purchase bill

Converting to an invoice or a bill opens that form prefilled; once it is
saved the form calls ``mark-converted`` with the number it was given.
"""
import logging
from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, set_audit_context
from app.core.money import round_money, to_decimal
from app.core.roles import CAN_POST, require
from app.core.security import get_current_user
from app.core.tenancy import resolve_fiscal_year

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Quotes & Orders"])

DOC_TYPES = {"Quote": "QT", "SalesOrder": "SO", "PurchaseOrder": "PO"}
# What a status may move to. Converted and Cancelled are final.
TRANSITIONS = {
    "Open": {"Accepted", "Declined", "Cancelled", "Converted"},
    "Accepted": {"Declined", "Cancelled", "Converted"},
    "Declined": {"Open"},
    "Converted": set(),
    "Cancelled": set(),
}


class OrderLine(BaseModel):
    material_id: Optional[UUID] = None
    description: Optional[str] = Field(default=None, max_length=500)
    hsn_sac_code: Optional[str] = Field(default=None, max_length=8)
    quantity: Decimal = Field(default=Decimal("1"), gt=0)
    net_weight: Optional[Decimal] = Field(default=None, ge=0)
    material_value: Decimal = Field(default=Decimal("0"), ge=0)
    making_charges: Decimal = Field(default=Decimal("0"), ge=0)
    discount_pct: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    material_gst_rate: Decimal = Field(default=Decimal("3"), ge=0, le=100)
    making_gst_rate: Decimal = Field(default=Decimal("5"), ge=0, le=100)


class CreateOrderDocument(BaseModel):
    doc_type: str
    party_id: UUID
    doc_date: date
    valid_until: Optional[date] = None
    reference_no: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = Field(default=None, max_length=2000)
    terms: Optional[str] = Field(default=None, max_length=2000)
    lines: List[OrderLine] = Field(min_length=1)
    reason: str = "Order document created"


class StatusChange(BaseModel):
    status: str
    reason: str = "Order document status changed"


class MarkConverted(BaseModel):
    converted_to: str = Field(min_length=1, max_length=60)
    reason: str = "Order document converted"


def line_amounts(line: OrderLine) -> dict:
    """Taxable value, GST and total of one line.

    The discount applies to material and making alike, as it does on the
    invoice (sales.py); each part then carries its own GST rate.
    """
    keep = (Decimal("100") - line.discount_pct) / Decimal("100")
    gross = line.material_value + line.making_charges
    material = round_money(line.material_value * keep)
    making = round_money(line.making_charges * keep)
    taxable = material + making
    gst = round_money(material * line.material_gst_rate / 100) + round_money(making * line.making_gst_rate / 100)
    return {"gross": round_money(gross), "discount": round_money(gross) - taxable, "taxable": taxable, "gst": gst, "total": taxable + gst}


def document_totals(lines: List[OrderLine]) -> dict:
    parts = [line_amounts(ln) for ln in lines]
    zero = Decimal("0")
    return {
        "subtotal": sum((p["gross"] for p in parts), zero),
        "discount_total": sum((p["discount"] for p in parts), zero),
        "gst_total": sum((p["gst"] for p in parts), zero),
        "grand_total": sum((p["total"] for p in parts), zero),
        "lines": parts,
    }


async def next_doc_no(db: AsyncSession, company_id, doc_type: str, fy_label: str) -> str:
    """QT|SO|PO/<FY>/<n>, gapless within the type and the year."""
    prefix = DOC_TYPES[doc_type]
    await db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"orderdoc:{company_id}:{doc_type}:{fy_label}"})
    res = await db.execute(
        text("""
            SELECT COALESCE(MAX(CAST(SUBSTRING(doc_no FROM '/([0-9]+)$') AS INTEGER)), 0) + 1
            FROM caratloop.order_documents
            WHERE company_id = :cid AND doc_type = :dtype AND doc_no LIKE :pattern
        """),
        {"cid": company_id, "dtype": doc_type, "pattern": f"{prefix}/{fy_label}/%"},
    )
    return f"{prefix}/{fy_label}/{int(res.scalar() or 1):05d}"


_HEAD = """
    SELECT d.id, d.doc_type, d.doc_no, d.doc_date, d.valid_until, d.party_id,
           COALESCE(NULLIF(p.trade_name, ''), p.name) AS party_name, p.gstin AS party_gstin,
           p.state_code AS party_state_code, p.phone AS party_phone, p.email AS party_email,
           d.reference_no, d.notes, d.terms, d.subtotal, d.discount_total, d.gst_total, d.grand_total,
           d.status, d.converted_to, d.source_doc_id, d.created_at
    FROM caratloop.order_documents d
    JOIN caratloop.parties p ON p.id = d.party_id
"""


def _head(r) -> dict:
    d = dict(r)
    for k in ("id", "party_id", "source_doc_id"):
        d[k] = str(d[k]) if d.get(k) is not None else None
    for k in ("subtotal", "discount_total", "gst_total", "grand_total"):
        d[k] = float(to_decimal(d[k]))
    return d


async def _insert_document(db, company_id, user_id, payload: CreateOrderDocument, source_doc_id=None) -> dict:
    party = await db.execute(
        text("SELECT id FROM caratloop.parties WHERE id = :pid AND company_id = :cid"),
        {"pid": str(payload.party_id), "cid": company_id},
    )
    if party.scalar() is None:
        raise HTTPException(status_code=404, detail="Party not found")
    if payload.valid_until and payload.valid_until < payload.doc_date:
        raise HTTPException(status_code=422, detail="The valid-until / expected date cannot be before the document date.")

    fy = await resolve_fiscal_year(db, company_id)
    doc_no = await next_doc_no(db, company_id, payload.doc_type, fy["year_label"])
    totals = document_totals(payload.lines)
    ins = await db.execute(
        text("""
            INSERT INTO caratloop.order_documents (
                company_id, doc_type, doc_no, doc_date, valid_until, party_id, reference_no, notes, terms,
                subtotal, discount_total, gst_total, grand_total, source_doc_id, created_by
            ) VALUES (
                :cid, :dtype, :dno, :ddate, :valid, CAST(:pid AS UUID), :ref, :notes, :terms,
                :subtotal, :discount, :gst, :grand, CAST(:src AS UUID), CAST(:cb AS UUID)
            ) RETURNING id
        """),
        {"cid": company_id, "dtype": payload.doc_type, "dno": doc_no, "ddate": payload.doc_date, "valid": payload.valid_until,
         "pid": str(payload.party_id), "ref": payload.reference_no, "notes": payload.notes, "terms": payload.terms,
         "subtotal": totals["subtotal"], "discount": totals["discount_total"], "gst": totals["gst_total"],
         "grand": totals["grand_total"], "src": str(source_doc_id) if source_doc_id else None, "cb": user_id},
    )
    doc_id = ins.scalar()
    for seq, (ln, amt) in enumerate(zip(payload.lines, totals["lines"]), 1):
        await db.execute(
            text("""
                INSERT INTO caratloop.order_document_lines (
                    document_id, sequence_no, material_id, description, hsn_sac_code, quantity, net_weight,
                    material_value, making_charges, discount_pct, material_gst_rate, making_gst_rate,
                    taxable, gst_amount, line_total
                ) VALUES (
                    :doc, :seq, CAST(:mid AS UUID), :descr, :hsn, :qty, :nw,
                    :mat, :mak, :disc, :mgst, :kgst, :taxable, :gst, :total
                )
            """),
            {"doc": doc_id, "seq": seq, "mid": str(ln.material_id) if ln.material_id else None, "descr": ln.description,
             "hsn": ln.hsn_sac_code, "qty": ln.quantity, "nw": ln.net_weight, "mat": ln.material_value,
             "mak": ln.making_charges, "disc": ln.discount_pct, "mgst": ln.material_gst_rate, "kgst": ln.making_gst_rate,
             "taxable": amt["taxable"], "gst": amt["gst"], "total": amt["total"]},
        )
    return {"id": str(doc_id), "doc_no": doc_no, "grand_total": float(totals["grand_total"])}


@router.get("")
async def list_documents(
    doc_type: str,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if doc_type not in DOC_TYPES:
        raise HTTPException(status_code=422, detail="doc_type must be Quote, SalesOrder or PurchaseOrder")
    res = await db.execute(
        text(_HEAD + """
            WHERE d.company_id = :cid AND d.doc_type = :dtype
              AND (CAST(:from_date AS DATE) IS NULL OR d.doc_date >= CAST(:from_date AS DATE))
              AND (CAST(:to_date AS DATE) IS NULL OR d.doc_date <= CAST(:to_date AS DATE))
              AND (CAST(:status AS VARCHAR) IS NULL OR d.status = CAST(:status AS VARCHAR))
            ORDER BY d.doc_date DESC, d.created_at DESC
            LIMIT 500
        """),
        {"cid": current_user["company_id"], "dtype": doc_type, "from_date": from_date, "to_date": to_date, "status": status},
    )
    rows = [_head(r) for r in res.mappings().all()]
    open_value = sum(r["grand_total"] for r in rows if r["status"] in ("Open", "Accepted"))
    return {"doc_type": doc_type, "documents": rows, "open_value": round(open_value, 2)}


@router.get("/{doc_id}")
async def get_document(doc_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    res = await db.execute(text(_HEAD + " WHERE d.id = :id AND d.company_id = :cid"), {"id": str(doc_id), "cid": current_user["company_id"]})
    head = res.mappings().first()
    if head is None:
        raise HTTPException(status_code=404, detail="Document not found")
    lines = await db.execute(
        text("""
            SELECT l.sequence_no, l.material_id, m.code AS material_code, m.name AS material_name, m.category,
                   l.description, l.hsn_sac_code, l.quantity, l.net_weight, l.material_value, l.making_charges,
                   l.discount_pct, l.material_gst_rate, l.making_gst_rate, l.taxable, l.gst_amount, l.line_total
            FROM caratloop.order_document_lines l
            LEFT JOIN caratloop.materials m ON m.id = l.material_id
            WHERE l.document_id = :id
            ORDER BY l.sequence_no
        """),
        {"id": str(doc_id)},
    )
    out = _head(head)
    out["lines"] = [
        {k: (str(v) if k == "material_id" and v is not None else float(v) if isinstance(v, Decimal) else v) for k, v in dict(r).items()}
        for r in lines.mappings().all()
    ]
    return out


@router.post("", dependencies=[Depends(require(*CAN_POST))])
async def create_document(
    payload: CreateOrderDocument,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if payload.doc_type not in DOC_TYPES:
        raise HTTPException(status_code=422, detail="doc_type must be Quote, SalesOrder or PurchaseOrder")
    user_id, company_id = str(current_user["id"]), current_user["company_id"]
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, user_id, current_user.get("session_id", "0"), ip, payload.reason)
    try:
        created = await _insert_document(db, company_id, user_id, payload)
        await db.commit()
        return {"status": "success", **created}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Creating the order document failed")
        raise HTTPException(status_code=500, detail="Saving the document failed. Nothing was saved.") from e


async def _locked(db, company_id, doc_id):
    res = await db.execute(
        text("SELECT id, doc_type, doc_no, status FROM caratloop.order_documents WHERE id = :id AND company_id = :cid FOR UPDATE"),
        {"id": str(doc_id), "cid": company_id},
    )
    doc = res.mappings().first()
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/{doc_id}/status", dependencies=[Depends(require(*CAN_POST))])
async def change_status(
    doc_id: UUID, payload: StatusChange, request: Request,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user),
):
    """Accept, decline, reopen or cancel. Converting goes through its own routes."""
    if payload.status not in ("Open", "Accepted", "Declined", "Cancelled"):
        raise HTTPException(status_code=422, detail="status must be Open, Accepted, Declined or Cancelled")
    company_id = current_user["company_id"]
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, str(current_user["id"]), current_user.get("session_id", "0"), ip, payload.reason)
    try:
        doc = await _locked(db, company_id, doc_id)
        if payload.status not in TRANSITIONS[doc["status"]]:
            raise HTTPException(status_code=409, detail=f"{doc['doc_no']} is {doc['status']}; it cannot become {payload.status}.")
        await db.execute(
            text("UPDATE caratloop.order_documents SET status = :st WHERE id = :id AND company_id = :cid"),
            {"st": payload.status, "id": str(doc_id), "cid": company_id},
        )
        await db.commit()
        return {"status": "success", "doc_no": doc["doc_no"], "new_status": payload.status}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Changing the order document status failed")
        raise HTTPException(status_code=500, detail="Changing the status failed. Nothing was saved.") from e


@router.post("/{doc_id}/mark-converted", dependencies=[Depends(require(*CAN_POST))])
async def mark_converted(
    doc_id: UUID, payload: MarkConverted, request: Request,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user),
):
    """Record the invoice or bill number this document became."""
    company_id = current_user["company_id"]
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, str(current_user["id"]), current_user.get("session_id", "0"), ip, payload.reason)
    try:
        doc = await _locked(db, company_id, doc_id)
        if "Converted" not in TRANSITIONS[doc["status"]]:
            raise HTTPException(status_code=409, detail=f"{doc['doc_no']} is {doc['status']}; it cannot be converted.")
        await db.execute(
            text("UPDATE caratloop.order_documents SET status = 'Converted', converted_to = :to WHERE id = :id AND company_id = :cid"),
            {"to": payload.converted_to, "id": str(doc_id), "cid": company_id},
        )
        await db.commit()
        return {"status": "success", "doc_no": doc["doc_no"], "converted_to": payload.converted_to}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Marking the order document converted failed")
        raise HTTPException(status_code=500, detail="Recording the conversion failed. Nothing was saved.") from e


@router.post("/{doc_id}/to-sales-order", dependencies=[Depends(require(*CAN_POST))])
async def quote_to_sales_order(
    doc_id: UUID, request: Request,
    db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user),
):
    """Copy an open or accepted quote into a new sales order and close the quote."""
    user_id, company_id = str(current_user["id"]), current_user["company_id"]
    ip = request.client.host if request.client else "0.0.0.0"
    await set_audit_context(db, user_id, current_user.get("session_id", "0"), ip, "Quote converted to sales order")
    try:
        doc = await _locked(db, company_id, doc_id)
        if doc["doc_type"] != "Quote":
            raise HTTPException(status_code=422, detail="Only a quote can be turned into a sales order.")
        if "Converted" not in TRANSITIONS[doc["status"]]:
            raise HTTPException(status_code=409, detail=f"{doc['doc_no']} is {doc['status']}; it cannot be converted.")
        head = await db.execute(
            text("SELECT party_id, reference_no, notes, terms FROM caratloop.order_documents WHERE id = :id"),
            {"id": str(doc_id)},
        )
        h = head.mappings().first()
        rows = await db.execute(
            text("""
                SELECT material_id, description, hsn_sac_code, quantity, net_weight, material_value, making_charges,
                       discount_pct, material_gst_rate, making_gst_rate
                FROM caratloop.order_document_lines WHERE document_id = :id ORDER BY sequence_no
            """),
            {"id": str(doc_id)},
        )
        order = CreateOrderDocument(
            doc_type="SalesOrder", party_id=h["party_id"], doc_date=date.today(),
            reference_no=doc["doc_no"], notes=h["notes"], terms=h["terms"],
            lines=[OrderLine(**dict(r)) for r in rows.mappings().all()],
        )
        created = await _insert_document(db, company_id, user_id, order, source_doc_id=doc_id)
        await db.execute(
            text("UPDATE caratloop.order_documents SET status = 'Converted', converted_to = :to WHERE id = :id AND company_id = :cid"),
            {"to": created["doc_no"], "id": str(doc_id), "cid": company_id},
        )
        await db.commit()
        return {"status": "success", "quote_no": doc["doc_no"], **created}
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Converting the quote failed")
        raise HTTPException(status_code=500, detail="Converting the quote failed. Nothing was saved.") from e
