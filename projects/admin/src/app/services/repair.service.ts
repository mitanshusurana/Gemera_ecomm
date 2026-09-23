import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type RepairStatus =
  | 'REQUESTED' | 'RECEIVED' | 'ASSESSED' | 'APPROVED' | 'IN_PROGRESS' | 'READY' | 'DELIVERED' | 'CANCELLED';

export type RepairPaymentMode = 'CASH' | 'UPI' | 'CARD' | 'RAZORPAY' | 'OTHER';

export const REPAIR_STATUSES: RepairStatus[] =
  ['REQUESTED', 'RECEIVED', 'ASSESSED', 'APPROVED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED'];

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  REQUESTED: 'Requested',
  RECEIVED: 'Received',
  ASSESSED: 'Assessed',
  APPROVED: 'Approved',
  IN_PROGRESS: 'In progress',
  READY: 'Ready',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const REPAIR_SERVICE_LABELS: Record<string, string> = {
  RESIZE: 'Resizing',
  POLISH: 'Polishing',
  STONE_RESET: 'Stone resetting',
  RHODIUM_PLATING: 'Rhodium plating',
  CHAIN_REPAIR: 'Chain repair',
  ENGRAVING: 'Engraving',
  CLEANING: 'Cleaning',
  OTHER: 'Other',
};

export interface RepairJobEvent {
  id: string;
  status: RepairStatus;
  note: string | null;
  actor: string | null;
  visibleToCustomer: boolean;
  createdAt: string;
}

/** Mirrors RepairJobDTO (admin view: internal fields present). */
export interface RepairJob {
  id: string;
  jobNumber: string;
  customerName: string;
  phone: string;
  email: string | null;
  itemType: string;
  itemDescription: string;
  serviceType: string;
  problemDescription: string | null;
  declaredValue: number | null;
  photoUrls: string[];
  ringSize: string | null;
  targetSize: string | null;
  status: RepairStatus;
  estimateAmount: number | null;
  estimateNote: string | null;
  estimateApprovedAt: string | null;
  promisedDate: string | null;
  finalAmount: number | null;
  paidAmount: number | null;
  paymentMode: RepairPaymentMode | null;
  paymentReference: string | null;
  assignedTo: string | null;
  internalNotes: string | null;
  receivedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Next statuses the machine allows from the current one. */
  allowedTransitions: RepairStatus[];
  events: RepairJobEvent[];
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface StatusUpdateRequest {
  status: RepairStatus;
  note?: string;
  visibleToCustomer?: boolean;
  /** ISO date (yyyy-MM-dd). */
  promisedDate?: string | null;
}

export interface EstimateRequest {
  estimateAmount: number;
  estimateNote?: string;
  promisedDate?: string | null;
}

export interface PaymentRequest {
  finalAmount?: number | null;
  paidAmount?: number | null;
  paymentMode?: RepairPaymentMode | '' | null;
  paymentReference?: string;
}

@Injectable({
  providedIn: 'root'
})
export class RepairService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/admin/repairs`;

  list(status: string | null, search: string, page = 0, size = 50): Observable<Page<RepairJob>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (status && status !== 'ALL') params = params.set('status', status);
    if (search.trim()) params = params.set('search', search.trim());
    return this.http.get<Page<RepairJob>>(this.apiUrl, { params });
  }

  stats(): Observable<Record<string, number>> {
    return this.http.get<Record<string, number>>(`${this.apiUrl}/stats`);
  }

  get(id: string): Observable<RepairJob> {
    return this.http.get<RepairJob>(`${this.apiUrl}/${id}`);
  }

  updateStatus(id: string, body: StatusUpdateRequest): Observable<RepairJob> {
    return this.http.put<RepairJob>(`${this.apiUrl}/${id}/status`, body);
  }

  setEstimate(id: string, body: EstimateRequest): Observable<RepairJob> {
    return this.http.put<RepairJob>(`${this.apiUrl}/${id}/estimate`, body);
  }

  assign(id: string, assignedTo: string): Observable<RepairJob> {
    return this.http.put<RepairJob>(`${this.apiUrl}/${id}/assign`, { assignedTo });
  }

  recordPayment(id: string, body: PaymentRequest): Observable<RepairJob> {
    return this.http.put<RepairJob>(`${this.apiUrl}/${id}/payment`, body);
  }

  updateNotes(id: string, internalNotes: string): Observable<RepairJob> {
    return this.http.put<RepairJob>(`${this.apiUrl}/${id}/notes`, { internalNotes });
  }

  jobCard(id: string): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/${id}/job-card.pdf`, { responseType: 'blob' });
  }
}
