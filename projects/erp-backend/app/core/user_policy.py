"""Rules for managing user accounts, as pure functions.

Until now a user could only be created by hand in SQL and nobody could change
a password, so the seven-role vocabulary in ``app.core.roles`` existed but the
only account most installations had was the one seeded at provisioning. The
endpoints in ``app.api.v1.users`` and the change-password route in ``auth``
apply the rules below; they live here, free of FastAPI and the database, so
they can be tested exhaustively offline and so ``auth`` and ``users`` can share
them without importing each other.
"""

from __future__ import annotations

from app.core.roles import ALL_ROLES, CAN_AMEND, OWNER, normalise

MIN_PASSWORD_LENGTH = 12
# bcrypt reads only the first 72 bytes; hash_password truncates silently, so a
# longer password would "work" while most of it was ignored. Refuse instead.
MAX_PASSWORD_BYTES = 72


def can_assign_role(actor_role: str | None, target_role: str | None) -> bool:
    """May a user holding ``actor_role`` give somebody ``target_role``?

    Only owners and admins manage users at all, the role must be one the
    database can store, and only an owner may make an owner: otherwise an
    admin could promote themselves (or an accomplice) to the proprietor's
    level and then remove the proprietor.
    """
    actor = normalise(actor_role)
    target = normalise(target_role)
    if actor not in CAN_AMEND:
        return False
    if target not in ALL_ROLES:
        return False
    if target == OWNER and actor != OWNER:
        return False
    return True


def can_change_role_of(actor_role: str | None, current_target_role: str | None) -> bool:
    """May ``actor_role`` alter the role or active flag of a user who is
    currently ``current_target_role``?

    An admin may not touch an owner: demoting or disabling the proprietor is
    the owner's own decision. Whether the *new* role is permitted is
    ``can_assign_role``'s question.
    """
    actor = normalise(actor_role)
    if actor not in CAN_AMEND:
        return False
    if normalise(current_target_role) == OWNER and actor != OWNER:
        return False
    return True


def password_policy_errors(password: str | None, email: str | None) -> list[str]:
    """Every reason ``password`` is unacceptable for the account ``email``.

    An empty list means the password passes. The messages are meant for the
    person choosing the password, so they say what to change.
    """
    errors: list[str] = []
    pw = password or ""
    if len(pw) < MIN_PASSWORD_LENGTH:
        errors.append(f"Password must be at least {MIN_PASSWORD_LENGTH} characters.")
    if len(pw.encode("utf-8")) > MAX_PASSWORD_BYTES:
        errors.append(f"Password must be at most {MAX_PASSWORD_BYTES} bytes.")
    if pw.strip() != pw or not pw.strip():
        errors.append("Password must not start or end with whitespace.")
    normalised_email = (email or "").strip().lower()
    if normalised_email and pw.strip().lower() == normalised_email:
        errors.append("Password must not be the same as the email address.")
    local_part = normalised_email.split("@", 1)[0] if normalised_email else ""
    if len(local_part) >= 4 and pw.strip().lower() == local_part:
        errors.append("Password must not be the same as the part of the email before '@'.")
    return errors
