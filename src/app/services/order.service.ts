import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { EMPTY, Observable, tap } from 'rxjs';
import { Order } from '../core/models';
import { CreateOrderRequest } from '../core/dtos';
import { ApiConfigService } from './api-config.service';

/** Mirrors ManualOrderService.PaymentOrder on the API. */
export interface PendingPaymentOrder {
  orderId: string;
  orderNumber: string;
  status: string;
  razorpayOrderId: string;
  /** Paise. */
  amount: number;
  currency: string;
  amountInr: number;
}

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);
  private platformId = inject(PLATFORM_ID);
  private baseUrl = this.apiConfig.getEndpoint('orders');

  createOrder(orderData: CreateOrderRequest): Observable<Order> {
    return this.http.post<Order>(this.baseUrl, orderData);
  }

  getOrderById(orderId: string): Observable<Order> {
    return this.http.get<Order>(`${this.baseUrl}/${orderId}`);
  }

  trackOrder(orderId: string): Observable<Order> {
    return this.http.get<Order>(`${this.baseUrl}/track/${orderId}`);
  }

  /**
   * POST /orders/{id}/payment-order: the Razorpay order for one of my orders
   * that is still PENDING_PAYMENT (an accepted quote, an exchange balance).
   * `amount` is in paise.
   */
  paymentOrder(orderId: string): Observable<PendingPaymentOrder> {
    return this.http.post<PendingPaymentOrder>(`${this.baseUrl}/${orderId}/payment-order`, {});
  }

  getUserOrders(page: number = 0, size: number = 10, status: string = 'ALL'): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    if (status && status !== 'ALL') {
      params = params.set('status', status);
    }

    return this.http.get<any>(this.baseUrl, { params });
  }

  /**
   * GET /orders/{id}/invoice as a PDF and hand it to the browser as a download
   * named `{invoiceNumber}.pdf`. The auth interceptor adds the bearer header
   * like on every other call. Completes without emitting on the server: there
   * is no window to hand the file to during SSR. A 404 (no invoice yet)
   * surfaces to the caller's error handler.
   */
  downloadInvoice(orderId: string, invoiceNumber: string): Observable<Blob> {
    if (!isPlatformBrowser(this.platformId)) {
      return EMPTY;
    }
    return this.http
      .get(`${this.baseUrl}/${orderId}/invoice`, { responseType: 'blob' })
      .pipe(tap((blob) => this.saveBlob(blob, `${invoiceNumber || `invoice-${orderId}`}.pdf`)));
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const pdf = blob.type ? blob : new Blob([blob], { type: 'application/pdf' });
    const url = URL.createObjectURL(pdf);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName.replace(/[\\/:*?"<>|]+/g, '-');
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Give the browser a tick to start the download before revoking.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
