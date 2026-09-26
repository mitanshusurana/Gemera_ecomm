import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type NotificationChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';
export type NotificationStatus = 'SENT' | 'FAILED' | 'SKIPPED';

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ['EMAIL', 'WHATSAPP', 'SMS'];
export const NOTIFICATION_STATUSES: NotificationStatus[] = ['SENT', 'FAILED', 'SKIPPED'];

/** Mirrors NotificationDtos.LogEntry (recipient is masked by the API). */
export interface NotificationLogEntry {
  id: string;
  event: string;
  channel: NotificationChannel;
  recipient: string;
  template: string | null;
  status: NotificationStatus;
  providerMessageId: string | null;
  error: string | null;
  reference: string | null;
  createdAt: string;
}

export interface ChannelStatus {
  configured: boolean;
  provider: string;
  description: string;
}

/** Mirrors NotificationDtos.EventTemplate. */
export interface EventTemplate {
  event: string;
  emailTemplate: string | null;
  waTemplateDefault: string | null;
  waTemplate: string | null;
  waParams: string[];
  smsTextDefault: string | null;
  smsText: string | null;
}

export interface TestResponse {
  channel: NotificationChannel;
  status: NotificationStatus;
  providerMessageId: string | null;
  error: string | null;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

/** Admin client for /api/v1/admin/notifications. */
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/admin/notifications`;

  list(page = 0, size = 25, channel?: string, status?: string, search?: string): Observable<Page<NotificationLogEntry>> {
    let params = new HttpParams().set('page', page).set('size', size);
    if (channel) params = params.set('channel', channel);
    if (status) params = params.set('status', status);
    if (search && search.trim()) params = params.set('search', search.trim());
    return this.http.get<Page<NotificationLogEntry>>(this.apiUrl, { params });
  }

  channels(): Observable<Record<NotificationChannel, ChannelStatus>> {
    return this.http.get<Record<NotificationChannel, ChannelStatus>>(`${this.apiUrl}/channels`);
  }

  events(): Observable<EventTemplate[]> {
    return this.http.get<EventTemplate[]>(`${this.apiUrl}/events`);
  }

  sendTest(channel: NotificationChannel, destination: string, event?: string): Observable<TestResponse> {
    const body: Record<string, string> = { channel };
    if (channel === 'EMAIL') body['email'] = destination; else body['phone'] = destination;
    if (event) body['event'] = event;
    return this.http.post<TestResponse>(`${this.apiUrl}/test`, body);
  }
}
