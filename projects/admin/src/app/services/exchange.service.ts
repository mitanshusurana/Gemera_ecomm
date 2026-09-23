import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type ExchangeMetal = 'GOLD' | 'SILVER';

export type ExchangeStatus =
  | 'REQUESTED'
  | 'RECEIVED'
  | 'ASSAYED'
  | 'CREDITED'
  | 'REJECTED'
  | 'CANCELLED';

export const EXCHANGE_STATUSES: ExchangeStatus[] = ['REQUESTED', 'RECEIVED', 'ASSAYED', 'CREDITED', 'REJECTED', 'CANCELLED'];

/** Rule 114B threshold (INR): PAN mandatory at or above this value. */
export const EXCHANGE_PAN_THRESHOLD = 200000;

export interface ExchangeEvent {
  status: ExchangeStatus;
  note: string | null;
  actor: string | null;
  at: string;
}

/** Mirrors ExchangeRequestDTO (admin view: PAN and ID proof unmasked, ERP sync state present). */
export interface ExchangeRequest {
  id: string;
  requestNumber: string;
  userId: string | null;
  customerName: string;
  email: string | null;
  phone: string | null;
  metal: ExchangeMetal;
  declaredPurity: string;
  declaredPurityFraction: number;
  declaredWeightGrams: number;
  quotedRatePerGram: number;
  quotedDeductionPct: number;
  quotedValue: number;
  quoteIndicative: boolean;
  status: ExchangeStatus;
  assayedPurityFraction: number | null;
  assayedNetWeightGrams: number | null;
  assayedRatePerGram: number | null;
  deductionPct: number | null;
  finalValue: number | null;
  rejectionReason: string | null;
  pan: string | null;
  panRequired: boolean;
  idProofType: string | null;
  idProofNumber: string | null;
  stateCode: string | null;
  creditGiftCardCode: string | null;
  erpPurchaseRef: string | null;
  erpSyncStatus: 'PENDING' | 'SENT' | 'FAILED' | null;
  erpSyncError: string | null;
  itemDescription: string | null;
  notes: string | null;
  receivedAt: string | null;
  assayedAt: string | null;
  creditedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  events: ExchangeEvent[];
}

export interface ExchangeQuote {
  metal: ExchangeMetal;
  purity: string;
  purityFraction: number;
  weightGrams: number;
  ratePerGramFine: number;
  rate: number;
  deductionPct: number;
  estimatedValue: number;
  indicative: boolean;
  panRequired: boolean;
}

export interface AssayRequest {
  assayedPurityFraction: number;
  assayedNetWeightGrams: number;
  assayedRatePerGram?: number;
  deductionPct?: number;
  pan?: string;
  note?: string;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

@Injectable({
  providedIn: 'root'
})
export class ExchangeService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/admin/exchange`;
  private publicUrl = `${environment.apiUrl}/exchange`;

  list(page = 0, size = 20, status?: ExchangeStatus | 'ALL' | ''): Observable<Page<ExchangeRequest>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status && status !== 'ALL') {
      params = params.set('status', status);
    }
    return this.http.get<Page<ExchangeRequest>>(this.apiUrl, { params });
  }

  get(id: string): Observable<ExchangeRequest> {
    return this.http.get<ExchangeRequest>(`${this.apiUrl}/${id}`);
  }

  receive(id: string, note?: string): Observable<ExchangeRequest> {
    return this.http.post<ExchangeRequest>(`${this.apiUrl}/${id}/receive`, { note: note || undefined });
  }

  assay(id: string, body: AssayRequest): Observable<ExchangeRequest> {
    return this.http.post<ExchangeRequest>(`${this.apiUrl}/${id}/assay`, body);
  }

  credit(id: string): Observable<ExchangeRequest> {
    return this.http.post<ExchangeRequest>(`${this.apiUrl}/${id}/credit`, {});
  }

  reject(id: string, reason: string): Observable<ExchangeRequest> {
    return this.http.post<ExchangeRequest>(`${this.apiUrl}/${id}/reject`, { reason });
  }

  cancel(id: string, reason?: string): Observable<ExchangeRequest> {
    return this.http.post<ExchangeRequest>(`${this.apiUrl}/${id}/cancel`, { reason: reason || undefined });
  }

  erpSync(id: string): Observable<ExchangeRequest> {
    return this.http.post<ExchangeRequest>(`${this.apiUrl}/${id}/erp-sync`, {});
  }

  /**
   * Live fine-metal rate in INR per gram, via the public quote endpoint with
   * 1 g at full fineness; used to prefill the assay form.
   */
  liveRate(metal: ExchangeMetal): Observable<ExchangeQuote> {
    const params = new HttpParams()
      .set('metal', metal)
      .set('purity', metal === 'GOLD' ? '24K' : '999')
      .set('weight', '1');
    return this.http.get<ExchangeQuote>(`${this.publicUrl}/quote`, { params });
  }
}
