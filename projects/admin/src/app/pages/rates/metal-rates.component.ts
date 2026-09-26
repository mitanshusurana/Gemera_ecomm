import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ToastrService } from 'ngx-toastr';
import { LineChartComponent, LineSeries } from '../../components/charts/line-chart.component';
import {
  BOARD_PURITIES,
  METAL_RATE_PROVIDERS,
  METAL_RATE_SETTING_KEYS,
  MetalBoard,
  MetalCode,
  MetalPurity,
  MetalRate,
  MetalRateService,
  MetalRateSettingKey,
  RepriceResult,
  purityKey,
  rateLabel,
} from '../../services/metal-rate.service';
import { SettingService } from '../../services/setting.service';
import { apiErrorMessage } from '../../services/stock.service';

/** One line of the board table: what the shop sells at, what the feed says now, and the operator's edit. */
export interface BoardRow {
  key: string;
  metal: MetalCode;
  purity: MetalPurity;
  label: string;
  purityFraction: number | null;
  /** Today's published rate (locked, or live-indicative until locked). */
  today: number | null;
  live: number | null;
  /** live - today, null when either side is missing. */
  diff: number | null;
  diffPct: number | null;
}

/**
 * /rates (rates.write): today's board beside the live feed, editable rates
 * per purity, lock and reprice actions, the feed details, a 30-day history
 * chart and the four provider settings. Settings live here only, not on the
 * Settings page.
 */
@Component({
  selector: 'app-metal-rates',
  standalone: true,
  imports: [CommonModule, FormsModule, LineChartComponent],
  templateUrl: './metal-rates.component.html'
})
export class MetalRatesComponent implements OnInit {
  private metalRateService = inject(MetalRateService);
  private settingService = inject(SettingService);
  private toastr = inject(ToastrService);

  readonly providers = METAL_RATE_PROVIDERS;
  readonly chartChoices = BOARD_PURITIES;

  today: MetalBoard | null = null;
  live: MetalBoard | null = null;
  loading = true;
  boardError: string | null = null;
  liveError: string | null = null;

  rows: BoardRow[] = [];
  /** Operator's per-purity rate inputs, keyed by "GOLD/22K"; prefilled from live, else today. */
  edits: Record<string, number | null> = {};
  lockNote = '';
  locking = false;

  repricing = false;
  repriceResult: RepriceResult | null = null;

  // History chart
  selectedKey = 'GOLD/22K';
  historyLoading = false;
  chartLabels: string[] = [];
  chartTicks: string[] = [];
  chartSeries: LineSeries[] = [];
  historyEmpty = false;

  // Settings
  settings: Record<MetalRateSettingKey, string> = {
    metalRateProvider: 'GOLD_API_FREE',
    metalRateDutyPct: '6',
    metalRatePremiumPct: '0',
    metalRateAutoLockHour: '10',
  };
  settingsLoaded = false;
  savingSettings = false;

  ngOnInit() {
    this.loadBoards();
    this.loadHistory();
    this.loadSettings();
  }

  // ---------------------------------------------------------------------
  // Boards
  // ---------------------------------------------------------------------

  loadBoards() {
    this.loading = true;
    this.boardError = null;
    this.liveError = null;
    forkJoin({
      today: this.metalRateService.getToday().pipe(catchError((err) => {
        this.boardError = apiErrorMessage(err, "Could not load today's board.");
        return of(null);
      })),
      live: this.metalRateService.getLive().pipe(catchError((err) => {
        this.liveError = apiErrorMessage(err, 'The live feed is not available right now.');
        return of(null);
      })),
    }).subscribe(({ today, live }) => {
      this.today = today;
      this.live = live;
      this.buildRows(true);
      this.loading = false;
    });
  }

  /** Rebuilds the table; `resetEdits` refills the inputs from the live board (else today's). */
  private buildRows(resetEdits: boolean) {
    const todayBy = new Map<string, MetalRate>((this.today?.rates ?? []).map((r) => [purityKey(r), r]));
    const liveBy = new Map<string, MetalRate>((this.live?.rates ?? []).map((r) => [purityKey(r), r]));
    const keys = BOARD_PURITIES.filter((p) => todayBy.has(purityKey(p)) || liveBy.has(purityKey(p)));
    // Purities the API returns that this page does not list yet still get a row.
    for (const r of [...todayBy.values(), ...liveBy.values()]) {
      if (!keys.some((k) => purityKey(k) === purityKey(r))) keys.push({ metal: r.metal, purity: r.purity });
    }
    this.rows = keys.map((p) => {
      const key = purityKey(p);
      const t = todayBy.get(key);
      const l = liveBy.get(key);
      const today = t ? Number(t.ratePerGram) : null;
      const live = l ? Number(l.ratePerGram) : null;
      const diff = today !== null && live !== null ? live - today : null;
      return {
        key,
        metal: p.metal,
        purity: p.purity,
        label: rateLabel(p),
        purityFraction: t?.purityFraction ?? l?.purityFraction ?? null,
        today,
        live,
        diff,
        diffPct: diff !== null && today ? (diff / today) * 100 : null,
      };
    });
    if (resetEdits) {
      this.edits = {};
      for (const row of this.rows) {
        const source = row.live ?? row.today;
        this.edits[row.key] = source !== null ? Math.round(source * 100) / 100 : null;
      }
    }
  }

  get isLocked(): boolean {
    return this.today?.source === 'LOCKED';
  }

  /** Copy one side of the table into the inputs. */
  fillFrom(side: 'today' | 'live') {
    for (const row of this.rows) {
      const v = side === 'live' ? row.live : row.today;
      if (v !== null) this.edits[row.key] = Math.round(v * 100) / 100;
    }
  }

  get lockableRates(): Array<{ metal: MetalCode; purity: MetalPurity; ratePerGram: number }> {
    return this.rows
      .map((row) => ({ metal: row.metal, purity: row.purity, ratePerGram: Number(this.edits[row.key]) }))
      .filter((r) => isFinite(r.ratePerGram) && r.ratePerGram > 0);
  }

  lock() {
    const rates = this.lockableRates;
    if (rates.length === 0) {
      this.toastr.error('Enter at least one rate per gram before locking.');
      return;
    }
    if (!confirm(`Lock ${rates.length} rate${rates.length === 1 ? '' : 's'} for today? Every metal-priced product will sell at these rates until the next lock.`)) return;
    this.locking = true;
    this.metalRateService.lock({ rates, note: this.lockNote.trim() || undefined }).subscribe({
      next: (board) => {
        this.today = board;
        this.buildRows(false);
        this.locking = false;
        this.lockNote = '';
        this.toastr.success("Today's rates are locked.");
        this.loadHistory();
      },
      error: (err) => {
        this.locking = false;
        this.toastr.error(apiErrorMessage(err, 'Could not lock the rates.'));
      }
    });
  }

  reprice() {
    if (!this.today) return;
    if (!this.isLocked && !confirm("Today's board is not locked yet; products will be repriced from the live, indicative rate. Continue?")) return;
    this.repricing = true;
    this.repriceResult = null;
    this.metalRateService.reprice().subscribe({
      next: (result) => {
        this.repriceResult = result;
        this.repricing = false;
        this.toastr.success(`${result.repriced} product${result.repriced === 1 ? '' : 's'} repriced`);
      },
      error: (err) => {
        this.repricing = false;
        this.toastr.error(apiErrorMessage(err, 'Could not reprice the products.'));
      }
    });
  }

  // ---------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------

  selectChart(key: string) {
    if (key === this.selectedKey) return;
    this.selectedKey = key;
    this.loadHistory();
  }

  chartKey(p: { metal: MetalCode; purity: MetalPurity }): string {
    return purityKey(p);
  }

  chartLabel(p: { metal: MetalCode; purity: MetalPurity }): string {
    return rateLabel(p);
  }

  get selectedLabel(): string {
    const [metal, purity] = this.selectedKey.split('/') as [MetalCode, MetalPurity];
    return rateLabel({ metal, purity });
  }

  loadHistory() {
    const key = this.selectedKey;
    const [metal, purity] = key.split('/') as [MetalCode, MetalPurity];
    this.historyLoading = true;
    this.historyEmpty = false;
    this.metalRateService.getHistory(metal, purity, 30).subscribe({
      next: (points) => {
        if (key !== this.selectedKey) return;
        const sorted = [...(points ?? [])].sort((a, b) => a.date.localeCompare(b.date));
        this.chartLabels = sorted.map((p) => longDate(p.date));
        this.chartTicks = sorted.map((p) => shortDate(p.date));
        this.chartSeries = sorted.length
          ? [{ name: `${rateLabel({ metal, purity })} per gram`, values: sorted.map((p) => Number(p.ratePerGram) || 0), axis: 'left', format: 'inr', color: 'var(--c2)' }]
          : [];
        this.historyEmpty = sorted.length === 0;
        this.historyLoading = false;
      },
      error: () => {
        if (key !== this.selectedKey) return;
        this.chartLabels = [];
        this.chartTicks = [];
        this.chartSeries = [];
        this.historyEmpty = true;
        this.historyLoading = false;
      }
    });
  }

  // ---------------------------------------------------------------------
  // Settings (the four metalRate* keys live on this page only)
  // ---------------------------------------------------------------------

  loadSettings() {
    this.settingService.getSettings().subscribe({
      next: (all) => {
        if (all) {
          for (const key of METAL_RATE_SETTING_KEYS) {
            if (all[key] !== undefined && all[key] !== null) this.settings[key] = String(all[key]);
          }
        }
        this.settingsLoaded = true;
      },
      error: () => {
        this.settingsLoaded = true;
      }
    });
  }

  get settingsProblem(): string | null {
    const duty = Number(this.settings.metalRateDutyPct);
    const premium = Number(this.settings.metalRatePremiumPct);
    const hour = this.settings.metalRateAutoLockHour.trim();
    if (this.settings.metalRateDutyPct.trim() === '' || !isFinite(duty) || duty < 0 || duty > 100) return 'Duty must be a percentage between 0 and 100.';
    if (this.settings.metalRatePremiumPct.trim() === '' || !isFinite(premium) || premium < -100 || premium > 100) return 'Premium must be a percentage between -100 and 100.';
    if (hour !== '' && !/^([01]?\d|2[0-3])$/.test(hour)) return 'Auto-lock hour must be 0-23, or blank for manual locking.';
    return null;
  }

  saveSettings() {
    if (this.settingsProblem) {
      this.toastr.error(this.settingsProblem);
      return;
    }
    this.savingSettings = true;
    const payload: Record<string, string> = {
      metalRateProvider: this.settings.metalRateProvider,
      metalRateDutyPct: String(Number(this.settings.metalRateDutyPct)),
      metalRatePremiumPct: String(Number(this.settings.metalRatePremiumPct)),
      metalRateAutoLockHour: this.settings.metalRateAutoLockHour.trim(),
    };
    this.settingService.updateSettings(payload).subscribe({
      next: () => {
        this.savingSettings = false;
        this.toastr.success('Rate settings saved. The live board now uses them.');
        this.loadBoards();
      },
      error: (err) => {
        this.savingSettings = false;
        this.toastr.error(apiErrorMessage(err, 'Could not save the rate settings.'));
      }
    });
  }
}

// History dates are date-only strings, which parse as UTC midnight; format in UTC to keep the day.
function shortDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function longDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
