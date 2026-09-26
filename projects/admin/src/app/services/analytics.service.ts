import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * GET /api/v1/admin/analytics/* (permission dashboard.read). Shapes mirror
 * backend dto/AnalyticsDtos.java. Dates are ISO calendar days, inclusive;
 * omitted, the API uses the last 30 days.
 */

export interface Period { from: string; to: string; days: number; }

/** Figure for the period, the same for the compare period, and the % change (null when previous was 0). */
export interface Metric { current: number; previous: number; deltaPercent: number | null; }

export interface BreakdownRow {
  key: string;
  label: string;
  revenue: number;
  units: number;
  orders: number;
  share: number | null;
}

export type BreakdownDimension = 'category' | 'metal' | 'purity' | 'itemType' | 'state' | 'paymentMethod';

export interface Breakdown { dimension: BreakdownDimension; period: Period; total: number; rows: BreakdownRow[]; }

export interface Overview {
  period: Period;
  comparePeriod: Period;
  revenue: Metric;
  orders: Metric;
  averageOrderValue: Metric;
  unitsSold: Metric;
  grossMargin: Metric;
  grossMarginPercent: number | null;
  revenueWithKnownCost: number;
  revenueWithUnknownCost: number;
  unknownCostSharePercent: number | null;
  couponDiscount: number;
  loyaltyDiscount: number;
  otherDiscount: number;
  giftCardRedeemed: number;
  treasureRedeemed: number;
  tax: number;
  shipping: number;
  newCustomers: number;
  returningCustomers: number;
  refundCount: number;
  refundAmount: number;
  repairsByStatus: Record<string, number>;
  exchangeByStatus: Record<string, number>;
  byPaymentMethod: BreakdownRow[];
}

export type Granularity = 'day' | 'week' | 'month';

export interface SeriesPoint { bucket: string; orders: number; revenue: number; margin: number; }

export interface Series {
  granularity: Granularity;
  period: Period;
  comparePeriod: Period;
  current: SeriesPoint[];
  previous: SeriesPoint[];
}

export interface TopProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number | null;
  units: number;
  revenue: number;
  margin: number | null;
}

export interface TopProducts { by: 'revenue' | 'units'; period: Period; rows: TopProduct[]; }

export interface StockRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number | null;
  price: number | null;
  costPrice: number | null;
  valueAtPrice: number;
  valueAtCost: number | null;
  lastSoldAt: string | null;
  createdAt: string | null;
  reorderPoint: number | null;
}

export interface StoreStock {
  storeId: string;
  storeName: string;
  skus: number;
  pieces: number;
  valueAtPrice: number;
  valueAtCost: number;
}

export interface StockReport {
  deadAfterDays: number;
  skusInStock: number;
  piecesInStock: number;
  valueAtPrice: number;
  valueAtCost: number;
  piecesWithoutCost: number;
  deadSkus: number;
  deadPieces: number;
  deadValueAtPrice: number;
  deadValueAtCost: number;
  deadStock: StockRow[];
  lowStock: StockRow[];
  stores: StoreStock[];
}

export interface DateRange { from: string; to: string; }

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/admin/analytics`;

  private params(range?: Partial<DateRange>, extra: Record<string, string | number | undefined> = {}): HttpParams {
    let p = new HttpParams();
    if (range?.from) p = p.set('from', range.from);
    if (range?.to) p = p.set('to', range.to);
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined && v !== null && v !== '') p = p.set(k, String(v));
    }
    return p;
  }

  overview(range?: Partial<DateRange>): Observable<Overview> {
    return this.http.get<Overview>(`${this.base}/overview`, { params: this.params(range) });
  }

  series(range?: Partial<DateRange>, granularity: Granularity = 'day'): Observable<Series> {
    return this.http.get<Series>(`${this.base}/series`, { params: this.params(range, { granularity }) });
  }

  breakdown(dimension: BreakdownDimension, range?: Partial<DateRange>): Observable<Breakdown> {
    return this.http.get<Breakdown>(`${this.base}/breakdown`, { params: this.params(range, { dimension }) });
  }

  topProducts(by: 'revenue' | 'units', range?: Partial<DateRange>, limit = 20): Observable<TopProducts> {
    return this.http.get<TopProducts>(`${this.base}/products/top`, { params: this.params(range, { by, limit }) });
  }

  stock(deadAfterDays = 90, limit = 50): Observable<StockReport> {
    return this.http.get<StockReport>(`${this.base}/stock`, { params: this.params(undefined, { deadAfterDays, limit }) });
  }

  /** Downloads the CSV through the authenticated client (the interceptor adds the token). */
  exportCsv(report: 'orders' | 'products', range?: Partial<DateRange>): Observable<Blob> {
    return this.http.get(`${this.base}/export`, { params: this.params(range, { report }), responseType: 'blob' });
  }
}

/** yyyy-MM-dd for a local date. */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Preset ranges for the period picker, ending today. */
export function presetRange(preset: '7d' | '30d' | '90d' | 'mtd' | 'fytd' | '12m'): DateRange {
  const today = new Date();
  const to = isoDate(today);
  const from = new Date(today);
  switch (preset) {
    case '7d': from.setDate(today.getDate() - 6); break;
    case '30d': from.setDate(today.getDate() - 29); break;
    case '90d': from.setDate(today.getDate() - 89); break;
    case 'mtd': from.setDate(1); break;
    case 'fytd': {
      // Indian financial year starts 1 April.
      const fyStartYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
      return { from: `${fyStartYear}-04-01`, to };
    }
    case '12m': from.setFullYear(today.getFullYear() - 1); from.setDate(from.getDate() + 1); break;
  }
  return { from: isoDate(from), to };
}
