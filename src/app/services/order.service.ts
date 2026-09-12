import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Order } from '../core/models';
import { CreateOrderRequest } from '../core/dtos';
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

  trackOrder(orderId: string): Observable<Order> {
    return this.http.get<Order>(`${this.baseUrl}/track/${orderId}`);
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
}
