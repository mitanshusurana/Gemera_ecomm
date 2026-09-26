import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Mirrors NotificationDtos.Preferences: effective toggles plus the profile phone (E.164 when it parses). */
export interface NotificationPreferences {
  notifyEmail: boolean;
  notifyWhatsapp: boolean;
  notifySms: boolean;
  phone: string;
}

/** Storefront client for /api/v1/users/me/notification-preferences. */
@Injectable({
  providedIn: 'root'
})
export class NotificationPreferenceService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/users/me/notification-preferences`;

  get(): Observable<NotificationPreferences> {
    return this.http.get<NotificationPreferences>(this.apiUrl);
  }

  /** Partial update; fields left undefined are not changed. */
  update(prefs: Partial<NotificationPreferences>): Observable<NotificationPreferences> {
    return this.http.put<NotificationPreferences>(this.apiUrl, prefs);
  }
}
