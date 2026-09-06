"""Role authorisation.

Two rounds of the same mistake are pinned down here.

The original check compared against ('admin','owner','auditor') while the only
role the system issued was 'SuperAdmin', so it denied the administrator and
protected nothing.

The replacement then invented its own vocabulary -- superadmin, storekeeper,
viewer -- none of which caratloop.users.role permits, and omitted four values
it does: owner, production_manager, store_keeper, read_only. Since auth.py
issues the token straight from the stored row, the owner of the business
matched no privilege group and was refused every posting endpoint, and a
store_keeper (underscored in the database, not in the code) could not move
stock.

The vocabulary now comes from the database; test_schema_covers_queries.py
asserts the two stay equal.
"""

import pytest
from fastapi import HTTPException

from app.core.roles import (
    ACCOUNTANT,
    ADMIN,
    ALL_ROLES,
    AUDITOR,
    CAN_AMEND,
    CAN_MOVE_STOCK,
    CAN_POST,
    CAN_READ_FULL_AUDIT,
    OWNER,
    PRODUCTION_MANAGER,
    READ_ONLY,
    STORE_KEEPER,
    has_role,
    normalise,
    require,
)


def user(role):
    return {"id": "u1", "role": role}


def test_the_owner_is_not_locked_out_of_their_own_books():
    """'owner' is in the database vocabulary and was in no privilege group."""
    assert has_role(user("owner"), CAN_POST) is True
    assert has_role(user("owner"), CAN_AMEND) is True
    assert has_role(user("owner"), CAN_MOVE_STOCK) is True
    assert has_role(user("owner"), CAN_READ_FULL_AUDIT) is True


def test_admin_can_read_the_full_audit_trail():
    assert has_role(user("Admin"), CAN_READ_FULL_AUDIT) is True


def test_role_matching_is_case_insensitive():
    for spelling in ("Admin", "admin", "ADMIN", "  Admin  "):
        assert has_role(user(spelling), CAN_POST) is True, spelling


def test_read_only_cannot_post_or_amend():
    assert has_role(user(READ_ONLY), CAN_POST) is False
    assert has_role(user(READ_ONLY), CAN_AMEND) is False
    assert has_role(user(READ_ONLY), CAN_MOVE_STOCK) is False
    assert has_role(user(READ_ONLY), CAN_READ_FULL_AUDIT) is False


def test_store_keeper_moves_stock_but_cannot_post_financials():
    """Spelt with the underscore, which is how the database stores it."""
    assert has_role(user("store_keeper"), CAN_MOVE_STOCK) is True
    assert has_role(user("store_keeper"), CAN_POST) is False
    assert has_role(user("store_keeper"), CAN_AMEND) is False


def test_production_manager_moves_stock_but_cannot_post_financials():
    """Issuing metal to the floor and receiving pieces back is the job."""
    assert has_role(user(PRODUCTION_MANAGER), CAN_MOVE_STOCK) is True
    assert has_role(user(PRODUCTION_MANAGER), CAN_POST) is False


def test_accountant_posts_but_cannot_amend_a_posted_document():
    assert has_role(user("Accountant"), CAN_POST) is True
    assert has_role(user("Accountant"), CAN_AMEND) is False


def test_auditor_reads_the_trail_but_cannot_post():
    assert has_role(user("Auditor"), CAN_READ_FULL_AUDIT) is True
    assert has_role(user("Auditor"), CAN_POST) is False


def test_unknown_or_missing_role_is_denied_everything():
    for bad in (None, "", "wizard", "superadmin", "storekeeper", "viewer"):
        assert has_role(user(bad), CAN_POST) is False, bad
        assert has_role(user(bad), CAN_AMEND) is False, bad
        assert has_role(user(bad), CAN_READ_FULL_AUDIT) is False, bad


def test_amend_is_a_subset_of_post():
    """Anyone who may amend must also be able to post; otherwise the guard
    ordering on an endpoint could be inconsistent."""
    assert CAN_AMEND <= CAN_POST


def test_posting_implies_moving_stock():
    """Every document that posts money also moves goods in this business."""
    assert CAN_POST <= CAN_MOVE_STOCK


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


def test_every_role_constant_is_in_all_roles():
    for role in (OWNER, ADMIN, ACCOUNTANT, PRODUCTION_MANAGER,
                 STORE_KEEPER, AUDITOR, READ_ONLY):
        assert role in ALL_ROLES, role


def test_normalise_handles_none_and_whitespace():
    assert normalise(None) == ""
    assert normalise("  Admin ") == "admin"


@pytest.mark.asyncio
async def test_require_dependency_rejects_an_unprivileged_role():
    guard = require(*CAN_AMEND)
    with pytest.raises(HTTPException) as exc:
        await guard(current_user=user(READ_ONLY))
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
        await guard(current_user=user(READ_ONLY))
    assert "store_keeper" in exc.value.detail
