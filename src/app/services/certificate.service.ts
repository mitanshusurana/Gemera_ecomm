import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { CertificateDetail } from '../core/models';

@Injectable({
  providedIn: 'root'
})
export class CertificateService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('certificates');

  verifyCertificate(reportNumber: string): Observable<CertificateDetail> {
    return this.http.get<CertificateDetail>(`${this.baseUrl}/${reportNumber}`);
  }

  downloadCertificate(reportNumber: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${reportNumber}/download`, {
      responseType: 'blob'
    });
  }
}
