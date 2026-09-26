import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MetalRateService, findRate, inr, rateLabel } from '../services/metal-rate.service';
import { SeoService } from '../services/seo.service';
import { MetalBoard, MetalCode, MetalPurity, MetalRate, MetalRateHistoryPoint } from '../core/models';

/** Purities the history chart and the calculator offer, in board order. */
const CHART_CHOICES: Array<{ metal: MetalCode; purity: MetalPurity }> = [
  { metal: 'GOLD', purity: '24K' },
  { metal: 'GOLD', purity: '22K' },
  { metal: 'GOLD', purity: '18K' },
  { metal: 'GOLD', purity: '14K' },
  { metal: 'SILVER', purity: '999' },
  { metal: 'SILVER', purity: '925' },
  { metal: 'PLATINUM', purity: '950' },
];

const CHART = { w: 640, h: 220, l: 56, r: 16, t: 16, b: 28 };

/**
 * /gold-rate: the day's rate board (INR per gram and per 10 g), when it was
 * locked, a 30-day history line, how the rate is set and a value calculator.
 * Amounts are INR straight from the API; the shopper's display currency is
 * not applied here because the board is the shop's own published rate.
 */
@Component({
  selector: 'app-gold-rate',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">

      <!-- Parchment header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-16 px-6 text-center">
        <div class="max-w-[800px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Daily rate</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl text-[#1d1d1f] tracking-tight">
            Today&rsquo;s gold rate.
          </h1>
          <p class="text-base text-[#7a7a7a] mt-4 max-w-xl mx-auto">
            The rate every metal-priced piece on Caratloop is sold at today, in rupees per gram, set once a day in Jaipur.
          </p>
          <div *ngIf="board() as b" class="mt-6 flex flex-wrap items-center justify-center gap-3 text-sm text-[#6e6e73]">
            <span class="badge" [class.!border-[#D4AF37]]="b.source === 'LOCKED'" [class.!text-[#1d1d1f]]="b.source === 'LOCKED'">
              {{ b.source === 'LOCKED' ? 'Locked for today' : 'Live, indicative' }}
            </span>
            <span *ngIf="b.source === 'LOCKED' && b.lockedAt">Locked at {{ b.lockedAt | date:'d MMM y, h:mm a' }}</span>
            <span *ngIf="b.source !== 'LOCKED'">As of {{ b.asOf | date:'d MMM y, h:mm a' }} &middot; not yet locked for the day</span>
          </div>
        </div>
      </section>

      <div class="max-w-[980px] mx-auto px-6 py-12 space-y-12">

        <!-- Loading / error -->
        <div *ngIf="loading()" class="store-utility-card p-8 text-center text-sm text-[#7a7a7a]">Loading today&rsquo;s rates&hellip;</div>
        <div *ngIf="error()" class="store-utility-card p-8 text-center text-sm text-[#7a7a7a]">
          {{ error() }}
          <button (click)="load()" class="btn-ghost text-sm !px-2 hover:underline">Try again</button>
        </div>

        <!-- Rate board -->
        <section *ngIf="board() as b" aria-labelledby="rate-board-heading">
          <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
            <h2 id="rate-board-heading" class="font-display font-semibold text-2xl tracking-tight">Rate board</h2>
            <p class="text-xs text-[#7a7a7a]">Rates as of {{ b.asOf | date:'d MMM y, h:mm a' }}</p>
          </div>
          <div class="store-utility-card !p-0 overflow-hidden">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-[11px] uppercase tracking-wider text-[#7a7a7a] border-b border-[#e0e0e0]">
                  <th scope="col" class="text-left font-medium px-5 py-3">Metal</th>
                  <th scope="col" class="text-left font-medium px-5 py-3 hidden sm:table-cell">Purity</th>
                  <th scope="col" class="text-right font-medium px-5 py-3">Per gram</th>
                  <th scope="col" class="text-right font-medium px-5 py-3">Per 10 g</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let r of b.rates" class="border-b border-[#f0f0f0] last:border-b-0">
                  <td class="px-5 py-3 font-semibold">{{ label(r) }}</td>
                  <td class="px-5 py-3 text-[#6e6e73] hidden sm:table-cell">{{ purityText(r) }}</td>
                  <td class="px-5 py-3 text-right tabular-nums">{{ fmt(r.ratePerGram) }}</td>
                  <td class="px-5 py-3 text-right tabular-nums font-semibold">{{ fmt(r.ratePerGram * 10) }}</td>
                </tr>
                <tr *ngIf="b.rates.length === 0">
                  <td colspan="4" class="px-5 py-6 text-center text-[#7a7a7a]">No rates published yet today.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-xs text-[#7a7a7a] mt-3">Inclusive of import duty and our premium; exclusive of GST and making charges, which are shown on each piece.</p>
        </section>

        <!-- 30-day history -->
        <section *ngIf="board()" aria-labelledby="history-heading">
          <div class="flex flex-wrap items-end justify-between gap-3 mb-4">
            <h2 id="history-heading" class="font-display font-semibold text-2xl tracking-tight">Last 30 days</h2>
            <div class="flex flex-wrap gap-2" role="group" aria-label="Choose a purity">
              <button *ngFor="let c of chartChoices()" type="button" (click)="selectChart(c)"
                      class="px-3 py-1.5 rounded-full border text-xs font-medium transition-colors active-press"
                      [class.border-[#1d1d1f]]="isSelected(c)" [class.bg-[#1d1d1f]]="isSelected(c)" [class.text-white]="isSelected(c)"
                      [class.border-[#e0e0e0]]="!isSelected(c)" [class.text-[#1d1d1f]]="!isSelected(c)">
                {{ c.purity }} {{ c.metal | titlecase }}
              </button>
            </div>
          </div>
          <div class="store-utility-card">
            <ng-container *ngIf="chart() as ch; else noHistory">
              <div class="flex flex-wrap items-baseline justify-between gap-2 mb-2 text-sm">
                <span class="text-[#6e6e73]">{{ selected().purity }} {{ selected().metal | titlecase }} &middot; {{ ch.points.length }} days</span>
                <span *ngIf="ch.change !== null" [class.text-[#1d1d1f]]="ch.change === 0" [class.text-emerald-700]="ch.change > 0" [class.text-red-700]="ch.change < 0">
                  {{ ch.change > 0 ? '+' : '' }}{{ fmt(ch.change) }} ({{ ch.changePct > 0 ? '+' : '' }}{{ ch.changePct | number:'1.0-1' }}%) over the period
                </span>
              </div>
              <svg [attr.viewBox]="'0 0 ' + chartW + ' ' + chartH" class="w-full h-auto" role="img" [attr.aria-label]="chartAria()">
                <line *ngFor="let t of ch.ticks" [attr.x1]="chartL" [attr.x2]="chartW - chartR" [attr.y1]="t.y" [attr.y2]="t.y" stroke="#e0e0e0" stroke-width="1"></line>
                <text *ngFor="let t of ch.ticks" [attr.x]="chartL - 8" [attr.y]="t.y + 3" text-anchor="end" font-size="10" fill="#7a7a7a">{{ t.label }}</text>
                <text *ngFor="let t of ch.xTicks" [attr.x]="t.x" [attr.y]="chartH - chartB + 16" text-anchor="middle" font-size="10" fill="#7a7a7a">{{ t.label }}</text>
                <path [attr.d]="ch.area" fill="#D4AF37" fill-opacity="0.10"></path>
                <path [attr.d]="ch.line" fill="none" stroke="#D4AF37" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>
                <circle [attr.cx]="ch.last.x" [attr.cy]="ch.last.y" r="3.5" fill="#D4AF37" stroke="#fff" stroke-width="1.5"></circle>
              </svg>
              <p class="text-xs text-[#7a7a7a] mt-2">Closing rate per gram for each day the board was set. Days without a locked rate show the live rate at the time.</p>
            </ng-container>
            <ng-template #noHistory>
              <p class="text-sm text-[#7a7a7a] text-center py-8">{{ historyLoading() ? 'Loading history…' : 'No history for this purity yet.' }}</p>
            </ng-template>
          </div>
        </section>

        <!-- Calculator and explainer -->
        <section *ngIf="board()" class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div class="store-utility-card" aria-labelledby="calc-heading">
            <h2 id="calc-heading" class="font-display font-semibold text-xl tracking-tight mb-1">Value calculator</h2>
            <p class="text-xs text-[#7a7a7a] mb-5">Metal value at today&rsquo;s rate, before making charges and GST.</p>
            <div class="grid grid-cols-2 gap-3">
              <label class="block">
                <span class="label-caps block mb-2">Purity</span>
                <select [ngModel]="calcKey()" (ngModelChange)="calcKey.set($event)" class="input-field">
                  <option *ngFor="let r of board()!.rates" [value]="keyOf(r)">{{ label(r) }}</option>
                </select>
              </label>
              <label class="block">
                <span class="label-caps block mb-2">Weight (g)</span>
                <input type="number" min="0" step="0.01" inputmode="decimal" [ngModel]="calcGrams()" (ngModelChange)="calcGrams.set($event)" class="input-field" placeholder="e.g. 8.5">
              </label>
            </div>
            <div class="mt-5 pt-5 border-t border-[#e0e0e0] flex items-baseline justify-between">
              <span class="text-sm text-[#6e6e73]">Metal value</span>
              <span class="font-display font-semibold text-2xl tabular-nums">{{ calcValue() === null ? '—' : fmt(calcValue()) }}</span>
            </div>
            <p *ngIf="calcRate() as r" class="text-xs text-[#7a7a7a] mt-2">{{ fmt(r.ratePerGram) }}/g &times; {{ calcGramsNumber() | number:'1.0-3' }} g</p>
          </div>

          <div class="store-utility-card" aria-labelledby="how-heading">
            <h2 id="how-heading" class="font-display font-semibold text-xl tracking-tight mb-1">How the rate is set</h2>
            <p class="text-xs text-[#7a7a7a] mb-5">One board a day, the same in store and online.</p>
            <ol class="space-y-4 text-sm text-[#1d1d1f]">
              <li class="flex gap-3">
                <span class="shrink-0 w-6 h-6 rounded-full bg-[#f5f5f7] border border-[#e0e0e0] text-[11px] font-semibold flex items-center justify-center">1</span>
                <span><span class="font-semibold">International spot.</span> The gold, silver and platinum spot price in US dollars per troy ounce, converted at the day&rsquo;s USD/INR rate<ng-container *ngIf="board()?.fx?.usdInr"> (today &#8377;{{ board()!.fx.usdInr | number:'1.2-2' }})</ng-container>.</span>
              </li>
              <li class="flex gap-3">
                <span class="shrink-0 w-6 h-6 rounded-full bg-[#f5f5f7] border border-[#e0e0e0] text-[11px] font-semibold flex items-center justify-center">2</span>
                <span><span class="font-semibold">Import duty.</span> Customs duty on bullion is added, as it is on every gram that reaches an Indian jeweller.</span>
              </li>
              <li class="flex gap-3">
                <span class="shrink-0 w-6 h-6 rounded-full bg-[#f5f5f7] border border-[#e0e0e0] text-[11px] font-semibold flex items-center justify-center">3</span>
                <span><span class="font-semibold">Local premium and purity.</span> A small premium covers refining and the bullion market in Jaipur; the 24K rate is then scaled by purity (22K is 91.6%, 18K is 75%).</span>
              </li>
              <li class="flex gap-3">
                <span class="shrink-0 w-6 h-6 rounded-full bg-[#f5f5f7] border border-[#e0e0e0] text-[11px] font-semibold flex items-center justify-center">4</span>
                <span><span class="font-semibold">Locked once a day.</span> We fix the board each morning and every metal-priced piece is repriced from it, so the price you see is the price you pay until the next lock. Between locks the board shows a live, indicative rate.</span>
              </li>
            </ol>
            <p class="text-xs text-[#7a7a7a] mt-5">Pieces priced from the rate show the full breakdown on their page: metal value, making charges, stones and GST. <a routerLink="/products" class="text-[#D4AF37] hover:underline">Browse the collection</a>.</p>
          </div>
        </section>
      </div>
    </div>
  `
})
export class GoldRateComponent implements OnInit {
  private metalRateService = inject(MetalRateService);
  private seoService = inject(SeoService);

  readonly chartW = CHART.w;
  readonly chartH = CHART.h;
  readonly chartL = CHART.l;
  readonly chartR = CHART.r;
  readonly chartB = CHART.b;

  board = signal<MetalBoard | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);

  selected = signal<{ metal: MetalCode; purity: MetalPurity }>({ metal: 'GOLD', purity: '22K' });
  history = signal<MetalRateHistoryPoint[]>([]);
  historyLoading = signal(false);

  calcKey = signal('GOLD/22K');
  calcGrams = signal<number | string | null>(10);

  /** Only the purities the board actually carries. */
  chartChoices = computed(() => {
    const b = this.board();
    return CHART_CHOICES.filter((c) => !!findRate(b, c.metal, c.purity));
  });

  calcRate = computed(() => {
    const [metal, purity] = this.calcKey().split('/') as [MetalCode, MetalPurity];
    return findRate(this.board(), metal, purity) ?? null;
  });

  calcGramsNumber = computed(() => {
    const g = Number(this.calcGrams());
    return isFinite(g) && g > 0 ? g : 0;
  });

  calcValue = computed(() => {
    const rate = this.calcRate();
    const g = this.calcGramsNumber();
    return rate && g > 0 ? rate.ratePerGram * g : null;
  });

  chart = computed(() => {
    const points = this.history().filter((p) => isFinite(Number(p.ratePerGram)));
    if (points.length === 0) return null;
    const values = points.map((p) => Number(p.ratePerGram));
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const span = hi - lo || Math.max(1, hi * 0.02);
    const min = lo - span * 0.15;
    const max = hi + span * 0.15;
    const innerW = CHART.w - CHART.l - CHART.r;
    const innerH = CHART.h - CHART.t - CHART.b;
    const x = (i: number) => CHART.l + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => CHART.t + innerH - ((v - min) / (max - min)) * innerH;
    const coords = values.map((v, i) => [x(i), y(v)] as const);
    const line = coords.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
    const base = CHART.t + innerH;
    const area = points.length > 1
      ? `${line} L${coords[coords.length - 1][0].toFixed(1)},${base} L${coords[0][0].toFixed(1)},${base} Z`
      : '';
    const ticks = [0, 0.5, 1].map((f) => {
      const v = min + (max - min) * f;
      return { y: y(v), label: inr(v) };
    });
    const every = Math.max(1, Math.ceil(points.length / 5));
    const xTicks: { x: number; label: string }[] = [];
    for (let i = 0; i < points.length; i += every) xTicks.push({ x: x(i), label: shortDate(points[i].date) });
    if ((points.length - 1) % every !== 0 && points.length > 1) xTicks.push({ x: x(points.length - 1), label: shortDate(points[points.length - 1].date) });
    const first = values[0];
    const last = values[values.length - 1];
    const change = points.length > 1 ? last - first : null;
    return {
      points,
      line,
      area,
      ticks,
      xTicks,
      last: { x: coords[coords.length - 1][0], y: coords[coords.length - 1][1] },
      change,
      changePct: change !== null && first > 0 ? (change / first) * 100 : 0,
    };
  });

  chartAria = computed(() => {
    const ch = this.chart();
    const s = this.selected();
    if (!ch) return 'Rate history';
    return `${s.purity} ${s.metal.toLowerCase()} rate per gram over the last ${ch.points.length} days`;
  });

  ngOnInit() {
    this.seoService.updateTags({
      title: "Today's Gold Rate in Jaipur | Caratloop",
      description: 'Live 24K, 22K and 18K gold, silver and platinum rates per gram, locked daily by Caratloop. See the 30-day trend, how the rate is set and calculate metal value by weight.',
      url: `${this.seoService.siteOrigin()}/gold-rate`,
    });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set(null);
    this.metalRateService.loadToday(true).subscribe({
      next: (board) => {
        this.board.set(board);
        this.loading.set(false);
        // Default the chart and the calculator to the first purity the board carries when 22K gold is absent.
        if (!findRate(board, 'GOLD', '22K') && board.rates.length > 0) {
          const first = board.rates[0];
          this.selected.set({ metal: first.metal, purity: first.purity });
          this.calcKey.set(this.keyOf(first));
        }
        this.loadHistory();
      },
      error: () => {
        this.loading.set(false);
        this.error.set('The rate board is not available right now.');
      }
    });
  }

  selectChart(c: { metal: MetalCode; purity: MetalPurity }) {
    if (this.isSelected(c)) return;
    this.selected.set(c);
    this.loadHistory();
  }

  isSelected(c: { metal: MetalCode; purity: MetalPurity }): boolean {
    const s = this.selected();
    return s.metal === c.metal && s.purity === c.purity;
  }

  private loadHistory() {
    const s = this.selected();
    this.historyLoading.set(true);
    this.history.set([]);
    this.metalRateService.getHistory(s.metal, s.purity, 30).subscribe({
      next: (points) => {
        // Only the request for the purity still selected may fill the chart.
        if (this.isSelected(s)) {
          this.history.set([...(points ?? [])].sort((a, b) => a.date.localeCompare(b.date)));
          this.historyLoading.set(false);
        }
      },
      error: () => {
        if (this.isSelected(s)) this.historyLoading.set(false);
      }
    });
  }

  keyOf(r: MetalRate): string {
    return `${r.metal}/${r.purity}`;
  }

  label(r: MetalRate): string {
    return rateLabel(r);
  }

  purityText(r: MetalRate): string {
    const pct = isFinite(Number(r.purityFraction)) ? `${(Number(r.purityFraction) * 100).toFixed(1).replace(/\.0$/, '')}% fine` : '';
    return pct;
  }

  fmt(value: number | null | undefined): string {
    return inr(value);
  }
}

/** "2026-09-26" -> "26 Sep". A date-only string parses as UTC midnight, so format in UTC to keep the day. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
