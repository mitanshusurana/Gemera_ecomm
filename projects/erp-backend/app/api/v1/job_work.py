"""Job work (karigar) endpoints — CGST s.143 and Rule 45.

Gold goes out to a karigar for making and comes back as finished pieces. The
dispatch is not a supply, so it moves on a delivery challan rather than a tax
invoice, and the goods stay the principal's asset throughout.

The part that bites is the deadline: inputs not returned within a year mean the
original dispatch is retrospectively a supply made on the day it left. Nothing
tracked that, so nothing could warn about it.

What the receipt does with the money (added with migration 0009):

  * The karigar's making charges become a purchase invoice on the karigar,
    raised through ``purchases.create_purchase_invoice`` so the payable, the
    GST or reverse charge and the input credit are posted by the one tested
    path. A karigar without a GSTIN is billed under reverse charge.
  * The pieces come back into stock at what they cost: the metal that went
    out (at the cost it went out at, including what was lost making them)
    plus the making charges. The bill debits the job-work expense account, so
    a second, balanced journal moves the making charges from expense into the
    stock account of the material that came back, and the ledger agrees with
    the stock register.
  * A challan past its s.143 deadline can be deemed supplied: the outstanding
    metal is constructively returned and invoiced to the karigar at its issue
    value through ``sales.create_sales_invoice``.
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

from app.api.v1.purchases import (
    CreatePurchaseInvoiceRequest,
    PurchaseLineRequest,
    create_purchase_invoice,
)
from app.api.v1.sales import (
    CreateSalesInvoiceRequest,
    InvoiceLineRequest,
    create_sales_invoice,
)
from app.core.config import settings
from app.core.costing import (
    account_id_for_code,
    cost_of_goods_sold,
    resolve_stock_account,
    weighted_average_cost,
)
from app.core.database import get_db, set_audit_context
from app.core.ledger import assert_journal_balanced
from app.core.money import ZERO, round_money, to_decimal
from app.core.pagination import Page, paginate
from app.core.periods import assert_period_open
from app.core.roles import CAN_MOVE_STOCK, CAN_POST, has_role, require
from app.core.security import get_current_user
from app.core.stock import assert_stock_available
from app.core.tenancy import resolve_default_uom, resolve_fiscal_year, resolve_stock_location
from app.tax.gstin import is_gstin_shaped
from app.tax.job_work import (
    GOODS_TYPE_INPUT,
    JOB_WORK_GST_RATE,
    JOB_WORK_SAC,
    ReceiptCostLine,
    days_remaining,
    is_overdue,
    job_work_tax,
    net_of_wastage,
    return_due_date,
    roll_up_receipt_cost,
    unit_issue_cost,
    wastage_pct,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/job-work", tags=["Job Work"])

# The service item the karigar's bill is raised against. It is a service, not
# stock: created inactive so it never appears in stock pickers or the stock
# register, and pointed at the job-work expense account so the purchase path
# debits expense rather than a metal stock account.
MAKING_MATERIAL_CODE = "MAKING"
JOB_WORK_EXPENSE_ACCOUNT = "MFG-001"


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ChallanLineRequest(BaseModel):
    material_id: UUID
    description: Optional[str] = None
    hsn_code: Optional[str] = None
    quantity_sent: Decimal = Field(gt=0)
    gross_weight: Optional[Decimal] = Field(default=None, ge=0)
    net_weight: Optional[Decimal] = Field(default=None, ge=0)
    purity: Optional[Decimal] = Field(default=None, gt=0, le=1)
    # Value for the challan and ITC-04. Zero means "use our cost".
    taxable_value: Decimal = Field(default=Decimal("0"), ge=0)


class CreateChallanRequest(BaseModel):
    job_worker_id: UUID
    challan_date: date
    goods_type: str = GOODS_TYPE_INPUT
    nature_of_work: Optional[str] = None
    # The legal deadline is derived; an earlier date may be agreed with the
    # karigar and is stored in its place. Later than the law allows is refused.
    expected_return_date: Optional[date] = None
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
    # The karigar's own bill number, printed on their bill; ours otherwise.
    karigar_bill_no: Optional[str] = Field(default=None, max_length=50)
    lines: List[ReceiptLineRequest]
    remarks: Optional[str] = None
    reason: str = "Job work goods received"


class DeemSupplyRequest(BaseModel):
    invoice_date: Optional[date] = None
    place_of_supply: Optional[str] = None
    reason: str = "Deemed supply under CGST s.143(3): goods not returned in time"


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _client(request: Request, current_user: dict) -> tuple[str, str, str, str]:
    user_id = str(current_user["id"])
    company_id = current_user["company_id"]
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    return user_id, company_id, ip_address, session_id


async def _issue_unit_cost(db: AsyncSession, company_id, challan_id, line) -> Decimal:
    """What one unit of this line's material cost when it went out.

    Read from the challan's own Job_Work_Out rows first -- that is literally
    what left -- then the weighted average, then the challan value. Zero only
    when nothing at all is known.
    """
    out_res = await db.execute(
        text(
            "SELECT COALESCE(SUM(amount), 0) AS amt, COALESCE(SUM(quantity), 0) AS qty "
            "FROM caratloop.stock_ledger_entries "
            "WHERE company_id = :cid AND source_document_type = 'JobWorkChallan' "
            "  AND source_document_id = :chid AND material_id = :mid AND direction = 'O'"
        ),
        {"cid": company_id, "chid": str(challan_id), "mid": str(line["material_id"])},
    )
    out = out_res.mappings().first() or {"amt": 0, "qty": 0}
    unit = unit_issue_cost(out["amt"], out["qty"])
    if unit <= 0:
        unit = (await weighted_average_cost(db, company_id, line["material_id"])).quantize(Decimal("0.0001"))
    if unit <= 0:
        unit = unit_issue_cost(line["taxable_value"], line["quantity_sent"])
    return unit


async def _insert_job_work_in(
    db: AsyncSession, *, company_id, fiscal_year_id, location_id, material_id,
    entry_date, quantity, unit_cost, amount, gross_weight, net_weight,
    source_type, source_id, source_no, remarks, user_id, ip_address,
) -> None:
    await db.execute(
        text(
            "INSERT INTO caratloop.stock_ledger_entries "
            "(company_id, fiscal_year_id, location_id, material_id, entry_date, "
            " direction, transaction_type, quantity, rate, amount, gross_weight, "
            " net_weight, source_document_type, source_document_id, "
            " source_document_no, remarks, sequence_no, created_by, ip_address) "
            "VALUES (:cid, :fyid, :loc, :mid, :edate, 'I', 'Job_Work_In', "
            "        :qty, :rate, :amt, :gw, :nw, :stype, :sid, :no, :remarks, "
            "        COALESCE((SELECT MAX(sequence_no) FROM caratloop.stock_ledger_entries), 0) + 1, "
            "        CAST(:cb AS UUID), CAST(:ip AS INET))"
        ),
        {
            "cid": company_id, "fyid": str(fiscal_year_id), "loc": location_id,
            "mid": str(material_id), "edate": entry_date, "qty": quantity,
            "rate": unit_cost, "amt": amount, "gw": gross_weight, "nw": net_weight,
            "stype": source_type, "sid": str(source_id), "no": source_no,
            "remarks": remarks, "cb": user_id, "ip": ip_address,
        },
    )


async def _ensure_making_material(db: AsyncSession, company_id, user_id, expense_account_id) -> str:
    """The MAKING service item, created on first use."""
    res = await db.execute(
        text(
            "SELECT id FROM caratloop.materials "
            "WHERE company_id = :cid AND code = :code LIMIT 1"
        ),
        {"cid": company_id, "code": MAKING_MATERIAL_CODE},
    )
    found = res.scalar()
    if found:
        return str(found)
    uom_id = await resolve_default_uom(db)
    ins = await db.execute(
        text(
            "INSERT INTO caratloop.materials "
            "(company_id, uom_id, code, name, category, hsn_code, gst_tax_rate, "
            " is_raw_material, is_finished_good, is_active, stock_account_id, "
            " description, created_by) "
            "VALUES (:cid, :uom, :code, :name, 'Service', :hsn, :rate, FALSE, FALSE, FALSE, "
            "        CAST(:acc AS UUID), :descr, CAST(:cb AS UUID)) RETURNING id"
        ),
        {
            "cid": company_id, "uom": uom_id, "code": MAKING_MATERIAL_CODE,
            "name": "Making charges (job work, SAC 998892)", "hsn": JOB_WORK_SAC,
            "rate": JOB_WORK_GST_RATE, "acc": expense_account_id,
            "descr": (
                "Service item the karigar's making-charge bill is raised against. "
                "Not stock; kept inactive so it stays out of stock pickers."
            ),
            "cb": user_id,
        },
    )
    return str(ins.scalar())


async def _challan_lines_with_outstanding(db: AsyncSession, challan_id) -> list[dict]:
    res = await db.execute(
        text(
            "SELECT l.id, l.sequence_no, l.material_id, m.code AS material_code, "
            "       m.name AS material_name, u.code AS uom, l.description, "
            "       l.hsn_code, l.quantity_sent, l.gross_weight, l.net_weight, "
            "       l.purity, l.taxable_value, "
            "       COALESCE(r.received, 0) AS quantity_received, "
            "       COALESCE(r.wastage, 0)  AS quantity_wastage, "
            "       l.quantity_sent - COALESCE(r.received, 0) - COALESCE(r.wastage, 0) "
            "           AS quantity_outstanding "
            "FROM caratloop.job_work_challan_lines l "
            "LEFT JOIN caratloop.materials m ON m.id = l.material_id "
            "LEFT JOIN caratloop.units_of_measure u ON u.id = COALESCE(l.uom_id, m.uom_id) "
            "LEFT JOIN ( "
            "    SELECT challan_line_id, "
            "           SUM(quantity_received) AS received, "
            "           SUM(quantity_wastage)  AS wastage "
            "    FROM caratloop.job_work_receipt_lines GROUP BY challan_line_id "
            ") r ON r.challan_line_id = l.id "
            "WHERE l.challan_id = :id "
            "ORDER BY l.sequence_no"
        ),
        {"id": str(challan_id)},
    )
    return [dict(r) for r in res.mappings().all()]


# ─── Issue ───────────────────────────────────────────────────────────────────

@router.post("/challans", dependencies=[Depends(require(*CAN_MOVE_STOCK))])
async def create_challan(
    payload: CreateChallanRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Issue a delivery challan and move stock out to the job worker.

    No GST is charged: sending goods for job work is not a supply. The stock
    ledger row carries our cost (weighted average), not the challan value, so
    what comes back can be valued at what went out.
    """
    user_id, company_id, ip_address, session_id = _client(request, current_user)
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    if not payload.lines:
        raise HTTPException(status_code=422, detail="A challan needs at least one line.")

    try:
        # A locked year takes no stock movement either: the Rule 56 register
        # for that year has been closed with the books.
        await assert_period_open(db, company_id, payload.challan_date, what="This job work challan")

        worker_res = await db.execute(
            text(
                "SELECT id, name, gstin, state_code, party_type FROM caratloop.parties "
                "WHERE id = :id AND company_id = :cid LIMIT 1"
            ),
            {"id": str(payload.job_worker_id), "cid": company_id},
        )
        worker = worker_res.mappings().first()
        if not worker:
            raise HTTPException(status_code=404, detail="Job worker not found")
        if worker["party_type"] == "Customer":
            raise HTTPException(
                status_code=422,
                detail=(
                    f"{worker['name']} is filed as a Customer. A job worker must be a "
                    "Karigar or Supplier so their making charges can be booked as a payable."
                ),
            )

        fy = await resolve_fiscal_year(db, company_id)

        seq_res = await db.execute(
            text("SELECT caratloop.next_document_number(:cid, :fyid, 'JobWorkChallan')"),
            {"cid": company_id, "fyid": str(fy["id"])},
        )
        challan_no = f"JW/{fy['year_label']}/{seq_res.scalar():05d}"

        legal_due = return_due_date(payload.challan_date, payload.goods_type)
        due = legal_due
        if payload.expected_return_date is not None:
            if payload.expected_return_date > legal_due:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Expected return {payload.expected_return_date} is after the s.143 "
                        f"deadline {legal_due}. The goods must be back by then."
                    ),
                )
            if payload.expected_return_date <= payload.challan_date:
                raise HTTPException(status_code=422, detail="Expected return must be after the challan date.")
            due = payload.expected_return_date

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

        total_value = ZERO
        total_cost = ZERO
        for seq, line in enumerate(payload.lines, 1):
            # The goods are still ours, but they are leaving the premises, so
            # they must actually be here to send.
            await assert_stock_available(
                db, company_id, line.material_id, line.quantity_sent,
                location_id=loc_id,
                context=f"job work challan {challan_no}",
                material_label=str(line.material_id),
            )

            # Our cost of what is leaving. The challan value defaults to it
            # when the caller gave none, so ITC-04 and a later deemed supply
            # have a figure to work from.
            cost = await cost_of_goods_sold(db, company_id, line.material_id, line.quantity_sent)
            value = round_money(line.taxable_value) if line.taxable_value > 0 else cost
            ledger_amount = cost if cost > 0 else value
            unit_rate = unit_issue_cost(ledger_amount, line.quantity_sent)

            await db.execute(
                text(
                    "INSERT INTO caratloop.job_work_challan_lines "
                    "(challan_id, sequence_no, material_id, uom_id, description, hsn_code, "
                    " quantity_sent, gross_weight, net_weight, purity, taxable_value) "
                    "VALUES (:chid, :seq, :mid, "
                    "        (SELECT uom_id FROM caratloop.materials WHERE id = :mid), "
                    "        :desc, :hsn, :qty, :gw, :nw, :pur, :val)"
                ),
                {
                    "chid": str(challan_id), "seq": seq, "mid": str(line.material_id),
                    "desc": line.description, "hsn": line.hsn_code,
                    "qty": line.quantity_sent, "gw": line.gross_weight,
                    "nw": line.net_weight, "pur": line.purity,
                    "val": value,
                },
            )

            await db.execute(
                text(
                    "INSERT INTO caratloop.stock_ledger_entries "
                    "(company_id, fiscal_year_id, location_id, material_id, entry_date, "
                    " direction, transaction_type, quantity, rate, amount, gross_weight, "
                    " net_weight, purity, source_document_type, source_document_id, "
                    " source_document_no, sequence_no, created_by, ip_address) "
                    "VALUES (:cid, :fyid, :loc, :mid, :edate, 'O', 'Job_Work_Out', "
                    "        :qty, :rate, :amt, :gw, :nw, :pur, 'JobWorkChallan', :chid, :no, "
                    "        COALESCE((SELECT MAX(sequence_no) FROM caratloop.stock_ledger_entries), 0) + 1, "
                    "        CAST(:cb AS UUID), CAST(:ip AS INET))"
                ),
                {
                    "cid": company_id, "fyid": str(fy["id"]), "loc": loc_id,
                    "mid": str(line.material_id), "edate": payload.challan_date,
                    "qty": line.quantity_sent, "rate": unit_rate, "amt": ledger_amount,
                    "gw": line.gross_weight, "nw": line.net_weight, "pur": line.purity,
                    "chid": str(challan_id), "no": challan_no,
                    "cb": user_id, "ip": ip_address,
                },
            )
            total_value += value
            total_cost += ledger_amount

        await db.commit()
        return {
            "status": "success",
            "challan_no": challan_no,
            "id": str(challan_id),
            "return_due_date": str(due),
            "legal_return_due_date": str(legal_due),
            "total_value": str(total_value),
            "issued_cost": str(total_cost),
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
    """Record goods coming back, bring the stock in at full cost, and bill
    the karigar's making charges.

    Making charges > 0 raise a purchase invoice on the karigar, which is a
    financial posting: the caller must hold a posting role for that, not only
    a stock role.
    """
    user_id, company_id, ip_address, session_id = _client(request, current_user)
    making = round_money(payload.making_charges)

    if making > 0 and not has_role(current_user, CAN_POST):
        raise HTTPException(
            status_code=403,
            detail=(
                "Recording making charges raises the karigar's bill, which needs a posting "
                "role (owner, admin or accountant). Receive the goods with zero making "
                "charges, or ask accounts to record the receipt."
            ),
        )
    if not payload.lines:
        raise HTTPException(status_code=422, detail="A receipt needs at least one line.")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    bill: dict | None = None
    capitalise: list[tuple[str, Decimal]] = []
    try:
        await assert_period_open(db, company_id, payload.receipt_date, what="This job work receipt")

        ch_res = await db.execute(
            text(
                "SELECT c.id, c.challan_no, c.challan_date, c.fiscal_year_id, c.status, "
                "       c.return_due_date, c.is_inter_state, c.place_of_supply, "
                "       p.id AS worker_id, p.name AS worker_name, "
                "       p.state_code AS worker_state, p.gstin AS worker_gstin "
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
        if challan["status"] == "DeemedSupply":
            raise HTTPException(
                status_code=409,
                detail="This challan was deemed supplied and invoiced; nothing can be received against it.",
            )

        expense_account_id: str | None = None
        if making > 0:
            expense_account_id = await account_id_for_code(db, company_id, JOB_WORK_EXPENSE_ACCOUNT)
            if not expense_account_id:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Chart of accounts is missing '{JOB_WORK_EXPENSE_ACCOUNT}' (Job Work / "
                        "Karigar Charges). Create it before billing making charges. No data was saved."
                    ),
                )

        seq_res = await db.execute(
            text("SELECT caratloop.next_document_number(:cid, NULL, 'JobWorkReceipt')"),
            {"cid": company_id},
        )
        receipt_no = f"JWR/{seq_res.scalar():05d}"

        rc_res = await db.execute(
            text(
                "INSERT INTO caratloop.job_work_receipts "
                "(company_id, challan_id, receipt_no, receipt_date, making_charges, "
                " karigar_bill_no, remarks, created_by) "
                "VALUES (:cid, :chid, :no, :rdate, :charges, :kbill, :remarks, CAST(:cb AS UUID)) "
                "RETURNING id"
            ),
            {
                "cid": company_id, "chid": str(challan_id), "no": receipt_no,
                "rdate": payload.receipt_date, "charges": making,
                "kbill": (payload.karigar_bill_no or "").strip() or None,
                "remarks": payload.remarks, "cb": user_id,
            },
        )
        receipt_id = rc_res.scalar()

        loc_id = await resolve_stock_location(db, company_id)

        # Pass one: validate every line and find what its metal cost on the
        # way out. Nothing is written until all lines are known good, so the
        # making charges can be spread over the lines that actually received.
        checked: list[tuple[ReceiptLineRequest, dict]] = []
        cost_inputs: list[ReceiptCostLine] = []
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

            unit = await _issue_unit_cost(db, company_id, challan_id, cl)
            checked.append((line, dict(cl)))
            cost_inputs.append(
                ReceiptCostLine(
                    key=line.challan_line_id,
                    quantity_received=to_decimal(line.quantity_received),
                    quantity_wastage=to_decimal(line.quantity_wastage),
                    unit_issue_cost=unit,
                )
            )

        costs = {c.key: c for c in roll_up_receipt_cost(cost_inputs, making)}
        total_received_cost = ZERO
        total_metal_cost = ZERO

        # Pass two: write the lines and bring the pieces in at full cost.
        for line, cl in checked:
            cost = costs[line.challan_line_id]
            await db.execute(
                text(
                    "INSERT INTO caratloop.job_work_receipt_lines "
                    "(receipt_id, challan_line_id, material_id, quantity_received, "
                    " quantity_wastage, gross_weight, net_weight, unit_cost, cost_amount, "
                    " making_charge_share) "
                    "VALUES (:rid, :lid, :mid, :qty, :waste, :gw, :nw, :unit, :cost, :share)"
                ),
                {
                    "rid": str(receipt_id), "lid": line.challan_line_id,
                    "mid": str(cl["material_id"]), "qty": line.quantity_received,
                    "waste": line.quantity_wastage, "gw": line.gross_weight,
                    "nw": line.net_weight, "unit": cost.unit_cost,
                    "cost": cost.total_cost, "share": cost.making_charge_share,
                },
            )
            total_metal_cost += cost.metal_cost

            if line.quantity_received > 0:
                await _insert_job_work_in(
                    db, company_id=company_id, fiscal_year_id=challan["fiscal_year_id"],
                    location_id=loc_id, material_id=cl["material_id"],
                    entry_date=payload.receipt_date, quantity=line.quantity_received,
                    unit_cost=cost.unit_cost, amount=cost.total_cost,
                    gross_weight=line.gross_weight, net_weight=line.net_weight,
                    source_type="JobWorkReceipt", source_id=receipt_id, source_no=receipt_no,
                    remarks=(
                        f"Metal {cost.metal_cost} + making {cost.making_charge_share} "
                        f"against {challan['challan_no']}"
                    ),
                    user_id=user_id, ip_address=ip_address,
                )
                total_received_cost += cost.total_cost
                if cost.making_charge_share > 0:
                    stock_acc = await resolve_stock_account(db, company_id, cl["material_id"])
                    if stock_acc:
                        capitalise.append((stock_acc, cost.making_charge_share))

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

        if making > 0:
            # The karigar's bill, through the purchase path. It commits on
            # success (taking the receipt above with it) and rolls back on
            # failure (likewise), so the receipt and its bill stand or fall
            # together.
            making_material_id = await _ensure_making_material(db, company_id, user_id, expense_account_id)
            registered = is_gstin_shaped((challan["worker_gstin"] or "").strip().upper())
            bill = await create_purchase_invoice(
                CreatePurchaseInvoiceRequest(
                    supplier_id=UUID(str(challan["worker_id"])),
                    invoice_date=payload.receipt_date,
                    supplier_invoice_no=(payload.karigar_bill_no or "").strip() or receipt_no,
                    place_of_supply=(challan["worker_state"] or challan["place_of_supply"] or settings.COMPANY_STATE_CODE),
                    items=[
                        PurchaseLineRequest(
                            material_id=making_material_id,
                            description=f"Making charges — {receipt_no} against {challan['challan_no']}"[:200],
                            quantity=1.0,
                            gross_weight=0.0,
                            net_weight=0.0,
                            purity=1.0,
                            rate=float(making),
                            making_charges=0.0,
                            hsn_code=JOB_WORK_SAC,
                            gst_rate=float(JOB_WORK_GST_RATE),
                        )
                    ],
                    # A karigar without a GSTIN cannot charge tax; the
                    # principal self-assesses under reverse charge.
                    is_rcm=not registered,
                    reason=f"Karigar making charges on job work receipt {receipt_no}",
                ),
                request,
                db,
                current_user,
            )
        else:
            await db.commit()

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

    capitalisation_je: str | None = None
    if bill is not None:
        # The receipt and the bill are committed. Link them and move the making
        # charges from expense into stock, in a second short transaction; if it
        # fails the bill stands and the message names both documents.
        try:
            await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
            await db.execute(
                text(
                    "UPDATE caratloop.job_work_receipts SET making_charge_bill_id = CAST(:bill AS UUID) "
                    "WHERE id = :id AND company_id = :cid"
                ),
                {"bill": str(bill["id"]), "id": str(receipt_id), "cid": company_id},
            )
            capitalisation_je = await _capitalise_making_charges(
                db, company_id=company_id, fiscal_year_id=challan["fiscal_year_id"],
                entry_date=payload.receipt_date, receipt_id=receipt_id, receipt_no=receipt_no,
                challan_no=challan["challan_no"], expense_account_id=expense_account_id,
                legs=capitalise, user_id=user_id, ip_address=ip_address, session_id=session_id,
            )
            await db.commit()
        except HTTPException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.exception(
                "Bill %s was raised but receipt %s could not be linked or its making charges capitalised",
                bill.get("bill_no"), receipt_no,
            )
            raise HTTPException(
                status_code=500,
                detail=(
                    f"Receipt {receipt_no} and bill {bill.get('bill_no')} were saved, but the "
                    "receipt could not be linked to the bill. Link it manually."
                ),
            ) from e

    tax = job_work_tax(
        making,
        settings.COMPANY_STATE_CODE,
        challan["worker_state"] or settings.COMPANY_STATE_CODE,
        job_worker_registered=is_gstin_shaped((challan["worker_gstin"] or "").strip().upper()),
    )

    return {
        "status": "success",
        "receipt_no": receipt_no,
        "id": str(receipt_id),
        "challan_status": new_status,
        "outstanding_quantity": str(outstanding_total),
        "was_overdue": is_overdue(challan["return_due_date"], payload.receipt_date),
        "metal_cost": str(total_metal_cost),
        "stock_value_in": str(total_received_cost),
        "making_charge_bill": (
            {"id": str(bill["id"]), "bill_no": bill["bill_no"], "reverse_charge": not is_gstin_shaped((challan["worker_gstin"] or "").strip().upper())}
            if bill else None
        ),
        "capitalisation_journal_no": capitalisation_je,
        "making_charges_tax": {
            "taxable_value": str(tax.taxable_value),
            "rate": str(tax.rate),
            "cgst": str(tax.cgst),
            "sgst": str(tax.sgst),
            "igst": str(tax.igst),
            "total": str(tax.total),
        },
    }


async def _capitalise_making_charges(
    db: AsyncSession, *, company_id, fiscal_year_id, entry_date, receipt_id, receipt_no,
    challan_no, expense_account_id, legs, user_id, ip_address, session_id,
) -> str | None:
    """Dr stock (per returned material) / Cr job-work expense, for the making
    charges that were loaded onto the returned pieces.

    The purchase path debited MFG-001 for the whole bill. The stock ledger
    now carries the same rupees inside the Job_Work_In rows, so without this
    entry the stock account and the stock register would disagree by exactly
    the making charges, and cost of goods sold would later credit stock for
    value that was never debited to it.
    """
    total = sum((amt for _, amt in legs), ZERO)
    if total <= 0 or not expense_account_id:
        return None

    fy_res = await db.execute(
        text("SELECT year_label FROM caratloop.fiscal_years WHERE id = :fyid"),
        {"fyid": str(fiscal_year_id)},
    )
    year_label = fy_res.scalar() or ""
    no_res = await db.execute(
        text("SELECT 'JV/' || :fy || '/' || LPAD(NEXTVAL('caratloop.journal_entry_seq')::TEXT, 5, '0')"),
        {"fy": year_label},
    )
    je_no = no_res.scalar()

    je_res = await db.execute(
        text(
            "INSERT INTO caratloop.journal_entries "
            "(company_id, fiscal_year_id, entry_no, entry_date, entry_type, narration, "
            " reference_no, reference_type, reference_id, total_debit, total_credit, "
            " created_by, ip_address, session_id, sequence_no) "
            "VALUES (:cid, :fyid, :no, :edate, 'Journal', :narration, :refno, :reftype, "
            "        CAST(:refid AS UUID), :amt, :amt, CAST(:cb AS UUID), CAST(:ip AS INET), "
            "        :sess, NEXTVAL('caratloop.journal_entry_seq')) RETURNING id"
        ),
        {
            "cid": company_id, "fyid": str(fiscal_year_id), "no": je_no, "edate": entry_date,
            "narration": f"Making charges capitalised into stock — {receipt_no} against {challan_no}",
            "refno": receipt_no, "reftype": "JobWorkReceipt", "refid": str(receipt_id),
            "amt": total, "cb": user_id, "ip": ip_address,
            "sess": int(session_id) if (session_id and str(session_id).isdigit() and int(session_id) > 0) else None,
        },
    )
    je_id = je_res.scalar()

    # One debit per stock account (several lines may share one).
    by_account: dict[str, Decimal] = {}
    for acc, amt in legs:
        by_account[acc] = by_account.get(acc, ZERO) + amt

    seq = 1
    for acc, amt in by_account.items():
        await db.execute(
            text(
                "INSERT INTO caratloop.journal_entry_lines "
                "(journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) "
                "VALUES (:jid, :seq, CAST(:aid AS UUID), :dr, 0, :narr)"
            ),
            {"jid": je_id, "seq": seq, "aid": acc, "dr": amt, "narr": f"Making charges on returned pieces — {receipt_no}"},
        )
        seq += 1
    await db.execute(
        text(
            "INSERT INTO caratloop.journal_entry_lines "
            "(journal_entry_id, sequence_no, account_id, dr_amount, cr_amount, narration) "
            "VALUES (:jid, :seq, CAST(:aid AS UUID), 0, :cr, :narr)"
        ),
        {"jid": je_id, "seq": seq, "aid": expense_account_id, "cr": total, "narr": f"Karigar charges moved to stock — {receipt_no}"},
    )
    await assert_journal_balanced(db, je_id, context="making-charge capitalisation journal")
    return je_no


# ─── Deemed supply ───────────────────────────────────────────────────────────

@router.post("/challans/{challan_id}/deem-supply", dependencies=[Depends(require(*CAN_POST))])
async def deem_supply(
    challan_id: UUID,
    payload: DeemSupplyRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Treat a challan past its s.143 deadline as a supply to the karigar.

    The outstanding metal is constructively returned to stock (it never came
    back, but the law says it was sold, and a sale relieves stock) and then
    invoiced to the karigar at its issue value through the sales path, which
    charges GST and posts revenue, output tax and cost of goods sold. The
    invoice is dated today; s.143(3) dates the supply to the challan, so
    interest runs from then -- the narration says so.
    """
    user_id, company_id, ip_address, session_id = _client(request, current_user)
    invoice_date = payload.invoice_date or date.today()

    ch_res = await db.execute(
        text(
            "SELECT c.id, c.challan_no, c.challan_date, c.fiscal_year_id, c.status, "
            "       c.return_due_date, c.place_of_supply, c.job_worker_id, p.name AS worker_name "
            "FROM caratloop.job_work_challans c "
            "JOIN caratloop.parties p ON p.id = c.job_worker_id "
            "WHERE c.id = :id AND c.company_id = :cid LIMIT 1"
        ),
        {"id": str(challan_id), "cid": company_id},
    )
    challan = ch_res.mappings().first()
    if not challan:
        raise HTTPException(status_code=404, detail="Job work challan not found")
    if challan["status"] not in ("Open", "PartiallyReceived"):
        raise HTTPException(
            status_code=409,
            detail=f"Challan {challan['challan_no']} is {challan['status']}; only an open challan can be deemed supplied.",
        )
    if not is_overdue(challan["return_due_date"], invoice_date):
        raise HTTPException(
            status_code=409,
            detail=(
                f"Challan {challan['challan_no']} is not overdue until {challan['return_due_date']}. "
                "A deemed supply arises only once the s.143 window has passed."
            ),
        )

    lines = [ln for ln in await _challan_lines_with_outstanding(db, challan_id) if to_decimal(ln["quantity_outstanding"]) > 0]
    if not lines:
        raise HTTPException(status_code=409, detail="Nothing is outstanding on this challan.")

    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
    try:
        await assert_period_open(db, company_id, invoice_date, what="The deemed-supply invoice")

        loc_id = await resolve_stock_location(db, company_id)
        invoice_lines: list[InvoiceLineRequest] = []
        for ln in lines:
            outstanding = to_decimal(ln["quantity_outstanding"])
            unit_cost = await _issue_unit_cost(db, company_id, challan_id, ln)
            unit_value = unit_issue_cost(ln["taxable_value"], ln["quantity_sent"])
            if unit_value <= 0:
                unit_value = unit_cost
            value = round_money(outstanding * unit_value)

            await _insert_job_work_in(
                db, company_id=company_id, fiscal_year_id=challan["fiscal_year_id"],
                location_id=loc_id, material_id=ln["material_id"], entry_date=invoice_date,
                quantity=outstanding, unit_cost=unit_cost, amount=round_money(outstanding * unit_cost),
                gross_weight=None, net_weight=None,
                source_type="JobWorkChallan", source_id=challan_id, source_no=challan["challan_no"],
                remarks=f"Constructive return for deemed supply u/s 143(3) — {challan['challan_no']}",
                user_id=user_id, ip_address=ip_address,
            )
            invoice_lines.append(
                InvoiceLineRequest(
                    material_id=UUID(str(ln["material_id"])),
                    hsn_sac_code=ln["hsn_code"] or None,
                    description=(
                        f"Deemed supply u/s 143(3): {ln['description'] or ln['material_name']} "
                        f"sent on {challan['challan_no']} dated {challan['challan_date']}, not returned"
                    )[:200],
                    quantity=outstanding,
                    purity=ln["purity"],
                    material_value=value,
                )
            )

        sale = await create_sales_invoice(
            CreateSalesInvoiceRequest(
                customer_id=UUID(str(challan["job_worker_id"])),
                invoice_date=invoice_date,
                place_of_supply=payload.place_of_supply or challan["place_of_supply"],
                lines=invoice_lines,
                payment_terms="Immediate",
                narration=(
                    f"Deemed supply under CGST s.143(3): inputs sent on challan {challan['challan_no']} "
                    f"dated {challan['challan_date']} not received back by {challan['return_due_date']}. "
                    f"The supply is dated {challan['challan_date']}; interest runs from that date."
                ),
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
        logger.exception("Deemed supply failed before the invoice was raised")
        raise HTTPException(
            status_code=500,
            detail="Deemed supply failed. The operation was rolled back and nothing was saved.",
        ) from e

    try:
        await set_audit_context(db, user_id, session_id, ip_address, payload.reason)
        await db.execute(
            text(
                "UPDATE caratloop.job_work_challans "
                "SET status = 'DeemedSupply', deemed_supply_at = NOW(), "
                "    deemed_supply_invoice_id = CAST(:inv AS UUID) "
                "WHERE id = :id AND company_id = :cid"
            ),
            {"inv": str(sale["invoice_id"]), "id": str(challan_id), "cid": company_id},
        )
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Invoice %s raised but challan %s not marked deemed supplied", sale.get("invoice_no"), challan["challan_no"])
        raise HTTPException(
            status_code=500,
            detail=(
                f"Invoice {sale.get('invoice_no')} was raised, but challan {challan['challan_no']} "
                "could not be marked as deemed supplied. Mark it manually."
            ),
        ) from e

    return {
        "status": "success",
        "challan_no": challan["challan_no"],
        "invoice_no": sale.get("invoice_no"),
        "invoice_id": str(sale["invoice_id"]),
        "deemed_supply_date": str(challan["challan_date"]),
        "rule": "CGST s.143(3) — deemed supply on the date of dispatch",
        "lines": len(invoice_lines),
    }


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
               c.status, c.nature_of_work, c.is_inter_state, c.deemed_supply_at,
               c.deemed_supply_invoice_id,
               p.id AS job_worker_id, p.name AS job_worker_name, p.gstin AS job_worker_gstin,
               COALESCE(t.quantity_sent, 0) AS quantity_sent,
               COALESCE(t.taxable_value, 0) AS taxable_value,
               COALESCE(t.quantity_received, 0) AS quantity_received,
               COALESCE(t.quantity_wastage, 0) AS quantity_wastage,
               COALESCE(t.quantity_sent, 0) - COALESCE(t.quantity_received, 0)
                   - COALESCE(t.quantity_wastage, 0) AS quantity_outstanding
        FROM caratloop.job_work_challans c
        JOIN caratloop.parties p ON p.id = c.job_worker_id
        LEFT JOIN (
            SELECT l.challan_id,
                   SUM(l.quantity_sent) AS quantity_sent,
                   SUM(l.taxable_value) AS taxable_value,
                   SUM(COALESCE(r.received, 0)) AS quantity_received,
                   SUM(COALESCE(r.wastage, 0)) AS quantity_wastage
            FROM caratloop.job_work_challan_lines l
            LEFT JOIN (
                SELECT challan_line_id, SUM(quantity_received) AS received,
                       SUM(quantity_wastage) AS wastage
                FROM caratloop.job_work_receipt_lines GROUP BY challan_line_id
            ) r ON r.challan_line_id = l.id
            GROUP BY l.challan_id
        ) t ON t.challan_id = c.id
        WHERE c.company_id = :cid
    """
    params = {"cid": current_user["company_id"]}
    if status:
        query += " AND c.status = :status"
        params["status"] = status
    if job_worker_id:
        query += " AND c.job_worker_id = :wid"
        params["wid"] = str(job_worker_id)
    query += " ORDER BY c.challan_date DESC, c.challan_no DESC"

    query = page.apply(query)
    params.update(page.params)

    res = await db.execute(text(query), params)
    rows = [dict(r) for r in res.mappings().all()]
    today = date.today()
    for row in rows:
        row["days_remaining"] = days_remaining(row["return_due_date"], today)
        row["is_overdue"] = (
            row["status"] in ("Open", "PartiallyReceived") and is_overdue(row["return_due_date"], today)
        )
    return {"challans": rows, **page.envelope(rows)}


@router.get("/challans/{challan_id}")
async def get_challan(
    challan_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """One challan with its lines and what is still outstanding on each.

    quantity_outstanding is what the caller needs to fill a receipt: what was
    sent, less everything already received or written off as wastage. The
    company block is included so the printed challan reads the master.
    """
    cid = current_user["company_id"]

    head_res = await db.execute(
        text(
            "SELECT c.id, c.challan_no, c.challan_date, c.goods_type, "
            "       c.return_due_date, c.status, c.nature_of_work, "
            "       c.place_of_supply, c.is_inter_state, c.remarks, "
            "       c.deemed_supply_at, c.deemed_supply_invoice_id, "
            "       fy.year_label AS fiscal_year, "
            "       p.id AS job_worker_id, p.name AS job_worker_name, "
            "       p.gstin AS job_worker_gstin, p.address_line1 AS job_worker_address1, "
            "       p.address_line2 AS job_worker_address2, p.city AS job_worker_city, "
            "       p.state_name AS job_worker_state_name, p.state_code AS job_worker_state_code, "
            "       p.pincode AS job_worker_pincode, p.phone AS job_worker_phone, "
            "       p.pan AS job_worker_pan "
            "FROM caratloop.job_work_challans c "
            "JOIN caratloop.parties p ON p.id = c.job_worker_id "
            "LEFT JOIN caratloop.fiscal_years fy ON fy.id = c.fiscal_year_id "
            "WHERE c.id = :id AND c.company_id = :cid"
        ),
        {"id": str(challan_id), "cid": cid},
    )
    head = head_res.mappings().first()
    if head is None:
        raise HTTPException(status_code=404, detail="Job work challan not found")

    lines = await _challan_lines_with_outstanding(db, challan_id)

    rc_res = await db.execute(
        text(
            "SELECT r.id, r.receipt_no, r.receipt_date, r.making_charges, r.karigar_bill_no, "
            "       r.making_charge_bill_id, pi.bill_no AS making_charge_bill_no, r.remarks, "
            "       COALESCE(SUM(rl.quantity_received), 0) AS quantity_received, "
            "       COALESCE(SUM(rl.quantity_wastage), 0) AS quantity_wastage, "
            "       COALESCE(SUM(rl.cost_amount), 0) AS cost_amount "
            "FROM caratloop.job_work_receipts r "
            "LEFT JOIN caratloop.purchase_invoices pi ON pi.id = r.making_charge_bill_id "
            "LEFT JOIN caratloop.job_work_receipt_lines rl ON rl.receipt_id = r.id "
            "WHERE r.challan_id = :id "
            "GROUP BY r.id, r.receipt_no, r.receipt_date, r.making_charges, r.karigar_bill_no, "
            "         r.making_charge_bill_id, pi.bill_no, r.remarks "
            "ORDER BY r.receipt_date, r.receipt_no"
        ),
        {"id": str(challan_id)},
    )
    receipts = [dict(r) for r in rc_res.mappings().all()]

    co_res = await db.execute(
        text(
            "SELECT id, name, legal_name, trade_name, gstin, pan, address_line1, address_line2, "
            "       city, state_code, state_name, pincode, phone, email "
            "FROM caratloop.companies WHERE id = :cid"
        ),
        {"cid": cid},
    )
    company = co_res.mappings().first()

    today = date.today()
    out = dict(head)
    out["days_remaining"] = days_remaining(head["return_due_date"], today)
    out["is_overdue"] = head["status"] in ("Open", "PartiallyReceived") and is_overdue(head["return_due_date"], today)
    out["legal_return_due_date"] = str(return_due_date(head["challan_date"], head["goods_type"]))
    out["lines"] = lines
    out["receipts"] = receipts
    out["total_quantity"] = str(sum((to_decimal(l["quantity_sent"]) for l in lines), ZERO))
    out["total_value"] = str(sum((to_decimal(l["taxable_value"]) for l in lines), ZERO))
    out["company"] = dict(company) if company else None
    return out


@router.get("/receipts")
async def list_receipts(
    job_worker_id: Optional[UUID] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Receipts register: what came back, what it cost, and the bill raised."""
    query = """
        SELECT r.id, r.receipt_no, r.receipt_date, r.making_charges, r.karigar_bill_no,
               r.making_charge_bill_id, pi.bill_no AS making_charge_bill_no,
               pi.grand_total AS bill_total, pi.is_rcm_applicable AS bill_reverse_charge,
               c.id AS challan_id, c.challan_no, c.challan_date, c.return_due_date, c.status AS challan_status,
               p.id AS job_worker_id, p.name AS job_worker_name, p.gstin AS job_worker_gstin,
               COALESCE(SUM(rl.quantity_received), 0) AS quantity_received,
               COALESCE(SUM(rl.quantity_wastage), 0) AS quantity_wastage,
               COALESCE(SUM(rl.cost_amount), 0) AS cost_amount
        FROM caratloop.job_work_receipts r
        JOIN caratloop.job_work_challans c ON c.id = r.challan_id
        JOIN caratloop.parties p ON p.id = c.job_worker_id
        LEFT JOIN caratloop.purchase_invoices pi ON pi.id = r.making_charge_bill_id
        LEFT JOIN caratloop.job_work_receipt_lines rl ON rl.receipt_id = r.id
        WHERE r.company_id = :cid
    """
    params: dict = {"cid": current_user["company_id"]}
    if job_worker_id:
        query += " AND c.job_worker_id = :wid"
        params["wid"] = str(job_worker_id)
    if from_date:
        query += " AND r.receipt_date >= :f"
        params["f"] = from_date
    if to_date:
        query += " AND r.receipt_date <= :t"
        params["t"] = to_date
    query += """
        GROUP BY r.id, r.receipt_no, r.receipt_date, r.making_charges, r.karigar_bill_no,
                 r.making_charge_bill_id, pi.bill_no, pi.grand_total, pi.is_rcm_applicable,
                 c.id, c.challan_no, c.challan_date, c.return_due_date, c.status, p.id, p.name, p.gstin
        ORDER BY r.receipt_date DESC, r.receipt_no DESC
    """
    query = page.apply(query)
    params.update(page.params)

    res = await db.execute(text(query), params)
    rows = [dict(r) for r in res.mappings().all()]
    for row in rows:
        row["wastage_pct"] = str(
            wastage_pct(
                to_decimal(row["quantity_received"]) + to_decimal(row["quantity_wastage"]),
                row["quantity_wastage"],
            )
        )
        row["was_overdue"] = is_overdue(row["return_due_date"], row["receipt_date"])
    return {"receipts": rows, **page.envelope(rows)}


@router.get("/karigars/{party_id}/statement")
async def karigar_statement(
    party_id: UUID,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """One karigar's account: challans out, receipts in, wastage, bills, balance."""
    cid = current_user["company_id"]

    party_res = await db.execute(
        text(
            "SELECT p.id, p.name, p.party_code, p.party_type, p.gstin, p.pan, p.phone, "
            "       p.city, p.state_code, p.state_name, p.karigar_skills, p.account_id, "
            "       COALESCE((SELECT SUM(cr_amount - dr_amount) FROM caratloop.journal_entry_lines "
            "                 WHERE account_id = p.account_id), 0) AS payable_balance "
            "FROM caratloop.parties p WHERE p.id = :id AND p.company_id = :cid"
        ),
        {"id": str(party_id), "cid": cid},
    )
    party = party_res.mappings().first()
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")

    params: dict = {"cid": cid, "wid": str(party_id)}
    ch_filter = ""
    rc_filter = ""
    if from_date:
        ch_filter += " AND c.challan_date >= :f"
        rc_filter += " AND r.receipt_date >= :f"
        params["f"] = from_date
    if to_date:
        ch_filter += " AND c.challan_date <= :t"
        rc_filter += " AND r.receipt_date <= :t"
        params["t"] = to_date

    ch_res = await db.execute(
        text(
            "SELECT c.id, c.challan_no, c.challan_date, c.return_due_date, c.status, c.goods_type, "
            "       c.nature_of_work, c.deemed_supply_at, "
            "       COALESCE(SUM(l.quantity_sent), 0) AS quantity_sent, "
            "       COALESCE(SUM(l.taxable_value), 0) AS taxable_value, "
            "       COALESCE(SUM(r.received), 0) AS quantity_received, "
            "       COALESCE(SUM(r.wastage), 0) AS quantity_wastage, "
            "       COALESCE(SUM(l.quantity_sent), 0) - COALESCE(SUM(r.received), 0) "
            "           - COALESCE(SUM(r.wastage), 0) AS quantity_outstanding "
            "FROM caratloop.job_work_challans c "
            "LEFT JOIN caratloop.job_work_challan_lines l ON l.challan_id = c.id "
            "LEFT JOIN ( "
            "    SELECT challan_line_id, SUM(quantity_received) AS received, "
            "           SUM(quantity_wastage) AS wastage "
            "    FROM caratloop.job_work_receipt_lines GROUP BY challan_line_id "
            ") r ON r.challan_line_id = l.id "
            "WHERE c.company_id = :cid AND c.job_worker_id = :wid" + ch_filter + " "
            "GROUP BY c.id, c.challan_no, c.challan_date, c.return_due_date, c.status, "
            "         c.goods_type, c.nature_of_work, c.deemed_supply_at "
            "ORDER BY c.challan_date, c.challan_no"
        ),
        params,
    )
    challans = [dict(r) for r in ch_res.mappings().all()]
    today = date.today()
    for row in challans:
        row["is_overdue"] = row["status"] in ("Open", "PartiallyReceived") and is_overdue(row["return_due_date"], today)
        row["days_remaining"] = days_remaining(row["return_due_date"], today)

    rc_res = await db.execute(
        text(
            "SELECT r.id, r.receipt_no, r.receipt_date, r.making_charges, r.karigar_bill_no, "
            "       r.making_charge_bill_id, pi.bill_no AS making_charge_bill_no, "
            "       c.challan_no, c.id AS challan_id, "
            "       COALESCE(SUM(rl.quantity_received), 0) AS quantity_received, "
            "       COALESCE(SUM(rl.quantity_wastage), 0) AS quantity_wastage, "
            "       COALESCE(SUM(rl.cost_amount), 0) AS cost_amount "
            "FROM caratloop.job_work_receipts r "
            "JOIN caratloop.job_work_challans c ON c.id = r.challan_id "
            "LEFT JOIN caratloop.purchase_invoices pi ON pi.id = r.making_charge_bill_id "
            "LEFT JOIN caratloop.job_work_receipt_lines rl ON rl.receipt_id = r.id "
            "WHERE r.company_id = :cid AND c.job_worker_id = :wid" + rc_filter + " "
            "GROUP BY r.id, r.receipt_no, r.receipt_date, r.making_charges, r.karigar_bill_no, "
            "         r.making_charge_bill_id, pi.bill_no, c.challan_no, c.id "
            "ORDER BY r.receipt_date, r.receipt_no"
        ),
        params,
    )
    receipts = [dict(r) for r in rc_res.mappings().all()]

    bill_res = await db.execute(
        text(
            "SELECT DISTINCT pi.id, pi.bill_no, pi.bill_date, pi.vendor_inv_no, pi.subtotal_value, "
            "       pi.total_gst, pi.rcm_cgst, pi.rcm_sgst, pi.is_rcm_applicable, pi.grand_total, "
            "       pi.status, r.receipt_no "
            "FROM caratloop.purchase_invoices pi "
            "JOIN caratloop.job_work_receipts r ON r.making_charge_bill_id = pi.id "
            "JOIN caratloop.job_work_challans c ON c.id = r.challan_id "
            "WHERE pi.company_id = :cid AND c.job_worker_id = :wid" + rc_filter + " "
            "ORDER BY pi.bill_date, pi.bill_no"
        ),
        params,
    )
    bills = [dict(r) for r in bill_res.mappings().all()]

    total_sent = sum((to_decimal(c["quantity_sent"]) for c in challans), ZERO)
    total_received = sum((to_decimal(c["quantity_received"]) for c in challans), ZERO)
    total_wastage = sum((to_decimal(c["quantity_wastage"]) for c in challans), ZERO)
    outstanding_qty = sum((to_decimal(c["quantity_outstanding"]) for c in challans), ZERO)
    value_at_risk = sum(
        (
            to_decimal(c["taxable_value"]) * (to_decimal(c["quantity_outstanding"]) / to_decimal(c["quantity_sent"]))
            for c in challans
            if to_decimal(c["quantity_sent"]) > 0 and c["status"] in ("Open", "PartiallyReceived")
        ),
        ZERO,
    )

    return {
        "party": dict(party),
        "period": {"from": str(from_date) if from_date else None, "to": str(to_date) if to_date else None},
        "summary": {
            "challans": len(challans),
            "receipts": len(receipts),
            "quantity_sent": str(total_sent),
            "quantity_received": str(total_received),
            "quantity_wastage": str(total_wastage),
            "wastage_pct": str(wastage_pct(total_received + total_wastage, total_wastage)),
            "quantity_outstanding": str(outstanding_qty),
            "value_at_risk": str(round_money(value_at_risk)),
            "overdue_challans": sum(1 for c in challans if c["is_overdue"]),
            "making_charges_billed": str(sum((to_decimal(r["making_charges"]) for r in receipts), ZERO)),
            "bills_total": str(sum((to_decimal(b["grand_total"]) for b in bills), ZERO)),
            "payable_balance": str(round_money(party["payable_balance"])),
        },
        "challans": challans,
        "receipts": receipts,
        "bills": bills,
    }


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
            "       c.status, p.id AS job_worker_id, p.name AS job_worker_name, p.gstin AS job_worker_gstin, "
            "       COALESCE(SUM(l.taxable_value), 0) AS value_at_risk, "
            "       COALESCE(SUM(l.quantity_sent), 0) AS quantity_sent "
            "FROM caratloop.job_work_challans c "
            "JOIN caratloop.parties p ON p.id = c.job_worker_id "
            "LEFT JOIN caratloop.job_work_challan_lines l ON l.challan_id = c.id "
            "WHERE c.company_id = :cid "
            "  AND c.status IN ('Open', 'PartiallyReceived') "
            "  AND c.return_due_date < :cutoff "
            "GROUP BY c.id, c.challan_no, c.challan_date, c.return_due_date, "
            "         c.goods_type, c.status, p.id, p.name, p.gstin "
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
            "       l.description, l.hsn_code, l.quantity_sent, l.taxable_value, "
            "       m.code AS material_code, m.name AS material_name, u.code AS uom "
            "FROM caratloop.job_work_challans c "
            "JOIN caratloop.parties p ON p.id = c.job_worker_id "
            "JOIN caratloop.job_work_challan_lines l ON l.challan_id = c.id "
            "LEFT JOIN caratloop.materials m ON m.id = l.material_id "
            "LEFT JOIN caratloop.units_of_measure u ON u.id = COALESCE(l.uom_id, m.uom_id) "
            "WHERE c.company_id = :cid AND c.challan_date BETWEEN :f AND :t "
            "ORDER BY c.challan_date, c.challan_no, l.sequence_no"
        ),
        {"cid": company_id, "f": from_date, "t": to_date},
    )

    recd_res = await db.execute(
        text(
            "SELECT r.receipt_no, r.receipt_date, c.challan_no, c.challan_date, "
            "       p.gstin AS job_worker_gstin, p.name AS job_worker_name, "
            "       m.code AS material_code, m.name AS material_name, "
            "       rl.quantity_received, rl.quantity_wastage "
            "FROM caratloop.job_work_receipts r "
            "JOIN caratloop.job_work_challans c ON c.id = r.challan_id "
            "JOIN caratloop.parties p ON p.id = c.job_worker_id "
            "JOIN caratloop.job_work_receipt_lines rl ON rl.receipt_id = r.id "
            "LEFT JOIN caratloop.materials m ON m.id = rl.material_id "
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
        "totals": {
            "sent_quantity": str(sum((to_decimal(r["quantity_sent"]) for r in sent), ZERO)),
            "sent_value": str(sum((to_decimal(r["taxable_value"]) for r in sent), ZERO)),
            "received_quantity": str(sum((to_decimal(r["quantity_received"]) for r in received), ZERO)),
            "wastage_quantity": str(sum((to_decimal(r["quantity_wastage"]) for r in received), ZERO)),
        },
        "note": (
            "Prepared from challans and receipts in this period. Table 5A/5B "
            "splitting by original challan period is not applied."
        ),
    }
