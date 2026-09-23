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

# The vocabulary below is not a matter of taste: caratloop.users.role carries a
# CHECK constraint permitting exactly these seven values, and every role that
# reaches an authorisation check is read from that column (auth.py issues the
# token from the stored row; this service never creates users). Any constant
# here that is not in the CHECK is unreachable, and any CHECK value missing
# here is a user locked out.
#
# The previous set had three names the database cannot store -- superadmin,
# storekeeper, viewer -- and was missing four it does: owner,
# production_manager, store_keeper, read_only. The effect was not cosmetic. An
# owner, the proprietor of the business, matched no group and was refused every
# posting, amendment and audit-trail endpoint; a store_keeper (spelt with the
# underscore in the database, without it here) could not move stock. Only
# admin, accountant and auditor worked at all.
OWNER = "owner"
ADMIN = "admin"
ACCOUNTANT = "accountant"
PRODUCTION_MANAGER = "production_manager"
STORE_KEEPER = "store_keeper"
AUDITOR = "auditor"
READ_ONLY = "read_only"

ALL_ROLES = frozenset(
    {OWNER, ADMIN, ACCOUNTANT, PRODUCTION_MANAGER, STORE_KEEPER, AUDITOR, READ_ONLY}
)

# Who may post or alter financial documents.
CAN_POST = frozenset({OWNER, ADMIN, ACCOUNTANT})
# Who may move stock. A production manager necessarily moves it -- issuing
# metal to the floor and receiving finished pieces is the job -- so the role is
# here even though it cannot post the accounting side.
CAN_MOVE_STOCK = frozenset({OWNER, ADMIN, ACCOUNTANT, STORE_KEEPER, PRODUCTION_MANAGER})
# Who may cancel or reverse a posted document, or rewrite opening balances.
CAN_AMEND = frozenset({OWNER, ADMIN})
# Who may read the full audit trail rather than only their own actions. The
# auditor is here precisely to read it; read_only is not, because seeing every
# user's actions is a wider grant than seeing the books.
CAN_READ_FULL_AUDIT = frozenset({OWNER, ADMIN, AUDITOR})


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
