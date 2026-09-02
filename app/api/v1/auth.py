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
from app.core.security import create_access_token

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