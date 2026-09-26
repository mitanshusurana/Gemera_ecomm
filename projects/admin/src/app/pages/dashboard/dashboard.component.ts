import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { OrderService } from '../../services/order.service';
import { ProductService } from '../../services/product.service';
import { environment } from '../../../environments/environment';
import {
  AnalyticsService, Breakdown, DateRange, Overview, Series, StockReport, TopProducts, presetRange,
} from '../../services/analytics.service';
import { LineChartComponent, LineSeries } from '../../components/charts/line-chart.component';
import { BarChartComponent, BarDatum } from '../../components/charts/bar-chart.component';
import { PeriodPickerComponent } from '../../components/analytics/period-picker.component';
import { inr, inrCompact, num, pct } from '../../core/inr';

/**
 * Admin home: period KPIs with deltas against the previous period, revenue
 * and orders over time, sales by category and metal, best sellers, dead and
 * low stock, plus the catalogue-health and recent-orders cards that were
 * already here. Figures come from /admin/analytics/* (AnalyticsService).
 */
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, LineChartComponent, BarChartComponent, PeriodPickerComponent],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  private orderService = inject(OrderService);
  private productService = inject(ProductService);
  private analytics = inject(AnalyticsService);
  private http = inject(HttpClient);

  readonly inr = inr;
  readonly inrCompact = inrCompact;
  readonly num = num;
  readonly pct = pct;

  range = signal<DateRange>(presetRange('30d'));
  compare = signal(true);

  overview = signal<Overview | null>(null);
  series = signal<Series | null>(null);
  byCategory = signal<Breakdown | null>(null);
  byMetal = signal<Breakdown | null>(null);
  top = signal<TopProducts | null>(null);
  stock = signal<StockReport | null>(null);
  analyticsError = signal<string | null>(null);
  loadingAnalytics = signal(true);

  recentOrders: any[] = [];
  stats: any = null;
  loading = true;

  /**
   * OPERATIONS-CONTRACT §5: products at or below their reorder point from
   * GET /admin/inventory/low-stock. `null` until loaded or when the endpoint
   * is unavailable, in which case the card shows a dash rather than 0.
   */
  lowStock: any[] | null = null;
  lowStockFailed = false;

  get lowStockCount(): number | null {
    return this.lowStock ? this.lowStock.length : null;
  }

  /**
   * FINISH-CONTRACT §1: products failing their item-type rules, from
   * GET /admin/inventory/incomplete. `null` until loaded; the card is hidden
   * entirely when the endpoint is unavailable (e.g. backend not yet deployed).
   */
  incompleteCount: number | null = null;
  incompleteFailed = false;

  // ---- chart inputs -------------------------------------------------------

  chartLabels = computed(() => (this.series()?.current ?? []).map(p => p.bucket));
  chartTicks = computed(() => (this.series()?.current ?? []).map(p => shortBucket(p.bucket, this.series()?.granularity ?? 'day')));
  chartSeries = computed<LineSeries[]>(() => {
    const s = this.series();
    if (!s) return [];
    const out: LineSeries[] = [
      { name: 'Revenue', values: s.current.map(p => p.revenue), axis: 'left', format: 'inr' },
      { name: 'Orders', values: s.current.map(p => p.orders), axis: 'right', format: 'num', color: 'var(--c2)' },
    ];
    if (this.compare() && s.previous.length) {
      out.push({ name: 'Revenue, previous period', values: s.previous.map(p => p.revenue), axis: 'left', format: 'inr', dashed: true, color: 'var(--c4)' });
    }
    return out;
  });

  categoryBars = computed<BarDatum[]>(() => toBars(this.byCategory()));
  metalBars = computed<BarDatum[]>(() => toBars(this.byMetal()));

  ngOnInit() {
    this.loadAnalytics();

    this.productService.getIncomplete(0, 1).subscribe({
      next: (data: any) => {
        const total = typeof data?.totalElements === 'number' ? data.totalElements
          : Array.isArray(data) ? data.length
          : Array.isArray(data?.content) ? data.content.length
          : null;
        if (total === null) {
          this.incompleteFailed = true;
        } else {
          this.incompleteCount = total;
        }
      },
      error: (err) => {
        console.warn('Incomplete-products count unavailable', err?.status);
        this.incompleteFailed = true;
      }
    });

    this.productService.getLowStock().subscribe({
      next: (data: any) => {
        const rows = Array.isArray(data) ? data : (data?.content ?? data?.items ?? []);
        this.lowStock = Array.isArray(rows) ? rows : [];
      },
      error: (err) => {
        console.warn('Low-stock list unavailable', err?.status);
        this.lowStockFailed = true;
      }
    });

    this.orderService.getOrders().subscribe({
      next: (data) => {
        this.recentOrders = data.content ? data.content.slice(0, 4) : [];
      },
      error: (err) => {
        console.error('Failed to load orders', err);
      }
    });

    this.http.get(`${environment.apiUrl}/admin/analytics/kpis`).subscribe({
      next: (data) => {
        this.stats = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load stats', err);
        this.loading = false;
      }
    });
  }

  onRange(r: DateRange) {
    this.range.set(r);
    this.loadAnalytics();
  }

  onCompare(on: boolean) {
    this.compare.set(on);
  }

  private loadAnalytics() {
    const r = this.range();
    this.loadingAnalytics.set(true);
    this.analyticsError.set(null);
    const fail = (err: any) => {
      console.warn('Analytics unavailable', err?.status);
      this.analyticsError.set(err?.status === 404
        ? 'The analytics endpoints are not available on this server yet.'
        : 'Could not load the analytics. Try again in a moment.');
      this.loadingAnalytics.set(false);
    };
    this.analytics.overview(r).subscribe({ next: o => { this.overview.set(o); this.loadingAnalytics.set(false); }, error: fail });
    const days = daysBetween(r.from, r.to);
    this.analytics.series(r, days > 180 ? 'month' : days > 62 ? 'week' : 'day').subscribe({ next: s => this.series.set(s), error: () => this.series.set(null) });
    this.analytics.breakdown('category', r).subscribe({ next: b => this.byCategory.set(b), error: () => this.byCategory.set(null) });
    this.analytics.breakdown('metal', r).subscribe({ next: b => this.byMetal.set(b), error: () => this.byMetal.set(null) });
    this.analytics.topProducts('revenue', r, 10).subscribe({ next: t => this.top.set(t), error: () => this.top.set(null) });
    if (!this.stock()) {
      this.analytics.stock(90, 8).subscribe({ next: s => this.stock.set(s), error: () => this.stock.set(null) });
    }
  }

  /** Tailwind classes for a delta badge: green up, red down, muted when no comparison. */
  deltaClass(delta: number | null | undefined, invert = false): string {
    if (delta === null || delta === undefined) return 'text-ink/50';
    const good = invert ? delta < 0 : delta > 0;
    if (delta === 0) return 'text-ink/60';
    return good ? 'text-emerald-600' : 'text-red-600';
  }

  deltaIcon(delta: number | null | undefined): string {
    if (delta === null || delta === undefined || delta === 0) return 'remove';
    return delta > 0 ? 'arrow_upward' : 'arrow_downward';
  }

  triggerBackup() {
    if (confirm('Are you sure you want to trigger a database backup?')) {
      this.http.post(`${environment.apiUrl}/admin/backup/trigger`, {}).subscribe({
        next: (res: any) => {
          alert(`Backup successful: ${res.message}`);
        },
        error: (err) => {
          alert(`Backup failed: ${err.error?.message || err.message}`);
        }
      });
    }
  }
}

export function toBars(b: Breakdown | null): BarDatum[] {
  return (b?.rows ?? []).map(r => ({ label: r.label, value: r.revenue, units: r.units, orders: r.orders, share: r.share }));
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00');
  const b = new Date(to + 'T00:00:00');
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Sep" for a day or week bucket, "Sep 26" for a month bucket. */
export function shortBucket(bucket: string, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'month') {
    const [y, m] = bucket.split('-');
    return `${MONTHS[Number(m) - 1] ?? m} ${y?.slice(2) ?? ''}`;
  }
  const [, m, d] = bucket.split('-');
  return `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}`;
}
