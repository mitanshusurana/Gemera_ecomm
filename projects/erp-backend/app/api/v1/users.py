"""User management: list, create, amend and reset passwords for the company's
own users.

Accounts used to be created by hand in SQL and there was no way to change a
password at all -- not for the user, not for an administrator. These endpoints
are the authorised, audited replacement. They are scoped to the caller's
company throughout: an owner sees and manages the users of their own books and
nobody else's.

``password_hash`` is written here (INSERT on create, UPDATE on reset) and is
never read back into a response; ``tests/test_user_management.py`` scans this
file to keep it that way.
"""

from __future__ import annotations

import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.auth import hash_password
from app.core.database import get_db, set_audit_context
from app.core.pagination import Page, paginate
from app.core.roles import ALL_ROLES, CAN_AMEND, OWNER, normalise, require
from app.core.security import get_current_user
from app.core.user_policy import (
    can_assign_role,
    can_change_role_of,
    password_policy_errors,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["Users"])

AUDIT_REASON = "User management"

# Every SELECT and RETURNING below names the same explicit column list, and
# password_hash is deliberately absent from it. The list is spelt out in each
# statement rather than interpolated, because SQL text is never assembled from
# f-strings in this codebase.


# ─── Schemas ─────────────────────────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=255)
    phone: Optional[str] = Field(None, max_length=15)
    role: str
    department: Optional[str] = Field(None, max_length=100)
    employee_code: Optional[str] = Field(None, max_length=20)
    password: str


class UpdateUserRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=200)
    phone: Optional[str] = Field(None, max_length=15)
    role: Optional[str] = None
    department: Optional[str] = Field(None, max_length=100)
    employee_code: Optional[str] = Field(None, max_length=20)
    is_active: Optional[bool] = None


class ResetPasswordRequest(BaseModel):
    new_password: str


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _request_context(request: Request, current_user: dict) -> tuple[str, str, str, str]:
    user_id = str(current_user["id"])
    company_id = str(current_user["company_id"])
    ip_address = request.client.host if request.client else "0.0.0.0"
    session_id = current_user.get("session_id", "0")
    return user_id, company_id, ip_address, session_id


def _serialise(row) -> dict:
    d = dict(row)
    d["id"] = str(d["id"])
    d["company_id"] = str(d["company_id"])
    for key in ("last_login_at", "created_at"):
        if d.get(key) is not None:
            d[key] = d[key].isoformat()
    return d


def _clean_optional(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


def _as_uuid(value: str) -> str:
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError):
        raise HTTPException(status_code=404, detail="User not found")


async def _load_user(db: AsyncSession, user_id: str, company_id: str):
    res = await db.execute(
        text(
            "SELECT id, company_id, full_name, email, phone, role, department, employee_code, is_active, last_login_at, created_at "
            "FROM caratloop.users "
            "WHERE id = :id AND company_id = :cid"
        ),
        {"id": user_id, "cid": company_id},
    )
    row = res.mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="User not found")
    return row


async def _active_owner_count(db: AsyncSession, company_id: str) -> int:
    res = await db.execute(
        text(
            "SELECT COUNT(*) FROM caratloop.users "
            "WHERE company_id = :cid AND role = :owner AND is_active = TRUE"
        ),
        {"cid": company_id, "owner": OWNER},
    )
    return int(res.scalar() or 0)


async def _end_open_sessions(db: AsyncSession, user_id: str) -> None:
    await db.execute(
        text(
            "UPDATE caratloop.session_logs SET logout_at = NOW(), is_active = FALSE "
            "WHERE user_id = :uid AND logout_at IS NULL"
        ),
        {"uid": user_id},
    )


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get("", dependencies=[Depends(require(*CAN_AMEND))])
async def list_users(
    page: Page = Depends(paginate),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The users of the caller's company, active first. Never includes credentials."""
    res = await db.execute(
        text(
            "SELECT id, company_id, full_name, email, phone, role, department, employee_code, is_active, last_login_at, created_at "
            "FROM caratloop.users "
            "WHERE company_id = :cid "
            "ORDER BY is_active DESC, full_name, email "
            "LIMIT :_limit OFFSET :_offset"
        ),
        {"cid": str(current_user["company_id"]), **page.params},
    )
    rows = [_serialise(r) for r in res.mappings().fetchall()]
    return {"data": rows, **page.envelope(rows)}


@router.post("", status_code=201, dependencies=[Depends(require(*CAN_AMEND))])
async def create_user(
    payload: CreateUserRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Create a user in the caller's company.

    The role must be one the database can store, only an owner may create an
    owner, and the password must pass the policy. The (company, email) pair is
    unique -- the constraint uq_user_email is the final word, and a race that
    slips past the pre-check surfaces as the same 409.
    """
    actor_id, company_id, ip_address, session_id = _request_context(request, current_user)

    role = normalise(payload.role)
    if role not in ALL_ROLES:
        raise HTTPException(
            status_code=422,
            detail="Unknown role. Permitted: " + ", ".join(sorted(ALL_ROLES)) + ".",
        )
    if not can_assign_role(current_user.get("role"), role):
        raise HTTPException(
            status_code=403,
            detail="Only an owner may create another owner.",
        )

    email = payload.email.strip().lower()
    if "@" not in email or email.startswith("@") or email.endswith("@"):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")

    problems = password_policy_errors(payload.password, email)
    if problems:
        raise HTTPException(status_code=422, detail=" ".join(problems))

    dup = await db.execute(
        text(
            "SELECT 1 FROM caratloop.users "
            "WHERE company_id = :cid AND LOWER(email) = :email LIMIT 1"
        ),
        {"cid": company_id, "email": email},
    )
    if dup.first() is not None:
        raise HTTPException(
            status_code=409,
            detail="A user with this email already exists in this company.",
        )

    await set_audit_context(db, actor_id, session_id, ip_address, AUDIT_REASON)

    try:
        res = await db.execute(
            text(
                "INSERT INTO caratloop.users "
                "(company_id, employee_code, full_name, email, phone, password_hash, "
                " role, department, is_active) "
                "VALUES (:cid, :employee_code, :full_name, :email, :phone, :password_hash, "
                "        :role, :department, TRUE) "
                "RETURNING id, company_id, full_name, email, phone, role, department, employee_code, is_active, last_login_at, created_at"
            ),
            {
                "cid": company_id,
                "employee_code": _clean_optional(payload.employee_code),
                "full_name": payload.full_name.strip(),
                "email": email,
                "phone": _clean_optional(payload.phone),
                "password_hash": hash_password(payload.password),
                "role": role,
                "department": _clean_optional(payload.department),
            },
        )
        row = res.mappings().first()
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A user with this email already exists in this company.",
        )

    logger.info("User %s created %s (%s) as %s", current_user.get("email"), email, row["id"], role)
    return _serialise(row)


@router.patch("/{user_id}", dependencies=[Depends(require(*CAN_AMEND))])
async def update_user(
    user_id: str,
    payload: UpdateUserRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Amend a user's details, role or active flag.

    Refused: changing your own role or deactivating yourself (do it from
    another owner's account, so the company cannot lock itself out); demoting
    or deactivating the last active owner; an admin altering an owner's role
    or status; assigning a role the actor may not grant.
    """
    actor_id, company_id, ip_address, session_id = _request_context(request, current_user)
    target_id = _as_uuid(user_id)
    provided = payload.model_fields_set

    if not provided:
        raise HTTPException(status_code=422, detail="Nothing to update.")

    target = await _load_user(db, target_id, company_id)
    target_role = normalise(target["role"])
    actor_role = normalise(current_user.get("role"))
    is_self = str(target["id"]) == actor_id

    new_role = normalise(payload.role) if "role" in provided and payload.role is not None else None
    role_changes = new_role is not None and new_role != target_role
    deactivating = (
        "is_active" in provided
        and payload.is_active is False
        and bool(target["is_active"]) is True
    )

    if new_role is not None and new_role not in ALL_ROLES:
        raise HTTPException(
            status_code=422,
            detail="Unknown role. Permitted: " + ", ".join(sorted(ALL_ROLES)) + ".",
        )

    if is_self and role_changes:
        raise HTTPException(status_code=409, detail="You cannot change your own role.")
    if is_self and deactivating:
        raise HTTPException(status_code=409, detail="You cannot deactivate your own account.")

    if (role_changes or deactivating) and not can_change_role_of(actor_role, target_role):
        raise HTTPException(
            status_code=403,
            detail="Only an owner may change an owner's role or deactivate an owner.",
        )
    if role_changes and not can_assign_role(actor_role, new_role):
        raise HTTPException(status_code=403, detail="Only an owner may grant the owner role.")

    losing_owner = target_role == OWNER and bool(target["is_active"]) and (
        deactivating or (role_changes and new_role != OWNER)
    )
    if losing_owner and await _active_owner_count(db, company_id) <= 1:
        raise HTTPException(
            status_code=409,
            detail="This is the company's only active owner; appoint another owner first.",
        )

    await set_audit_context(db, actor_id, session_id, ip_address, AUDIT_REASON)

    # Each column is written only when the client sent it, so a PATCH with a
    # single field leaves the rest alone and an explicit null clears a value.
    params = {
        "id": target_id,
        "cid": company_id,
        "set_full_name": "full_name" in provided and payload.full_name is not None,
        "full_name": (payload.full_name or "").strip() or None,
        "set_phone": "phone" in provided,
        "phone": _clean_optional(payload.phone),
        "set_role": role_changes,
        "role": new_role,
        "set_department": "department" in provided,
        "department": _clean_optional(payload.department),
        "set_employee_code": "employee_code" in provided,
        "employee_code": _clean_optional(payload.employee_code),
        "set_is_active": "is_active" in provided and payload.is_active is not None,
        "is_active": payload.is_active,
    }
    res = await db.execute(
        text(
            "UPDATE caratloop.users SET "
            "  full_name = CASE WHEN CAST(:set_full_name AS boolean) THEN CAST(:full_name AS varchar) ELSE full_name END, "
            "  phone = CASE WHEN CAST(:set_phone AS boolean) THEN CAST(:phone AS varchar) ELSE phone END, "
            "  role = CASE WHEN CAST(:set_role AS boolean) THEN CAST(:role AS varchar) ELSE role END, "
            "  department = CASE WHEN CAST(:set_department AS boolean) THEN CAST(:department AS varchar) ELSE department END, "
            "  employee_code = CASE WHEN CAST(:set_employee_code AS boolean) THEN CAST(:employee_code AS varchar) ELSE employee_code END, "
            "  is_active = CASE WHEN CAST(:set_is_active AS boolean) THEN CAST(:is_active AS boolean) ELSE is_active END "
            "WHERE id = :id AND company_id = :cid "
            "RETURNING id, company_id, full_name, email, phone, role, department, employee_code, is_active, last_login_at, created_at"
        ),
        params,
    )
    row = res.mappings().first()
    if row is None:
        await db.rollback()
        raise HTTPException(status_code=404, detail="User not found")

    # A disabled account must stop working now, not when its tokens expire.
    if deactivating:
        await _end_open_sessions(db, target_id)

    await db.commit()
    logger.info(
        "User %s amended %s: %s", current_user.get("email"), target["email"], sorted(provided)
    )
    return _serialise(row)


@router.post("/{user_id}/reset-password", dependencies=[Depends(require(*CAN_AMEND))])
async def reset_password(
    user_id: str,
    payload: ResetPasswordRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Set a new password for a user and sign them out everywhere.

    An admin may reset any non-owner's password; an owner may reset anyone's.
    Otherwise an admin could take over the proprietor's account by resetting
    its password and signing in as them.
    """
    actor_id, company_id, ip_address, session_id = _request_context(request, current_user)
    target_id = _as_uuid(user_id)
    target = await _load_user(db, target_id, company_id)

    if not can_change_role_of(current_user.get("role"), target["role"]):
        raise HTTPException(
            status_code=403,
            detail="Only an owner may reset an owner's password.",
        )

    problems = password_policy_errors(payload.new_password, target["email"])
    if problems:
        raise HTTPException(status_code=422, detail=" ".join(problems))

    await set_audit_context(db, actor_id, session_id, ip_address, AUDIT_REASON)

    await db.execute(
        text(
            "UPDATE caratloop.users SET password_hash = :password_hash "
            "WHERE id = :id AND company_id = :cid"
        ),
        {"password_hash": hash_password(payload.new_password), "id": target_id, "cid": company_id},
    )
    await _end_open_sessions(db, target_id)
    await db.commit()

    logger.info("User %s reset the password of %s", current_user.get("email"), target["email"])
    return {"status": "success", "message": "Password reset; the user has been signed out of every session."}
