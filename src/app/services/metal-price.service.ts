import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface MetalPrices {
  gold_usd: number;
  '24k': number;
  '22k': number;
  '18k': number;
  currency: string;
  is_mock?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class MetalPriceService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/metal-prices`;

  getLivePrices(): Observable<MetalPrices> {
    return this.http.get<MetalPrices>(this.apiUrl);
  }
}
