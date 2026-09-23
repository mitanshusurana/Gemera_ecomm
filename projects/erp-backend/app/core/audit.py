import contextlib
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

@contextlib.asynccontextmanager
async def audit_context(db: AsyncSession, user_id: str, session_id: str, ip: str, reason: str):
    # [MCA-11g] Audit context must be set before every financial transaction
    # Parameterised: every value here is caller-supplied and must never be
    # interpolated into SQL. See set_audit_context() in core/database.py.
    await db.execute(
        text(
            "SELECT set_config('app.user_id',    :user_id,    true), "
            "       set_config('app.session_id', :session_id, true), "
            "       set_config('app.ip_address', :ip_address, true), "
            "       set_config('app.reason',     :reason,     true)"
        ),
        {
            "user_id": str(user_id or ""),
            "session_id": str(session_id if session_id is not None else 0),
            "ip_address": str(ip or "0.0.0.0"),
            "reason": str(reason or "System")[:500],
        },
    )
    try:
        yield
    finally:
        pass # The variables will clear when the transaction commits/rolls back
