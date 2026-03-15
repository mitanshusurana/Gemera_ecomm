import { ErrorHandler, Injectable, Injector, NgZone } from '@angular/core';
import { ToastService } from '../services/toast.service';
import { HttpErrorResponse } from '@angular/common/http';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private injector: Injector, private zone: NgZone) {}

  handleError(error: any) {
    if (error instanceof HttpErrorResponse) {
      // Handled by ErrorInterceptor
      return;
    }

    console.error('GlobalErrorHandler caught an error:', error);

    // Inject service lazily to avoid circular dependencies
    const toastService = this.injector.get(ToastService);
    let message = 'An unexpected error occurred.';

    if (error.message) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    }

    // Ensure the toast UI updates by running inside NgZone
    this.zone.run(() => {
      toastService.show(message, 'error');
    });
  }
}
