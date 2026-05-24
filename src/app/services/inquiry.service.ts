import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface CustomInquiry {
  id?: string;
  name: string;
  email: string;
  phone: string;
  concept: string;
  attachmentUrl?: string;
  status?: string;
}

@Injectable({
  providedIn: 'root'
})
export class InquiryService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/api/v1/inquiries`;

  createInquiry(formData: FormData): Observable<CustomInquiry> {
    return this.http.post<CustomInquiry>(this.apiUrl, formData);
  }

  getAllInquiries(): Observable<CustomInquiry[]> {
    return this.http.get<CustomInquiry[]>(this.apiUrl);
  }

  updateStatus(id: string, status: string): Observable<CustomInquiry> {
    return this.http.patch<CustomInquiry>(`${this.apiUrl}/${id}/status`, { status });
  }
}
