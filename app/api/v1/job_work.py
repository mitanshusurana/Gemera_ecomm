"""Job work (karigar) endpoints — CGST s.143 and Rule 45.

Gold goes out to a karigar for making and comes back as finished pieces. The
dispatch is not a supply, so it moves on a delivery challan rather than a tax
invoice, and the goods stay the principal's asset throughout.

The part that bites is the deadline: inputs not returned within a year mean the
original dispatch is retrospectively a supply made on the day it left. Nothing
tracked that, so nothing could warn about it.
"""

from __future__ import annotations

import logging
from datetime import date
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, set_audit_context
from app.core.money import to_decimal
from app.core.pagination import Page, paginate
from app.core.roles import CAN_MOVE_STOCK, require
from app.core.security import get_current_user
from app.core.stock import assert_stock_available
from app.core.tenancy import resolve_fiscal_year, resolve_stock_location
from app.tax.job_work import (
    GOODS_TYPE_INPUT,
    days_remaining,
    is_overdue,
    job_work_tax,
    net_of_wastage,
    return_due_date,
    wastage_pct,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/job-work", tags=["Job Work"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ChallanLineRequest(BaseModel):
    material_id: UUID
    description: Optional[str] = None
    hsn_code: Optional[str] = None
    quantity_sent: Decimal = Field(gt=0)
    gross_weight: Optional[Decimal] = Field(default=None, ge=0)
    net_weight: Optional[Decimal] = Field(default=None, ge=0)
    purity: Optional[Decimal] = Field(default=None, gt=0, le=1)
    taxable_value: Decimal = Field(default=Decimal("0"), ge=0)


class CreateChallanRequest(BaseModel):
    job_worker_id: UUID
    challan_date: date
    goods_type: str = GOODS_TYPE_INPUT
    nature_of_work: Optional[str] = None
    lines: List[ChallanLineRequest]
    remarks: Optional[str] = None
    reason: str = "Job work challan issued"


class ReceiptLineRequest(BaseModel):
    challan_line_id: int
    quantity_received: Decimal = Field(default=Decimal("0"), ge=0)
    quantity_wastage: Decimal = Field(default=Decimal("0"), ge=0)
    gross_weight: Optional[Decimal] = Field(default=None, ge=0)
    net_weight: Optional[Decimal] = Field(default=None, ge=0)


class CreateReceiptRequest(BaseModel):
    receipt_date: date
    making_charges: Decimal = Field(default=Decimal("0"), ge=0)
    lines: List[ReceiptLineRequest]
    remarks: Optional[str] = None
    reason: str = "Job work goods received"


# ─── Issue ───────────────────────────────────────────────────────────────────

@router.post("/challans", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def create_challan(
    payload: CreateChallanRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Issue a delivery challan and move stock out to the job worker.

    No GST is charged: sending goods for job work is not a supply.
    """
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        worker_res = await db.execute(
            text(
                "SELECT id, name, gstin, state_code FROM caratloop.parties "
                "WHERE id = :id AND company_id = :cid LIMIT 1"
            ),
            {"id": str(payload.job_worker_id), "cid": company_id},
        )
        worker = worker_res.mappings().first()
        if not worker:
            raise HTTPException(status_code=404, detail="Job worker not found")

        fy = await resolve_fiscal_year(db, company_id)

        seq_res = await db.execute(
            text("SELECT caratloop.next_document_number(:cid, :fyid, 'JobWorkChallan')"),
            {"cid": company_id, "fyid": str(fy["id"])},
        )
        challan_no = f"JW/{fy['year_label']}/{seq_res.scalar():05d}"

        due = return_due_date(payload.challan_date, payload.goods_type)
        pos = (worker["state_code"] or settings.COMPANY_STATE_CODE or "").strip()
        inter_state = pos.zfill(2) != settings.COMPANY_STATE_CODE.strip().zfill(2)

        ch_res = await db.execute(
            text(
                "INSERT INTO caratloop.job_work_challans "
                "(company_id, fiscal_year_id, job_worker_id, challan_no, challan_date, "
                " goods_type, return_due_date, nature_of_work, place_of_supply, "
                " is_inter_state, remarks, created_by) "
                "VALUES (:cid, :fyid, :wid, :no, :cdate, :gtype, :due, :nature, :pos, "
                "        :inter, :remarks, CAST(:cb AS UUID)) RETURNING id"
            ),
            {
                "cid": company_id, "fyid": str(fy["id"]), "wid": str(payload.job_worker_id),
                "no": challan_no, "cdate": payload.challan_date,
                "gtype": payload.goods_type, "due": due,
                "nature": payload.nature_of_work, "pos": pos or None,
                "inter": inter_state, "remarks": payload.remarks, "cb": user_id,
            },
        )
        challan_id = ch_res.scalar()

        loc_id = await resolve_stock_location(db, company_id)

        for seq, line in enumerate(payload.lines, 1):
            # The goods are still ours, but they are leaving the premises, so
            # they must actually be here to send.
            await assert_stock_available(
                db, company_id, line.material_id, line.quantity_sent,
                location_id=loc_id,
                context=f"job work challan {challan_no}",
                material_label=str(line.material_id),
            )

            await db.execute(
                text(
                    "INSERT INTO caratloop.job_work_challan_lines "
                    "(challan_id, sequence_no, material_id, description, hsn_code, "
                    " quantity_sent, gross_weight, net_weight, purity, taxable_value) "
                    "VALUES (:chid, :seq, :mid, :desc, :hsn, :qty, :gw, :nw, :pur, :val)"
                ),
                {
                    "chid": str(challan_id), "seq": seq, "mid": str(line.material_id),
                    "desc": line.description, "hsn": line.hsn_code,
                    "qty": line.quantity_sent, "gw": line.gross_weight,
                    "nw": line.net_weight, "pur": line.purity,
                    "val": line.taxable_value,
                },
            )

            await db.execute(
                text(
                    "INSERT INTO caratloop.stock_ledger_entries "
                    "(company_id, fiscal_year_id, location_id, material_id, entry_date, "
                    " direction, transaction_type, quantity, amount, gross_weight, "
                    " net_weight, purity, source_document_type, source_document_id, "
                    " source_document_no, sequence_no, created_by, ip_address) "
                    "VALUES (:cid, :fyid, :loc, :mid, :edate, 'O', 'JobWork_Issue', "
                    "        :qty, :amt, :gw, :nw, :pur, 'JobWorkChallan', :chid, :no, "
                    "        COALESCE((SELECT MAX(sequence_no) FROM caratloop.stock_ledger_entries), 0) + 1, "
                    "        CAST(:cb AS UUID), CAST(:ip AS INET))"
                ),
                {
                    "cid": company_id, "fyid": str(fy["id"]), "loc": loc_id,
                    "mid": str(line.material_id), "edate": payload.challan_date,
                    "qty": line.quantity_sent, "amt": line.taxable_value,
                    "gw": line.gross_weight, "nw": line.net_weight, "pur": line.purity,
                    "chid": str(challan_id), "no": challan_no,
                    "cb": user_id, "ip": ip_address,
                },
            )

        await db.commit()
        return {
            "status": "success",
            "challan_no": challan_no,
            "id": str(challan_id),
            "return_due_date": str(due),
            "note": "Not a supply under CGST s.143. No GST charged on this dispatch.",
        }

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Job work challan creation failed")
        raise HTTPException(
            status_code=500,
            detail="Job work challan creation failed. The operation was rolled back and nothing was saved.",
        ) from e


# ─── Receive ─────────────────────────────────────────────────────────────────

@router.post("/challans/{challan_id}/receive", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def receive_against_challan(
    challan_id: UUID,
    payload: CreateReceiptRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Record goods coming back and bring the stock back in."""
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    try:
        ch_res = await db.execute(
            text(
                "SELECT c.id, c.challan_no, c.fiscal_year_id, c.status, c.return_due_date, "
                "       c.is_inter_state, p.state_code AS worker_state, p.gstin AS worker_gstin "
                "FROM caratloop.job_work_challans c "
                "JOIN caratloop.parties p ON p.id = c.job_worker_id "
                "WHERE c.id = :id AND c.company_id = :cid LIMIT 1"
            ),
            {"id": str(challan_id), "cid": company_id},
        )
        challan = ch_res.mappings().first()
        if not challan:
            raise HTTPException(status_code=404, detail="Job work challan not found")
        if challan["status"] == "Closed":
            raise HTTPException(status_code=409, detail="This challan is already closed")

        seq_res = await db.execute(
            text("SELECT caratloop.next_document_number(:cid, NULL, 'JobWorkReceipt')"),
            {"cid": company_id},
        )
        receipt_no = f"JWR/{seq_res.scalar():05d}"

        rc_res = await db.execute(
            text(
                "INSERT INTO caratloop.job_work_receipts "
                "(company_id, challan_id, receipt_no, receipt_date, making_charges, "
                " remarks, created_by) "
                "VALUES (:cid, :chid, :no, :rdate, :charges, :remarks, CAST(:cb AS UUID)) "
                "RETURNING id"
            ),
            {
                "cid": company_id, "chid": str(challan_id), "no": receipt_no,
                "rdate": payload.receipt_date, "charges": payload.making_charges,
                "remarks": payload.remarks, "cb": user_id,
            },
        )
        receipt_id = rc_res.scalar()

        loc_id = await resolve_stock_location(db, company_id)

        for line in payload.lines:
            cl_res = await db.execute(
                text(
                    "SELECT l.id, l.material_id, l.quantity_sent, l.taxable_value "
                    "FROM caratloop.job_work_challan_lines l "
                    "WHERE l.id = :lid AND l.challan_id = :chid LIMIT 1"
                ),
                {"lid": line.challan_line_id, "chid": str(challan_id)},
            )
            cl = cl_res.mappings().first()
            if not cl:
                raise HTTPException(
                    status_code=400,
                    detail=f"Challan line {line.challan_line_id} does not belong to this challan",
                )

            # Already-received quantities, so a second receipt cannot exceed
            # what went out.
            prev_res = await db.execute(
                text(
                    "SELECT COALESCE(SUM(quantity_received), 0) AS recd, "
                    "       COALESCE(SUM(quantity_wastage), 0) AS wasted "
                    "FROM caratloop.job_work_receipt_lines WHERE challan_line_id = :lid"
                ),
                {"lid": line.challan_line_id},
            )
            prev = prev_res.mappings().first()
            outstanding = net_of_wastage(
                cl["quantity_sent"],
                to_decimal(prev["recd"]),
                to_decimal(prev["wasted"]),
            )
            claiming = to_decimal(line.quantity_received) + to_decimal(line.quantity_wastage)
            if claiming > outstanding:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Line {line.challan_line_id}: {claiming} claimed but only "
                        f"{outstanding} is outstanding on this challan. "
                        "No data was saved."
                    ),
                )

            await db.execute(
                text(
                    "INSERT INTO caratloop.job_work_receipt_lines "
                    "(receipt_id, challan_line_id, material_id, quantity_received, "
                    " quantity_wastage, gross_weight, net_weight) "
                    "VALUES (:rid, :lid, :mid, :qty, :waste, :gw, :nw)"
                ),
                {
                    "rid": str(receipt_id), "lid": line.challan_line_id,
                    "mid": str(cl["material_id"]), "qty": line.quantity_received,
                    "waste": line.quantity_wastage, "gw": line.gross_weight,
                    "nw": line.net_weight,
                },
            )

            if line.quantity_received > 0:
                # Value returning at the same rate it left; the karigar's
                # making charges are a separate purchase, not stock value here.
                unit_value = (
                    to_decimal(cl["taxable_value"]) / to_decimal(cl["quantity_sent"])
                    if to_decimal(cl["quantity_sent"]) > 0
                    else Decimal("0")
                )
                await db.execute(
                    text(
                        "INSERT INTO caratloop.stock_ledger_entries "
                        "(company_id, fiscal_year_id, location_id, material_id, entry_date, "
                        " direction, transaction_type, quantity, amount, gross_weight, "
                        " net_weight, source_document_type, source_document_id, "
                        " source_document_no, sequence_no, created_by, ip_address) "
                        "VALUES (:cid, :fyid, :loc, :mid, :edate, 'I', 'JobWork_Receipt', "
                        "        :qty, :amt, :gw, :nw, 'JobWorkReceipt', :rid, :no, "
                        "        COALESCE((SELECT MAX(sequence_no) FROM caratloop.stock_ledger_entries), 0) + 1, "
                        "        CAST(:cb AS UUID), CAST(:ip AS INET))"
                    ),
                    {
                        "cid": company_id, "fyid": str(challan["fiscal_year_id"]),
                        "loc": loc_id, "mid": str(cl["material_id"]),
                        "edate": payload.receipt_date, "qty": line.quantity_received,
                        "amt": to_decimal(line.quantity_received) * unit_value,
                        "gw": line.gross_weight, "nw": line.net_weight,
                        "rid": str(receipt_id), "no": receipt_no,
                        "cb": user_id, "ip": ip_address,
                    },
                )

        # Close the challan only when nothing is outstanding on any line.
        out_res = await db.execute(
            text(
                "SELECT COALESCE(SUM(l.quantity_sent), 0) "
                "     - COALESCE(SUM(r.recd), 0) - COALESCE(SUM(r.wasted), 0) AS outstanding "
                "FROM caratloop.job_work_challan_lines l "
                "LEFT JOIN ( "
                "    SELECT challan_line_id, SUM(quantity_received) AS recd, "
                "           SUM(quantity_wastage) AS wasted "
                "    FROM caratloop.job_work_receipt_lines GROUP BY challan_line_id "
                ") r ON r.challan_line_id = l.id "
                "WHERE l.challan_id = :chid"
            ),
            {"chid": str(challan_id)},
        )
        outstanding_total = to_decimal(out_res.scalar())
        new_status = "Closed" if outstanding_total <= 0 else "PartiallyReceived"

        await db.execute(
            text(
                "UPDATE caratloop.job_work_challans SET status = :st "
                "WHERE id = :id AND company_id = :cid"
            ),
            {"st": new_status, "id": str(challan_id), "cid": company_id},
        )

        await db.commit()

        tax = job_work_tax(
            payload.making_charges,
            settings.COMPANY_STATE_CODE,
            challan["worker_state"] or settings.COMPANY_STATE_CODE,
            job_worker_registered=bool(challan["worker_gstin"]),
        )

        return {
            "status": "success",
            "receipt_no": receipt_no,
            "id": str(receipt_id),
            "challan_status": new_status,
            "outstanding_quantity": str(outstanding_total),
            "was_overdue": is_overdue(challan["return_due_date"], payload.receipt_date),
            "making_charges_tax": {
                "taxable_value": str(tax.taxable_value),
                "rate": str(tax.rate),
                "cgst": str(tax.cgst),
                "sgst": str(tax.sgst),
                "igst": str(tax.igst),
                "total": str(tax.total),
            },
        }

    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Job work receipt failed")
        raise HTTPException(
            status_code=500,
            detail="Job work receipt failed. The operation was rolled back and nothing was saved.",
        ) from e


# ─── Tracking ────────────────────────────────────────────────────────────────

@router.get("/challans")
async def list_challans(
    status: Optional[str] = None,
    job_worker_id: Optional[UUID] = None,
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    query = """
        SELECT c.id, c.challan_no, c.challan_date, c.goods_type, c.return_due_date,
               c.status, c.nature_of_work, c.is_inter_state,
               p.name AS job_worker_name, p.gstin AS job_worker_gstin
        FROM caratloop.job_work_challans c
        JOIN caratloop.parties p ON p.id = c.job_worker_id
        WHERE c.company_id = :cid
    """
    params = {"cid": current_user["company_id"]}
    if status:
        query += " AND c.status = :status"
        params["status"] = status
    if job_worker_id:
        query += " AND c.job_worker_id = :wid"
        params["wid"] = str(job_worker_id)
    query += " ORDER BY c.challan_date DESC"

    query = page.apply(query)
    params.update(page.params)

    res = await db.execute(text(query), params)
    rows = [dict(r) for r in res.mappings().all()]
    today = date.today()
    for row in rows:
        row["days_remaining"] = days_remaining(row["return_due_date"], today)
        row["is_overdue"] = is_overdue(row["return_due_date"], today)
    return {"challans": rows, **page.envelope(rows)}


@router.get("/overdue")
async def overdue_challans(
    as_of: Optional[date] = Query(None, description="Defaults to today."),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Challans past their s.143 deadline.

    Each of these is a deemed supply made on the CHALLAN date, not on the date
    the deadline passed, so tax and interest have been running since dispatch.
    """
    cutoff = as_of or date.today()
    res = await db.execute(
        text(
            "SELECT c.id, c.challan_no, c.challan_date, c.return_due_date, c.goods_type, "
            "       c.status, p.name AS job_worker_name, p.gstin AS job_worker_gstin, "
            "       COALESCE(SUM(l.taxable_value), 0) AS value_at_risk "
            "FROM caratloop.job_work_challans c "
            "JOIN caratloop.parties p ON p.id = c.job_worker_id "
            "LEFT JOIN caratloop.job_work_challan_lines l ON l.challan_id = c.id "
            "WHERE c.company_id = :cid "
            "  AND c.status IN ('Open', 'PartiallyReceived') "
            "  AND c.return_due_date < :cutoff "
            "GROUP BY c.id, c.challan_no, c.challan_date, c.return_due_date, "
            "         c.goods_type, c.status, p.name, p.gstin "
            "ORDER BY c.return_due_date"
        ),
        {"cid": current_user["company_id"], "cutoff": cutoff},
    )
    rows = [dict(r) for r in res.mappings().all()]
    for row in rows:
        row["days_overdue"] = -days_remaining(row["return_due_date"], cutoff)
        row["deemed_supply_date"] = str(row["challan_date"])

    return {
        "as_of": str(cutoff),
        "rule": "CGST s.143(3) — deemed supply on the date of dispatch",
        "count": len(rows),
        "total_value_at_risk": str(sum(to_decimal(r["value_at_risk"]) for r in rows)),
        "challans": rows,
    }


@router.get("/itc-04")
async def itc_04(
    from_date: date,
    to_date: date,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """ITC-04 data: goods sent to, and received back from, job workers."""
    company_id = current_user["company_id"]

    sent_res = await db.execute(
        text(
            "SELECT c.challan_no, c.challan_date, p.gstin AS job_worker_gstin, "
            "       p.name AS job_worker_name, p.state_code, "
            "       l.description, l.hsn_code, l.quantity_sent, l.taxable_value "
            "FROM caratloop.job_work_challans c "
            "JOIN caratloop.parties p ON p.id = c.job_worker_id "
            "JOIN caratloop.job_work_challan_lines l ON l.challan_id = c.id "
            "WHERE c.company_id = :cid AND c.challan_date BETWEEN :f AND :t "
            "ORDER BY c.challan_date, c.challan_no"
        ),
        {"cid": company_id, "f": from_date, "t": to_date},
    )

    recd_res = await db.execute(
        text(
            "SELECT r.receipt_no, r.receipt_date, c.challan_no, "
            "       p.gstin AS job_worker_gstin, rl.quantity_received, rl.quantity_wastage "
            "FROM caratloop.job_work_receipts r "
            "JOIN caratloop.job_work_challans c ON c.id = r.challan_id "
            "JOIN caratloop.parties p ON p.id = c.job_worker_id "
            "JOIN caratloop.job_work_receipt_lines rl ON rl.receipt_id = r.id "
            "WHERE r.company_id = :cid AND r.receipt_date BETWEEN :f AND :t "
            "ORDER BY r.receipt_date, r.receipt_no"
        ),
        {"cid": company_id, "f": from_date, "t": to_date},
    )

    sent = [dict(r) for r in sent_res.mappings().all()]
    received = [dict(r) for r in recd_res.mappings().all()]

    for row in received:
        row["wastage_pct"] = str(
            wastage_pct(
                to_decimal(row["quantity_received"]) + to_decimal(row["quantity_wastage"]),
                row["quantity_wastage"],
            )
        )

    return {
        "period": {"from": str(from_date), "to": str(to_date)},
        "form": "ITC-04 — goods sent to and received from job workers",
        "table_4_sent": sent,
        "table_5_received": received,
        "note": (
            "Prepared from challans and receipts in this period. Table 5A/5B "
            "splitting by original challan period is not applied."
        ),
    }
