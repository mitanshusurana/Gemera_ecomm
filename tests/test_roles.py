"""Role authorisation.

The original check compared against ('admin','owner','auditor') while the only
role the system issued was 'SuperAdmin'. It therefore denied the administrator
and protected nothing, which is the failure mode these tests pin down.
"""

import pytest
from fastapi import HTTPException

from app.core.roles import (
    ALL_ROLES,
    CAN_AMEND,
    CAN_MOVE_STOCK,
    CAN_POST,
    CAN_READ_FULL_AUDIT,
    has_role,
    normalise,
    require,
)


def user(role):
    return {"id": "u1", "role": role}


def test_superadmin_can_read_the_full_audit_trail():
    """The exact case the old check got wrong."""
    assert has_role(user("SuperAdmin"), CAN_READ_FULL_AUDIT) is True


def test_role_matching_is_case_insensitive():
    for spelling in ("SuperAdmin", "superadmin", "SUPERADMIN", "  SuperAdmin  "):
        assert has_role(user(spelling), CAN_POST) is True, spelling


def test_viewer_cannot_post_or_amend():
    assert has_role(user("Viewer"), CAN_POST) is False
    assert has_role(user("Viewer"), CAN_AMEND) is False
    assert has_role(user("Viewer"), CAN_MOVE_STOCK) is False


def test_storekeeper_moves_stock_but_cannot_post_financials():
    assert has_role(user("StoreKeeper"), CAN_MOVE_STOCK) is True
    assert has_role(user("StoreKeeper"), CAN_POST) is False
    assert has_role(user("StoreKeeper"), CAN_AMEND) is False


def test_accountant_posts_but_cannot_amend_a_posted_document():
    assert has_role(user("Accountant"), CAN_POST) is True
    assert has_role(user("Accountant"), CAN_AMEND) is False


def test_auditor_reads_the_trail_but_cannot_post():
    assert has_role(user("Auditor"), CAN_READ_FULL_AUDIT) is True
    assert has_role(user("Auditor"), CAN_POST) is False


def test_unknown_or_missing_role_is_denied_everything():
    for bad in (None, "", "wizard", "Owner"):
        assert has_role(user(bad), CAN_POST) is False, bad
        assert has_role(user(bad), CAN_AMEND) is False, bad
        assert has_role(user(bad), CAN_READ_FULL_AUDIT) is False, bad


def test_amend_is_a_subset_of_post():
    """Anyone who may amend must also be able to post; otherwise the guard
    ordering on an endpoint could be inconsistent."""
    assert CAN_AMEND <= CAN_POST


def test_every_privilege_set_uses_only_known_roles():
    """A typo in a role constant would silently grant nobody the privilege."""
    for name, group in [
        ("CAN_POST", CAN_POST),
        ("CAN_AMEND", CAN_AMEND),
        ("CAN_MOVE_STOCK", CAN_MOVE_STOCK),
        ("CAN_READ_FULL_AUDIT", CAN_READ_FULL_AUDIT),
    ]:
        unknown = set(group) - ALL_ROLES
        assert not unknown, f"{name} references unknown roles: {unknown}"


def test_normalise_handles_none_and_whitespace():
    assert normalise(None) == ""
    assert normalise("  Admin ") == "admin"


@pytest.mark.asyncio
async def test_require_dependency_rejects_an_unprivileged_role():
    guard = require(*CAN_AMEND)
    with pytest.raises(HTTPException) as exc:
        await guard(current_user=user("Viewer"))
    assert exc.value.status_code == 403
    assert "does not permit" in exc.value.detail


@pytest.mark.asyncio
async def test_require_dependency_admits_a_privileged_role():
    guard = require(*CAN_AMEND)
    result = await guard(current_user=user("Admin"))
    assert result["role"] == "Admin"


@pytest.mark.asyncio
async def test_require_names_the_roles_that_would_work():
    guard = require(*CAN_MOVE_STOCK)
    with pytest.raises(HTTPException) as exc:
        await guard(current_user=user("Viewer"))
    assert "storekeeper" in exc.value.detail
