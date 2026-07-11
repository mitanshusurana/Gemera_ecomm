import { Component, OnInit, inject, signal, OnDestroy, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MetalPriceService, MetalPrices } from '../services/metal-price.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

@Component({
  selector: 'app-gold-rate-ticker',
  standalone: true,
  imports: [CommonModule, CurrencyConvertPipe],
  template: `
    <div *ngIf="prices()" class="bg-ink text-surface py-1.5 px-4 text-xs font-semibold uppercase tracking-widest flex items-center justify-between lg:justify-center gap-6 overflow-hidden">
      <div class="flex animate-marquee lg:animate-none gap-8 whitespace-nowrap">
        <span class="flex items-center gap-2">
          <span class="text-gold-400">●</span> 24K Gold Rate: 
          <span class="text-gold-200">{{ prices()!['24k'] | currencyConvert }} / g</span>
        </span>
        <span class="flex items-center gap-2">
          <span class="text-gold-400">●</span> 22K Gold Rate: 
          <span class="text-gold-200">{{ prices()!['22k'] | currencyConvert }} / g</span>
        </span>
        <span class="flex items-center gap-2">
          <span class="text-gold-400">●</span> 18K Gold Rate: 
          <span class="text-gold-200">{{ prices()!['18k'] | currencyConvert }} / g</span>
        </span>
      </div>
    </div>
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
  private metalPriceService = inject(MetalPriceService);
  private platformId = inject(PLATFORM_ID);
  prices = signal<MetalPrices | null>(null);
  private intervalId: any;

  ngOnInit() {
    this.fetchPrices();
    // Refresh every 15 minutes, but only in the browser to prevent SSR hang
    if (isPlatformBrowser(this.platformId)) {
      this.intervalId = setInterval(() => {
        this.fetchPrices();
      }, 15 * 60 * 1000);
    }
  }

  ngOnDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  private fetchPrices() {
    this.metalPriceService.getLivePrices().subscribe({
      next: (data) => {
        this.prices.set(data);
      },
      error: (err) => console.error('Failed to fetch metal prices:', err)
    });
  }
}
