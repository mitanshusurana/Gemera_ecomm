import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ExchangeService } from '../services/exchange.service';
import { ToastService } from '../services/toast.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import { ExchangeRequest, exchangeStatusLabel } from '../core/exchange.models';

/**
 * "Old gold exchange" block on the account page: the signed-in customer's
 * requests with status, the quoted or final value and the masked credit code.
 */
@Component({
  selector: 'app-account-exchange',
  standalone: true,
  imports: [CommonModule, RouterLink, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 class="font-display font-semibold text-2xl tracking-tight text-[#1d1d1f]">Old gold exchange</h2>
          <p class="text-sm text-[#6e6e73] mt-1">Old gold or silver you have handed in for store credit.</p>
        </div>
        <a routerLink="/exchange" class="btn-outline text-sm !py-2.5 !px-5 whitespace-nowrap">Get an estimate</a>
      </div>

      <div *ngIf="loading()" class="space-y-3">
        <div class="skeleton h-16 rounded-[12px]"></div>
      </div>

      <div *ngIf="!loading() && !requests().length" class="text-sm text-[#6e6e73] py-4">
        No exchange requests yet. Bring in old jewellery and its metal value becomes credit you can spend at checkout.
      </div>

      <ul *ngIf="!loading() && requests().length" class="divide-y divide-[#f0f0f0]">
        <li *ngFor="let r of requests()" class="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-[#1d1d1f]">
              <span class="font-mono text-[#D4AF37]">{{ r.requestNumber }}</span>
              <span class="text-[#6e6e73] font-normal"> &middot; {{ r.declaredWeightGrams }} g {{ r.declaredPurity }} {{ r.metal | titlecase }}</span>
            </p>
            <p class="text-xs text-[#6e6e73] mt-1">
              Placed {{ r.createdAt | date:'mediumDate' }}
              <ng-container *ngIf="r.status === 'CREDITED' && r.creditGiftCardCode"> &middot; Credit code {{ r.creditGiftCardCode }} (full code in your e-mail)</ng-container>
              <ng-container *ngIf="r.status === 'REJECTED' && r.rejectionReason"> &middot; {{ r.rejectionReason }}</ng-container>
            </p>
          </div>
          <div class="flex items-center gap-4 md:text-right">
            <div>
              <p class="font-sans font-semibold text-[#1d1d1f]">{{ (r.finalValue ?? r.quotedValue) | currencyConvert }}</p>
              <p class="text-[11px] text-[#6e6e73]">{{ r.finalValue != null ? 'Final value' : 'Estimate' }}</p>
            </div>
            <span class="badge" [ngClass]="badgeClass(r.status)">{{ label(r.status) }}</span>
            <button *ngIf="r.status === 'REQUESTED'" type="button" (click)="cancel(r)" [disabled]="cancelling() === r.id"
                    class="text-xs text-[#6e6e73] hover:text-[#1d1d1f] underline whitespace-nowrap">
              {{ cancelling() === r.id ? 'Cancelling…' : 'Cancel' }}
            </button>
          </div>
        </li>
      </ul>
    </div>
  `,
})
export class AccountExchangeComponent implements OnInit {
  private exchangeService = inject(ExchangeService);
  private toast = inject(ToastService);

  requests = signal<ExchangeRequest[]>([]);
  loading = signal(true);
  cancelling = signal<string | null>(null);

  ngOnInit(): void {
    this.exchangeService.mine().subscribe({
      next: (list) => {
        this.requests.set(list ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  label(status: string): string {
    return exchangeStatusLabel(status);
  }

  badgeClass(status: string): string {
    switch (status) {
      case 'CREDITED': return '!bg-[#D4AF37]/15 !text-[#8a6d1f] !border-[#D4AF37]/40';
      case 'REJECTED':
      case 'CANCELLED': return '!text-[#7a7a7a]';
      default: return '';
    }
  }

  cancel(r: ExchangeRequest): void {
    this.cancelling.set(r.id);
    this.exchangeService.cancel(r.id).subscribe({
      next: (updated) => {
        this.requests.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
        this.cancelling.set(null);
        this.toast.show('Exchange request cancelled', 'success');
      },
      error: (err) => {
        this.cancelling.set(null);
        this.toast.show(err?.error?.message || 'Could not cancel the request', 'error');
      },
    });
  }
}
