import contextlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

@contextlib.asynccontextmanager
async def audit_context(db: AsyncSession, user_id: str, session_id: str, ip: str, reason: str):
    # [MCA-11g] Audit context must be set before every financial transaction
    await db.execute(text(f"SET LOCAL app.user_id = '{user_id}'"))
    await db.execute(text(f"SET LOCAL app.session_id = '{session_id}'"))
    await db.execute(text(f"SET LOCAL app.ip_address = '{ip}'"))
    await db.execute(text(f"SET LOCAL app.reason = '{reason}'"))
    try:
        yield
    finally:
        pass # The variables will clear when the transaction commits/rolls back
