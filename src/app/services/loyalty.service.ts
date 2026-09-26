import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { LoyaltySummary } from '../core/models';

/** Tier order, lowest first; mirrors LoyaltyService on the API. */
export const LOYALTY_TIERS = ['SILVER', 'GOLD', 'PLATINUM'] as const;

export const LOYALTY_TIER_LABEL: Record<string, string> = {
  SILVER: 'Silver',
  GOLD: 'Gold',
  PLATINUM: 'Platinum',
};

@Injectable({
  providedIn: 'root',
})
export class LoyaltyService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('loyalty');

  /** Balance, tier, expiring points, referral code and a page of the ledger. */
  me(page = 0, size = 20): Observable<LoyaltySummary> {
    const params = new HttpParams().set('page', String(page)).set('size', String(size));
    return this.http.get<LoyaltySummary>(`${this.baseUrl}/me`, { params });
  }
}
