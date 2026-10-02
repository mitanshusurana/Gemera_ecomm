"""GET /settings/runtime: the deployment configuration, without its secrets.

Owner/admin only. Everything this returns is built by
app.core.runtime_config.build_runtime_view, which reduces every credential
to a boolean. This module deliberately names no credential setting; a test
reads its source to keep it that way.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.company import fetch_company, fetch_default_bank_account
from app.core.config import settings
from app.core.database import get_db
from app.core.roles import CAN_AMEND, require
from app.core.runtime_config import build_runtime_view
from app.core.security import get_current_user

router = APIRouter(prefix="/settings")


async def _settlement_account(db: AsyncSession, company_id) -> Optional[dict]:
    """The account the storefront bridge will credit: the configured code when
    it names an account of this company, else the default bank account."""
    code = (settings.ECOMMERCE_SETTLEMENT_ACCOUNT_CODE or "").strip()
    if code:
        res = await db.execute(
            text(
                "SELECT id, code, name FROM caratloop.accounts "
                "WHERE company_id = CAST(:cid AS UUID) AND code = :code LIMIT 1"
            ),
            {"cid": str(company_id), "code": code},
        )
        row = res.mappings().first()
        if row:
            return {**dict(row), "from": "setting"}
    bank = await fetch_default_bank_account(db, company_id)
    if bank:
        return {"id": bank["id"], "code": bank["code"], "name": bank["name"], "from": "default_bank"}
    return None


@router.get("/runtime", dependencies=[Depends(require(*CAN_AMEND))])
async def runtime_configuration(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """What the API was started with, as far as it is safe to show."""
    company = await fetch_company(db, current_user["company_id"])
    settlement = await _settlement_account(db, current_user["company_id"])
    return build_runtime_view(
        settings,
        company_state_code=(company or {}).get("state_code"),
        company_state_name=(company or {}).get("state_name"),
        settlement_account=settlement,
    )
