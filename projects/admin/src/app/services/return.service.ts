import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'REFUNDED' | 'EXCHANGED' | 'CANCELLED';
export type ReturnResolution = 'REFUND' | 'STORE_CREDIT' | 'EXCHANGE';

export const RETURN_STATUSES: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED', 'EXCHANGED', 'REJECTED', 'CANCELLED'];

export const RETURN_REASON_LABEL: Record<string, string> = {
  DAMAGED: 'Damaged on arrival',
  WRONG_ITEM: 'Wrong item',
  NOT_AS_DESCRIBED: 'Not as described',
  SIZE: 'Size / fit',
  CHANGED_MIND: 'Changed mind',
  OTHER: 'Other',
};

export const RETURN_RESOLUTION_LABEL: Record<ReturnResolution, string> = {
  REFUND: 'Refund',
  STORE_CREDIT: 'Store credit',
  EXCHANGE: 'Exchange',
};

export const RETURN_CONDITIONS = ['GOOD', 'DAMAGED', 'WORN', 'MISSING_PARTS'];

export interface ReturnLine {
  id: string;
  orderItemId: string;
  productId: string | null;
  name: string;
  sku: string | null;
  image: string | null;
  quantity: number;
  unitPrice: number;
  condition: string | null;
  received: boolean | null;
}

export interface ReturnExchangeItem {
  productId: string;
  name: string | null;
  sku: string | null;
  price: number | null;
  quantity: number;
}

/** Mirrors ReturnDtos.ReturnRequestDTO. */
export interface ReturnRequest {
  id: string;
  rmaNumber: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  status: ReturnStatus;
  reason: string;
  reasonNote: string | null;
  resolution: ReturnResolution;
  refundAmount: number;
  restockingFee: number | null;
  refundedViaGateway: number | null;
  razorpayRefundId: string | null;
  exchangeOrderId: string | null;
  exchangeOrderNumber: string | null;
  exchangeOrderStatus: string | null;
  storeCreditGiftCardCode: string | null;
  exchangeItems: ReturnExchangeItem[];
  adminNote: string | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  lines: ReturnLine[];
  createdAt: string;
  updatedAt: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  cancellable: boolean;
}

export interface ReceiveLine {
  lineId: string;
  received: boolean;
  condition: string | null;
}

@Injectable({ providedIn: 'root' })
export class ReturnService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/admin/returns`;

  list(status: ReturnStatus | 'ALL', q: string, page = 0, size = 20): Observable<any> {
    let params = new HttpParams().set('page', String(page)).set('size', String(size));
    if (status && status !== 'ALL') params = params.set('status', status);
    if (q?.trim()) params = params.set('q', q.trim());
    return this.http.get(this.apiUrl, { params });
  }

  stats(): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(`${this.apiUrl}/stats`);
  }

  get(id: string): Observable<ReturnRequest> {
    return this.http.get<ReturnRequest>(`${this.apiUrl}/${id}`);
  }

  approve(id: string, restockingFee: number | null, note: string): Observable<ReturnRequest> {
    const body: Record<string, unknown> = { note };
    if (restockingFee != null) body['restockingFee'] = restockingFee;
    return this.http.put<ReturnRequest>(`${this.apiUrl}/${id}/approve`, body);
  }

  reject(id: string, note: string): Observable<ReturnRequest> {
    return this.http.put<ReturnRequest>(`${this.apiUrl}/${id}/reject`, { note });
  }

  receive(id: string, lines: ReceiveLine[], note: string): Observable<ReturnRequest> {
    return this.http.put<ReturnRequest>(`${this.apiUrl}/${id}/receive`, { lines, note });
  }

  resolve(id: string, note: string): Observable<ReturnRequest> {
    return this.http.put<ReturnRequest>(`${this.apiUrl}/${id}/resolve`, { note });
  }
}
