import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** Mirrors StoreDTO in the API contract (section 3). */
export interface Store {
  id: string | null;
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
  private apiUrl = `${environment.apiUrl}/admin/stores`;

  getStores(): Observable<Store[]> {
    return this.http.get<Store[]>(this.apiUrl);
  }

  createStore(store: Omit<Store, 'id'>): Observable<Store> {
    return this.http.post<Store>(this.apiUrl, store);
  }

  updateStore(id: string, store: Store): Observable<Store> {
    return this.http.put<Store>(`${this.apiUrl}/${id}`, store);
  }

  deleteStore(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
