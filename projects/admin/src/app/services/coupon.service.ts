import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export type CouponDiscountType = 'PERCENTAGE' | 'FLAT';

/** Mirrors CouponDTO in the GST / promotions contract. */
export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  /** Percent for PERCENTAGE, whole INR for FLAT. */
  discountValue: number;
  /** ISO datetime, or null for no expiry. */
  expiryDate: string | null;
  /** Total redemptions allowed, or null for unlimited. */
  usageLimit: number | null;
  timesUsed: number;
  active: boolean;
  /** Minimum cart value (INR) for the coupon to apply, or null. */
  minOrderValue: number | null;
}

/** POST / PUT body; the server owns id, timesUsed and (on create) active. */
export interface CouponRequest {
  code: string;
  description?: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  expiryDate?: string | null;
  usageLimit?: number | null;
  minOrderValue?: number | null;
  active?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CouponService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/admin/coupons`;

  /** Accepts either a bare array or a Spring `Page` envelope, whichever the API sends. */
  getCoupons(): Observable<Coupon[]> {
    return this.http.get<Coupon[] | { content: Coupon[] }>(this.apiUrl).pipe(
      map(res => (Array.isArray(res) ? res : res?.content ?? []))
    );
  }

  createCoupon(body: CouponRequest): Observable<Coupon> {
    return this.http.post<Coupon>(this.apiUrl, body);
  }

  updateCoupon(id: string, body: CouponRequest): Observable<Coupon> {
    return this.http.put<Coupon>(`${this.apiUrl}/${id}`, body);
  }

  /** DELETE deactivates rather than removes, so redeemed orders keep their reference. */
  deactivateCoupon(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
