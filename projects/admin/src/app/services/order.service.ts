import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Body of PUT /orders/{id}/ship (OPERATIONS-CONTRACT §3). */
export interface ShipOrderRequest {
  trackingNumber: string;
  shippingMethod?: string;
  /** ISO date (yyyy-MM-dd). */
  estimatedDelivery?: string;
}

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  private apiUrl = environment.apiUrl + '/orders';

  constructor(private http: HttpClient) {}

  getOrders(page: number = 0, size: number = 50, status: string = 'ALL'): Observable<any> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    if (status && status !== 'ALL') {
      params = params.set('status', status);
    }
    return this.http.get(this.apiUrl, { params });
  }

  /** `{ PENDING_PAYMENT: n, PAID: n, ... }`; callers hide the counts when this fails. */
  getStats(): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(`${this.apiUrl}/stats`);
  }

  getOrder(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  updateOrderStatus(id: string, status: string, reason?: string): Observable<any> {
    const body: Record<string, string> = { status };
    if (reason) body['reason'] = reason;
    return this.http.put(`${this.apiUrl}/${id}/status`, body);
  }

  /** Sets tracking and moves the order to SHIPPED in one call. */
  shipOrder(id: string, request: ShipOrderRequest): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/ship`, request);
  }

  updateTrackingNumber(id: string, trackingNumber: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/tracking`, { trackingNumber });
  }

  updateNotes(id: string, notes: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/notes`, { notes });
  }
}
