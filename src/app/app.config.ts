import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, ErrorHandler, isDevMode, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withPreloading, PreloadAllModules } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { provideClientHydration } from '@angular/platform-browser';
import { provideServiceWorker } from '@angular/service-worker';
import { IMAGE_LOADER, ImageLoaderConfig, provideImgixLoader } from '@angular/common';

import { routes } from './app.routes';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ErrorInterceptor } from './interceptors/error.interceptor';
import { GlobalErrorHandler } from './core/global-error-handler';
import { TreasureService } from './services/treasure.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimations(),
    provideRouter(routes, withInMemoryScrolling({ scrollPositionRestoration: 'top' }), withPreloading(PreloadAllModules)),
    provideClientHydration(),
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: IMAGE_LOADER,
      useValue: (config: ImageLoaderConfig) => {
        // Since we are using an external R2 bucket, we can just return the absolute URL.
        // If config.src is already absolute, return it.
        // Some users mention images don't load. If it's returning empty, handle it.
        if (!config.src) return '';
        if (config.src.startsWith('http://') || config.src.startsWith('https://')) {
          return config.src;
        }
        return `https://pub-edd8f524b4784df1b5961ce0d431f767.r2.dev/${config.src}`;
      }
    },
    provideServiceWorker('ngsw-worker.js', {
        enabled: !isDevMode(),
        registrationStrategy: 'registerWhenStable:30000'
    }),
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    {
      provide: APP_INITIALIZER,
      useFactory: (treasureService: TreasureService) => () => treasureService.loadConfig(),
      deps: [TreasureService],
      multi: true
    }
  ]
};
