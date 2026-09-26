import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  ReturnService, ReturnRequest, RETURN_STATUS_LABEL, RETURN_REASON_LABEL, RETURN_RESOLUTION_LABEL,
} from '../services/return.service';
import { ToastService } from '../services/toast.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

/**
 * "Returns & exchanges" block on the account page (also the /returns/mine
 * page): every RMA the customer raised, its status, what it is worth and the
 * outcome (refund, store credit code or replacement order).
 */
@Component({
  selector: 'app-account-returns',
  standalone: true,
  imports: [CommonModule, RouterLink, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 class="font-display font-semibold text-2xl tracking-tight text-[#1d1d1f]">Returns &amp; exchanges</h2>
          <p class="text-sm text-[#6e6e73] mt-1">Start a return from the order card above within the return window.</p>
        </div>
        <a routerLink="/returns" class="text-[#D4AF37] hover:underline text-sm font-medium whitespace-nowrap">Return policy →</a>
      </div>

      <div *ngIf="loading()" class="space-y-3">
        <div class="skeleton h-16 rounded-[12px]"></div>
      </div>

      <div *ngIf="!loading() && !returns().length" class="text-sm text-[#6e6e73] py-4">
        No return or exchange requests.
      </div>

      <ul *ngIf="!loading() && returns().length" class="divide-y divide-[#f0f0f0]">
        <li *ngFor="let r of returns()" class="py-4">
          <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-[#1d1d1f]">
                <span class="font-mono text-[#D4AF37]">{{ r.rmaNumber }}</span>
                <span class="text-[#6e6e73] font-normal"> &middot; order #{{ r.orderNumber }}</span>
              </p>
              <p class="text-sm text-[#6e6e73]">
                {{ resolutionLabel(r.resolution) }} &middot; {{ reasonLabel(r.reason) }}
                &middot; {{ r.lines.length }} item{{ r.lines.length === 1 ? '' : 's' }}
              </p>
              <p class="text-xs text-[#7a7a7a] mt-1">
                Requested {{ r.createdAt | date:'mediumDate' }}
                <span *ngIf="r.refundAmount"> &middot; value {{ r.refundAmount | currencyConvert }}</span>
                <span *ngIf="r.restockingFee"> (after a {{ r.restockingFee | currencyConvert }} restocking fee)</span>
              </p>
              <p *ngIf="r.status === 'APPROVED'" class="text-xs text-[#8a6d1f] mt-2">
                Send the piece back insured, quoting {{ r.rmaNumber }}, or hand it in at any store.
              </p>
              <p *ngIf="r.storeCreditGiftCardCode && (r.status === 'REFUNDED' || r.status === 'EXCHANGED')" class="text-xs text-[#1d1d1f] mt-2">
                Store credit code: <span class="font-mono font-semibold">{{ r.storeCreditGiftCardCode }}</span>
              </p>
              <p *ngIf="r.exchangeOrderNumber" class="text-xs text-[#1d1d1f] mt-2">
                Replacement order <span class="font-mono font-semibold">#{{ r.exchangeOrderNumber }}</span>
                <span *ngIf="r.exchangeOrderStatus === 'PENDING_PAYMENT'"> &middot; pay the balance from the order card above.</span>
              </p>
              <p *ngIf="r.status === 'REJECTED' && r.adminNote" class="text-xs text-[#7a7a7a] mt-2 whitespace-pre-line">{{ r.adminNote }}</p>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="badge" [ngClass]="badgeClass(r.status)">{{ statusLabel(r.status) }}</span>
              <button *ngIf="r.cancellable" type="button" (click)="cancel(r)" [disabled]="busy() === r.id"
                      class="text-[#6e6e73] hover:text-red-600 hover:underline text-sm font-medium whitespace-nowrap">
                Withdraw
              </button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  `,
})
export class AccountReturnsComponent implements OnInit {
  private returnService = inject(ReturnService);
  private toast = inject(ToastService);

  returns = signal<ReturnRequest[]>([]);
  loading = signal(true);
  busy = signal<string | null>(null);

  ngOnInit(): void {
    this.returnService.mine().subscribe({
      next: (list) => {
        this.returns.set(list ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  cancel(r: ReturnRequest): void {
    if (this.busy()) return;
    this.busy.set(r.id);
    this.returnService.cancel(r.rmaNumber).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.returns.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.toast.show('Return request withdrawn.', 'info');
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.show(err?.error?.message || 'The request could not be withdrawn.', 'error');
      },
    });
  }

  badgeClass(status: string): string {
    switch (status) {
      case 'REFUNDED':
      case 'EXCHANGED': return 'bg-[#1d1d1f] text-white';
      case 'APPROVED':
      case 'RECEIVED': return 'bg-[#D4AF37] text-black';
      case 'REJECTED':
      case 'CANCELLED': return 'bg-red-50 text-red-700';
      default: return 'bg-[#fbf8ef] text-[#8a6d1f] border border-[#D4AF37]/40';
    }
  }

  statusLabel(status: string): string {
    return RETURN_STATUS_LABEL[status] ?? status;
  }

  reasonLabel(reason: string): string {
    return RETURN_REASON_LABEL[reason as keyof typeof RETURN_REASON_LABEL] ?? reason;
  }

  resolutionLabel(resolution: string): string {
    return RETURN_RESOLUTION_LABEL[resolution as keyof typeof RETURN_RESOLUTION_LABEL] ?? resolution;
  }
}
