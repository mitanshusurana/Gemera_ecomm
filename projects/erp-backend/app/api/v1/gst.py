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
from app.api.v1.sales import export_invoices_for_period

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

    # The register lists every row, credit notes included -- that is what a
    # register is for, and GSTR-1 Table 9B reports them. The SUMMARY must not:
    # this added a credit note to the liability, so a cancelled invoice still
    # counted as tax payable and the business would have over-declared and
    # over-paid. A credit note reduces output tax; it is netted off here and
    # disclosed on its own so nothing is hidden by the netting.
    #
    # Every other endpoint on this router already filters NOT is_credit_note.
    invoices = [r for r in rows if not r["is_credit_note"]]
    credit_notes = [r for r in rows if r["is_credit_note"]]

    def total(records, field):
        return sum(r[field] or 0 for r in records)

    summary = {
        "total_taxable_material": total(invoices, "taxable_material_value")
        - total(credit_notes, "taxable_material_value"),
        "total_taxable_making": total(invoices, "taxable_making_value")
        - total(credit_notes, "taxable_making_value"),
        "total_igst": total(invoices, "igst_amount") - total(credit_notes, "igst_amount"),
        "total_cgst": total(invoices, "cgst_amount") - total(credit_notes, "cgst_amount"),
        "total_sgst": total(invoices, "sgst_amount") - total(credit_notes, "sgst_amount"),
        "total_output_tax": total(invoices, "total_tax") - total(credit_notes, "total_tax"),
        # What the netting is made of, so the figure can be traced.
        "gross_output_tax": total(invoices, "total_tax"),
        "credit_note_tax": total(credit_notes, "total_tax"),
        "invoice_count": len(invoices),
        "credit_note_count": len(credit_notes),
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
                ir.gstr2b_matched, ir.gstr2b_match_date,
                ir.is_reversal, ir.reversal_of_id
            FROM caratloop.itc_register ir
            JOIN caratloop.parties p ON p.id = ir.vendor_id
            WHERE ir.return_period = :period AND ir.company_id = :cid
            ORDER BY ir.invoice_date, ir.id
        """),
        {"period": period, "cid": current_user["company_id"]},
    )
    rows = result.mappings().all()

    # A reversal row (an amended bill's original) carries the same positive
    # amounts flagged is_reversal; it is listed, and netted off the totals.
    def signed(r, field):
        v = r[field] or 0
        return -v if r["is_reversal"] else v

    live = [r for r in rows if not r["is_reversal"]]
    summary = {
        "total_igst_itc": sum(signed(r, "igst_credit") for r in rows),
        "total_cgst_itc": sum(signed(r, "cgst_credit") for r in rows),
        "total_sgst_itc": sum(signed(r, "sgst_credit") for r in rows),
        "total_itc": sum(signed(r, "total_itc") for r in rows),
        "reversed_itc": sum(r["total_itc"] or 0 for r in rows if r["is_reversal"]),
        "matched": sum(1 for r in live if r["gstr2b_matched"]),
        "unmatched": sum(1 for r in live if not r["gstr2b_matched"]),
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
                r.remarks, r.is_reversal, r.reversal_of_id
            FROM caratloop.rcm_liability_register r
            WHERE r.return_period = :period AND r.company_id = :cid
            ORDER BY r.transaction_date, r.id
        """),
        {"period": period, "cid": current_user["company_id"]},
    )
    rows = result.mappings().all()

    # Reversal rows (amended bills) are listed and netted off.
    total_rcm = sum((-(r["total_rcm"] or 0) if r["is_reversal"] else (r["total_rcm"] or 0)) for r in rows)
    total_paid = sum((-(r["total_rcm"] or 0) if r["is_reversal"] else (r["total_rcm"] or 0)) for r in rows if r["is_paid"])

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



def _cell_values(row) -> list:
    """A database row as a list of spreadsheet cells, in column order.

    tuple(row) on a SQLAlchemy RowMapping iterates its KEYS, like a dict, so
    the first cut of the Excel export wrote the column names on every data
    row. Values are taken explicitly; dates become ISO strings and Decimals
    become floats so openpyxl can write them.
    """
    values = row.values() if hasattr(row, "values") else row
    out = []
    for v in values:
        if v is None:
            out.append("")
        elif hasattr(v, "isoformat"):
            out.append(v.isoformat())
        elif isinstance(v, Decimal):
            out.append(float(v))
        else:
            out.append(v)
    return out


async def _hsn_summary_rows(db, period: str, company_id) -> list[dict]:
    """GSTR-1 Table 12: taxable value and tax by HSN/SAC for the period.

    One query for the staging screen and the export, so they cannot disagree.
    Grouped by the HSN recorded on each invoice, with making charges (SAC
    998892) as their own row; credit notes are excluded here because Table 12
    reports outward supplies and the notes go in Table 9B.
    """
    res = await db.execute(
        text("""
            SELECT
                COALESCE(NULLIF(hsn_material, ''), 'UNSPECIFIED') AS hsn_code,
                'Goods - material' AS description,
                'GMS' AS uqc,
                -- Signed: a credit note reduces the HSN's taxable value and
                -- tax. Excluding notes left Table 12 gross while Tables 4, 7
                -- and 9B are net, so the two halves of the return disagreed
                -- by every cancelled sale.
                SUM(sgn * taxable_material_value) AS taxable_value,
                -- The register's igst/cgst/sgst columns are invoice totals
                -- (material + making). Each component's own tax is its
                -- taxable value at its own rate.
                SUM(CASE WHEN is_inter_state
                         THEN sgn * ROUND(taxable_material_value * material_gst_rate / 100, 2) ELSE 0 END) AS igst,
                SUM(CASE WHEN is_inter_state THEN 0
                         ELSE sgn * ROUND(taxable_material_value * material_gst_rate / 200, 2) END) AS cgst,
                SUM(CASE WHEN is_inter_state THEN 0
                         ELSE sgn * ROUND(taxable_material_value * material_gst_rate / 200, 2) END) AS sgst
            FROM caratloop.gst_output_tax_register,
                 LATERAL (SELECT CASE WHEN is_credit_note THEN -1 ELSE 1 END AS sgn) sg
            WHERE return_period = :period AND company_id = :cid
              AND taxable_material_value > 0
            GROUP BY COALESCE(NULLIF(hsn_material, ''), 'UNSPECIFIED')

            UNION ALL

            SELECT
                COALESCE(NULLIF(hsn_making, ''), '998892') AS hsn_code,
                'Services - making charges' AS description,
                'OTH' AS uqc,
                SUM(sgn * taxable_making_value) AS taxable_value,
                SUM(CASE WHEN is_inter_state
                         THEN sgn * ROUND(taxable_making_value * making_gst_rate / 100, 2) ELSE 0 END) AS igst,
                SUM(CASE WHEN is_inter_state THEN 0
                         ELSE sgn * ROUND(taxable_making_value * making_gst_rate / 200, 2) END) AS cgst,
                SUM(CASE WHEN is_inter_state THEN 0
                         ELSE sgn * ROUND(taxable_making_value * making_gst_rate / 200, 2) END) AS sgst
            FROM caratloop.gst_output_tax_register,
                 LATERAL (SELECT CASE WHEN is_credit_note THEN -1 ELSE 1 END AS sgn) sg
            WHERE return_period = :period AND company_id = :cid
              AND taxable_making_value > 0
            GROUP BY COALESCE(NULLIF(hsn_making, ''), '998892')
            ORDER BY 1
        """),
        {"period": period, "cid": str(company_id)},
    )
    return [dict(r) for r in res.mappings().all()]

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

    hsn_rows = await _hsn_summary_rows(db, period, current_user["company_id"])

    # Credit and debit notes to registered persons -- GSTR-1 Table 9B.
    #
    # The return had no CDNR section at all, so a credit note raised against a
    # cancelled invoice was declared nowhere. The invoice stayed in Table 4 at
    # its full value and the reduction was never claimed: the business declared
    # and paid output tax on a sale it had reversed.
    cdnr = await db.execute(
        text("""
            SELECT
                r.invoice_no AS note_no,
                r.invoice_date AS note_date,
                r.party_gstin,
                r.place_of_supply, r.is_inter_state,
                orig.invoice_no AS original_invoice_no,
                orig.invoice_date AS original_invoice_date,
                'C' AS note_type,
                r.taxable_material_value + r.taxable_making_value AS taxable_value,
                r.igst_amount, r.cgst_amount, r.sgst_amount, r.total_tax,
                r.remarks
            FROM caratloop.gst_output_tax_register r
            LEFT JOIN caratloop.gst_output_tax_register orig
                   ON orig.invoice_id = r.invoice_id
                  AND orig.company_id = r.company_id
                  AND NOT orig.is_credit_note
            WHERE r.return_period = :period AND r.company_id = :cid
              AND r.is_credit_note
              AND r.party_gstin IS NOT NULL
            ORDER BY r.invoice_date, r.invoice_no
        """),
        {"period": period, "cid": current_user["company_id"]},
    )

    return {
        "period": period,
        "return_type": "GSTR-1",
        "b2b": [dict(r) for r in b2b.mappings().all()],
        "cdnr": [dict(r) for r in cdnr.mappings().all()],
        "hsn_summary": hsn_rows,
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
    # Output tax, Table 3.1(a).
    #
    # This excluded credit notes rather than deducting them, so a cancelled
    # sale was still declared at its full value: the business paid tax on
    # turnover it had reversed. GSTR-3B is filed on net outward supply, so each
    # credit note is subtracted from the invoices in the same period.
    output = await db.execute(
        text("""
            SELECT
                SUM(CASE WHEN is_credit_note THEN -1 ELSE 1 END
                    * (taxable_material_value + taxable_making_value)) AS taxable_value,
                SUM(CASE WHEN is_credit_note THEN -igst_amount ELSE igst_amount END) AS igst,
                SUM(CASE WHEN is_credit_note THEN -cgst_amount ELSE cgst_amount END) AS cgst,
                SUM(CASE WHEN is_credit_note THEN -sgst_amount ELSE sgst_amount END) AS sgst,
                SUM(CASE WHEN is_credit_note THEN -total_tax ELSE total_tax END) AS total_output_tax
            FROM caratloop.gst_output_tax_register
            WHERE return_period = :period AND company_id = :cid
        """),
        {"period": period, "cid": current_user["company_id"]},
    )

    # ITC, Table 4.
    #
    # s.16(2)(aa) makes appearance in GSTR-2B a condition of the claim, and the
    # register has a gstr2b_matched column for exactly that -- which nothing in
    # this codebase ever sets, because there is no GSTR-2B import. The summary
    # used to read is_eligible alone and present the whole figure as
    # claimable. It still reports the eligible total, because that is what the
    # accountant reconciles against 2B by hand, but it now says how much of it
    # is matched (today: none) so the unmatched exposure is visible on the
    # face of the return rather than discovered in a notice.
    # Reversal rows (an amended bill's original) are netted: the amounts are
    # stored positive with is_reversal, and the sign is applied here.
    itc = await db.execute(
        text("""
            SELECT
                SUM(sgn * igst_credit) AS igst_itc, SUM(sgn * cgst_credit) AS cgst_itc,
                SUM(sgn * sgst_credit) AS sgst_itc, SUM(sgn * total_itc) AS total_itc,
                SUM(CASE WHEN gstr2b_matched THEN sgn * total_itc ELSE 0 END) AS itc_matched_2b,
                SUM(CASE WHEN gstr2b_matched THEN 0 ELSE sgn * total_itc END) AS itc_unmatched_2b,
                COUNT(*) FILTER (WHERE NOT gstr2b_matched AND NOT is_reversal
                                   AND NOT EXISTS (SELECT 1 FROM caratloop.itc_register x WHERE x.reversal_of_id = ir.id)) AS unmatched_invoices
            FROM caratloop.itc_register ir,
                 LATERAL (SELECT CASE WHEN ir.is_reversal THEN -1 ELSE 1 END AS sgn) s
            WHERE return_period = :period AND company_id = :cid AND is_eligible = TRUE
        """),
        {"period": period, "cid": current_user["company_id"]},
    )

    # RCM, net of reversals
    rcm = await db.execute(
        text("""
            SELECT
                SUM(sgn * purchase_value) AS taxable_value,
                SUM(sgn * igst_rcm) AS igst_rcm, SUM(sgn * cgst_rcm) AS cgst_rcm,
                SUM(sgn * sgst_rcm) AS sgst_rcm, SUM(sgn * total_rcm) AS total_rcm
            FROM caratloop.rcm_liability_register r,
                 LATERAL (SELECT CASE WHEN r.is_reversal THEN -1 ELSE 1 END AS sgn) s
            WHERE return_period = :period AND company_id = :cid
        """),
        {"period": period, "cid": current_user["company_id"]},
    )

    out = dict(output.mappings().first() or {})
    itc_data = dict(itc.mappings().first() or {})
    rcm_data = dict(rcm.mappings().first() or {})

    net_tax = (out.get("total_output_tax") or 0) + (rcm_data.get("total_rcm") or 0) - (itc_data.get("total_itc") or 0)

    caveats = []
    if (itc_data.get("itc_unmatched_2b") or 0) > 0:
        caveats.append(
            f"{itc_data.get('unmatched_invoices') or 0} supplier invoice(s) carrying ITC of "
            f"{itc_data.get('itc_unmatched_2b')} are not matched to GSTR-2B. Under s.16(2)(aa) "
            "that credit is not available until the supplier has filed. Reconcile before claiming."
        )

    return {
        "caveats": caveats,
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
        # Table 6A: exports under LUT (WOPAY) and on payment of IGST (WPAY).
        "exp": await export_invoices_for_period(db, company_id, period),
    }
    return JSONResponse(content=gstr1_data)

@router.get("/export/gstr3b-json")
async def export_gstr3b_json(period: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    company_id = current_user["company_id"]
    # Output tax, net of credit notes -- the same correction the on-screen
    # summary received. Filtering credit notes OUT declared the cancelled sale
    # at full value; they have to be subtracted.
    output = await db.execute(
        text("""
            SELECT
                SUM(CASE WHEN is_credit_note THEN -1 ELSE 1 END
                    * (taxable_material_value + taxable_making_value)) AS taxable_value,
                SUM(CASE WHEN is_credit_note THEN -igst_amount ELSE igst_amount END) AS igst,
                SUM(CASE WHEN is_credit_note THEN -cgst_amount ELSE cgst_amount END) AS cgst,
                SUM(CASE WHEN is_credit_note THEN -sgst_amount ELSE sgst_amount END) AS sgst,
                SUM(CASE WHEN is_credit_note THEN -total_tax ELSE total_tax END) AS total_output_tax
            FROM caratloop.gst_output_tax_register
            WHERE return_period = :period AND company_id = :cid
        """),
        {"period": period, "cid": company_id}
    )
    # ITC, net of reversals (amended bills leave a reversing row behind).
    itc = await db.execute(
        text("""
            SELECT
                SUM(sgn * igst_credit) AS igst_itc, SUM(sgn * cgst_credit) AS cgst_itc,
                SUM(sgn * sgst_credit) AS sgst_itc, SUM(sgn * total_itc) AS total_itc
            FROM caratloop.itc_register ir,
                 LATERAL (SELECT CASE WHEN ir.is_reversal THEN -1 ELSE 1 END AS sgn) s
            WHERE return_period = :period AND company_id = :cid AND is_eligible = TRUE
        """),
        {"period": period, "cid": company_id}
    )
    # Table 3.1(d): inward supplies liable to reverse charge, and Table
    # 4(A)(3): the ITC on that same tax. The JSON omitted both, so a jeweller
    # buying old gold under RCM filed a return that declared no self-liability
    # -- and claimed no credit for it either.
    rcm = await db.execute(
        text("""
            SELECT
                SUM(sgn * purchase_value) AS taxable_value,
                SUM(sgn * igst_rcm) AS igst_rcm, SUM(sgn * cgst_rcm) AS cgst_rcm,
                SUM(sgn * sgst_rcm) AS sgst_rcm, SUM(sgn * total_rcm) AS total_rcm
            FROM caratloop.rcm_liability_register r,
                 LATERAL (SELECT CASE WHEN r.is_reversal THEN -1 ELSE 1 END AS sgn) s
            WHERE return_period = :period AND company_id = :cid
        """),
        {"period": period, "cid": company_id}
    )
    out = output.mappings().first() or {}
    itc_data = itc.mappings().first() or {}
    rcm_data = rcm.mappings().first() or {}
    company_res = await db.execute(text("SELECT gstin FROM caratloop.companies WHERE id = :cid LIMIT 1"), {"cid": company_id})
    gstin = company_res.scalar()

    gstr3b_data = build_gstr3b_json(period, out, itc_data, rcm_data, gstin=gstin)
    return JSONResponse(content=gstr3b_data)


def build_gstr3b_json(period: str, out, itc_data, rcm_data, *, gstin: Optional[str] = None) -> dict:
    """The GSTR-3B JSON in the portal's offline-tool layout.

    sup_details.osup_det is Table 3.1(a); sup_details.isup_rev is 3.1(d);
    itc_elg.itc_avl carries 4(A)(3) as ty 'ISRC' and 4(A)(5) as ty 'OTH'
    (the portal's codes -- it does not accept 'All other ITC' as a type).
    """
    def f(mapping, key):
        return float((mapping or {}).get(key) or 0)

    # The portal writes return periods as MMYYYY ('082026'), not YYYYMM.
    yyyy, mm = period[:4], period[5:7]
    return {
        "gstin": gstin or "",
        "ret_period": f"{mm}{yyyy}",
        "sup_details": {
            "osup_det": {
                "txval": f(out, "taxable_value"),
                "iamt": f(out, "igst"),
                "camt": f(out, "cgst"),
                "samt": f(out, "sgst"),
                "csamt": 0.0,
            },
            "isup_rev": {
                "txval": f(rcm_data, "taxable_value"),
                "iamt": f(rcm_data, "igst_rcm"),
                "camt": f(rcm_data, "cgst_rcm"),
                "samt": f(rcm_data, "sgst_rcm"),
                "csamt": 0.0,
            },
        },
        "itc_elg": {
            "itc_avl": [
                {
                    "ty": "ISRC",
                    "iamt": f(rcm_data, "igst_rcm"),
                    "camt": f(rcm_data, "cgst_rcm"),
                    "samt": f(rcm_data, "sgst_rcm"),
                    "csamt": 0.0,
                },
                {
                    "ty": "OTH",
                    "iamt": f(itc_data, "igst_itc"),
                    "camt": f(itc_data, "cgst_itc"),
                    "samt": f(itc_data, "sgst_itc"),
                    "csamt": 0.0,
                },
            ]
        },
    }

@router.get("/export/gstr1-excel")
async def export_gstr1_excel(period: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """GSTR-1 working papers as a workbook: B2B, B2C, CDNR and HSN sheets.

    This streamed zero bytes with a spreadsheet content type -- a download
    that opened as a corrupt file and looked like an export bug rather than
    what it was, an endpoint that had never been written. The data was in the
    register the whole time.
    """
    from io import BytesIO
    from openpyxl import Workbook
    from openpyxl.styles import Font

    cid = current_user["company_id"]

    b2b = await db.execute(text("""
        SELECT r.invoice_no, r.invoice_date, r.party_gstin, p.name AS party_name,
               r.place_of_supply, r.is_inter_state,
               r.taxable_material_value, r.material_gst_rate,
               r.taxable_making_value, r.making_gst_rate,
               r.igst_amount, r.cgst_amount, r.sgst_amount, r.total_tax
        FROM caratloop.gst_output_tax_register r
        LEFT JOIN caratloop.parties p ON p.id = r.party_id
        WHERE r.return_period = :period AND r.company_id = :cid
          AND r.supply_type = 'B2B' AND NOT r.is_credit_note
        ORDER BY r.invoice_date, r.invoice_no
    """), {"period": period, "cid": cid})
    b2c = await db.execute(text("""
        SELECT r.invoice_no, r.invoice_date, r.place_of_supply, r.is_inter_state,
               r.taxable_material_value + r.taxable_making_value AS taxable_value,
               r.igst_amount, r.cgst_amount, r.sgst_amount, r.total_tax
        FROM caratloop.gst_output_tax_register r
        WHERE r.return_period = :period AND r.company_id = :cid
          AND r.supply_type <> 'B2B' AND NOT r.is_credit_note
        ORDER BY r.invoice_date, r.invoice_no
    """), {"period": period, "cid": cid})
    cdnr = await db.execute(text("""
        SELECT r.invoice_no AS note_no, r.invoice_date AS note_date, r.party_gstin,
               orig.invoice_no AS original_invoice_no, orig.invoice_date AS original_invoice_date,
               r.place_of_supply,
               r.taxable_material_value + r.taxable_making_value AS taxable_value,
               r.igst_amount, r.cgst_amount, r.sgst_amount, r.total_tax
        FROM caratloop.gst_output_tax_register r
        LEFT JOIN caratloop.gst_output_tax_register orig
               ON orig.invoice_id = r.invoice_id AND orig.company_id = r.company_id
              AND NOT orig.is_credit_note
        WHERE r.return_period = :period AND r.company_id = :cid AND r.is_credit_note
          -- Table 9B is notes to REGISTERED recipients. A note against a B2C
          -- sale belongs in CDNUR, not here.
          AND r.party_gstin IS NOT NULL AND r.party_gstin <> ''
        ORDER BY r.invoice_date, r.invoice_no
    """), {"period": period, "cid": cid})
    hsn = await _hsn_summary_rows(db, period, cid)

    wb = Workbook()
    bold = Font(bold=True)

    def sheet(title, headers, rows):
        ws = wb.create_sheet(title)
        ws.append(headers)
        for c in ws[1]:
            c.font = bold
        for row in rows:
            ws.append(_cell_values(row))
        for col in ws.columns:
            width = max(len(str(c.value)) if c.value is not None else 0 for c in col)
            ws.column_dimensions[col[0].column_letter].width = min(max(10, width + 2), 40)
        return ws

    wb.remove(wb.active)
    sheet("B2B (Table 4)",
          ["Invoice No", "Date", "Recipient GSTIN", "Recipient", "Place of Supply", "Inter-state",
           "Taxable Material", "Material Rate %", "Taxable Making", "Making Rate %",
           "IGST", "CGST", "SGST", "Total Tax"],
          [r for r in b2b.mappings().all()])
    sheet("B2C (Tables 5 & 7)",
          ["Invoice No", "Date", "Place of Supply", "Inter-state", "Taxable Value",
           "IGST", "CGST", "SGST", "Total Tax"],
          [r for r in b2c.mappings().all()])
    sheet("CDNR (Table 9B)",
          ["Note No", "Note Date", "Recipient GSTIN", "Original Invoice", "Original Date",
           "Place of Supply", "Taxable Value", "IGST", "CGST", "SGST", "Total Tax"],
          [r for r in cdnr.mappings().all()])
    sheet("HSN (Table 12)",
          ["HSN/SAC", "Description", "UQC", "Taxable Value", "IGST", "CGST", "SGST"],
          [(r["hsn_code"], r["description"], r["uqc"], r["taxable_value"], r["igst"], r["cgst"], r["sgst"]) for r in hsn])

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    filename = f"GSTR1_{period}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/hsn-summary")
async def export_hsn_summary(period: str, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    """GSTR-1 Table 12. Returned an empty list regardless of the period.

    An empty list is indistinguishable from "no HSN lines this month", and the
    HSN summary is mandatory, so the stub read as a clean month. Same query as
    the staging screen.
    """
    rows = await _hsn_summary_rows(db, period, current_user["company_id"])
    return {"period": period, "table": "12", "hsn": rows}

