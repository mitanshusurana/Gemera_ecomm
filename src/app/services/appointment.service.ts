import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type AppointmentType = 'STORE_VISIT' | 'TRY_AT_HOME' | 'VIDEO_CONSULT';
export type AppointmentStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';

export const APPOINTMENT_TYPE_LABEL: Record<AppointmentType, string> = {
  STORE_VISIT: 'Store visit',
  TRY_AT_HOME: 'Try at home',
  VIDEO_CONSULT: 'Video consult',
};

export const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Awaiting confirmation',
  CONFIRMED: 'Confirmed',
  COMPLETED: 'Completed',
  NO_SHOW: 'Missed',
  CANCELLED: 'Cancelled',
};

/** Body of POST /appointments. `slotStart` is a local ISO date-time ("2026-10-01T11:00:00"). */
export interface AppointmentRequest {
  name: string;
  email?: string;
  phone?: string;
  appointmentType: AppointmentType;
  slotStart?: string;
  storeId?: string | null;
  /** Older flow without a slot grid. */
  requestedDate?: string;
  productId?: string;
  notes?: string;
}

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

/** One entry of GET /appointments/slots. */
export interface AppointmentSlot {
  start: string;
  end: string;
  capacity: number;
  booked: number;
  remaining: number;
  available: boolean;
  reason: 'FULL' | 'TOO_SOON' | null;
}

/** "2026-10-01T11:00:00" without the zone, as the API stores local slot times. */
export function toLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

@Injectable({
  providedIn: 'root'
})
export class AppointmentService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/appointments`;

  createAppointment(appointment: AppointmentRequest): Observable<Appointment> {
    return this.http.post<Appointment>(this.apiUrl, appointment);
  }

  /** Slots of one day; `storeId` matters for store visits only. */
  slots(date: string, type: AppointmentType, storeId?: string | null): Observable<AppointmentSlot[]> {
    let params = new HttpParams().set('date', date).set('type', type);
    if (storeId) params = params.set('storeId', storeId);
    return this.http.get<AppointmentSlot[]>(`${this.apiUrl}/slots`, { params });
  }

  mine(): Observable<Appointment[]> {
    return this.http.get<Appointment[]>(`${this.apiUrl}/mine`);
  }

  cancel(id: string, reason?: string, phone?: string): Observable<Appointment> {
    const params = phone ? new HttpParams().set('phone', phone) : undefined;
    return this.http.post<Appointment>(`${this.apiUrl}/${id}/cancel`, { reason: reason || '' }, { params });
  }

  reschedule(id: string, slotStart: string, storeId?: string | null, phone?: string): Observable<Appointment> {
    const params = phone ? new HttpParams().set('phone', phone) : undefined;
    return this.http.post<Appointment>(`${this.apiUrl}/${id}/reschedule`, { slotStart, storeId: storeId || null }, { params });
  }

  /** Staff only (appointments.write). */
  updateStatus(id: string, status: string): Observable<Appointment> {
    return this.http.put<Appointment>(`${this.apiUrl}/${id}/status`, { status });
  }
}
