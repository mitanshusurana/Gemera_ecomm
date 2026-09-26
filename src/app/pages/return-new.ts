import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  ReturnService, ReturnEligibility, EligibleLine, ReturnReason, ReturnResolution,
  RETURN_REASON_LABEL, RETURN_RESOLUTION_LABEL,
} from '../services/return.service';
import { ProductService } from '../services/product.service';
import { ToastService } from '../services/toast.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import { Product } from '../core/models';

interface ExchangePick {
  product: Product;
  quantity: number;
}

/**
 * /returns/new/:orderId: pick the items and quantities to send back, the
 * reason and how it should be settled (refund, store credit or an exchange
 * for other pieces). Eligibility (window, returnable products, quantities
 * already returned) comes from the API.
 */
@Component({
  selector: 'app-return-new',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-12 px-6">
        <div class="max-w-[960px] mx-auto">
          <nav aria-label="Breadcrumb" class="flex items-center gap-2 text-xs text-[#6e6e73] mb-6">
            <a routerLink="/account" [queryParams]="{ tab: 'orders' }" class="text-[#D4AF37] hover:underline">My orders</a>
            <span>/</span>
            <span class="text-[#1d1d1f]">Return or exchange</span>
          </nav>
          <h1 class="font-display font-semibold text-3xl md:text-4xl tracking-tight">Return or exchange</h1>
          <p *ngIf="eligibility()" class="text-base text-[#7a7a7a] mt-3">
            Order <span class="font-mono text-[#1d1d1f]">#{{ eligibility()!.orderNumber }}</span>
            <span *ngIf="eligibility()!.windowEnds"> &middot; returns accepted until {{ eligibility()!.windowEnds | date:'mediumDate' }}</span>
          </p>
        </div>
      </section>

      <div class="max-w-[960px] mx-auto px-6 py-10">
        <div *ngIf="loading()" class="space-y-3">
          <div class="skeleton h-20 rounded-[12px]"></div>
          <div class="skeleton h-20 rounded-[12px]"></div>
        </div>

        <div *ngIf="!loading() && eligibility() && !eligibility()!.eligible" class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
          <h2 class="font-display font-semibold text-2xl mb-2">This order cannot be returned</h2>
          <p class="text-[#6e6e73] mb-6">{{ eligibility()!.reason }}</p>
          <a routerLink="/contact" class="btn-outline text-sm !py-2.5 !px-5">Talk to the concierge</a>
        </div>

        <form *ngIf="!loading() && eligibility()?.eligible && !done()" (ngSubmit)="submit()" class="space-y-8">
          <!-- Items -->
          <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
            <h2 class="font-display font-semibold text-2xl mb-1">What are you sending back?</h2>
            <p class="text-sm text-[#6e6e73] mb-6">Tick the items and set the quantity.</p>
            <ul class="divide-y divide-[#f0f0f0]">
              <li *ngFor="let l of eligibility()!.lines" class="py-4 flex items-center gap-4">
                <input type="checkbox" [id]="'line-' + l.orderItemId" [disabled]="!l.returnable"
                       [checked]="isPicked(l)" (change)="toggle(l)"
                       class="h-5 w-5 rounded border-[#e0e0e0] text-[#1d1d1f] focus:ring-[#D4AF37]" />
                <div *ngIf="l.image" class="w-14 h-14 rounded-[10px] bg-[#f5f5f7] overflow-hidden shrink-0">
                  <img [src]="l.image" [alt]="l.name" class="w-full h-full object-cover" />
                </div>
                <label [for]="'line-' + l.orderItemId" class="flex-1 min-w-0 cursor-pointer">
                  <span class="block text-sm font-semibold truncate">{{ l.name }}</span>
                  <span class="block text-xs text-[#6e6e73]">
                    {{ l.unitPrice | currencyConvert }} &middot; bought {{ l.quantity }}
                    <span *ngIf="!l.returnable" class="text-red-600"> &middot; {{ l.reason }}</span>
                    <span *ngIf="l.returnable && l.returnableQuantity < l.quantity"> &middot; {{ l.returnableQuantity }} still returnable</span>
                  </span>
                </label>
                <div *ngIf="isPicked(l) && l.returnableQuantity > 1" class="flex items-center gap-2 text-sm">
                  <label [for]="'qty-' + l.orderItemId" class="text-[#6e6e73]">Qty</label>
                  <select [id]="'qty-' + l.orderItemId" [ngModel]="quantities()[l.orderItemId]" (ngModelChange)="setQty(l, $event)" [name]="'qty-' + l.orderItemId" class="input-field !w-20 !py-1.5">
                    <option *ngFor="let n of range(l.returnableQuantity)" [ngValue]="n">{{ n }}</option>
                  </select>
                </div>
              </li>
            </ul>
          </div>

          <!-- Reason -->
          <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
            <h2 class="font-display font-semibold text-2xl mb-4">Why?</h2>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label *ngFor="let r of reasons" class="flex items-center gap-3 rounded-[12px] border p-3 cursor-pointer transition-colors"
                     [ngClass]="reason() === r ? 'border-[#1d1d1f] bg-[#f5f5f7]' : 'border-[#e0e0e0] hover:border-[#D4AF37]'">
                <input type="radio" name="reason" [value]="r" [checked]="reason() === r" (change)="reason.set(r)" class="text-[#1d1d1f] focus:ring-[#D4AF37]" />
                <span class="text-sm">{{ reasonLabel(r) }}</span>
              </label>
            </div>
            <textarea [(ngModel)]="note" name="note" rows="3" class="input-field mt-4" placeholder="Anything we should know (optional)"></textarea>
          </div>

          <!-- Resolution -->
          <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
            <h2 class="font-display font-semibold text-2xl mb-4">How should we settle it?</h2>
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button *ngFor="let r of resolutions" type="button" (click)="resolution.set(r)"
                      class="rounded-[14px] border p-4 text-left transition-colors active-press"
                      [ngClass]="resolution() === r ? 'border-[#1d1d1f] bg-[#f5f5f7]' : 'border-[#e0e0e0] hover:border-[#D4AF37]'">
                <span class="block text-sm font-semibold">{{ resolutionLabel(r) }}</span>
                <span class="block text-xs text-[#6e6e73] mt-1">{{ resolutionHint(r) }}</span>
              </button>
            </div>

            <div *ngIf="resolution() === 'EXCHANGE'" class="mt-6 border-t border-[#f0f0f0] pt-6">
              <h3 class="text-sm font-semibold uppercase tracking-wider mb-3">Pieces you would like instead</h3>
              <div class="relative">
                <input type="search" [(ngModel)]="query" name="query" (ngModelChange)="search($event)" class="input-field" placeholder="Search the collection by name or SKU" autocomplete="off" />
                <ul *ngIf="results().length" class="absolute z-10 mt-1 w-full bg-white border border-[#e0e0e0] rounded-[12px] max-h-64 overflow-auto">
                  <li *ngFor="let p of results()">
                    <button type="button" (click)="addExchange(p)" class="w-full text-left px-4 py-2.5 text-sm hover:bg-[#f5f5f7] flex justify-between gap-3">
                      <span class="truncate">{{ p.name }}</span>
                      <span class="text-[#6e6e73] whitespace-nowrap">{{ p.price | currencyConvert }}</span>
                    </button>
                  </li>
                </ul>
              </div>
              <ul *ngIf="exchange().length" class="mt-4 divide-y divide-[#f0f0f0]">
                <li *ngFor="let e of exchange()" class="py-3 flex items-center justify-between gap-3 text-sm">
                  <span class="truncate">{{ e.product.name }} <span class="text-[#6e6e73]">&middot; {{ e.product.price | currencyConvert }}</span></span>
                  <span class="flex items-center gap-3">
                    <select [ngModel]="e.quantity" (ngModelChange)="setExchangeQty(e, $event)" [name]="'xq-' + e.product.id" class="input-field !w-20 !py-1.5">
                      <option *ngFor="let n of range(5)" [ngValue]="n">{{ n }}</option>
                    </select>
                    <button type="button" (click)="removeExchange(e)" class="text-[#6e6e73] hover:text-red-600">Remove</button>
                  </span>
                </li>
              </ul>
              <p class="text-xs text-[#7a7a7a] mt-3">
                The value of the returned pieces is applied to the new order as store credit; any difference is paid online (or stays on the credit).
              </p>
            </div>
          </div>

          <div class="bg-[#fafafc] border border-[#e0e0e0] rounded-[18px] p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div class="text-sm text-[#6e6e73]">
              <p><strong class="text-[#1d1d1f]">{{ pickedCount() }}</strong> item{{ pickedCount() === 1 ? '' : 's' }} &middot; estimated value <strong class="text-[#1d1d1f]">{{ estimate() | currencyConvert }}</strong></p>
              <p class="text-xs mt-1">Final value is confirmed once the pieces are inspected. Shipping charges are not refunded.</p>
              <p *ngIf="error()" class="text-xs text-red-600 mt-2">{{ error() }}</p>
            </div>
            <button type="submit" [disabled]="!canSubmit() || submitting()" class="btn-apple-pill whitespace-nowrap">
              {{ submitting() ? 'Sending…' : 'Request return' }}
            </button>
          </div>
        </form>

        <div *ngIf="done()" class="bg-white border border-[#e0e0e0] rounded-[18px] p-10 text-center">
          <div class="w-20 h-20 rounded-full bg-[#fbf8ef] text-[#8a6d1f] flex items-center justify-center text-4xl mx-auto mb-6">✓</div>
          <h2 class="font-display font-semibold text-3xl tracking-tight mb-3">Request {{ done()!.rmaNumber }} received</h2>
          <p class="text-[#6e6e73] mb-8">We review every return within a working day and e-mail you the next step. Keep the piece in its packaging with the certificate until then.</p>
          <a routerLink="/account" [queryParams]="{ tab: 'orders' }" class="btn-apple-pill">Back to my orders</a>
        </div>
      </div>
    </div>
  `,
})
export class ReturnNewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private returnService = inject(ReturnService);
  private productService = inject(ProductService);
  private toast = inject(ToastService);

  readonly reasons: ReturnReason[] = ['DAMAGED', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'SIZE', 'CHANGED_MIND', 'OTHER'];
  readonly resolutions: ReturnResolution[] = ['REFUND', 'STORE_CREDIT', 'EXCHANGE'];

  orderId = '';
  loading = signal(true);
  eligibility = signal<ReturnEligibility | null>(null);
  quantities = signal<Record<string, number>>({});
  reason = signal<ReturnReason | null>(null);
  resolution = signal<ReturnResolution>('REFUND');
  note = '';
  query = '';
  results = signal<Product[]>([]);
  exchange = signal<ExchangePick[]>([]);
  submitting = signal(false);
  error = signal<string | null>(null);
  done = signal<{ rmaNumber: string } | null>(null);

  pickedCount = computed(() => Object.values(this.quantities()).reduce((n, q) => n + q, 0));
  estimate = computed(() => {
    const lines = this.eligibility()?.lines ?? [];
    return lines.reduce((sum, l) => sum + (this.quantities()[l.orderItemId] || 0) * l.unitPrice, 0);
  });
  canSubmit = computed(() =>
    this.pickedCount() > 0 && !!this.reason() && (this.resolution() !== 'EXCHANGE' || this.exchange().length > 0));

  ngOnInit(): void {
    this.orderId = this.route.snapshot.paramMap.get('orderId') || '';
    if (!this.orderId) {
      this.router.navigate(['/account'], { queryParams: { tab: 'orders' } });
      return;
    }
    this.returnService.eligibility(this.orderId).subscribe({
      next: (e) => {
        this.eligibility.set(e);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.toast.show(err?.error?.message || 'This order could not be loaded.', 'error');
        this.router.navigate(['/account'], { queryParams: { tab: 'orders' } });
      },
    });
  }

  isPicked(l: EligibleLine): boolean {
    return !!this.quantities()[l.orderItemId];
  }

  toggle(l: EligibleLine): void {
    if (!l.returnable) return;
    this.quantities.update(q => {
      const next = { ...q };
      if (next[l.orderItemId]) delete next[l.orderItemId];
      else next[l.orderItemId] = l.returnableQuantity === 1 ? 1 : Math.min(1, l.returnableQuantity);
      return next;
    });
  }

  setQty(l: EligibleLine, qty: number): void {
    this.quantities.update(q => ({ ...q, [l.orderItemId]: Math.max(1, Math.min(Number(qty) || 1, l.returnableQuantity)) }));
  }

  range(n: number): number[] {
    return Array.from({ length: Math.max(n, 1) }, (_, i) => i + 1);
  }

  reasonLabel(r: ReturnReason): string {
    return RETURN_REASON_LABEL[r];
  }

  resolutionLabel(r: ReturnResolution): string {
    return RETURN_RESOLUTION_LABEL[r];
  }

  resolutionHint(r: ReturnResolution): string {
    switch (r) {
      case 'REFUND': return 'Back to the card or account you paid with, 5-7 working days after receipt.';
      case 'STORE_CREDIT': return 'A gift card code for the full value, valid 12 months.';
      default: return 'Choose other pieces; the value is set off against them.';
    }
  }

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  search(q: string): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const term = (q || '').trim();
    if (term.length < 2) {
      this.results.set([]);
      return;
    }
    this.searchTimer = setTimeout(() => {
      this.productService.searchProducts(term, 8).subscribe({
        next: (res) => this.results.set((res?.results ?? []).filter(p => !this.exchange().some(e => e.product.id === p.id))),
        error: () => this.results.set([]),
      });
    }, 250);
  }

  addExchange(p: Product): void {
    this.exchange.update(list => [...list, { product: p, quantity: 1 }]);
    this.results.set([]);
    this.query = '';
  }

  setExchangeQty(e: ExchangePick, qty: number): void {
    this.exchange.update(list => list.map(x => x === e ? { ...x, quantity: Math.max(1, Number(qty) || 1) } : x));
  }

  removeExchange(e: ExchangePick): void {
    this.exchange.update(list => list.filter(x => x !== e));
  }

  submit(): void {
    if (!this.canSubmit() || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    const lines = Object.entries(this.quantities()).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
    this.returnService.create(this.orderId, {
      lines,
      reason: this.reason()!,
      reasonNote: this.note.trim() || undefined,
      resolution: this.resolution(),
      exchangeItems: this.resolution() === 'EXCHANGE'
        ? this.exchange().map(e => ({ productId: e.product.id, quantity: e.quantity }))
        : undefined,
    }).subscribe({
      next: (r) => {
        this.submitting.set(false);
        this.done.set({ rmaNumber: r.rmaNumber });
        this.toast.show(`Return ${r.rmaNumber} requested.`, 'success');
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message || 'The request could not be sent. Please try again.');
      },
    });
  }
}
