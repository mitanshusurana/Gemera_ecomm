import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
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

  // Default config used as fallback
  private configSignal = signal<TreasurePlanConfig>({
    minAmount: 1000,
    maxAmount: 50000,
    durationMonths: 10, // Total duration
    bonusMonths: 1 // The last month is paid by company
  });

  loadConfig(): Observable<TreasurePlanConfig> {
    return this.http.get<TreasurePlanConfig>(`${this.baseUrl}/config`).pipe(
      tap(config => this.configSignal.set(config)),
      catchError(() => of(this.configSignal())) // Fallback to default
    );
  }

  getPlanConfig(): Observable<TreasurePlanConfig> {
    return of(this.configSignal());
  }

  calculateMaturity(installmentAmount: number): { youPay: number; weAdd: number; total: number } {
    const config = this.configSignal();
    const installments = config.durationMonths - config.bonusMonths;
    const youPay = installmentAmount * installments;
    const weAdd = installmentAmount * config.bonusMonths;
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
