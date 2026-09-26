import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { inr, inrCompact, num } from '../../core/inr';

/** One line on the chart. `axis: 'right'` plots against the secondary scale (counts next to money). */
export interface LineSeries {
  name: string;
  values: number[];
  /** Colour token from the palette below; defaults by index. */
  color?: string;
  axis?: 'left' | 'right';
  format?: 'inr' | 'num';
  dashed?: boolean;
}

/**
 * Hand-written inline SVG line chart (no chart library) for the admin
 * dashboard: several series, a left money axis and an optional right count
 * axis, gridlines, axis labels, a legend and a hover tooltip driven by a
 * single invisible hit area. Colours come from CSS custom properties defined
 * on the host so the same palette works on light and dark canvases.
 */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="m-0" [attr.aria-label]="ariaLabel()">
      <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" class="w-full h-auto select-none" role="img" preserveAspectRatio="none"
           (mouseleave)="hover.set(null)" (mousemove)="onMove($event)" (touchmove)="onTouch($event)" (touchend)="hover.set(null)">
        <!-- gridlines and left axis labels -->
        <g *ngFor="let t of leftTicks()">
          <line [attr.x1]="pad.l" [attr.x2]="width - pad.r" [attr.y1]="t.y" [attr.y2]="t.y" class="grid"></line>
          <text [attr.x]="pad.l - 6" [attr.y]="t.y + 3" text-anchor="end" class="axis">{{ t.label }}</text>
        </g>
        <!-- right axis labels -->
        <g *ngFor="let t of rightTicks()">
          <text [attr.x]="width - pad.r + 6" [attr.y]="t.y + 3" text-anchor="start" class="axis">{{ t.label }}</text>
        </g>
        <!-- x axis labels -->
        <g *ngFor="let t of xTicks()">
          <text [attr.x]="t.x" [attr.y]="height - pad.b + 14" text-anchor="middle" class="axis">{{ t.label }}</text>
        </g>
        <line [attr.x1]="pad.l" [attr.x2]="width - pad.r" [attr.y1]="height - pad.b" [attr.y2]="height - pad.b" class="baseline"></line>

        <!-- series -->
        <g *ngFor="let s of paths()">
          <path [attr.d]="s.area" [attr.fill]="s.color" fill-opacity="0.08" *ngIf="!s.dashed"></path>
          <path [attr.d]="s.line" fill="none" [attr.stroke]="s.color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"
                [attr.stroke-dasharray]="s.dashed ? '4 4' : null"></path>
        </g>

        <!-- hover -->
        <g *ngIf="hover() as h">
          <line [attr.x1]="h.x" [attr.x2]="h.x" [attr.y1]="pad.t" [attr.y2]="height - pad.b" class="cursor"></line>
          <circle *ngFor="let p of h.points" [attr.cx]="h.x" [attr.cy]="p.y" r="3.5" [attr.fill]="p.color" class="dot"></circle>
        </g>
        <rect [attr.x]="pad.l" [attr.y]="pad.t" [attr.width]="width - pad.l - pad.r" [attr.height]="height - pad.t - pad.b" fill="transparent"></rect>
      </svg>

      <div *ngIf="hover() as h" class="tooltip" [style.left.%]="h.x / width * 100" [class.flip]="h.x > width * 0.65" role="status">
        <div class="tooltip-title">{{ h.label }}</div>
        <div *ngFor="let p of h.points" class="tooltip-row">
          <span class="swatch" [style.background]="p.color"></span>
          <span class="tooltip-name">{{ p.name }}</span>
          <span class="tooltip-value">{{ p.text }}</span>
        </div>
      </div>

      <figcaption class="legend">
        <span *ngFor="let s of paths()" class="legend-item">
          <span class="swatch" [style.background]="s.color" [class.swatch-dashed]="s.dashed"></span>{{ s.name }}
        </span>
      </figcaption>
    </figure>
  `,
  styles: [`
    :host { display: block; position: relative; --c1: #115e59; --c2: #C0A062; --c3: #3b82f6; --c4: #9ca3af; --grid: rgba(28,35,49,0.08); --axis: rgba(28,35,49,0.6); }
    @media (prefers-color-scheme: dark) { :host { --grid: rgba(255,255,255,0.12); --axis: rgba(255,255,255,0.65); --c1: #2dd4bf; } }
    figure { position: relative; }
    svg { display: block; overflow: visible; }
    .grid { stroke: var(--grid); stroke-width: 1; }
    .baseline { stroke: var(--grid); stroke-width: 1; }
    .axis { fill: var(--axis); font-size: 10px; font-family: inherit; }
    .cursor { stroke: var(--axis); stroke-width: 1; stroke-dasharray: 3 3; }
    .dot { stroke: #fff; stroke-width: 1.5; }
    .tooltip { position: absolute; top: 8px; transform: translateX(10px); background: #1C2331; color: #fff; border-radius: 8px; padding: 8px 10px; font-size: 12px; pointer-events: none; min-width: 150px; z-index: 5; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .tooltip.flip { transform: translateX(calc(-100% - 10px)); }
    .tooltip-title { font-weight: 600; margin-bottom: 4px; }
    .tooltip-row { display: flex; align-items: center; gap: 6px; line-height: 1.5; }
    .tooltip-name { flex: 1; opacity: 0.85; }
    .tooltip-value { font-variant-numeric: tabular-nums; font-weight: 600; }
    .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; }
    .swatch-dashed { background: repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 5px) !important; opacity: 0.6; }
    .legend { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 6px; font-size: 12px; color: var(--axis); }
    .legend-item { display: inline-flex; align-items: center; }
  `]
})
export class LineChartComponent {
  /** Category labels for the x axis, one per point. */
  labels = input<string[]>([]);
  series = input<LineSeries[]>([]);
  /** Short labels for the x axis ticks (defaults to labels). */
  tickLabels = input<string[] | null>(null);
  ariaLabel = input<string>('Line chart');

  readonly width = 720;
  readonly height = 240;
  readonly pad = { l: 56, r: 44, t: 12, b: 26 };

  private readonly palette = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)'];

  hover = signal<{ x: number; label: string; points: { y: number; color: string; name: string; text: string }[] } | null>(null);

  private colorOf(s: LineSeries, i: number): string {
    return s.color ?? this.palette[i % this.palette.length];
  }

  private scale(axis: 'left' | 'right') {
    const values = this.series().filter(s => (s.axis ?? 'left') === axis).flatMap(s => s.values);
    const max = Math.max(0, ...values.filter(v => isFinite(v)));
    const nice = niceMax(max);
    const innerH = this.height - this.pad.t - this.pad.b;
    return { max: nice, y: (v: number) => this.height - this.pad.b - (nice === 0 ? 0 : (v / nice) * innerH) };
  }

  private x(i: number): number {
    const n = Math.max(1, this.labels().length - 1);
    return this.pad.l + (i / n) * (this.width - this.pad.l - this.pad.r);
  }

  paths = computed(() => {
    const left = this.scale('left');
    const right = this.scale('right');
    return this.series().map((s, i) => {
      const sc = (s.axis ?? 'left') === 'right' ? right : left;
      const pts = s.values.map((v, j) => [this.x(j), sc.y(isFinite(v) ? v : 0)] as const);
      const line = pts.length === 1
        ? `M${pts[0][0]},${pts[0][1]} h0.01`
        : pts.map((p, j) => (j === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
      const base = this.height - this.pad.b;
      const area = pts.length > 1
        ? line + ` L${pts[pts.length - 1][0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z`
        : '';
      return { name: s.name, color: this.colorOf(s, i), line, area, dashed: !!s.dashed };
    });
  });

  leftTicks = computed(() => {
    const sc = this.scale('left');
    const fmt = this.series().find(s => (s.axis ?? 'left') === 'left')?.format ?? 'inr';
    return [0, 0.25, 0.5, 0.75, 1].map(f => ({ y: sc.y(sc.max * f), label: fmt === 'num' ? num(Math.round(sc.max * f)) : inrCompact(sc.max * f) }));
  });

  rightTicks = computed(() => {
    if (!this.series().some(s => s.axis === 'right')) return [];
    const sc = this.scale('right');
    const fmt = this.series().find(s => s.axis === 'right')?.format ?? 'num';
    return [0, 0.5, 1].map(f => ({ y: sc.y(sc.max * f), label: fmt === 'inr' ? inrCompact(sc.max * f) : num(Math.round(sc.max * f)) }));
  });

  xTicks = computed(() => {
    const labels = this.tickLabels() ?? this.labels();
    const n = labels.length;
    if (n === 0) return [];
    const every = Math.max(1, Math.ceil(n / 8));
    const out: { x: number; label: string }[] = [];
    for (let i = 0; i < n; i += every) out.push({ x: this.x(i), label: labels[i] });
    if ((n - 1) % every !== 0 && n > 1) out.push({ x: this.x(n - 1), label: labels[n - 1] });
    return out;
  });

  onMove(ev: MouseEvent) {
    const svg = ev.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    this.setHover((ev.clientX - rect.left) / rect.width * this.width);
  }

  onTouch(ev: TouchEvent) {
    const svg = ev.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const t = ev.touches[0];
    if (t) this.setHover((t.clientX - rect.left) / rect.width * this.width);
  }

  private setHover(px: number) {
    const n = this.labels().length;
    if (n === 0) { this.hover.set(null); return; }
    const inner = this.width - this.pad.l - this.pad.r;
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - this.pad.l) / inner) * (n - 1))));
    const left = this.scale('left');
    const right = this.scale('right');
    const points = this.series().map((s, k) => {
      const v = s.values[i] ?? 0;
      const sc = (s.axis ?? 'left') === 'right' ? right : left;
      const text = (s.format ?? ((s.axis ?? 'left') === 'right' ? 'num' : 'inr')) === 'num' ? num(v) : inr(v);
      return { y: sc.y(v), color: this.colorOf(s, k), name: s.name, text };
    });
    this.hover.set({ x: this.x(i), label: this.labels()[i], points });
  }
}

/** Rounds a maximum up to a tidy axis top (1, 2, 5 x 10^n). */
export function niceMax(max: number): number {
  if (!isFinite(max) || max <= 0) return 0;
  const exp = Math.floor(Math.log10(max));
  const base = Math.pow(10, exp);
  const m = max / base;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return step * base;
}
