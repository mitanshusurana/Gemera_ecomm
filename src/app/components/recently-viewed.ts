import { Component, inject } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HistoryService } from '../services/history.service';
import { CurrencyService } from '../services/currency.service';

@Component({
  selector: 'app-recently-viewed',
  standalone: true,
  imports: [CommonModule, RouterLink, NgOptimizedImage],
  template: `
    <section *ngIf="historyService.recentlyViewed().length > 0" class="py-12 border-t border-ink bg-surface">
      <div class="container-luxury">
        <h3 class="text-2xl font-bold text-ink mb-6">Recently Viewed</h3>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <a *ngFor="let product of historyService.recentlyViewed()"
             [routerLink]="['/products', product.id]"
             class="card card-hover group block bg-surface">
            <div class="aspect-square bg-surface flex items-center justify-center relative overflow-hidden">
               <img *ngIf="product.imageUrl || product.images?.[0]" [ngSrc]="product.imageUrl || product.images?.[0] || ''" fill class="w-full h-full object-cover">
               <span *ngIf="!product.imageUrl && !product.images?.[0]" class="text-3xl">💎</span>
            </div>
            <div class="p-3">
              <p class="text-xs text-gold-600 font-semibold uppercase truncate">{{ product.category }}</p>
              <h4 class="font-semibold text-ink text-sm truncate">{{ product.name }}</h4>
              <p class="text-ink font-bold mt-1">{{ formatPrice(product.price) }}</p>
            </div>
          </a>
        </div>
      </div>
    </section>
  `
})
export class RecentlyViewedComponent {
  historyService = inject(HistoryService);
  private currencyService = inject(CurrencyService);

  formatPrice(price: number): string {
    return this.currencyService.format(price);
  }
}
