import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type AppointmentType = 'STORE_VISIT' | 'TRY_AT_HOME' | 'VIDEO_CONSULT';
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';

export const APPOINTMENT_STATUSES: AppointmentStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];

export const APPOINTMENT_TYPE_LABEL: Record<AppointmentType, string> = {
  STORE_VISIT: 'Store visit',
  TRY_AT_HOME: 'Try at home',
  VIDEO_CONSULT: 'Video consult',
};

/** Mirrors AppointmentService.ALLOWED_TRANSITIONS on the API. */
export const APPOINTMENT_NEXT: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['COMPLETED', 'NO_SHOW', 'CANCELLED'],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

/** Mirrors AppointmentDtos.AppointmentDTO. */
export interface Appointment {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  appointmentType: AppointmentType;
  status: AppointmentStatus;
  requestedDate: string | null;
  slotStart: string | null;
  slotEnd: string | null;
  storeId: string | null;
  storeName: string | null;
  storeAddress: string | null;
  consultant: string | null;
  cancellationReason: string | null;
  productId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface AppointmentSlot {
  start: string;
  end: string;
  capacity: number;
  booked: number;
  remaining: number;
  available: boolean;
  reason: 'FULL' | 'TOO_SOON' | null;
}

@Injectable({ providedIn: 'root' })
export class AppointmentService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/appointments`;

  /** One day (YYYY-MM-DD), optionally one store and one status. */
  list(date: string | null, storeId: string | null, status: string | null): Observable<Appointment[]> {
    let params = new HttpParams();
    if (date) params = params.set('date', date);
    if (storeId) params = params.set('storeId', storeId);
    if (status && status !== 'ALL') params = params.set('status', status);
    return this.http.get<Appointment[]>(this.apiUrl, { params });
  }

  slots(date: string, type: AppointmentType, storeId: string | null): Observable<AppointmentSlot[]> {
    let params = new HttpParams().set('date', date).set('type', type);
    if (storeId) params = params.set('storeId', storeId);
    return this.http.get<AppointmentSlot[]>(`${this.apiUrl}/slots`, { params });
  }

  updateStatus(id: string, status: AppointmentStatus, reason?: string): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiUrl}/${id}/status`, { status, reason: reason || '' });
  }

  assign(id: string, consultant: string): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiUrl}/${id}/assign`, { consultant });
  }

  reschedule(id: string, slotStart: string, storeId: string | null): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiUrl}/${id}/reschedule`, { slotStart, storeId });
  }
}
