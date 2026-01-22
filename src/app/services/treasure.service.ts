import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, delay } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { TreasureChestAccount } from '../core/models';

export interface TreasurePlanConfig {
  minAmount: number;
  maxAmount: number;
  durationMonths: number;
  bonusMonths: number;
}

@Injectable({
  providedIn: 'root'
})
export class TreasureService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('treasure');

  private config: TreasurePlanConfig = {
    minAmount: 1000,
    maxAmount: 50000,
    durationMonths: 10, // Total duration
    bonusMonths: 1 // The last month is paid by company
  };

  getPlanConfig(): Observable<TreasurePlanConfig> {
    return of(this.config).pipe(delay(500));
  }

  calculateMaturity(installmentAmount: number): { youPay: number; weAdd: number; total: number } {
    const installments = this.config.durationMonths - this.config.bonusMonths; // 9
    const youPay = installmentAmount * installments;
    const weAdd = installmentAmount * this.config.bonusMonths; // 1
    return {
       youPay,
       weAdd,
       total: youPay + weAdd
    };
  }

  enroll(amount: number): Observable<TreasureChestAccount> {
     const payload = {
       planName: "Golden Treasure Plan",
       installmentAmount: amount
     };
     return this.http.post<TreasureChestAccount>(`${this.baseUrl}/enroll`, payload);
  }
}
