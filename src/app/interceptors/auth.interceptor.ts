import { Injectable, Injector, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private injector = inject(Injector);
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);
  private platformId = inject(PLATFORM_ID);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    let reqToForward = request;
    
    // In Docker SSR, localhost:8080 fails because it points to the frontend container.
    // We must route it to the backend container.
    if (isPlatformServer(this.platformId) && request.url.startsWith('http://localhost:8080')) {
      reqToForward = request.clone({
        url: request.url.replace('http://localhost:8080', 'http://gemera-backend-dev:8080')
      });
    }

    // Skip auth logic for login/logout endpoints to avoid loops
    if (reqToForward.url.includes('/auth/login') || reqToForward.url.includes('/auth/logout')) {
      return next.handle(reqToForward);
    }

    const authService = this.injector.get(AuthService);
    const token = authService.getAuthToken();
    let authReq = reqToForward;

    if (token && request.url.includes('/api/')) {
      authReq = this.addToken(reqToForward, token);
    }

    return next.handle(authReq).pipe(
      catchError(error => {
        if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403) && request.url.includes('/api/')) {
          return this.handleAuthError(authReq, next, authService);
        }
        return throwError(() => error);
      })
    );
  }

  private addToken(request: HttpRequest<unknown>, token: string) {
    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  private handleAuthError(request: HttpRequest<unknown>, next: HttpHandler, authService: AuthService) {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      return authService.refreshToken().pipe(
        switchMap((token: any) => {
          this.isRefreshing = false;
          this.refreshTokenSubject.next(token.token);
          return next.handle(this.addToken(request, token.token));
        }),
        catchError((err) => {
          this.isRefreshing = false;
          authService.clearSession(); // Silently clear instead of unused logout observable
          return throwError(() => err);
        })
      );
    } else {
      return this.refreshTokenSubject.pipe(
        filter(token => token != null),
        take(1),
        switchMap(jwt => {
          return next.handle(this.addToken(request, jwt));
        })
      );
    }
  }
}
