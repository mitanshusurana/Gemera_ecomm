import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** GROWTH-CONTRACT §3 segments, in display order. */
export const CUSTOMER_SEGMENTS = ['NEW', 'FIRST', 'REPEAT', 'VIP', 'DORMANT', 'TREASURE', 'RFQ'] as const;
export type CustomerSegment = (typeof CUSTOMER_SEGMENTS)[number];

export const SEGMENT_LABEL: Record<CustomerSegment, string> = {
  NEW: 'New',
  FIRST: 'First order',
  REPEAT: 'Repeat',
  VIP: 'VIP',
  DORMANT: 'Dormant',
  TREASURE: 'Treasure',
  RFQ: 'RFQ'
};

export const SEGMENT_CLASS: Record<string, string> = {
  NEW: 'bg-sky-100 text-sky-800',
  FIRST: 'bg-emerald-100 text-emerald-800',
  REPEAT: 'bg-indigo-100 text-indigo-800',
  VIP: 'bg-amber-100 text-amber-800',
  DORMANT: 'bg-gray-200 text-gray-700',
  TREASURE: 'bg-purple-100 text-purple-800',
  RFQ: 'bg-teal-100 text-teal-800'
};

/** Row of GET /admin/customers (Spring Page content). */
export interface CustomerSummary {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  ordersCount?: number;
  totalSpend?: number;
  lastOrderAt?: string;
  createdAt?: string;
  lastLoginAt?: string;
  segment?: CustomerSegment | string;
  tags?: string;
  marketingOptIn?: boolean;
  city?: string;
}

/** GET /admin/customers/{id}. Every field is optional: the endpoint is new. */
export interface CustomerProfile extends CustomerSummary {
  firstName?: string;
  lastName?: string;
  addresses?: any[];
  birthday?: string;
  anniversary?: string;
  ringSize?: string;
  preferredMetal?: string;
  preferredStones?: string;
  source?: string;
  preferences?: {
    birthday?: string;
    anniversary?: string;
    ringSize?: string;
    preferredMetal?: string;
    preferredStones?: string;
    marketingOptIn?: boolean;
  };
  orders?: Array<{ id: string; orderNumber?: string; status?: string; total?: number; createdAt?: string }>;
  wishlist?: Array<{ id: string; name?: string; sku?: string; price?: number }>;
  rfqs?: Array<{ id: string; rfqNumber?: string; status?: string; createdAt?: string }>;
  treasure?: any | null;
  giftCardsPurchased?: number;
  adminNotes?: string;
}

export interface CustomerStats {
  total?: number;
  new30d?: number;
  repeat?: number;
  vip?: number;
  dormant?: number;
  optedIn?: number;
  byCity?: Array<{ city: string; count: number }>;
  /** Optional per-segment counts, if the backend chooses to send them. */
  segments?: Partial<Record<CustomerSegment, number>>;
}

@Injectable({
  providedIn: 'root'
})
export class CustomerService {
  private http = inject(HttpClient);
  /** Legacy user listing (AdminController). */
  private usersUrl = `${environment.apiUrl}/admin/users`;
  /** GROWTH-CONTRACT §3 customer intelligence endpoints. */
  private apiUrl = `${environment.apiUrl}/admin/customers`;

  /** Pre-contract listing; kept for callers that still want raw UserDTOs. */
  getCustomers(page: number = 0, size: number = 10): Observable<any> {
    return this.http.get<any>(`${this.usersUrl}?page=${page}&size=${size}`);
  }

  /** `Page<CustomerSummaryDTO>`; `search` matches name/email/phone. */
  list(opts: { search?: string; segment?: string | null; page?: number; size?: number } = {}): Observable<any> {
    let params = new HttpParams()
      .set('page', String(opts.page ?? 0))
      .set('size', String(opts.size ?? 25));
    if (opts.search?.trim()) params = params.set('search', opts.search.trim());
    if (opts.segment) params = params.set('segment', opts.segment);
    return this.http.get<any>(this.apiUrl, { params });
  }

  get(id: string): Observable<CustomerProfile> {
    return this.http.get<CustomerProfile>(`${this.apiUrl}/${encodeURIComponent(id)}`);
  }

  saveNotes(id: string, body: { tags?: string; adminNotes?: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/${encodeURIComponent(id)}/notes`, body);
  }

  stats(): Observable<CustomerStats> {
    return this.http.get<CustomerStats>(`${this.apiUrl}/stats`);
  }

  /** CSV of the summary rows, fetched through the authenticated client so it can be saved as a download. */
  exportCsv(segment?: string | null): Observable<Blob> {
    let params = new HttpParams();
    if (segment) params = params.set('segment', segment);
    return this.http.get(`${this.apiUrl}/export.csv`, { params, responseType: 'blob' });
  }
}
