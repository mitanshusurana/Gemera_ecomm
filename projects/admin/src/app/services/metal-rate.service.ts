import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export type MetalCode = 'GOLD' | 'SILVER' | 'PLATINUM';
export type MetalPurity = '24K' | '22K' | '18K' | '14K' | '999' | '925' | '950';
export type PricingMode = 'FIXED' | 'METAL_RATE';
export type MakingChargeType = 'PER_GRAM' | 'PERCENT' | 'FIXED';

/** One line of the board, INR per gram. */
export interface MetalRate {
  metal: MetalCode;
  purity: MetalPurity;
  purityFraction: number;
  ratePerGram: number;
}

/** GET /metal-prices/today and GET /admin/metal-rates/live share this shape. */
export interface MetalBoard {
  asOf: string;
  source: 'LOCKED' | 'LIVE';
  lockedAt: string | null;
  indicative: boolean;
  fx: { usdInr: number; source: string };
  live: {
    goldUsdPerOunce: number;
    silverUsdPerOunce: number;
    platinumUsdPerOunce: number;
    updatedAt: string;
  } | null;
  rates: MetalRate[];
}

export interface MetalRateHistoryPoint {
  date: string;
  ratePerGram: number;
  source: string;
}

export interface LockRatesRequest {
  rates: Array<{ metal: MetalCode; purity: MetalPurity; ratePerGram: number }>;
  note?: string;
}

export interface RepriceResult {
  repriced: number;
  skipped: number;
  asOf: string;
}

/** Body of POST /admin/products/price-preview. */
export interface PricePreviewRequest {
  pricingMetal: MetalCode;
  pricingPurity: MetalPurity;
  pricingNetWeightGrams: number;
  makingChargeType: MakingChargeType;
  makingChargeValue: number;
  wastagePct: number;
  stoneValue: number;
  otherCharges: number;
}

export interface PriceBreakdown {
  metal: MetalCode;
  purity: MetalPurity;
  ratePerGram: number;
  netWeightGrams: number;
  wastagePct: number;
  metalValue: number;
  makingChargeType: MakingChargeType;
  makingChargeValue: number;
  makingCharges: number;
  stoneValue: number;
  otherCharges: number;
  price: number;
  pricedAt: string;
}

/** Settings keys the Rates page owns (flat settings map, string values). */
export const METAL_RATE_SETTING_KEYS = ['metalRateProvider', 'metalRateDutyPct', 'metalRatePremiumPct', 'metalRateAutoLockHour'] as const;
export type MetalRateSettingKey = (typeof METAL_RATE_SETTING_KEYS)[number];

export const METAL_RATE_PROVIDERS: Array<{ value: string; label: string }> = [
  { value: 'GOLD_API_FREE', label: 'Gold API (free tier)' },
  { value: 'GOLDAPI_IO', label: 'goldapi.io (keyed)' },
];

/** Purities the board can carry, in display order, with the metal each belongs to. */
export const BOARD_PURITIES: Array<{ metal: MetalCode; purity: MetalPurity }> = [
  { metal: 'GOLD', purity: '24K' },
  { metal: 'GOLD', purity: '22K' },
  { metal: 'GOLD', purity: '18K' },
  { metal: 'GOLD', purity: '14K' },
  { metal: 'SILVER', purity: '999' },
  { metal: 'SILVER', purity: '925' },
  { metal: 'PLATINUM', purity: '950' },
];

export function purityKey(r: { metal: MetalCode; purity: MetalPurity }): string {
  return `${r.metal}/${r.purity}`;
}

/** "22K Gold". */
export function rateLabel(r: { metal: MetalCode; purity: MetalPurity }): string {
  return `${r.purity} ${r.metal.charAt(0)}${r.metal.slice(1).toLowerCase()}`;
}

@Injectable({
  providedIn: 'root'
})
export class MetalRateService {
  private http = inject(HttpClient);
  private publicUrl = `${environment.apiUrl}/metal-prices`;
  private adminUrl = `${environment.apiUrl}/admin/metal-rates`;

  /** The board the storefront is selling at (locked, or live until the day's lock). */
  getToday(): Observable<MetalBoard> {
    return this.http.get<MetalBoard>(`${this.publicUrl}/today`);
  }

  getHistory(metal: MetalCode, purity: MetalPurity, days = 30): Observable<MetalRateHistoryPoint[]> {
    const params = new HttpParams().set('metal', metal).set('purity', purity).set('days', String(days));
    return this.http.get<MetalRateHistoryPoint[]>(`${this.publicUrl}/history`, { params });
  }

  /** Freshly derived from the feed, regardless of today's lock (rates.write). */
  getLive(): Observable<MetalBoard> {
    return this.http.get<MetalBoard>(`${this.adminUrl}/live`);
  }

  /** Fixes today's board; the response is the board as now published. */
  lock(body: LockRatesRequest): Observable<MetalBoard> {
    return this.http.post<MetalBoard>(`${this.adminUrl}/lock`, body);
  }

  /** Recomputes every METAL_RATE product from the current board. */
  reprice(): Observable<RepriceResult> {
    return this.http.post<RepriceResult>(`${this.adminUrl}/reprice`, {});
  }

  /** Breakdown a product would get from today's board, for the product form's preview. */
  pricePreview(body: PricePreviewRequest): Observable<PriceBreakdown> {
    return this.http.post<PriceBreakdown>(`${environment.apiUrl}/admin/products/price-preview`, body);
  }
}
