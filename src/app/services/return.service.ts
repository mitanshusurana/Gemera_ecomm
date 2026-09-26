import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type ReturnStatus = 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'RECEIVED' | 'REFUNDED' | 'EXCHANGED' | 'CANCELLED';
export type ReturnReason = 'DAMAGED' | 'WRONG_ITEM' | 'NOT_AS_DESCRIBED' | 'SIZE' | 'CHANGED_MIND' | 'OTHER';
export type ReturnResolution = 'REFUND' | 'STORE_CREDIT' | 'EXCHANGE';

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  DAMAGED: 'Arrived damaged',
  WRONG_ITEM: 'Wrong item received',
  NOT_AS_DESCRIBED: 'Not as described',
  SIZE: 'Wrong size or fit',
  CHANGED_MIND: 'Changed my mind',
  OTHER: 'Something else',
};

export const RETURN_RESOLUTION_LABEL: Record<ReturnResolution, string> = {
  REFUND: 'Refund to my payment method',
  STORE_CREDIT: 'Store credit (gift card)',
  EXCHANGE: 'Exchange for another piece',
};

export const RETURN_STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved, send it back',
  RECEIVED: 'Received by the store',
  REFUNDED: 'Refunded',
  EXCHANGED: 'Exchanged',
  REJECTED: 'Not accepted',
  CANCELLED: 'Cancelled',
};

export interface EligibleLine {
  orderItemId: string;
  productId: string | null;
  name: string;
  sku: string | null;
  image: string | null;
  quantity: number;
  returnableQuantity: number;
  unitPrice: number;
  returnable: boolean;
  reason: string | null;
}

export interface ReturnEligibility {
  orderId: string;
  orderNumber: string;
  eligible: boolean;
  reason: string | null;
  windowEnds: string | null;
  windowDays: number;
  lines: EligibleLine[];
}

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

export interface ReturnRequest {
  id: string;
  rmaNumber: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  status: ReturnStatus;
  reason: ReturnReason;
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
  lines: ReturnLine[];
  createdAt: string;
  updatedAt: string | null;
  approvedAt: string | null;
  receivedAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  cancellable: boolean;
}

export interface CreateReturnRequest {
  lines: { orderItemId: string; quantity: number }[];
  reason: ReturnReason;
  reasonNote?: string;
  resolution: ReturnResolution;
  exchangeItems?: { productId: string; quantity: number }[];
}

/** Storefront client for returns and exchanges (RMA). */
@Injectable({ providedIn: 'root' })
export class ReturnService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;

  eligibility(orderId: string): Observable<ReturnEligibility> {
    return this.http.get<ReturnEligibility>(`${this.apiUrl}/orders/${orderId}/returns/eligibility`);
  }

  create(orderId: string, body: CreateReturnRequest): Observable<ReturnRequest> {
    return this.http.post<ReturnRequest>(`${this.apiUrl}/orders/${orderId}/returns`, body);
  }

  mine(): Observable<ReturnRequest[]> {
    return this.http.get<ReturnRequest[]>(`${this.apiUrl}/returns/mine`);
  }

  cancel(rmaNumber: string): Observable<ReturnRequest> {
    return this.http.post<ReturnRequest>(`${this.apiUrl}/returns/${encodeURIComponent(rmaNumber)}/cancel`, {});
  }
}
