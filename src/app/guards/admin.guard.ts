import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map } from 'rxjs/operators';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.user().pipe(
    map(user => {
      if (user && user.role === 'ADMIN') {
        return true;
      }
      // If not logged in or not admin, redirect to home or login
      if (!user) {
          router.navigate(['/login']);
      } else {
          router.navigate(['/']);
      }
      return false;
    })
  );
};
