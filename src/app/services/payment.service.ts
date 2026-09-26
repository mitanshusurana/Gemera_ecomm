import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { CreateRazorpayOrderRequest, RazorpayOrderResponse, TransactionFailureRequest } from '../core/dtos';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);

  createRazorpayOrder(amount: number, currency: string = 'INR'): Observable<RazorpayOrderResponse> {
    const body: CreateRazorpayOrderRequest = { amount, currency };
    return this.http.post<RazorpayOrderResponse>(
      this.apiConfig.getEndpoint('payments/razorpay-order'),
      body
    );
  }

  /**
   * Signature check after the Razorpay modal succeeds. The API also
   * completes a PENDING_PAYMENT order that carries this Razorpay order id
   * (accepted quotes, exchange balances), interchangeably with the webhook.
   */
  verifyPayment(response: Razorpay.PaymentSuccessResponse): Observable<unknown> {
    return this.http.post(this.apiConfig.getEndpoint('payments/verify'), {
      orderId: response.razorpay_order_id,
      paymentId: response.razorpay_payment_id,
      paymentToken: response.razorpay_signature,
    });
  }

  logFailedTransaction(details: TransactionFailureRequest): Observable<any> {
    return this.http.post(
      this.apiConfig.getEndpoint('transactions/failure'),
      details
    );
  }
}
