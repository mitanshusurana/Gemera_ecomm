import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { MetalBoard, MetalCode, MetalPurity, MetalRate, MetalRateHistoryPoint } from '../core/models';

/**
 * Public metal-rate endpoints. The board is INR per gram already; nothing
 * here converts currency. `today` is cached so the header ticker and the
 * /gold-rate page share one request per load; `loadToday(true)` refreshes.
 */
@Injectable({
  providedIn: 'root'
})
export class MetalRateService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/metal-prices`;

  /** Last board fetched in this session (null until the first response). */
  readonly today = signal<MetalBoard | null>(null);

  loadToday(force = false): Observable<MetalBoard> {
    const cached = this.today();
    if (cached && !force) return of(cached);
    return this.http.get<MetalBoard>(`${this.baseUrl}/today`).pipe(tap((board) => this.today.set(board)));
  }

  getHistory(metal: MetalCode, purity: MetalPurity, days = 30): Observable<MetalRateHistoryPoint[]> {
    const params = new HttpParams().set('metal', metal).set('purity', purity).set('days', String(days));
    return this.http.get<MetalRateHistoryPoint[]>(`${this.baseUrl}/history`, { params });
  }
}

/** The board line for a metal and purity, if the API returned one. */
export function findRate(board: MetalBoard | null | undefined, metal: MetalCode, purity: MetalPurity): MetalRate | undefined {
  return board?.rates?.find((r) => r.metal === metal && r.purity === purity);
}

/** "22K Gold", "999 Silver", "950 Platinum". */
export function rateLabel(rate: Pick<MetalRate, 'metal' | 'purity'>): string {
  const metal = rate.metal.charAt(0) + rate.metal.slice(1).toLowerCase();
  return `${rate.purity} ${metal}`;
}

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ₹7,245 with Indian grouping and no paise; the API already speaks INR. */
export function inr(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(value)) return '—';
  return '₹' + INR.format(Math.round(value));
}
