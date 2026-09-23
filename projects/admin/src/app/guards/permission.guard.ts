import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Permission } from '../core/permissions';

/**
 * `canActivate: [permissionGuard('orders.read')]`.
 *
 * Waits for the cached /auth/me/permissions (the parent authGuard normally
 * has it already) and sends users without the key to the first page they may
 * open. A UI nicety, not a security boundary: the API checks the same key.
 */
export function permissionGuard(key: Permission): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    if (!auth.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }

    await auth.ensurePermissions();
    if (auth.can(key)) {
      return true;
    }
    return router.createUrlTree([landingPage(auth)]);
  };
}

/** First route the user may open, in nav order; login when they may open nothing. */
export function landingPage(auth: AuthService): string {
  const order: Array<[Permission, string]> = [
    ['dashboard.read', '/dashboard'],
    ['orders.read', '/orders'],
    ['products.read', '/products'],
    ['stock.read', '/stock'],
    ['customers.read', '/customers'],
    ['appointments.write', '/appointments'],
    ['repairs.write', '/repairs'],
    ['inquiries.write', '/inquiries'],
    ['rfq.write', '/rfqs'],
    ['giftcards.write', '/gift-cards'],
    ['exchange.write', '/exchange'],
    ['coupons.write', '/coupons'],
    ['treasure.write', '/treasure'],
    ['stores.write', '/stores'],
    ['settings.read', '/settings'],
    ['logs.read', '/logs'],
  ];
  for (const [key, path] of order) {
    if (auth.can(key)) return path;
  }
  return '/login';
}
