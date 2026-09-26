import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { inr, inrCompact, num, pct } from '../../core/inr';

export interface BarDatum {
  label: string;
  value: number;
  /** Optional secondary figure shown in the tooltip (e.g. units). */
  units?: number;
  orders?: number;
  /** Share of the total in %, shown in the tooltip. */
  share?: number | null;
}

/**
 * Hand-written inline SVG horizontal bar chart: one bar per row, value labels
 * at the bar end, a value axis with gridlines and a hover tooltip. Rows beyond
 * `max` are folded into an "Others" bar so the chart never overflows.
 */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="m-0 relative" [attr.aria-label]="ariaLabel()">
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height()" class="w-full h-auto select-none" role="img"
           (mouseleave)="hover.set(null)">
        <g *ngFor="let t of ticks()">
          <line [attr.x1]="t.x" [attr.x2]="t.x" [attr.y1]="pad.t" [attr.y2]="height() - pad.b" class="grid"></line>
          <text [attr.x]="t.x" [attr.y]="height() - pad.b + 12" text-anchor="middle" class="axis">{{ t.label }}</text>
        </g>
        <g *ngFor="let b of bars(); let i = index" (mouseenter)="hover.set(i)" (touchstart)="hover.set(i)" class="bar-group">
          <rect [attr.x]="pad.l - labelW" [attr.y]="b.y - 2" [attr.width]="width" [attr.height]="barH + 4" fill="transparent"></rect>
          <text [attr.x]="pad.l - 8" [attr.y]="b.y + barH / 2 + 3.5" text-anchor="end" class="label">{{ b.short }}</text>
          <rect [attr.x]="pad.l" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="barH" rx="3"
                [attr.fill]="b.color" [attr.fill-opacity]="hover() === null || hover() === i ? 1 : 0.45"></rect>
          <text [attr.x]="pad.l + b.w + 6" [attr.y]="b.y + barH / 2 + 3.5" class="value">{{ b.valueText }}</text>
        </g>
        <text *ngIf="bars().length === 0" [attr.x]="width / 2" [attr.y]="height() / 2" text-anchor="middle" class="axis">No sales in this period</text>
      </svg>
      <div *ngIf="hover() !== null && bars()[hover()!] as b" class="tooltip" [style.top.%]="tooltipTop()" role="status">
        <div class="tooltip-title">{{ b.label }}</div>
        <div class="tooltip-row"><span>{{ valueName() }}</span><span>{{ b.valueText }}</span></div>
        <div class="tooltip-row" *ngIf="b.share !== null && b.share !== undefined"><span>Share</span><span>{{ shareText(b.share) }}</span></div>
        <div class="tooltip-row" *ngIf="b.units"><span>Units</span><span>{{ numText(b.units) }}</span></div>
        <div class="tooltip-row" *ngIf="b.orders"><span>Orders</span><span>{{ numText(b.orders) }}</span></div>
      </div>
    </figure>
  `,
  styles: [`
    :host { display: block; --bar: #115e59; --bar-other: #9ca3af; --grid: rgba(28,35,49,0.08); --axis: rgba(28,35,49,0.6); --ink: #1C2331; }
    @media (prefers-color-scheme: dark) { :host { --bar: #2dd4bf; --grid: rgba(255,255,255,0.12); --axis: rgba(255,255,255,0.65); --ink: #f5f5f7; } }
    svg { display: block; overflow: visible; }
    .grid { stroke: var(--grid); stroke-width: 1; }
    .axis { fill: var(--axis); font-size: 10px; }
    .label { fill: var(--ink); font-size: 11px; }
    .value { fill: var(--axis); font-size: 10px; font-variant-numeric: tabular-nums; }
    .bar-group { cursor: default; }
    .tooltip { position: absolute; right: 8px; background: #1C2331; color: #fff; border-radius: 8px; padding: 8px 10px; font-size: 12px; pointer-events: none; min-width: 160px; z-index: 5; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .tooltip-title { font-weight: 600; margin-bottom: 4px; }
    .tooltip-row { display: flex; justify-content: space-between; gap: 12px; line-height: 1.5; }
    .tooltip-row span:last-child { font-variant-numeric: tabular-nums; font-weight: 600; }
  `]
})
export class BarChartComponent {
  data = input<BarDatum[]>([]);
  /** Rows shown before folding the rest into "Others". */
  max = input<number>(8);
  format = input<'inr' | 'num'>('inr');
  valueName = input<string>('Revenue');
  ariaLabel = input<string>('Bar chart');

  readonly width = 720;
  readonly pad = { l: 150, r: 70, t: 6, b: 18 };
  readonly barH = 18;
  readonly gap = 8;
  readonly labelW = 150;

  hover = signal<number | null>(null);

  rows = computed(() => {
    const all = this.data().filter(d => d.value > 0);
    const keep = all.slice(0, this.max());
    const rest = all.slice(this.max());
    if (rest.length > 0) {
      keep.push({
        label: `Others (${rest.length})`,
        value: rest.reduce((a, d) => a + d.value, 0),
        units: rest.reduce((a, d) => a + (d.units ?? 0), 0),
        orders: rest.reduce((a, d) => a + (d.orders ?? 0), 0),
        share: rest.every(d => d.share === null || d.share === undefined) ? null : rest.reduce((a, d) => a + (d.share ?? 0), 0),
      });
    }
    return keep;
  });

  height = computed(() => this.pad.t + this.pad.b + Math.max(1, this.rows().length) * (this.barH + this.gap));

  private maxValue = computed(() => Math.max(0, ...this.rows().map(r => r.value)));

  bars = computed(() => {
    const maxV = this.maxValue();
    const inner = this.width - this.pad.l - this.pad.r;
    return this.rows().map((r, i) => ({
      ...r,
      short: r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label,
      y: this.pad.t + i * (this.barH + this.gap),
      w: maxV === 0 ? 0 : Math.max(1, (r.value / maxV) * inner),
      color: r.label.startsWith('Others (') ? 'var(--bar-other)' : 'var(--bar)',
      valueText: this.format() === 'num' ? num(r.value) : inrCompact(r.value),
    }));
  });

  ticks = computed(() => {
    const maxV = this.maxValue();
    const inner = this.width - this.pad.l - this.pad.r;
    if (maxV === 0) return [];
    return [0, 0.5, 1].map(f => ({
      x: this.pad.l + f * inner,
      label: this.format() === 'num' ? num(Math.round(maxV * f)) : inrCompact(maxV * f),
    }));
  });

  tooltipTop(): number {
    const i = this.hover();
    if (i === null) return 0;
    const svgH = this.height();
    // Position roughly beside the hovered bar as a % of the rendered height.
    return Math.max(0, (this.pad.t + i * (this.barH + this.gap)) / svgH * 100);
  }

  shareText(v: number | null | undefined) { return pct(v, false); }
  numText(v: number) { return num(v); }
  inrText(v: number) { return inr(v); }
}
