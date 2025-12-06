import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { ApiService } from '../services/api.service';
import { map } from 'rxjs/operators';

export const adminGuard: CanActivateFn = (route, state) => {
  const apiService = inject(ApiService);
  const router = inject(Router);

  return apiService.user().pipe(
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
