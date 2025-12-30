import { Injectable, inject } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ToastService } from '../services/toast.service';

@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
  private toastService = inject(ToastService);

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        let errorMessage = 'An unknown error occurred!';
        if (error.error instanceof ErrorEvent) {
          // Client-side error
          errorMessage = `Error: ${error.error.message}`;
        } else {
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

        // Show toast
        this.toastService.show(errorMessage, 'error');

        return throwError(() => error);
      })
    );
  }
}
