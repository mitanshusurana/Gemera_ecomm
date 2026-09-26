import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {
  AnalyticsService, Breakdown, BreakdownDimension, DateRange, Granularity, Overview, Series, StockReport, TopProducts, presetRange,
} from '../../services/analytics.service';
import { LineChartComponent, LineSeries } from '../../components/charts/line-chart.component';
import { BarChartComponent, BarDatum } from '../../components/charts/bar-chart.component';
import { PeriodPickerComponent } from '../../components/analytics/period-picker.component';
import { inr, inrCompact, num, pct } from '../../core/inr';
import { daysBetween, shortBucket, toBars } from '../dashboard/dashboard.component';

/**
 * Full analytics page (permission dashboard.read): period KPIs, series with
 * a granularity switch, a breakdown selector (category, metal, purity, item
 * type, state, payment method), best sellers by revenue or units, customers,
 * discounts, repairs and old-gold counts, the stock report and CSV exports.
 * `?dimension=` deep-links a breakdown.
 */
@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, LineChartComponent, BarChartComponent, PeriodPickerComponent],
  templateUrl: './analytics.component.html'
})
export class AnalyticsComponent implements OnInit {
  private analytics = inject(AnalyticsService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastr = inject(ToastrService);

  readonly inr = inr;
  readonly inrCompact = inrCompact;
  readonly num = num;
  readonly pct = pct;

  readonly dimensions: { key: BreakdownDimension; label: string }[] = [
    { key: 'category', label: 'Category' },
    { key: 'metal', label: 'Metal' },
    { key: 'purity', label: 'Purity' },
    { key: 'itemType', label: 'Item type' },
    { key: 'state', label: 'State (place of supply)' },
    { key: 'paymentMethod', label: 'Payment method' },
  ];

  range = signal<DateRange>(presetRange('30d'));
  compare = signal(true);
  granularity = signal<Granularity>('day');
  dimension = signal<BreakdownDimension>('category');
  topBy = signal<'revenue' | 'units'>('revenue');
  deadAfterDays = signal(90);

  overview = signal<Overview | null>(null);
  series = signal<Series | null>(null);
  breakdown = signal<Breakdown | null>(null);
  top = signal<TopProducts | null>(null);
  stock = signal<StockReport | null>(null);
  error = signal<string | null>(null);
  exporting = signal<'orders' | 'products' | null>(null);

  chartLabels = computed(() => (this.series()?.current ?? []).map(p => p.bucket));
  chartTicks = computed(() => (this.series()?.current ?? []).map(p => shortBucket(p.bucket, this.series()?.granularity ?? 'day')));
  chartSeries = computed<LineSeries[]>(() => {
    const s = this.series();
    if (!s) return [];
    const out: LineSeries[] = [
      { name: 'Revenue', values: s.current.map(p => p.revenue), axis: 'left', format: 'inr' },
      { name: 'Margin (known cost)', values: s.current.map(p => p.margin), axis: 'left', format: 'inr', color: 'var(--c3)' },
      { name: 'Orders', values: s.current.map(p => p.orders), axis: 'right', format: 'num', color: 'var(--c2)' },
    ];
    if (this.compare() && s.previous.length) {
      out.push({ name: 'Revenue, previous period', values: s.previous.map(p => p.revenue), axis: 'left', format: 'inr', dashed: true, color: 'var(--c4)' });
    }
    return out;
  });
  breakdownBars = computed<BarDatum[]>(() => toBars(this.breakdown()));
  paymentBars = computed<BarDatum[]>(() => (this.overview()?.byPaymentMethod ?? []).map(r => ({ label: r.label, value: r.revenue, orders: r.orders, share: r.share })));

  repairRows = computed(() => Object.entries(this.overview()?.repairsByStatus ?? {}).map(([k, v]) => ({ status: k.replace(/_/g, ' '), count: v })));
  exchangeRows = computed(() => Object.entries(this.overview()?.exchangeByStatus ?? {}).map(([k, v]) => ({ status: k.replace(/_/g, ' '), count: v })));
  repairTotal = computed(() => this.repairRows().reduce((a, r) => a + r.count, 0));
  exchangeTotal = computed(() => this.exchangeRows().reduce((a, r) => a + r.count, 0));

  ngOnInit() {
    const dim = this.route.snapshot.queryParamMap.get('dimension') as BreakdownDimension | null;
    if (dim && this.dimensions.some(d => d.key === dim)) this.dimension.set(dim);
    this.granularity.set(this.autoGranularity());
    this.loadAll();
    this.loadStock();
  }

  onRange(r: DateRange) {
    this.range.set(r);
    this.granularity.set(this.autoGranularity());
    this.loadAll();
  }

  onCompare(on: boolean) {
    this.compare.set(on);
  }

  setGranularity(g: Granularity) {
    this.granularity.set(g);
    this.loadSeries();
  }

  setDimension(d: BreakdownDimension) {
    this.dimension.set(d);
    this.router.navigate([], { relativeTo: this.route, queryParams: { dimension: d }, queryParamsHandling: 'merge', replaceUrl: true });
    this.loadBreakdown();
  }

  setTopBy(by: 'revenue' | 'units') {
    this.topBy.set(by);
    this.loadTop();
  }

  setDeadAfter(days: number) {
    const d = Math.max(1, Math.min(3650, Math.round(days) || 90));
    this.deadAfterDays.set(d);
    this.loadStock();
  }

  private autoGranularity(): Granularity {
    const days = daysBetween(this.range().from, this.range().to);
    return days > 180 ? 'month' : days > 62 ? 'week' : 'day';
  }

  private fail = (err: any) => {
    console.warn('Analytics unavailable', err?.status);
    this.error.set(err?.status === 404
      ? 'The analytics endpoints are not available on this server yet.'
      : (err?.error?.message || 'Could not load the analytics. Try again in a moment.'));
  };

  private loadAll() {
    this.error.set(null);
    this.analytics.overview(this.range()).subscribe({ next: o => this.overview.set(o), error: this.fail });
    this.loadSeries();
    this.loadBreakdown();
    this.loadTop();
  }

  private loadSeries() {
    this.analytics.series(this.range(), this.granularity()).subscribe({ next: s => this.series.set(s), error: this.fail });
  }

  private loadBreakdown() {
    this.breakdown.set(null);
    this.analytics.breakdown(this.dimension(), this.range()).subscribe({ next: b => this.breakdown.set(b), error: this.fail });
  }

  private loadTop() {
    this.analytics.topProducts(this.topBy(), this.range(), 20).subscribe({ next: t => this.top.set(t), error: this.fail });
  }

  private loadStock() {
    this.analytics.stock(this.deadAfterDays(), 50).subscribe({ next: s => this.stock.set(s), error: this.fail });
  }

  exportCsv(report: 'orders' | 'products') {
    if (this.exporting()) return;
    this.exporting.set(report);
    const r = this.range();
    this.analytics.exportCsv(report, r).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report}_${r.from}_${r.to}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.exporting.set(null);
      },
      error: (err) => {
        this.exporting.set(null);
        this.toastr.error(err?.error?.message || 'Could not export the report.');
      }
    });
  }

  deltaClass(delta: number | null | undefined): string {
    if (delta === null || delta === undefined) return 'text-ink/50';
    if (delta === 0) return 'text-ink/60';
    return delta > 0 ? 'text-emerald-600' : 'text-red-600';
  }

  deltaIcon(delta: number | null | undefined): string {
    if (delta === null || delta === undefined || delta === 0) return 'remove';
    return delta > 0 ? 'arrow_upward' : 'arrow_downward';
  }

  marginPct(revenue: number, margin: number | null): string {
    if (margin === null || !revenue) return '—';
    return pct(margin / revenue * 100, false);
  }
}
