/**
 * Permission keys, mirrored from backend security/StaffPermissions.java.
 *
 * The API is the authority: every admin endpoint checks its own key with
 * `@access.has('<key>')`. The SPA only uses these to decide which routes,
 * nav entries and buttons to render, so a user is not shown a screen the
 * server will refuse.
 */
export const PERMISSIONS = [
  'dashboard.read',
  'orders.read',
  'orders.write',
  'orders.refund',
  'invoices.read',
  'products.read',
  'products.write',
  'categories.write',
  'stock.read',
  'stock.write',
  'labels.print',
  'customers.read',
  'customers.write',
  'rfq.write',
  'appointments.write',
  'inquiries.write',
  'repairs.write',
  'exchange.write',
  'treasure.write',
  'giftcards.write',
  'coupons.write',
  'reviews.write',
  'stores.write',
  'settings.read',
  'settings.write',
  'emails.write',
  'logs.read',
  'maintenance.write',
  'erp.sync',
  'staff.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Back-office roles, in display order. USER is a customer and never enters the admin. */
export const STAFF_ROLES = ['ADMIN', 'MANAGER', 'SALES', 'INVENTORY', 'ACCOUNTS', 'SUPPORT'] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

/** One line per role for the role picker; the API's /admin/staff/roles carries the same text. */
export const ROLE_DESCRIPTIONS: Record<StaffRole, string> = {
  ADMIN: 'Owner: everything, including settings and staff accounts.',
  MANAGER: 'Everything except changing settings and managing staff.',
  SALES: 'Orders, customers, quotes, appointments, repairs, old gold, gift cards and labels.',
  INVENTORY: 'Products, categories, stock, transfers, stock takes and labels; orders read-only.',
  ACCOUNTS: 'Refunds, invoices, coupons, gift cards, ERP sync and audit logs; settings read-only.',
  SUPPORT: 'Appointments, inquiries, repairs and reviews; orders and customers read-only.',
};

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return !!role && (STAFF_ROLES as readonly string[]).includes(role.toUpperCase());
}

/** Response of GET /auth/me/permissions. */
export interface MyPermissions {
  role: string;
  staff: boolean;
  permissions: string[];
}
