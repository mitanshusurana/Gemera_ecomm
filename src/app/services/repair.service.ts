import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { EMPTY, Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  RepairJob, RepairPaymentOrder, RepairPaymentVerification, RepairRequest, RepairTracking,
} from '../core/repair.models';

/** Storefront client for /api/v1/repairs. */
@Injectable({
  providedIn: 'root'
})
export class RepairService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);
  private apiUrl = `${environment.apiUrl}/repairs`;

  /** Books a job. Works signed in (contact fields optional) or as a guest. */
  createRequest(request: RepairRequest): Observable<RepairJob> {
    return this.http.post<RepairJob>(`${this.apiUrl}/requests`, request);
  }

  /** The signed-in customer's jobs, newest first. */
  mine(): Observable<RepairJob[]> {
    return this.http.get<RepairJob[]>(`${this.apiUrl}/mine`);
  }

  /** Public lookup. `phone` may be empty for the signed-in owner. */
  track(jobNumber: string, phone: string): Observable<RepairTracking> {
    const params = phone ? new HttpParams().set('phone', phone) : undefined;
    return this.http.get<RepairTracking>(`${this.apiUrl}/track/${encodeURIComponent(jobNumber.trim())}`, { params });
  }

  approveEstimate(jobNumber: string, phone: string): Observable<RepairTracking> {
    const params = phone ? new HttpParams().set('phone', phone) : undefined;
    return this.http.post<RepairTracking>(`${this.apiUrl}/${encodeURIComponent(jobNumber.trim())}/approve-estimate`, {}, { params });
  }

  /** Razorpay order for the amount due; the page opens checkout with it. */
  createPaymentOrder(jobNumber: string, phone: string): Observable<RepairPaymentOrder> {
    const params = phone ? new HttpParams().set('phone', phone) : undefined;
    return this.http.post<RepairPaymentOrder>(`${this.apiUrl}/${encodeURIComponent(jobNumber.trim())}/payments/order`, {}, { params });
  }

  /** Signature check after checkout; the response is the refreshed tracking view. */
  verifyPayment(jobNumber: string, phone: string, body: RepairPaymentVerification): Observable<RepairTracking> {
    const params = phone ? new HttpParams().set('phone', phone) : undefined;
    return this.http.post<RepairTracking>(`${this.apiUrl}/${encodeURIComponent(jobNumber.trim())}/payments/verify`, body, { params });
  }

  /**
   * GET /repairs/{jobNumber}/invoice as a PDF, handed to the browser as a
   * download. Completes without emitting on the server (no window during
   * SSR). 404 (not issued yet) reaches the caller's error handler.
   */
  downloadInvoice(jobNumber: string, phone: string, invoiceNumber: string | null): Observable<Blob> {
    if (!isPlatformBrowser(this.platformId)) {
      return EMPTY;
    }
    const params = phone ? new HttpParams().set('phone', phone) : undefined;
    return this.http
      .get(`${this.apiUrl}/${encodeURIComponent(jobNumber.trim())}/invoice`, { params, responseType: 'blob' })
      .pipe(tap((blob) => this.saveBlob(blob, `${invoiceNumber || `${jobNumber}-invoice`}.pdf`)));
  }

  private saveBlob(blob: Blob, fileName: string): void {
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

  /** Uploads one photo for the request form; resolves to its public URL. */
  uploadPhoto(file: File): Observable<{ url: string }> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<{ url: string }>(`${this.apiUrl}/photos`, form);
  }
}
