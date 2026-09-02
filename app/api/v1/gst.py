"""
Caratloop ERP — GST Compliance API
[CGST Rule 56(4)]: Output Tax Register, ITC Register, RCM Register
GSTR-1 and GSTR-3B staging data
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel
from uuid import UUID

from app.core.database import get_db, set_audit_context
from decimal import Decimal

from app.core.money import round_money, to_decimal
from app.core.security import get_current_user
from app.tax.gst_engine import calculate_rcm_old_gold, get_return_period

router = APIRouter()


@router.get("/tax-register")
async def get_output_tax_register(
    period: str,                             # Format: "2024-04"
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    [CGST Rule 56(4)] Output Tax Register.
    Returns tax payable (forward charge) for the given return period.
    """
    result = await db.execute(
        text("""
            SELECT
                r.invoice_no, r.invoice_date, r.supply_type,
                r.party_gstin, r.place_of_supply, r.is_inter_state,
                p.name AS party_name,
                r.taxable_material_value, r.material_gst_rate,
                r.taxable_making_value, r.making_gst_rate,
                r.igst_amount, r.cgst_amount, r.sgst_amount, r.total_tax,
                r.is_credit_note
            FROM caratloop.gst_output_tax_register r
            LEFT JOIN caratloop.parties p ON p.id = r.party_id
            WHERE r.return_period = :period AND r.company_id = :cid
            ORDER BY r.invoice_date, r.invoice_no
        """),
        {"period": period, "cid": current_user["company_id"]},
    )
    rows = result.mappings().all()

    # Summary
    summary = {
        "total_taxable_material": sum(r["taxable_material_value"] or 0 for r in rows),
        "total_taxable_making": sum(r["taxable_making_value"] or 0 for r in rows),
        "total_igst": sum(r["igst_amount"] or 0 for r in rows),
        "total_cgst": sum(r["cgst_amount"] or 0 for r in rows),
        "total_sgst": sum(r["sgst_amount"] or 0 for r in rows),
        "total_output_tax": sum(r["total_tax"] or 0 for r in rows),
    }

    return {
        "period": period,
        "cgst_rule": "56(4)",
        "register_type": "Output Tax Register",
        "records": [dict(r) for r in rows],
        "summary": summary,
    }


@router.get("/itc-register")
async def get_itc_register(
    period: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    [CGST Rule 56(4)] Input Tax Credit Register.
    Shows ITC claimed per return period, GSTR-2B match status.
    """
    result = await db.execute(
        text("""
            SELECT
                ir.vendor_invoice_no, ir.invoice_date, ir.itc_type,
                p.name AS vendor_name, p.gstin AS vendor_gstin,
                ir.igst_credit, ir.cgst_credit, ir.sgst_credit, ir.total_itc,
                ir.is_eligible, ir.ineligibility_reason,
                ir.gstr2b_matched, ir.gstr2b_match_date
            FROM caratloop.itc_register ir
            JOIN caratloop.parties p ON p.id = ir.vendor_id
            WHERE ir.return_period = :period AND ir.company_id = :cid
            ORDER BY ir.invoice_date
        """),
        {"period": period, "cid": current_user["company_id"]},
    )
    rows = result.mappings().all()

    summary = {
        "total_igst_itc": sum(r["igst_credit"] or 0 for r in rows),
        "total_cgst_itc": sum(r["cgst_credit"] or 0 for r in rows),
        "total_sgst_itc": sum(r["sgst_credit"] or 0 for r in rows),
        "total_itc": sum(r["total_itc"] or 0 for r in rows),
        "matched": sum(1 for r in rows if r["gstr2b_matched"]),
        "unmatched": sum(1 for r in rows if not r["gstr2b_matched"]),
    }

    return {
        "period": period,
        "cgst_rule": "56(4)",
        "register_type": "ITC Register",
        "records": [dict(r) for r in rows],
        "summary": summary,
    }


@router.get("/rcm-register")
async def get_rcm_register(
    period: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    [CGST Rule 56(4)] Reverse Charge Mechanism Register.
    Old gold purchases from unregistered persons.
    Notification No. 13/2017-CT(Rate) applies.
    """
    result = await db.execute(
        text("""
            SELECT
                r.transaction_date, r.vendor_name, r.vendor_pan,
                r.purchase_value, r.rcm_rate,
                r.igst_rcm, r.cgst_rcm, r.sgst_rcm, r.total_rcm,
                r.is_paid, r.paid_at,
                r.itc_availed, r.itc_availed_period,
                r.remarks
            FROM caratloop.rcm_liability_register r
            WHERE r.return_period = :period AND r.company_id = :cid
            ORDER BY r.transaction_date
        """),
        {"period": period, "cid": current_user["company_id"]},
    )
    rows = result.mappings().all()

    total_rcm = sum(r["total_rcm"] or 0 for r in rows)
    total_paid = sum(r["total_rcm"] or 0 for r in rows if r["is_paid"])

    return {
        "period": period,
        "cgst_rule": "56(4)",
        "register_type": "RCM Liability Register",
        "legal_basis": "Notification No. 13/2017-CT(Rate) — Old gold from unregistered",
        "records": [dict(r) for r in rows],
        "summary": {
            "total_rcm_liability": total_rcm,
            "total_paid": total_paid,
            "total_outstanding": total_rcm - total_paid,
        },
    }


@router.get("/gstr1-data")
async def get_gstr1_data(
    period: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    GSTR-1 staging data — Outward Supplies return.
    B2B, B2C Large, B2C Small, HSN Summary.
    """
    # B2B Invoices
    b2b = await db.execute(
        text("""
            SELECT
                r.invoice_no, r.invoice_date, r.party_gstin,
                r.place_of_supply, r.is_inter_state,
                r.taxable_material_value + r.taxable_making_value AS taxable_value,
                r.igst_amount, r.cgst_amount, r.sgst_amount, r.total_tax
            FROM caratloop.gst_output_tax_register r
            WHERE r.return_period = :period AND r.company_id = :cid
              AND r.supply_type = 'B2B' AND NOT r.is_credit_note
        """),
        {"period": period, "cid": current_user["company_id"]},
    )

    # HSN Summary
    hsn_summary = await db.execute(
        text("""
            -- Group by the HSN actually recorded on each invoice instead of
            -- declaring everything as 71131910, and include making charges
            -- (SAC 9988) as their own row. Previously the summary reported a
            -- single hardcoded HSN and omitted making charges entirely, which
            -- understated declared turnover.
            SELECT
                COALESCE(NULLIF(hsn_material, ''), 'UNSPECIFIED') AS hsn_code,
                'Goods - material' AS description,
                'GMS' AS uqc, 'NOS' AS uqc2,
                SUM(taxable_material_value) AS taxable_value,
                SUM(igst_amount) AS igst, SUM(cgst_amount) AS cgst, SUM(sgst_amount) AS sgst
            FROM caratloop.gst_output_tax_register
            WHERE return_period = :period AND company_id = :cid AND NOT is_credit_note
              AND taxable_material_value > 0
            GROUP BY COALESCE(NULLIF(hsn_material, ''), 'UNSPECIFIED')

            UNION ALL

            SELECT
                COALESCE(NULLIF(hsn_making, ''), '998821') AS hsn_code,
                'Services - making charges' AS description,
                'NOS' AS uqc, 'NOS' AS uqc2,
                SUM(taxable_making_value) AS taxable_value,
                0 AS igst, 0 AS cgst, 0 AS sgst
            FROM caratloop.gst_output_tax_register
            WHERE return_period = :period AND company_id = :cid AND NOT is_credit_note
              AND taxable_making_value > 0
            GROUP BY COALESCE(NULLIF(hsn_making, ''), '998821')
        """),
        {"period": period, "cid": current_user["company_id"]},
    )

    return {
        "period": period,
        "return_type": "GSTR-1",
        "b2b": [dict(r) for r in b2b.mappings().all()],
        "hsn_summary": [dict(r) for r in hsn_summary.mappings().all()],
    }


@router.get("/gstr3b-summary")
async def get_gstr3b_summary(
    period: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    GSTR-3B Summary — Monthly self-assessed return data.
    Table 3.1: Outward Supplies
    Table 4: ITC Available
    Table 3.1(d): RCM Inward Supplies
    """
    # Output tax
    output = await db.execute(
        text("""
            SELECT
                SUM(taxable_material_value + taxable_making_value) AS taxable_value,
                SUM(igst_amount) AS igst, SUM(cgst_amount) AS cgst, SUM(sgst_amount) AS sgst,
                SUM(total_tax) AS total_output_tax
            FROM caratloop.gst_output_tax_register
            WHERE return_period = :period AND company_id = :cid AND NOT is_credit_note
        """),
        {"period": period, "cid": current_user["company_id"]},
    )

    # ITC
    itc = await db.execute(
        text("""
            SELECT
                SUM(igst_credit) AS igst_itc, SUM(cgst_credit) AS cgst_itc,
                SUM(sgst_credit) AS sgst_itc, SUM(total_itc) AS total_itc
            FROM caratloop.itc_register
            WHERE return_period = :period AND company_id = :cid AND is_eligible = TRUE
        """),
        {"period": period, "cid": current_user["company_id"]},
    )

    # RCM
    rcm = await db.execute(
        text("""
            SELECT
                SUM(igst_rcm) AS igst_rcm, SUM(cgst_rcm) AS cgst_rcm,
                SUM(sgst_rcm) AS sgst_rcm, SUM(total_rcm) AS total_rcm
            FROM caratloop.rcm_liability_register
            WHERE return_period = :period AND company_id = :cid
        """),
        {"period": period, "cid": current_user["company_id"]},
    )

    out = dict(output.mappings().first() or {})
    itc_data = dict(itc.mappings().first() or {})
    rcm_data = dict(rcm.mappings().first() or {})

    net_tax = (out.get("total_output_tax") or 0) + (rcm_data.get("total_rcm") or 0) - (itc_data.get("total_itc") or 0)

    return {
        "period": period,
        "return_type": "GSTR-3B",
        "table_3_1_outward_supplies": out,
        "table_4_itc_available": itc_data,
        "table_3_1d_rcm_inward": rcm_data,
        "net_tax_payable": max(net_tax, 0),
    }


from fastapi.responses import JSONResponse, StreamingResponse

# ─── GSTR-1 helpers ──────────────────────────────────────────────────────────
# b2cl covers inter-state B2C invoices above this value; everything else is
# summarised in b2cs.
B2CL_THRESHOLD = Decimal("250000")


def _rate_items(row):
    """One itm_det per rate actually charged.

    Material (HSN 7113) and making charges (SAC 9988) attract different rates,
    so a single line declared at a hardcoded 3% misstated the making component.
    """
    items = []
    num = 0
    components = (
        (to_decimal(row["taxable_material_value"]), to_decimal(row["material_gst_rate"])),
        (to_decimal(row["taxable_making_value"]), to_decimal(row["making_gst_rate"])),
    )
    total_taxable = sum(v for v, _ in components) or Decimal("1")

    for taxable, rate in components:
        if taxable <= 0:
            continue
        num += 1
        share = taxable / total_taxable
        items.append({
            "num": num,
            "itm_det": {
                "txval": float(round_money(taxable)),
                "rt": float(rate),
                "camt": float(round_money(to_decimal(row["cgst_amount"]) * share)),
                "samt": float(round_money(to_decimal(row["sgst_amount"]) * share)),
                "iamt": float(round_money(to_decimal(row["igst_amount"]) * share)),
            },
        })
    return items


def _invoice_value(row) -> float:
    taxable = to_decimal(row["taxable_material_value"]) + to_decimal(row["taxable_making_value"])
    return float(round_money(taxable + to_decimal(row["total_tax"])))


def _is_b2cl(row) -> bool:
    taxable = to_decimal(row["taxable_material_value"]) + to_decimal(row["taxable_making_value"])
    return bool(row["is_inter_state"]) and (taxable + to_decimal(row["total_tax"])) > B2CL_THRESHOLD


def _b2b_entry(row):
    return {
        "ctin": row["party_gstin"],
        "inv": [{
            "inum": row["invoice_no"],
            "idt": str(row["invoice_date"]),
            "val": _invoice_value(row),
            "pos": row["place_of_supply"],
            "rchrg": "N",
            "itms": _rate_items(row),
        }],
    }


def _b2cl_entry(row):
    return {
        "pos": row["place_of_supply"],
        "inv": [{
            "inum": row["invoice_no"],
            "idt": str(row["invoice_date"]),
            "val": _invoice_value(row),
            "itms": _rate_items(row),
        }],
    }


def _b2cs_summary(rows):
    """Small-value B2C supplies, aggregated by place of supply and rate.

    This section was missing entirely; those invoices were being reported as
    b2cl, which also meant their CGST/SGST was dropped.
    """
    buckets: dict = {}
    for row in rows:
        inter = bool(row["is_inter_state"])
        pos = row["place_of_supply"]
        for taxable, rate, camt, samt, iamt in (
            (to_decimal(row["taxable_material_value"]), to_decimal(row["material_gst_rate"]),
             to_decimal(row["cgst_amount"]), to_decimal(row["sgst_amount"]), to_decimal(row["igst_amount"])),
        ):
            if taxable <= 0:
                continue
            key = (pos, float(rate), inter)
            b = buckets.setdefault(key, {"txval": Decimal("0"), "camt": Decimal("0"),
                                         "samt": Decimal("0"), "iamt": Decimal("0")})
            b["txval"] += taxable
            b["camt"] += camt
            b["samt"] += samt
            b["iamt"] += iamt

        making = to_decimal(row["taxable_making_value"])
        if making > 0:
            key = (pos, float(to_decimal(row["making_gst_rate"])), inter)
            b = buckets.setdefault(key, {"txval": Decimal("0"), "camt": Decimal("0"),
                                         "samt": Decimal("0"), "iamt": Decimal("0")})
            b["txval"] += making

    out = []
    for (pos, rate, inter), b in sorted(buckets.items(), key=lambda kv: (kv[0][0] or "", kv[0][1])):
        out.append({
            "sply_ty": "INTER" if inter else "INTRA",
            "pos": pos,
            "typ": "OE",
            "rt": rate,
            "txval": float(round_money(b["txval"])),
            "camt": float(round_money(b["camt"])),
            "samt": float(round_money(b["samt"])),
            "iamt": float(round_money(b["iamt"])),
        })
    return out


@router.get("/export/gstr1-json")
async def export_gstr1_json(period: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    # Get company GSTIN
    company_res = await db.execute(text("SELECT gstin, state_code FROM caratloop.companies WHERE id = :cid LIMIT 1"), {"cid": company_id})
    company = company_res.mappings().first()
    
    # Get all B2B invoices for the period
    b2b_res = await db.execute(text("""
        SELECT gst.invoice_no, gst.invoice_date, gst.party_gstin, gst.place_of_supply,
               gst.taxable_material_value, gst.taxable_making_value,
               gst.material_gst_rate, gst.making_gst_rate,
               gst.is_inter_state,
               gst.cgst_amount, gst.sgst_amount, gst.igst_amount, gst.total_tax
        FROM caratloop.gst_output_tax_register gst
        WHERE gst.company_id = :cid AND gst.return_period = :period
          AND gst.supply_type = 'B2B' AND NOT gst.is_credit_note
        ORDER BY gst.invoice_date
    """), {"cid": company_id, "period": period})
    b2b_rows = b2b_res.mappings().all()
    
    # Get all B2C invoices
    b2c_res = await db.execute(text("""
        SELECT gst.invoice_no, gst.invoice_date, gst.place_of_supply,
               gst.taxable_material_value, gst.taxable_making_value,
               gst.material_gst_rate, gst.making_gst_rate,
               gst.is_inter_state,
               gst.cgst_amount, gst.sgst_amount, gst.igst_amount, gst.total_tax
        FROM caratloop.gst_output_tax_register gst
        WHERE gst.company_id = :cid AND gst.return_period = :period
          AND gst.supply_type != 'B2B' AND NOT gst.is_credit_note
        ORDER BY gst.invoice_date
    """), {"cid": company_id, "period": period})
    b2c_rows = b2c_res.mappings().all()
    
    gstr1_data = {
        "gstin": company["gstin"] if company else "",
        "fp": period.replace("-", ""),
        "b2b": [_b2b_entry(row) for row in b2b_rows],
        "b2cl": [_b2cl_entry(row) for row in b2c_rows if _is_b2cl(row)],
        "b2cs": _b2cs_summary([row for row in b2c_rows if not _is_b2cl(row)]),
    }
    return JSONResponse(content=gstr1_data)

@router.get("/export/gstr3b-json")
async def export_gstr3b_json(period: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    # Output tax
    output = await db.execute(
        text("""
            SELECT
                SUM(taxable_material_value + taxable_making_value) AS taxable_value,
                SUM(igst_amount) AS igst, SUM(cgst_amount) AS cgst, SUM(sgst_amount) AS sgst,
                SUM(total_tax) AS total_output_tax
            FROM caratloop.gst_output_tax_register
            WHERE return_period = :period AND company_id = :cid AND NOT is_credit_note
        """),
        {"period": period, "cid": company_id}
    )
    # ITC
    itc = await db.execute(
        text("""
            SELECT
                SUM(igst_credit) AS igst_itc, SUM(cgst_credit) AS cgst_itc,
                SUM(sgst_credit) AS sgst_itc, SUM(total_itc) AS total_itc
            FROM caratloop.itc_register
            WHERE return_period = :period AND company_id = :cid AND is_eligible = TRUE
        """),
        {"period": period, "cid": company_id}
    )
    out = output.mappings().first() or {}
    itc_data = itc.mappings().first() or {}
    
    gstr3b_data = {
        "ret_period": period.replace("-", ""),
        "sup_details": {
            "osup_det": {
                "txval": float(out.get("taxable_value") or 0),
                "iamt": float(out.get("igst") or 0),
                "camt": float(out.get("cgst") or 0),
                "samt": float(out.get("sgst") or 0)
            }
        },
        "itc_elg": {
            "itc_avl": [
                {
                    "ty": "All other ITC",
                    "iamt": float(itc_data.get("igst_itc") or 0),
                    "camt": float(itc_data.get("cgst_itc") or 0),
                    "samt": float(itc_data.get("sgst_itc") or 0)
                }
            ]
        }
    }
    return JSONResponse(content=gstr3b_data)

@router.get("/export/gstr1-excel")
async def export_gstr1_excel(period: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    # Mock stream response
    return StreamingResponse(iter([b""]), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

@router.get("/export/hsn-summary")
async def export_hsn_summary(period: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    return {"hsn": []}

@router.post("/eway-bill")
async def eway_bill():
    return {"status": "not_implemented", "message": "e-Way Bill provisions ready. Integration with NIC portal pending."}
