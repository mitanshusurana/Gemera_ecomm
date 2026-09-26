package com.jewelry.backend.security;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Permission keys and the role-to-permission matrix for back-office staff.
 *
 * Roles are stored on {@code User.role} as plain strings ("ADMIN", "SALES", ...)
 * and surfaced to Spring Security as {@code ROLE_<role>} authorities. Every
 * admin endpoint declares the one permission it needs with
 * {@code @PreAuthorize("@access.has('<key>')")}; the mapping from role to keys
 * lives only here so a change to what a role may do is a one-line edit.
 *
 * {@code USER} is the customer role: it holds no staff permissions and is not a
 * staff role. {@code ADMIN} is the owner and holds every key.
 */
public final class StaffPermissions {

    private StaffPermissions() {
    }

    // ---- roles -----------------------------------------------------------

    public static final String ROLE_USER = "USER";
    public static final String ROLE_ADMIN = "ADMIN";
    public static final String ROLE_MANAGER = "MANAGER";
    public static final String ROLE_SALES = "SALES";
    public static final String ROLE_INVENTORY = "INVENTORY";
    public static final String ROLE_ACCOUNTS = "ACCOUNTS";
    public static final String ROLE_SUPPORT = "SUPPORT";

    /** Roles allowed into the admin app and the /api/v1/admin/** URL space, in display order. */
    public static final List<String> STAFF_ROLES = List.of(
            ROLE_ADMIN, ROLE_MANAGER, ROLE_SALES, ROLE_INVENTORY, ROLE_ACCOUNTS, ROLE_SUPPORT);

    // ---- permission keys -------------------------------------------------

    public static final String DASHBOARD_READ = "dashboard.read";
    public static final String ORDERS_READ = "orders.read";
    public static final String ORDERS_WRITE = "orders.write";
    public static final String ORDERS_REFUND = "orders.refund";
    public static final String INVOICES_READ = "invoices.read";
    public static final String PRODUCTS_READ = "products.read";
    public static final String PRODUCTS_WRITE = "products.write";
    public static final String CATEGORIES_WRITE = "categories.write";
    public static final String STOCK_READ = "stock.read";
    public static final String STOCK_WRITE = "stock.write";
    public static final String RATES_WRITE = "rates.write";
    public static final String LABELS_PRINT = "labels.print";
    public static final String CUSTOMERS_READ = "customers.read";
    public static final String CUSTOMERS_WRITE = "customers.write";
    public static final String RFQ_WRITE = "rfq.write";
    public static final String APPOINTMENTS_WRITE = "appointments.write";
    public static final String INQUIRIES_WRITE = "inquiries.write";
    public static final String REPAIRS_WRITE = "repairs.write";
    public static final String EXCHANGE_WRITE = "exchange.write";
    public static final String TREASURE_WRITE = "treasure.write";
    public static final String GIFTCARDS_WRITE = "giftcards.write";
    public static final String COUPONS_WRITE = "coupons.write";
    public static final String REVIEWS_WRITE = "reviews.write";
    public static final String STORES_WRITE = "stores.write";
    public static final String SETTINGS_READ = "settings.read";
    public static final String SETTINGS_WRITE = "settings.write";
    public static final String EMAILS_WRITE = "emails.write";
    public static final String LOGS_READ = "logs.read";
    public static final String MAINTENANCE_WRITE = "maintenance.write";
    public static final String ERP_SYNC = "erp.sync";
    public static final String STAFF_MANAGE = "staff.manage";

    /** Every key, in a stable order (the admin SPA mirrors this list in core/permissions.ts). */
    public static final List<String> ALL = List.of(
            DASHBOARD_READ,
            ORDERS_READ, ORDERS_WRITE, ORDERS_REFUND,
            INVOICES_READ,
            PRODUCTS_READ, PRODUCTS_WRITE, CATEGORIES_WRITE,
            STOCK_READ, STOCK_WRITE, LABELS_PRINT, RATES_WRITE,
            CUSTOMERS_READ, CUSTOMERS_WRITE,
            RFQ_WRITE, APPOINTMENTS_WRITE, INQUIRIES_WRITE, REPAIRS_WRITE,
            EXCHANGE_WRITE, TREASURE_WRITE, GIFTCARDS_WRITE, COUPONS_WRITE, REVIEWS_WRITE,
            STORES_WRITE,
            SETTINGS_READ, SETTINGS_WRITE,
            EMAILS_WRITE, LOGS_READ, MAINTENANCE_WRITE, ERP_SYNC,
            STAFF_MANAGE);

    // ---- matrix ----------------------------------------------------------

    private static final Map<String, Set<String>> BY_ROLE;

    static {
        Map<String, Set<String>> m = new LinkedHashMap<>();

        m.put(ROLE_ADMIN, new LinkedHashSet<>(ALL));

        Set<String> manager = new LinkedHashSet<>(ALL);
        manager.remove(SETTINGS_WRITE);
        manager.remove(STAFF_MANAGE);
        m.put(ROLE_MANAGER, manager);

        m.put(ROLE_SALES, new LinkedHashSet<>(List.of(
                DASHBOARD_READ, ORDERS_READ, ORDERS_WRITE, INVOICES_READ,
                PRODUCTS_READ, STOCK_READ,
                CUSTOMERS_READ, CUSTOMERS_WRITE,
                RFQ_WRITE, APPOINTMENTS_WRITE, INQUIRIES_WRITE, REPAIRS_WRITE,
                EXCHANGE_WRITE, TREASURE_WRITE, GIFTCARDS_WRITE,
                LABELS_PRINT, REVIEWS_WRITE)));

        m.put(ROLE_INVENTORY, new LinkedHashSet<>(List.of(
                DASHBOARD_READ, PRODUCTS_READ, PRODUCTS_WRITE, CATEGORIES_WRITE,
                STOCK_READ, STOCK_WRITE, LABELS_PRINT, ORDERS_READ, RATES_WRITE)));

        m.put(ROLE_ACCOUNTS, new LinkedHashSet<>(List.of(
                DASHBOARD_READ, ORDERS_READ, ORDERS_REFUND, INVOICES_READ,
                CUSTOMERS_READ, COUPONS_WRITE, GIFTCARDS_WRITE, TREASURE_WRITE, EXCHANGE_WRITE,
                SETTINGS_READ, ERP_SYNC, LOGS_READ, RATES_WRITE)));

        m.put(ROLE_SUPPORT, new LinkedHashSet<>(List.of(
                DASHBOARD_READ, ORDERS_READ, CUSTOMERS_READ,
                APPOINTMENTS_WRITE, INQUIRIES_WRITE, REPAIRS_WRITE, REVIEWS_WRITE)));

        m.put(ROLE_USER, new LinkedHashSet<>());

        Map<String, Set<String>> frozen = new LinkedHashMap<>();
        m.forEach((role, keys) -> frozen.put(role, Collections.unmodifiableSet(keys)));
        BY_ROLE = Collections.unmodifiableMap(frozen);
    }

    /** Normalises "ROLE_SALES", "sales" and "SALES" to "SALES"; null stays null. */
    public static String normalizeRole(String role) {
        if (role == null) {
            return null;
        }
        String r = role.trim().toUpperCase();
        if (r.startsWith("ROLE_")) {
            r = r.substring(5);
        }
        return r.isEmpty() ? null : r;
    }

    public static boolean isStaffRole(String role) {
        String r = normalizeRole(role);
        return r != null && STAFF_ROLES.contains(r);
    }

    public static boolean isKnownRole(String role) {
        String r = normalizeRole(role);
        return r != null && (ROLE_USER.equals(r) || STAFF_ROLES.contains(r));
    }

    /** Permission keys for a role; empty for USER, unknown roles and null. */
    public static Set<String> permissionsFor(String role) {
        String r = normalizeRole(role);
        return r == null ? Set.of() : BY_ROLE.getOrDefault(r, Set.of());
    }

    public static boolean roleHas(String role, String permission) {
        return permission != null && permissionsFor(role).contains(permission);
    }

    /** One line per staff role for the admin's role picker. */
    public static String describe(String role) {
        return switch (normalizeRole(role) == null ? "" : normalizeRole(role)) {
            case ROLE_ADMIN -> "Owner: everything, including settings and staff accounts.";
            case ROLE_MANAGER -> "Everything except changing settings and managing staff.";
            case ROLE_SALES -> "Orders, customers, quotes, appointments, repairs, old gold, gift cards and labels.";
            case ROLE_INVENTORY -> "Products, categories, stock, transfers, stock takes, labels and the daily metal rate; orders read-only.";
            case ROLE_ACCOUNTS -> "Refunds, invoices, coupons, gift cards, the daily metal rate, ERP sync and audit logs; settings read-only.";
            case ROLE_SUPPORT -> "Appointments, inquiries, repairs and reviews; orders and customers read-only.";
            default -> "";
        };
    }
}
