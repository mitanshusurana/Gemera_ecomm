import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export const RFQ_STATUSES = ['PENDING', 'QUOTED', 'NEGOTIATING', 'ACCEPTED', 'REJECTED', 'CANCELLED'] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

/** Badge colours per RFQ status, shared by the list and detail pages. */
export const RFQ_STATUS_CLASS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  QUOTED: 'bg-sky-100 text-sky-800',
  NEGOTIATING: 'bg-purple-100 text-purple-800',
  ACCEPTED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-200 text-gray-700',
};

/**
 * RFQ endpoints (OPERATIONS-CONTRACT §7). Bodies mirror RFQController:
 *  - quote:     { proposedPrice, notes? }        -> RFQQuoteDTO
 *  - negotiate: NegotiationRequestDTO { requestedPrice?, notes?, items? }
 *  - reject:    { reason }
 *  - accept / cancel: empty body
 */
@Injectable({ providedIn: 'root' })
export class RfqService {
  private apiUrl = environment.apiUrl + '/rfq/requests';

  constructor(private http: HttpClient) {}

  list(status: string | null, page = 0, size = 20): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('size', String(size));
    if (status) params = params.set('status', status);
    return this.http.get(this.apiUrl, { params });
  }

  get(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  quotes(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}/quotes`, { params: new HttpParams().set('size', '50') });
  }

  quote(id: string, proposedPrice: number, notes?: string): Observable<any> {
    const body: Record<string, unknown> = { proposedPrice };
    if (notes) body['notes'] = notes;
    return this.http.post(`${this.apiUrl}/${id}/quote`, body);
  }

  negotiate(id: string, notes: string, requestedPrice?: number | null): Observable<any> {
    const body: Record<string, unknown> = { notes };
    if (requestedPrice != null) body['requestedPrice'] = requestedPrice;
    return this.http.post(`${this.apiUrl}/${id}/negotiate`, body);
  }

  accept(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/accept`, {});
  }

  reject(id: string, reason: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/reject`, { reason });
  }

  cancel(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/cancel`, {});
  }
}
