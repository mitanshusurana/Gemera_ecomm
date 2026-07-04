import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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

  getOrder(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  updateOrderStatus(id: string, status: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/status`, { status });
  }

  updateTrackingNumber(id: string, trackingNumber: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/tracking`, { trackingNumber });
  }

  updateNotes(id: string, notes: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}/notes`, { notes });
  }
}
