import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { ApiConfigService } from './api-config.service';
import {
  TreasureChestAccount,
  TreasureInstallment,
  TreasureInstallmentConfirmRequest,
  TreasureInstallmentOrderResponse,
} from '../core/models';

/**
 * Mirrors the backend's TreasurePlanConfig: `durationMonths` is the number of
 * installments the customer pays and `bonusMonths` is what Caratloop adds on
 * top at maturity (finish contract, section 2: totalInstallments = durationMonths).
 */
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

  // Default config used as fallback; matches TreasurePlanService.getConfig().
  private configSignal = signal<TreasurePlanConfig>({
    minAmount: 1000,
    maxAmount: 100000,
    durationMonths: 11,
    bonusMonths: 1
  });

  /** Read-only view of the plan config (defaults until loadConfig() resolves). */
  readonly config = this.configSignal.asReadonly();

  loadConfig(): Observable<TreasurePlanConfig> {
    return this.http.get<TreasurePlanConfig>(`${this.baseUrl}/config`).pipe(
      tap(config => this.configSignal.set({ ...this.configSignal(), ...config })),
      catchError(() => of(this.configSignal())) // Fallback to default
    );
  }

  /**
   * youPay = installment x paid months, weAdd = installment x bonus months.
   * Same arithmetic as the DTO's maturityAmount so the calculator and the
   * account view can never disagree.
   */
  calculateMaturity(installmentAmount: number): { youPay: number; weAdd: number; total: number } {
    const config = this.configSignal();
    const youPay = installmentAmount * config.durationMonths;
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

  /** The caller's account. 404 means "not enrolled"; callers map that to the enrol form. */
  getAccount(): Observable<TreasureChestAccount> {
    return this.http.get<TreasureChestAccount>(`${this.baseUrl}/account`);
  }

  /**
   * Creates a PENDING installment and a Razorpay order for it. 400 when the
   * plan is not ACTIVE or is fully paid; 503 when the gateway is unconfigured.
   */
  createInstallmentOrder(): Observable<TreasureInstallmentOrderResponse> {
    return this.http.post<TreasureInstallmentOrderResponse>(`${this.baseUrl}/account/installments/order`, {});
  }

  /**
   * Verifies the Razorpay signature and applies the payment. Idempotent for an
   * already PAID installment. The page re-fetches the account afterwards rather
   * than relying on the response body's shape.
   */
  confirmInstallment(installmentId: string, req: TreasureInstallmentConfirmRequest): Observable<TreasureChestAccount> {
    return this.http.post<TreasureChestAccount>(
      `${this.baseUrl}/account/installments/${encodeURIComponent(installmentId)}/confirm`,
      req,
    );
  }

  /** Installment history for the caller's account, newest first. */
  getInstallments(): Observable<TreasureInstallment[]> {
    return this.http.get<TreasureInstallment[]>(`${this.baseUrl}/account/installments`);
  }
}
