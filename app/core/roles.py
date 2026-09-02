"""Role-based authorisation.

The application had exactly one role check, in the audit-trail report, and it
was broken: it tested against the lowercase strings ``admin``/``owner``/
``auditor`` while the only role the system ever issued was ``SuperAdmin``. So
the sole administrator was denied the full audit trail, and nothing else was
protected at all -- every authenticated user could cancel invoices, rewrite
opening balances and post arbitrary journals.

Roles are compared case-insensitively so a differently-cased value in the
database cannot silently disable a check, which is how the original failed.
"""

from __future__ import annotations

from typing import Iterable

from fastapi import Depends, HTTPException

from app.core.security import get_current_user

# Ordered loosely from most to least privileged. These match the CHECK
# constraint on caratloop.users.role.
SUPER_ADMIN = "superadmin"
ADMIN = "admin"
ACCOUNTANT = "accountant"
STORE_KEEPER = "storekeeper"
AUDITOR = "auditor"
VIEWER = "viewer"

ALL_ROLES = frozenset(
    {SUPER_ADMIN, ADMIN, ACCOUNTANT, STORE_KEEPER, AUDITOR, VIEWER}
)

# Who may post or alter financial documents.
CAN_POST = frozenset({SUPER_ADMIN, ADMIN, ACCOUNTANT})
# Who may move stock.
CAN_MOVE_STOCK = frozenset({SUPER_ADMIN, ADMIN, ACCOUNTANT, STORE_KEEPER})
# Who may cancel or reverse a posted document, or rewrite opening balances.
CAN_AMEND = frozenset({SUPER_ADMIN, ADMIN})
# Who may read the full audit trail rather than only their own actions.
CAN_READ_FULL_AUDIT = frozenset({SUPER_ADMIN, ADMIN, AUDITOR})


def normalise(role: str | None) -> str:
    return (role or "").strip().lower()


def has_role(user: dict, allowed: Iterable[str]) -> bool:
    return normalise(user.get("role")) in {normalise(r) for r in allowed}


def require(*allowed: str):
    """FastAPI dependency factory enforcing that the caller holds one of ``allowed``.

    Usage::

        @router.post("/invoices", dependencies=[Depends(require(*CAN_POST))])
    """
    allowed_set = {normalise(r) for r in allowed}

    async def _guard(current_user: dict = Depends(get_current_user)) -> dict:
        if not has_role(current_user, allowed_set):
            raise HTTPException(
                status_code=403,
                detail=(
                    "Your role does not permit this action. Required: "
                    + ", ".join(sorted(allowed_set))
                    + "."
                ),
            )
        return current_user

    return _guard
