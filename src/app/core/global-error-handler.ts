import { ErrorHandler, Injectable, Injector, NgZone } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '../services/toast.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private injector: Injector, private zone: NgZone) {}

  handleError(error: any): void {
    const toastService = this.injector.get(ToastService);

    let message = 'An unexpected error occurred';

    if (error instanceof HttpErrorResponse) {
        // Server Error
        message = error.error?.message || error.statusText || 'Server Error';
    } else if (error instanceof Error) {
        // Client Error
        message = error.message;
    } else if (error?.message) {
        // Fallback for objects with message
        message = error.message;
    } else if (error?.rejection?.message) {
        // Promise rejection
        message = error.rejection.message;
    }

    // Run inside zone to ensure UI updates
    this.zone.run(() => {
        // Only log to console in non-production, but here we keep it for debugging
        console.error('Global Error Handler:', error);

        // Avoid showing "ExpressionChangedAfterItHasBeenCheckedError" to users
        if (!message.includes('ExpressionChangedAfterItHasBeenCheckedError')) {
             toastService.show(message, 'error');
        }
    });
  }
}
