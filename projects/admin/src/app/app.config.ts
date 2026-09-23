import {
  ApplicationConfig,
  DEFAULT_CURRENCY_CODE,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEnIn from '@angular/common/locales/en-IN';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideToastr } from 'ngx-toastr';

import { routes } from './app.routes';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './interceptors/auth.interceptor';
import { AuthService } from './services/auth.service';

// Angular's `currency` pipe defaults to USD when no code is given, and seven
// admin templates use the bare pipe. An order of Rs 1,25,000 was rendering as
// $125,000.00 -- while the product list, which passes 'INR' explicitly, showed
// the same figure in rupees. Setting the default fixes every call site at once
// and stops the next one being wrong too.
registerLocaleData(localeEnIn);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideAnimations(),
    provideToastr(),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Warm the permission cache when a session already exists so the nav and
    // guards do not wait on the first navigation. Not awaited: the guards
    // share the same promise and wait for it themselves.
    provideAppInitializer(() => {
      const auth = inject(AuthService);
      if (auth.getToken()) {
        void auth.ensurePermissions(true);
      }
    }),
    { provide: LOCALE_ID, useValue: 'en-IN' },
    { provide: DEFAULT_CURRENCY_CODE, useValue: 'INR' },
  ]
};
