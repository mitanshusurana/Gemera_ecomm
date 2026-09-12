import { Injectable, inject } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError, TimeoutError } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { ToastService } from '../services/toast.service';

/**
 * Turns HTTP failures into a single, human-readable toast.
 *
 * Read-only requests that fail because the API is unreachable or the resource
 * does not exist stay silent: the page that made the call renders its own
 * empty state, and a burst of "Error Code: 0" toasts on first paint is worse
 * than an empty section. Mutations always report.
 */
@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private toastService = inject(ToastService);
  private lastMessage = '';
  private lastShownAt = 0;

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      timeout(15000),
      catchError((error: HttpErrorResponse | TimeoutError) => {
        const message = this.messageFor(request, error);
        if (message) this.showOnce(message);
        return throwError(() => error);
      })
    );
  }

  private messageFor(request: HttpRequest<unknown>, error: HttpErrorResponse | TimeoutError): string | null {
    const isRead = request.method === 'GET' || request.method === 'HEAD';

    if (error instanceof TimeoutError) {
      return isRead ? null : 'The request timed out. Please check your connection and try again.';
    }
    if (!(error instanceof HttpErrorResponse)) {
      return 'Something went wrong. Please try again.';
    }

    // Cart falls back to a local cart for guests; do not nag them to log in.
    if ((error.status === 401 || error.status === 403) && request.url.includes('/api/v1/cart')) {
      return null;
    }

    switch (true) {
      case error.status === 0:
        return isRead ? null : 'We could not reach our servers. Please try again in a moment.';
      case error.status === 401:
        return 'Please sign in to continue.';
      case error.status === 403:
        return 'You do not have permission to do that.';
      case error.status === 404:
        return isRead ? null : 'We could not find what you were looking for.';
      case error.status === 429:
        return 'Too many attempts. Please wait a moment and try again.';
      case error.status >= 500:
        return 'Our servers hit a problem. Please try again shortly.';
      default: {
        // 4xx validation-style errors: prefer the API's own message when it is a short string.
        const apiMessage = (error.error && typeof error.error === 'object' && typeof error.error.message === 'string')
          ? error.error.message
          : (typeof error.error === 'string' ? error.error : '');
        return apiMessage && apiMessage.length <= 160 ? apiMessage : 'The request could not be completed. Please check your details and try again.';
      }
    }
  }

  /** Suppress identical toasts fired within a short window (parallel calls failing together). */
  private showOnce(message: string) {
    const now = Date.now();
    if (message === this.lastMessage && now - this.lastShownAt < 4000) return;
    this.lastMessage = message;
    this.lastShownAt = now;
    this.toastService.show(message, 'error');
  }
}
