"""
Caratloop ERP — Security: JWT Authentication
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

# PyJWT, not python-jose: 3.3.0 is from 2021, effectively unmaintained, and
# carries algorithm-confusion advisories -- while performing every JWT
# verification in this service.
import jwt
from jwt import InvalidTokenError
import bcrypt as _bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.core.config import settings
from app.core.database import get_db
bearer_scheme = HTTPBearer()


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt(12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    # utcnow() is deprecated in 3.12 and returns a naive datetime; an aware one
    # removes any ambiguity about the exp claim's timezone.
    now = datetime.now(timezone.utc)
    expire = now + (expires_delta or timedelta(minutes=settings.JWT_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": now, "iss": "caratloop-erp"})
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Decode JWT and return current user dict."""
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET,
            # Pinned to the configured algorithm so a token claiming a
            # different one -- 'none' included -- is rejected outright.
            algorithms=[settings.JWT_ALGORITHM],
            issuer="caratloop-erp",
            options={"require": ["exp", "sub"], "verify_exp": True},
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")

    result = await db.execute(
        text("SELECT id, email, full_name, role, company_id, is_active FROM caratloop.users WHERE id = :uid"),
        {"uid": user_id},
    )
    user = result.mappings().first()
    if not user or not user["is_active"]:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    context = dict(user)

    # The JWT carries the session id, but it was never copied onto the user
    # dict, so current_user.get("session_id", "0") returned "0" at every call
    # site and every audit row recorded a null session -- the trail could not
    # tie a change to a login. MCA Rule 11(g) expects that attribution.
    session_id = payload.get("session_id") or "0"

    # Reject a token whose session has been signed out. Without this the
    # logout endpoint would only clear the client's copy, and a stolen token
    # would stay valid for its full lifetime.
    if str(session_id).isdigit() and int(session_id) > 0:
        s_res = await db.execute(
            text(
                "SELECT logout_at FROM caratloop.session_logs "
                "WHERE id = :sid AND user_id = :uid"
            ),
            {"sid": int(session_id), "uid": user_id},
        )
        row = s_res.mappings().first()
        if row is None or row["logout_at"] is not None:
            raise HTTPException(status_code=401, detail="Session has ended")

    context["session_id"] = session_id

    return context
