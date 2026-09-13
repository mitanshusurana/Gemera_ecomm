import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type GiftCardStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'DEPLETED' | 'DISABLED';

/** Mirrors GiftCardDTO in the API contract (section 4). */
export interface GiftCard {
  id: string;
  code: string | null;
  initialAmount: number;
  balance: number;
  currency: string;
  recipientName: string;
  recipientEmail: string;
  message: string | null;
  theme: string | null;
  status: GiftCardStatus;
  expiresAt: string | null;
  createdAt: string;
  /** Present on admin-issued cards; not part of the public DTO. */
  purchaserEmail?: string | null;
  issuedBy?: string | null;
}

/** Spring `Page<T>` envelope, as returned by the admin list endpoint. */
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface IssueGiftCardRequest {
  amount: number;
  recipientName: string;
  recipientEmail: string;
  message?: string;
  note?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GiftCardService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/admin/gift-cards`;

  getGiftCards(page: number = 0, size: number = 20): Observable<Page<GiftCard>> {
    return this.http.get<Page<GiftCard>>(`${this.apiUrl}?page=${page}&size=${size}`);
  }

  issueGiftCard(request: IssueGiftCardRequest): Observable<GiftCard> {
    return this.http.post<GiftCard>(this.apiUrl, request);
  }

  disableGiftCard(id: string): Observable<GiftCard> {
    return this.http.post<GiftCard>(`${this.apiUrl}/${id}/disable`, {});
  }
}
