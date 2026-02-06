declare namespace Razorpay {
  interface Options {
    key: string;
    amount: number;
    currency: string;
    name: string;
    description?: string;
    image?: string;
    order_id: string;
    handler?: (response: PaymentSuccessResponse) => void;
    prefill?: {
      name?: string;
      email?: string;
      contact?: string;
      method?: string;
    };
    theme?: {
      color?: string;
    };
    notes?: {
      [key: string]: string;
    };
    modal?: {
      ondismiss?: () => void;
      confirm_close?: boolean;
      escape?: boolean;
      animation?: boolean;
      backdropclose?: boolean;
      handleback?: boolean;
    };
  }

  interface PaymentSuccessResponse {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }

  interface PaymentFailedResponse {
    error: {
      code: string;
      description: string;
      source: string;
      step: string;
      reason: string;
      metadata: {
        order_id: string;
        payment_id: string;
      };
    };
  }
}

declare class Razorpay {
  constructor(options: Razorpay.Options);
  open(): void;
  on(event: 'payment.failed', callback: (response: Razorpay.PaymentFailedResponse) => void): void;
}
