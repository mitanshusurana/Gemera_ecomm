import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Order } from '../core/models';
import { CreateOrderRequest, InitializePaymentRequest, VerifyPaymentRequest } from '../core/dtos';
import { ApiConfigService } from './api-config.service';

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('orders');

  createOrder(orderData: CreateOrderRequest): Observable<Order> {
    return this.http.post<Order>(this.baseUrl, orderData);
  }

  getOrderById(orderId: string): Observable<Order> {
    return this.http.get<Order>(`${this.baseUrl}/${orderId}`);
  }

  getUserOrders(page: number = 0, size: number = 10): Observable<any> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    return this.http.get<any>(this.baseUrl, { params });
  }

  updateOrderStatus(orderId: string, status: string, trackingNumber?: string): Observable<any> {
    return this.http.put(
      `${this.baseUrl}/${orderId}/status`,
      { status, trackingNumber }
    );
  }

  initializePayment(
    orderId: string,
    amount: number,
    currency: string = 'USD',
    paymentMethod: string = 'CREDIT_CARD'
  ): Observable<any> {
    const body: InitializePaymentRequest = { orderId, amount, currency, paymentMethod };
    return this.http.post(
      `${this.apiConfig.getEndpoint('payments')}/initialize`,
      body
    );
  }

  verifyPayment(paymentId: string, paymentToken: string): Observable<any> {
    const body: VerifyPaymentRequest = { paymentId, paymentToken };
    return this.http.post(
      `${this.apiConfig.getEndpoint('payments')}/verify`,
      body
    );
  }
}
