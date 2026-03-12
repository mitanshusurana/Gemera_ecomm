import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AdminMaintenanceService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/admin`;

  getHealth(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/health`);
  }

  triggerBackup(): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/backup`, {});
  }
}
