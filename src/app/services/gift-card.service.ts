import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import {
  GiftCardBalanceResponse,
  GiftCardConfirmRequest,
  GiftCardDTO,
  GiftCardPurchaseRequest,
  GiftCardPurchaseResponse,
} from '../core/dtos';

/** "CL-ABCD-EFGH-1234" -> "CL-****-****-1234". Already-masked input is returned as-is. */
export function maskGiftCardCode(code: string | null | undefined): string {
  if (!code) return '';
  const trimmed = code.trim();
  if (trimmed.includes('*')) return trimmed;
  const last4 = trimmed.slice(-4);
  return `CL-****-****-${last4}`;
}

@Injectable({
  providedIn: 'root',
})
export class GiftCardService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('gift-cards');

  /** Creates a PENDING_PAYMENT card and a Razorpay order for it. 503 when the gateway is not configured. */
  purchase(req: GiftCardPurchaseRequest): Observable<GiftCardPurchaseResponse> {
    return this.http.post<GiftCardPurchaseResponse>(`${this.baseUrl}/purchase`, req);
  }

  /** Verifies the Razorpay signature and activates the card. Idempotent on an ACTIVE card. */
  confirm(giftCardId: string, req: GiftCardConfirmRequest): Observable<GiftCardDTO> {
    return this.http.post<GiftCardDTO>(`${this.baseUrl}/${encodeURIComponent(giftCardId)}/confirm`, req);
  }

  /** Public balance lookup; 404 for an unknown code. */
  balance(code: string): Observable<GiftCardBalanceResponse> {
    const clean = code.trim().toUpperCase();
    return this.http.get<GiftCardBalanceResponse>(`${this.baseUrl}/${encodeURIComponent(clean)}/balance`);
  }
}
