package com.jewelry.backend.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StaffPermissionsTest {

    @Test
    void adminHoldsEveryKey() {
        assertThat(StaffPermissions.permissionsFor(StaffPermissions.ROLE_ADMIN))
                .containsExactlyInAnyOrderElementsOf(StaffPermissions.ALL);
    }

    @Test
    void managerHoldsEverythingExceptSettingsWriteAndStaffManage() {
        Set<String> manager = StaffPermissions.permissionsFor(StaffPermissions.ROLE_MANAGER);
        assertThat(manager)
                .doesNotContain(StaffPermissions.SETTINGS_WRITE, StaffPermissions.STAFF_MANAGE)
                .hasSize(StaffPermissions.ALL.size() - 2);
        assertThat(StaffPermissions.ALL).filteredOn(key -> !manager.contains(key))
                .containsExactlyInAnyOrder(StaffPermissions.SETTINGS_WRITE, StaffPermissions.STAFF_MANAGE);
    }

    @Test
    void customerRoleHoldsNothing() {
        assertThat(StaffPermissions.permissionsFor(StaffPermissions.ROLE_USER)).isEmpty();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_USER, StaffPermissions.DASHBOARD_READ)).isFalse();
        assertThat(StaffPermissions.isStaffRole(StaffPermissions.ROLE_USER)).isFalse();
        assertThat(StaffPermissions.isKnownRole(StaffPermissions.ROLE_USER)).isTrue();
    }

    @Test
    void everyKeyBelongsToAtLeastAdminAndOnlyAdminHoldsStaffManage() {
        for (String key : StaffPermissions.ALL) {
            assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_ADMIN, key)).as(key).isTrue();
        }
        for (String role : StaffPermissions.STAFF_ROLES) {
            boolean expected = StaffPermissions.ROLE_ADMIN.equals(role);
            assertThat(StaffPermissions.roleHas(role, StaffPermissions.STAFF_MANAGE)).as(role).isEqualTo(expected);
            assertThat(StaffPermissions.roleHas(role, StaffPermissions.SETTINGS_WRITE)).as(role).isEqualTo(expected);
        }
    }

    @Test
    void everyStaffRoleCanSeeTheDashboardAndOrders() {
        for (String role : StaffPermissions.STAFF_ROLES) {
            assertThat(StaffPermissions.roleHas(role, StaffPermissions.DASHBOARD_READ)).as(role).isTrue();
            assertThat(StaffPermissions.roleHas(role, StaffPermissions.ORDERS_READ)).as(role).isTrue();
        }
    }

    @Test
    void salesCannotWriteCouponsOrSettings() {
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_SALES, StaffPermissions.ORDERS_READ)).isTrue();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_SALES, StaffPermissions.ORDERS_WRITE)).isTrue();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_SALES, StaffPermissions.COUPONS_WRITE)).isFalse();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_SALES, StaffPermissions.SETTINGS_READ)).isFalse();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_SALES, StaffPermissions.ORDERS_REFUND)).isFalse();
    }

    @Test
    void accountsRefundsButNeverEditsProducts() {
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_ACCOUNTS, StaffPermissions.ORDERS_REFUND)).isTrue();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_ACCOUNTS, StaffPermissions.COUPONS_WRITE)).isTrue();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_ACCOUNTS, StaffPermissions.PRODUCTS_WRITE)).isFalse();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_ACCOUNTS, StaffPermissions.ORDERS_WRITE)).isFalse();
    }

    @Test
    void ratesAreWrittenByInventoryAndAccountsButNotSalesOrSupport() {
        assertThat(StaffPermissions.ALL).contains(StaffPermissions.RATES_WRITE);
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_ADMIN, StaffPermissions.RATES_WRITE)).isTrue();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_MANAGER, StaffPermissions.RATES_WRITE)).isTrue();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_INVENTORY, StaffPermissions.RATES_WRITE)).isTrue();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_ACCOUNTS, StaffPermissions.RATES_WRITE)).isTrue();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_SALES, StaffPermissions.RATES_WRITE)).isFalse();
        assertThat(StaffPermissions.roleHas(StaffPermissions.ROLE_SUPPORT, StaffPermissions.RATES_WRITE)).isFalse();
    }

    @Test
    void permissionKeysAreUniqueAndDotSeparated() {
        assertThat(StaffPermissions.ALL).doesNotHaveDuplicates();
        assertThat(StaffPermissions.ALL).allMatch(key -> key.matches("[a-z]+\\.[a-z]+"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"SALES", "sales", "ROLE_SALES", " role_sales "})
    void normalizeRoleStripsPrefixAndCase(String raw) {
        assertThat(StaffPermissions.normalizeRole(raw)).isEqualTo("SALES");
        assertThat(StaffPermissions.permissionsFor(raw))
                .isEqualTo(StaffPermissions.permissionsFor(StaffPermissions.ROLE_SALES));
    }

    @Test
    void nullBlankAndUnknownRolesAreHarmless() {
        assertThat(StaffPermissions.normalizeRole(null)).isNull();
        assertThat(StaffPermissions.normalizeRole("ROLE_")).isNull();
        assertThat(StaffPermissions.permissionsFor(null)).isEmpty();
        assertThat(StaffPermissions.permissionsFor("WIZARD")).isEmpty();
        assertThat(StaffPermissions.roleHas("ADMIN", null)).isFalse();
        assertThat(StaffPermissions.isStaffRole("WIZARD")).isFalse();
        assertThat(StaffPermissions.isKnownRole("WIZARD")).isFalse();
    }

    @Test
    void permissionSetsAreReadOnly() {
        Set<String> admin = StaffPermissions.permissionsFor(StaffPermissions.ROLE_ADMIN);
        assertThatThrownBy(() -> admin.add("hack.everything")).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void everyStaffRoleHasADescription() {
        for (String role : StaffPermissions.STAFF_ROLES) {
            assertThat(StaffPermissions.describe(role)).as(role).isNotBlank();
        }
        assertThat(StaffPermissions.describe("USER")).isEmpty();
        assertThat(StaffPermissions.describe(null)).isEmpty();
    }
}
