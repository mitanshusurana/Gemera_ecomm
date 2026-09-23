import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { StaffRole } from '../core/permissions';

/** Mirrors StaffRequests.StaffUserDTO. */
export interface StaffUser {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: StaffRole | string;
  active: boolean;
  createdAt: string | null;
}

export interface StaffRoleInfo {
  role: StaffRole | string;
  description: string;
  permissions: string[];
}

export interface CreateStaffRequest {
  name: string;
  email: string;
  role: StaffRole | string;
  password: string;
}

@Injectable({
  providedIn: 'root'
})
export class StaffService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/admin/staff`;

  list(): Observable<StaffUser[]> {
    return this.http.get<StaffUser[]>(this.baseUrl);
  }

  roles(): Observable<StaffRoleInfo[]> {
    return this.http.get<StaffRoleInfo[]>(`${this.baseUrl}/roles`);
  }

  create(body: CreateStaffRequest): Observable<StaffUser> {
    return this.http.post<StaffUser>(this.baseUrl, body);
  }

  changeRole(id: string, role: string): Observable<StaffUser> {
    return this.http.put<StaffUser>(`${this.baseUrl}/${id}/role`, { role });
  }

  setActive(id: string, active: boolean): Observable<StaffUser> {
    return this.http.put<StaffUser>(`${this.baseUrl}/${id}/active`, { active });
  }

  resetPassword(id: string, password: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.baseUrl}/${id}/reset-password`, { password });
  }
}
