import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DateRange, presetRange } from '../../services/analytics.service';

type Preset = '7d' | '30d' | '90d' | 'mtd' | 'fytd' | '12m' | 'custom';

/**
 * Period chips (7 / 30 / 90 days, month to date, FY to date, 12 months) plus a
 * custom from/to pair and a "compare with previous period" toggle. Emits the
 * inclusive ISO range whenever it changes.
 */
@Component({
  selector: 'app-period-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <div class="inline-flex flex-wrap rounded-lg border border-ink/20 bg-surface p-0.5" role="group" aria-label="Period">
        <button *ngFor="let p of presets" type="button" (click)="choose(p.key)"
                class="px-3 py-1.5 text-xs font-semibold rounded-md transition-colors"
                [class.bg-primary]="preset() === p.key" [class.text-white]="preset() === p.key"
                [class.text-ink]="preset() !== p.key" [attr.aria-pressed]="preset() === p.key">{{ p.label }}</button>
      </div>
      <div class="inline-flex items-center gap-1 text-xs text-ink">
        <label class="sr-only" for="pp-from">From</label>
        <input id="pp-from" type="date" [ngModel]="from()" (ngModelChange)="setCustom($event, to())" [max]="to()"
               class="rounded-md border-gray-300 text-xs py-1 px-2 text-ink bg-surface">
        <span aria-hidden="true">–</span>
        <label class="sr-only" for="pp-to">To</label>
        <input id="pp-to" type="date" [ngModel]="to()" (ngModelChange)="setCustom(from(), $event)" [min]="from()"
               class="rounded-md border-gray-300 text-xs py-1 px-2 text-ink bg-surface">
      </div>
      <label *ngIf="showCompare()" class="inline-flex items-center gap-1.5 text-xs text-ink cursor-pointer select-none">
        <input type="checkbox" [ngModel]="compare()" (ngModelChange)="compare.set($event); compareChange.emit($event)"
               class="h-3.5 w-3.5 rounded border-ink/40 text-primary focus:ring-primary">
        Compare with previous period
      </label>
    </div>
  `
})
export class PeriodPickerComponent {
  initialPreset = input<Exclude<Preset, 'custom'>>('30d');
  showCompare = input<boolean>(true);
  rangeChange = output<DateRange>();
  compareChange = output<boolean>();

  readonly presets: { key: Exclude<Preset, 'custom'>; label: string }[] = [
    { key: '7d', label: '7 days' },
    { key: '30d', label: '30 days' },
    { key: '90d', label: '90 days' },
    { key: 'mtd', label: 'This month' },
    { key: 'fytd', label: 'FY to date' },
    { key: '12m', label: '12 months' },
  ];

  preset = signal<Preset>('30d');
  from = signal<string>('');
  to = signal<string>('');
  compare = signal<boolean>(true);

  ngOnInit() {
    this.choose(this.initialPreset(), false);
  }

  choose(key: Exclude<Preset, 'custom'>, emit = true) {
    const r = presetRange(key);
    this.preset.set(key);
    this.from.set(r.from);
    this.to.set(r.to);
    if (emit) this.rangeChange.emit(r);
  }

  setCustom(from: string, to: string) {
    if (!from || !to) return;
    this.preset.set('custom');
    this.from.set(from);
    this.to.set(to);
    if (from <= to) this.rangeChange.emit({ from, to });
  }

  current(): DateRange {
    return { from: this.from(), to: this.to() };
  }
}
