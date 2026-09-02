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
engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENVIRONMENT == "development",
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


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
    await session.execute(text(f"SET LOCAL app.user_id = '{user_id or ''}'"))
    await session.execute(text(f"SET LOCAL app.session_id = '{session_id or 0}'"))
    await session.execute(text(f"SET LOCAL app.ip_address = '{ip_address or '0.0.0.0'}'"))
    await session.execute(text(f"SET LOCAL app.reason = '{reason}'"))
