import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { RepairJob, RepairRequest, RepairTracking } from '../core/repair.models';

/** Storefront client for /api/v1/repairs. */
@Injectable({
  providedIn: 'root'
})
export class RepairService {
  private http = inject(HttpClient);
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

  /** Uploads one photo for the request form; resolves to its public URL. */
  uploadPhoto(file: File): Observable<{ url: string }> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<{ url: string }>(`${this.apiUrl}/photos`, form);
  }
}
