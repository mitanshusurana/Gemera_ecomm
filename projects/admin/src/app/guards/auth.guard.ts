import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Route guard for the admin shell.
 *
 * It checks the session is present, well-formed, unexpired and carries an
 * ADMIN role. That keeps an unauthorised browser from rendering admin screens
 * and leaking customer PII into the DOM -- but it is NOT authorisation. The
 * token is unverified on the client and localStorage is writable by anyone at
 * the keyboard. Every admin endpoint must enforce hasRole('ADMIN') server-side
 * independently; this guard exists so the UI does not mislead.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { next: state.url },
    });
  }

  if (!authService.isAdmin()) {
    authService.clearSession();
    return router.createUrlTree(['/login'], {
      queryParams: { error: 'not-admin' },
    });
  }

  return true;
};
