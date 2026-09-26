import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type TreasureStatus = 'ACTIVE' | 'MATURED' | 'REDEEMED' | 'CLOSED';

/** Mirrors TreasureChestAccountDTO (admin list is enriched with customer and rate figures). */
export interface TreasureAccount {
  id: string;
  planName: string;
  installmentAmount: number;
  installmentsPaid: number;
  totalInstallments: number;
  balance: number;
  status: TreasureStatus | string;
  startDate: string | null;
  nextDueDate: string | null;
  bonusAmount: number;
  maturityAmount: number;
  goldGramsAccrued: number | null;
  ratePerGram: number | null;
  rateIndicative: boolean;
  goldValue: number | null;
  redeemableValue: number | null;
  redeemableBasis: 'BALANCE' | 'GOLD' | null;
  redeemedAmount: number | null;
  redeemedOrderId: string | null;
  redeemedOrderNumber: string | null;
  userId: string | null;
  customerName: string | null;
  customerEmail: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class TreasureService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/treasure`;

  /** Every plan (treasure.write). */
  list(): Observable<TreasureAccount[]> {
    return this.http.get<TreasureAccount[]>(`${this.apiUrl}/accounts`);
  }

  /** Records a cash installment paid in store. */
  recordPayment(id: string, note?: string): Observable<TreasureAccount> {
    return this.http.post<TreasureAccount>(`${this.apiUrl}/accounts/${encodeURIComponent(id)}/payment`, note ? { note } : {});
  }

  skipMonth(id: string): Observable<TreasureAccount> {
    return this.http.post<TreasureAccount>(`${this.apiUrl}/accounts/${encodeURIComponent(id)}/skip`, {});
  }

  closePlan(id: string): Observable<TreasureAccount> {
    return this.http.post<TreasureAccount>(`${this.apiUrl}/accounts/${encodeURIComponent(id)}/close`, {});
  }
}
