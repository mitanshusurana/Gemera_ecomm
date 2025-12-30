import { ErrorHandler, Injectable, Injector, NgZone } from '@angular/core';
import { ToastService } from '../services/toast.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private injector: Injector, private zone: NgZone) {}

  handleError(error: any): void {
    const toastService = this.injector.get(ToastService);

    // Check if it's an error we want to show
    let message = 'An unexpected error occurred';
    if (error?.message) {
        message = error.message;
    }
    if (error?.rejection?.message) {
        message = error.rejection.message;
    }

    // Run inside zone to ensure UI updates
    this.zone.run(() => {
        console.error('Global Error Handler:', error);
        // Avoid showing "ExpressionChangedAfterItHasBeenCheckedError" to users
        if (!message.includes('ExpressionChangedAfterItHasBeenCheckedError')) {
             toastService.show(message, 'error');
        }
    });
  }
}
