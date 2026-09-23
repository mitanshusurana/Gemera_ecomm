import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { isStaffRole } from '../core/permissions';

/**
 * Route guard for the admin shell.
 *
 * It checks the session is present, well-formed, unexpired and carries a
 * staff role (anything but USER). That keeps a customer's browser from
 * rendering admin screens and leaking PII into the DOM -- but it is NOT
 * authorisation. The token is unverified on the client and localStorage is
 * writable by anyone at the keyboard. Every admin endpoint enforces its own
 * permission key server-side; this guard exists so the UI does not mislead.
 *
 * It also waits for /auth/me/permissions so child routes guarded by
 * `permissionGuard` and the nav can decide synchronously.
 */
export const authGuard: CanActivateFn = async (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { next: state.url },
    });
  }

  const perms = await authService.ensurePermissions();
  const role = perms?.role ?? authService.currentRole();

  if (!isStaffRole(role)) {
    authService.clearSession();
    return router.createUrlTree(['/login'], {
      queryParams: { error: 'not-staff' },
    });
  }

  return true;
};
