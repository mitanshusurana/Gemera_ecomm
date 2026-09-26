import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MetalRateService, findRate, inr } from '../services/metal-rate.service';
import { MetalBoard, MetalCode, MetalPurity } from '../core/models';

/** Lines shown in the header, in order. */
const TICKER_LINES: Array<{ metal: MetalCode; purity: MetalPurity; label: string }> = [
  { metal: 'GOLD', purity: '24K', label: '24K Gold' },
  { metal: 'GOLD', purity: '22K', label: '22K Gold' },
  { metal: 'GOLD', purity: '18K', label: '18K Gold' },
  { metal: 'SILVER', purity: '999', label: '999 Silver' },
];

/**
 * Rendered inside the black top nav: rupees per gram from
 * GET /metal-prices/today (already INR, so no currency pipe), the time the
 * board was set and whether it is the locked daily rate or a live, indicative
 * one. Refreshes every 15 minutes in the browser only.
 */
@Component({
  selector: 'app-gold-rate-ticker',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a *ngIf="lines().length > 0" routerLink="/gold-rate" title="Today's gold rate"
       class="text-[#cccccc] text-[11px] font-sans font-medium tracking-tight flex items-center justify-between lg:justify-center gap-4 overflow-hidden hover:text-white transition-colors">
      <span class="flex animate-marquee lg:animate-none gap-6 whitespace-nowrap">
        <span *ngFor="let line of lines()" class="flex items-center gap-1.5">
          <span class="text-[#D4AF37]">●</span> {{ line.label }}
          <span class="text-[#D4AF37]">{{ line.value }}/g</span>
        </span>
      </span>
      <span class="hidden xl:flex items-center gap-2 whitespace-nowrap text-[#a1a1a6]">
        <span>Rates as of {{ board()!.asOf | date:'d MMM, h:mm a' }}</span>
        <span class="px-1.5 py-px rounded-full border text-[9px] uppercase tracking-wider"
              [class.border-[#D4AF37]/60]="isLocked()" [class.text-[#D4AF37]]="isLocked()"
              [class.border-[#a1a1a6]/60]="!isLocked()" [class.text-[#a1a1a6]]="!isLocked()">
          {{ isLocked() ? 'Locked' : 'Live, indicative' }}
        </span>
      </span>
    </a>
  `,
  styles: [`
    @keyframes marquee {
      0% { transform: translateX(100%); }
      100% { transform: translateX(-100%); }
    }
    .animate-marquee {
      animation: marquee 20s linear infinite;
    }
  `]
})
export class GoldRateTickerComponent implements OnInit, OnDestroy {
  private metalRateService = inject(MetalRateService);
  private platformId = inject(PLATFORM_ID);
  private intervalId: ReturnType<typeof setInterval> | null = null;

  board = signal<MetalBoard | null>(null);
  isLocked = computed(() => this.board()?.source === 'LOCKED');

  lines = computed(() => {
    const board = this.board();
    if (!board) return [];
    return TICKER_LINES
      .map((line) => {
        const rate = findRate(board, line.metal, line.purity);
        return rate ? { label: line.label, value: inr(rate.ratePerGram) } : null;
      })
      .filter((line): line is { label: string; value: string } => line !== null);
  });

  ngOnInit() {
    this.fetch(false);
    if (isPlatformBrowser(this.platformId)) {
      this.intervalId = setInterval(() => this.fetch(true), 15 * 60 * 1000);
    }
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private fetch(force: boolean) {
    this.metalRateService.loadToday(force).subscribe({
      next: (board) => this.board.set(board),
      error: (err) => console.error('Failed to fetch metal rates:', err)
    });
  }
}
