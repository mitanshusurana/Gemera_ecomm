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

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private toastService = inject(ToastService);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      timeout(15000), // 15 seconds timeout
      catchError((error: HttpErrorResponse | TimeoutError) => {
        let errorMessage = 'An unknown error occurred!';

        if (error instanceof TimeoutError) {
          errorMessage = 'Request timed out. Please check your internet connection and try again.';
          this.toastService.show(errorMessage, 'error');
          return throwError(() => error);
        }

        if (error instanceof HttpErrorResponse && error.error instanceof ErrorEvent) {
          // Client-side error
          errorMessage = `Error: ${error.error.message}`;
        } else if (error instanceof HttpErrorResponse) {
          // Server-side error
          if (error.status === 401) {
              errorMessage = 'Unauthorized access. Please login.';
          } else if (error.status === 403) {
              errorMessage = 'You do not have permission to perform this action.';
          } else if (error.status === 404) {
              errorMessage = 'Resource not found.';
          } else if (error.status >= 500) {
              errorMessage = 'Server error. Please try again later.';
          } else {
              errorMessage = `Error Code: ${error.status}\nMessage: ${error.message}`;
          }
        }

        // Suppress toast for 401/403 on cart endpoints since CartService will gracefully fall back
        const isCartAuthError = error instanceof HttpErrorResponse &&
                               (error.status === 401 || error.status === 403) &&
                               request.url.includes('/api/v1/cart');

        if (!isCartAuthError) {
          // Show toast
          this.toastService.show(errorMessage, 'error');
        }

        return throwError(() => error);
      })
    );
  }
}
