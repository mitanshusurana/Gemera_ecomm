"""
Caratloop ERP — Database Engine & Session Management
Async SQLAlchemy with audit context injection [MCA-11g]
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

from app.core.config import settings


# ─── Engine ──────────────────────────────────────────────────────────────────
# Built lazily. Constructing it at import time made the whole application
# un-importable without a database URL -- including for tests that touch no
# database at all -- and meant a misconfigured URL failed at import rather than
# at the startup check that reports it properly.

_engine = None
_sessionmaker = None


def get_engine():
    """Create the async engine on first use."""
    global _engine
    if _engine is None:
        _engine = create_async_engine(
            settings.DATABASE_URL,
            # SQL echo logs every statement and parameter, including
            # credentials and PII; development only.
            echo=settings.ENVIRONMENT == "development",
            pool_size=10,
            max_overflow=20,
            pool_pre_ping=True,
        )
    return _engine


def get_sessionmaker():
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(
            bind=get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
    return _sessionmaker


class _LazySessionFactory:
    """Preserves the ``AsyncSessionLocal()`` call sites."""

    def __call__(self, *args, **kwargs):
        return get_sessionmaker()(*args, **kwargs)


AsyncSessionLocal = _LazySessionFactory()


class Base(DeclarativeBase):
    pass


# ─── Dependency ──────────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ─── Audit Context [MCA-11g] ─────────────────────────────────────────────────
async def set_audit_context(
    session: AsyncSession,
    user_id: Optional[str],
    session_id: Optional[str],
    ip_address: Optional[str],
    reason: str = "System",
) -> None:
    """
    Sets PostgreSQL session-level variables consumed by audit triggers.
    [MCA-11g] Every financial transaction must capture user, session, IP, reason.
    These vars are read by fn_audit_trigger() in the database.
    """
    # set_config(name, value, is_local=true) is the parameterised equivalent of
    # SET LOCAL. The values below are caller-supplied (``reason`` is a plain
    # request-body field), so they MUST be bound parameters, never interpolated.
    await session.execute(
        text(
            "SELECT set_config('app.user_id',    :user_id,    true), "
            "       set_config('app.session_id', :session_id, true), "
            "       set_config('app.ip_address', :ip_address, true), "
            "       set_config('app.reason',     :reason,     true)"
        ),
        {
            "user_id": str(user_id or ""),
            "session_id": str(session_id if session_id is not None else 0),
            "ip_address": str(ip_address or "0.0.0.0"),
            "reason": str(reason or "System")[:500],
        },
    )
