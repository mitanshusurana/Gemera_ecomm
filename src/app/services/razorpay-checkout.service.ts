import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../../environments/environment';

/** What the caller passes to open the Razorpay checkout for an order it already created on the API. */
export interface RazorpayCheckoutOptions {
  /** Razorpay order id from the API (`razorpayOrderId` / `id`). */
  orderId: string;
  /** Paise. */
  amount: number;
  currency?: string;
  description: string;
  prefill?: { name?: string; email?: string; contact?: string };
  /** Signature payload to verify on the API. */
  onSuccess: (response: Razorpay.PaymentSuccessResponse) => void;
  /** Customer closed the modal without paying. */
  onDismiss?: () => void;
  /** Gateway reported a failed attempt (the modal stays open for a retry). */
  onFailure?: (response: Razorpay.PaymentFailedResponse) => void;
}

/**
 * One place that loads checkout.js and opens the Razorpay modal, shared by
 * the cart checkout, repair payments, accepted quotes and pending orders.
 * The key comes from `environment.razorpayKey` (substituted by env-subst.sh
 * in the image). Every method is a no-op during SSR.
 */
@Injectable({ providedIn: 'root' })
export class RazorpayCheckoutService {
  private platformId = inject(PLATFORM_ID);

  static readonly LOAD_ERROR = 'Payment gateway failed to load. Please check your connection or disable ad blockers.';

  /** Injects checkout.js once; safe to call on every page that may open the modal. */
  load(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (typeof Razorpay !== 'undefined' || document.querySelector('script[src*="checkout.razorpay.com"]')) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }

  /** True when the script has loaded and the modal can be opened. */
  isReady(): boolean {
    return isPlatformBrowser(this.platformId) && typeof Razorpay !== 'undefined';
  }

  /**
   * Opens the modal. Returns false (and does nothing) when checkout.js is
   * not available, so the caller can show {@link RazorpayCheckoutService.LOAD_ERROR}.
   */
  open(options: RazorpayCheckoutOptions): boolean {
    if (!this.isReady()) return false;
    const rzpOptions: Razorpay.Options = {
      key: environment.razorpayKey,
      amount: options.amount,
      currency: options.currency || 'INR',
      name: 'Caratloop',
      description: options.description,
      order_id: options.orderId,
      prefill: options.prefill,
      theme: { color: '#D4AF37' },
      handler: (response: Razorpay.PaymentSuccessResponse) => options.onSuccess(response),
      modal: {
        ondismiss: () => options.onDismiss?.(),
      },
    };
    const rzp = new Razorpay(rzpOptions);
    rzp.on('payment.failed', (response: Razorpay.PaymentFailedResponse) => options.onFailure?.(response));
    rzp.open();
    return true;
  }
}
