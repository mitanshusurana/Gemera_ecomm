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

/** Whether the order has been pushed to the accounting ERP (GST contract). */
export type ErpSyncStatus = 'PENDING' | 'SENT' | 'FAILED';

/**
 * The parts of OrderDTO the admin reads by name. The DTO carries more (items,
 * addresses, totals) that the templates access loosely; these are the fields
 * with contract-level meaning, so they are typed.
 */
export interface AdminOrder {
  id: string;
  orderNumber?: string;
  status: string;
  paymentMethod?: string;
  razorpayOrderId?: string;
  appliedCoupon?: string;
  appliedGiftCard?: string;
  giftCardAmount?: number;
  subtotal?: number;
  tax?: number;
  shipping?: number;
  discount?: number;
  total?: number;
  items?: any[];
  createdAt?: string;
  updatedAt?: string;
  trackingNumber?: string;
  shippingMethod?: string;
  estimatedDelivery?: string;
  internalNotes?: string;
  nextStatuses?: string[];
  customerName?: string;
  customerEmail?: string;
  email?: string;
  user?: { email?: string; [key: string]: any };
  /** Address object; the template reads it field by field with `?.` guards. */
  shippingAddress?: any;
  billingAddress?: any;

  // Tax invoice and accounting (GST contract)
  /** Buyer GSTIN for a B2B invoice, as entered at checkout. */
  buyerGstin?: string;
  /** Buyer PAN; mandatory on payable totals of 2,00,000 INR or more (Rule 114B). */
  buyerPan?: string;
  /** e.g. "WEB/2026-27/000123"; absent until the invoice is issued. */
  invoiceNumber?: string;
  /** ISO date or datetime. */
  invoiceDate?: string;
  erpSyncStatus?: ErpSyncStatus | null;
  /** The ERP's own document reference once SENT. */
  erpReference?: string;
  erpLastError?: string;
  razorpayRefundId?: string;
  /** Whole INR refunded through the gateway. */
  refundedAmount?: number;

  [key: string]: any;
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

  getOrder(id: string): Observable<AdminOrder> {
    return this.http.get<AdminOrder>(`${this.apiUrl}/${id}`);
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

  /**
   * GET /orders/{id}/invoice: the issued tax invoice as application/pdf.
   * 404 when no invoice exists yet. The auth interceptor adds the bearer.
   */
  downloadInvoice(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/invoice`, { responseType: 'blob' });
  }

  /** POST /orders/{id}/erp-sync: queue or retry the ERP push; returns the updated order. */
  syncToErp(id: string): Observable<AdminOrder> {
    return this.http.post<AdminOrder>(`${this.apiUrl}/${id}/erp-sync`, {});
  }
}

/** Hand a fetched PDF to the browser as a download. */
export function saveBlobAs(blob: Blob, fileName: string): void {
  const pdf = blob.type ? blob : new Blob([blob], { type: 'application/pdf' });
  const url = URL.createObjectURL(pdf);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.replace(/[\\/:*?"<>|]+/g, '-');
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
