import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from './api-config.service';

export interface Store {
  id: number;
  name: string;
  address: string;
  phone: string;
  hours: string;
  lat: number;
  lng: number;
}

@Injectable({
  providedIn: 'root'
})
export class StoreService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('stores');

  getStores(): Observable<{ stores: Store[] }> {
    return this.http.get<{ stores: Store[] }>(this.baseUrl);
  }
}
