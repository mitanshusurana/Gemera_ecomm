"""Company settings: the legal person whose books these are.

GET /company   any signed-in user; the row every document reads, with the
               remittance block resolved from the default bank account.
PATCH /company owner/admin; every editable column. The GSTIN is checked for
               shape and check digit and, when it changes, decides the state
               and is cross-checked against the PAN (app.core.company).

The row is read by the printed documents through /auth/me and by the invoice
detail and e-invoice payload directly from caratloop.companies, so a change
here is on the next document printed; nothing caches it server-side.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.company import (
    CompanyValidationError,
    fetch_company,
    fetch_default_bank_account,
    public_company,
    validate_company_patch,
)
from app.core.database import get_db, set_audit_context
from app.core.roles import CAN_AMEND, require
from app.core.security import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/company")

# The columns the UPDATE below can rewrite: the editable set plus the derived
# state_name. Kept in step with the statement by test_company_settings.py.
_WRITABLE: tuple[str, ...] = (
    "name", "legal_name", "trade_name", "gstin", "pan", "cin", "tan", "msme_reg_no",
    "address_line1", "address_line2", "city", "state_code", "state_name", "pincode",
    "phone", "email", "website", "logo_url", "fiscal_year_start", "base_currency",
    "bank_name", "bank_branch", "bank_account_no", "bank_ifsc",
)


class CompanyPatch(BaseModel):
    """Every editable column, all optional: only the fields sent are written.

    ``extra="forbid"`` so a misspelt field is a 422, not a silent no-op.
    """

    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    legal_name: Optional[str] = None
    trade_name: Optional[str] = None
    gstin: Optional[str] = None
    pan: Optional[str] = None
    cin: Optional[str] = None
    tan: Optional[str] = None
    msme_reg_no: Optional[str] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state_code: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    fiscal_year_start: Optional[int] = None
    base_currency: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    bank_account_no: Optional[str] = None
    bank_ifsc: Optional[str] = None
    reason: str = "Company settings updated"


async def _load(db: AsyncSession, company_id) -> dict:
    row = await fetch_company(db, company_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Company not found for this user")
    bank = await fetch_default_bank_account(db, company_id)
    return public_company(row, bank)


@router.get("")
async def get_company(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The company master row with the remittance block the documents print."""
    return await _load(db, current_user["company_id"])


@router.patch("", dependencies=[Depends(require(*CAN_AMEND))])
async def patch_company(
    payload: CompanyPatch,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Amend the company master. Only the fields sent are written.

    A GSTIN change re-derives state_code/state_name and must agree with the
    PAN (send both when the PAN changes with it). state_code may be set on
    its own only while there is no GSTIN to derive it from.
    """
    company_id = current_user["company_id"]
    changes = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if k != "reason"}
    if not changes:
        raise HTTPException(status_code=422, detail="Nothing to update.")

    current = await fetch_company(db, company_id)
    if current is None:
        raise HTTPException(status_code=404, detail="Company not found for this user")

    try:
        writes = validate_company_patch(current, changes)
    except CompanyValidationError as e:
        raise HTTPException(status_code=422, detail=" ".join(e.problems)) from e

    # Drop no-ops so the audit row shows only what actually changed.
    writes = {k: v for k, v in writes.items() if current.get(k) != v}
    if not writes:
        return await _load(db, company_id)

    user_id = str(current_user["id"])
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    await set_audit_context(db, user_id, session_id, ip_address, payload.reason)

    # One static statement: each column is rewritten only when its set_<col>
    # flag is true, so a field can be cleared to NULL without assembling SQL
    # from the request (no f-strings in SQL; see tests/test_sql_parses.py).
    params: dict = {"cid": str(company_id)}
    for col in _WRITABLE:
        params[f"set_{col}"] = col in writes
        params[col] = writes.get(col)
    try:
        res = await db.execute(
            text("""
                UPDATE caratloop.companies SET
                    name              = CASE WHEN :set_name THEN :name ELSE name END,
                    legal_name        = CASE WHEN :set_legal_name THEN :legal_name ELSE legal_name END,
                    trade_name        = CASE WHEN :set_trade_name THEN :trade_name ELSE trade_name END,
                    gstin             = CASE WHEN :set_gstin THEN :gstin ELSE gstin END,
                    pan               = CASE WHEN :set_pan THEN :pan ELSE pan END,
                    cin               = CASE WHEN :set_cin THEN :cin ELSE cin END,
                    tan               = CASE WHEN :set_tan THEN :tan ELSE tan END,
                    msme_reg_no       = CASE WHEN :set_msme_reg_no THEN :msme_reg_no ELSE msme_reg_no END,
                    address_line1     = CASE WHEN :set_address_line1 THEN :address_line1 ELSE address_line1 END,
                    address_line2     = CASE WHEN :set_address_line2 THEN :address_line2 ELSE address_line2 END,
                    city              = CASE WHEN :set_city THEN :city ELSE city END,
                    state_code        = CASE WHEN :set_state_code THEN :state_code ELSE state_code END,
                    state_name        = CASE WHEN :set_state_name THEN :state_name ELSE state_name END,
                    pincode           = CASE WHEN :set_pincode THEN :pincode ELSE pincode END,
                    phone             = CASE WHEN :set_phone THEN :phone ELSE phone END,
                    email             = CASE WHEN :set_email THEN :email ELSE email END,
                    website           = CASE WHEN :set_website THEN :website ELSE website END,
                    logo_url          = CASE WHEN :set_logo_url THEN :logo_url ELSE logo_url END,
                    fiscal_year_start = CASE WHEN :set_fiscal_year_start THEN :fiscal_year_start ELSE fiscal_year_start END,
                    base_currency     = CASE WHEN :set_base_currency THEN :base_currency ELSE base_currency END,
                    bank_name         = CASE WHEN :set_bank_name THEN :bank_name ELSE bank_name END,
                    bank_branch       = CASE WHEN :set_bank_branch THEN :bank_branch ELSE bank_branch END,
                    bank_account_no   = CASE WHEN :set_bank_account_no THEN :bank_account_no ELSE bank_account_no END,
                    bank_ifsc         = CASE WHEN :set_bank_ifsc THEN :bank_ifsc ELSE bank_ifsc END
                WHERE id = CAST(:cid AS UUID)
                RETURNING id
            """),
            params,
        )
        if res.scalar() is None:
            raise HTTPException(status_code=404, detail="Company not found for this user")
        await db.commit()
    except HTTPException:
        await db.rollback()
        raise
    except Exception as e:
        await db.rollback()
        logger.exception("Failed to update company settings")
        raise HTTPException(
            status_code=500,
            detail="Failed to update the company. The operation was rolled back and nothing was saved.",
        ) from e

    logger.info("Company %s amended by %s: %s", company_id, current_user.get("email"), ", ".join(sorted(writes)))
    return await _load(db, company_id)
