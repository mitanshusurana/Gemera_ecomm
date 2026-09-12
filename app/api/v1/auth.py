"""
Caratloop ERP — Authentication Endpoints
"""
import logging
import uuid
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from pydantic import BaseModel

from app.core.database import get_db
from app.core.security import create_access_token, get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


def _client_ip(request: Request) -> str:
    """Best-effort client IP for audit logging only. Never used for authz."""
    return request.client.host if request.client else "unknown"


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against a bcrypt hash.

    Fails closed: a missing hash, a non-bcrypt hash, or any error during
    verification is treated as a failed login. There is deliberately no
    plaintext-comparison path and no master password.
    """
    if not hashed_password or not hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
        logger.error("Stored credential is not a bcrypt hash; rejecting login.")
        return False
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8")[:72], hashed_password.encode("utf-8")
        )
    except Exception:
        logger.exception("Password verification failed")
        return False


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8')[:72], bcrypt.gensalt()).decode('utf-8')


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """Login and receive JWT token."""
    email_clean = payload.email.lower().strip()
    result = await db.execute(
        text("SELECT id, email, full_name, role, company_id, password_hash, is_active FROM caratloop.users WHERE email = :email LIMIT 1"),
        {"email": email_clean}
    )
    user = result.mappings().first()

    # Unknown accounts are rejected exactly like a bad password. Logging in must
    # never create a user, and must never provision a role. User creation is an
    # authenticated, authorised operation performed elsewhere.
    if not user or not verify_password(payload.password, user["password_hash"]):
        logger.warning("Failed login attempt for %s from %s", email_clean, _client_ip(request))
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if user.get("is_active") is False:
        logger.warning("Login attempt on disabled account %s", email_clean)
        raise HTTPException(status_code=403, detail="Account is disabled")

    session_token = str(uuid.uuid4())
    s_res = await db.execute(
        text("INSERT INTO caratloop.session_logs (user_id, session_token, ip_address) VALUES (:uid, :stoken, CAST(:ip AS inet)) RETURNING id"),
        {"uid": str(user["id"]), "stoken": session_token, "ip": request.client.host if request.client else "127.0.0.1"}
    )
    s_row = s_res.mappings().first()
    session_id = s_row["id"] if s_row else None
    await db.commit()

    token = create_access_token({
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "company_id": str(user["company_id"]),
        "session_id": str(session_id) if session_id else session_token,
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user["id"]),
            "name": user["full_name"],
            "email": user["email"],
            "role": user["role"],
        },
    }

@router.post("/logout")
async def logout(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """End the current session.

    There was no logout endpoint at all, and no way to invalidate a token: a
    stolen one stayed valid for its full 8-hour life. Closing the session row
    makes get_current_user reject the token immediately.
    """
    session_id = current_user.get("session_id")
    if session_id and str(session_id).isdigit():
        await db.execute(
            text(
                "UPDATE caratloop.session_logs SET logout_at = NOW() "
                "WHERE id = :sid AND user_id = :uid AND logout_at IS NULL"
            ),
            {"sid": int(session_id), "uid": str(current_user["id"])},
        )
        await db.commit()

    logger.info("User %s logged out (session %s)", current_user["email"], session_id)
    return {"status": "success", "message": "Signed out"}


@router.get("/me")
async def me(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """The signed-in user and the company whose books they are in.

    The printed documents had nowhere to get the seller from. The tax invoice
    component read invoice.company, which nothing ever populated, so every
    invoice went out headed "COMPANY NOT CONFIGURED"; the purchase voucher used
    a build-time environment variable that the container never received, so it
    fell back to a literal -- "CARATLOOP MANUFACTURING LLP", an entity that is
    not this company. Both are the legal person claiming or charging the tax
    on the document. They come from the company master, here, once per session.

    The bank block is included only when the company has filled it in; the
    invoice omits it otherwise rather than printing somebody's example digits.
    """
    res = await db.execute(
        text(
            "SELECT id, name, legal_name, trade_name, gstin, pan, cin, "
            "       address_line1, address_line2, city, state_code, state_name, "
            "       pincode, phone, email, website, logo_url, "
            "       bank_name, bank_branch, bank_account_no, bank_ifsc "
            "FROM caratloop.companies WHERE id = :cid"
        ),
        {"cid": str(current_user["company_id"])},
    )
    company = res.mappings().first()
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found for this user")

    c = dict(company)
    c["id"] = str(c["id"])
    bank = {
        "bank_name": c.pop("bank_name"),
        "bank_branch": c.pop("bank_branch"),
        "account_no": c.pop("bank_account_no"),
        "ifsc": c.pop("bank_ifsc"),
    }
    c["bank"] = bank if bank["account_no"] and bank["ifsc"] else None

    return {
        "user": {
            "id": str(current_user["id"]),
            "name": current_user.get("full_name") or current_user.get("name"),
            "email": current_user.get("email"),
            "role": current_user.get("role"),
        },
        "company": c,
    }
