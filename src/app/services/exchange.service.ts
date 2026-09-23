import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import {
  CreateExchangeRequest,
  ExchangeMetal,
  ExchangeQuote,
  ExchangeRequest,
} from '../core/exchange.models';

/** Storefront client for /api/v1/exchange (old gold and silver for store credit). */
@Injectable({
  providedIn: 'root',
})
export class ExchangeService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('exchange');

  /** Public live estimate. 400 for an unknown purity label. */
  quote(metal: ExchangeMetal, purity: string, weightGrams: number): Observable<ExchangeQuote> {
    const params = new HttpParams()
      .set('metal', metal)
      .set('purity', purity)
      .set('weight', String(weightGrams));
    return this.http.get<ExchangeQuote>(`${this.baseUrl}/quote`, { params });
  }

  /** Guest or signed-in intake; the response carries the EX-YYYY-NNNNN number. */
  create(body: CreateExchangeRequest): Observable<ExchangeRequest> {
    return this.http.post<ExchangeRequest>(`${this.baseUrl}/requests`, body);
  }

  /** Signed-in customer's own requests, newest first. */
  mine(): Observable<ExchangeRequest[]> {
    return this.http.get<ExchangeRequest[]>(`${this.baseUrl}/requests/mine`);
  }

  /** Cancel one of your own requests while it is still REQUESTED. */
  cancel(id: string): Observable<ExchangeRequest> {
    return this.http.post<ExchangeRequest>(`${this.baseUrl}/requests/${encodeURIComponent(id)}/cancel`, {});
  }

  /** Public lookup by request number and the phone it was placed with; 404 when they do not match. */
  track(requestNumber: string, phone: string): Observable<ExchangeRequest> {
    const params = new HttpParams().set('phone', phone.trim());
    return this.http.get<ExchangeRequest>(
      `${this.baseUrl}/requests/track/${encodeURIComponent(requestNumber.trim().toUpperCase())}`,
      { params },
    );
  }
}
