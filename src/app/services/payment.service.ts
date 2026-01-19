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

  logFailedTransaction(details: TransactionFailureRequest): Observable<any> {
    return this.http.post(
      this.apiConfig.getEndpoint('transactions/failure'),
      details
    );
  }
}
