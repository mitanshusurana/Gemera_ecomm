import { Component, DestroyRef, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TreasureService } from '../services/treasure.service';
import { CurrencyService } from '../services/currency.service';
import { ToastService } from '../services/toast.service';
import { AuthService } from '../services/auth.service';
import { TreasureChestAccount, TreasureInstallment, TreasureInstallmentOrderResponse } from '../core/models';
import { environment } from '../../environments/environment';

/**
 * loading  - waiting on the session or GET treasure/account
 * guest    - not signed in: pitch + calculator + sign-in prompt
 * none     - signed in, 404 from GET treasure/account: enrol form
 * enrolled - account view
 * error    - account lookup failed for another reason
 */
type AccountState = 'loading' | 'guest' | 'none' | 'enrolled' | 'error';
type PayStage = 'idle' | 'creating' | 'paying' | 'confirming';

@Component({
  selector: 'app-treasure-chest',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <!-- APPLE DESIGN SYSTEM: TREASURE PLAN (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">

      <!-- Top Parchment Header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-16 px-6 text-center">
        <div class="max-w-[800px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Jewelry Wealth Plan</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl text-[#1d1d1f] tracking-tight">
            Caratloop Treasure Vault.
          </h1>
          <p class="text-base text-[#7a7a7a] mt-4 max-w-xl mx-auto">
            Pay {{ paidMonths() }} monthly installments, and Caratloop contributes {{ bonusMonthsLabel() }} as a bonus towards your bespoke luxury acquisition.
          </p>

          <div class="flex justify-center items-center space-x-12 mt-10">
            <div>
              <span class="font-display font-semibold text-3xl text-[#D4AF37] block">{{ bonusPercent() }}%</span>
              <span class="text-[11px] text-[#7a7a7a] uppercase tracking-wider">Bonus On Your Savings</span>
            </div>
            <div class="w-px h-10 bg-[#e0e0e0]"></div>
            <div>
              <span class="font-display font-semibold text-3xl text-[#1d1d1f] block">0%</span>
              <span class="text-[11px] text-[#7a7a7a] uppercase tracking-wider">Making Charges</span>
            </div>
          </div>
        </div>
      </section>

      <div class="max-w-[1000px] mx-auto px-6 py-12 space-y-8">

        <!-- Loading -->
        <div *ngIf="accountState() === 'loading'" class="store-utility-card text-center py-16" aria-live="polite">
          <div class="w-8 h-8 border-2 border-[#e0e0e0] border-t-[#D4AF37] rounded-full animate-spin mx-auto mb-4" aria-hidden="true"></div>
          <p class="text-sm text-[#6e6e73]">Checking your Treasure Plan...</p>
        </div>

        <!-- Lookup failed -->
        <div *ngIf="accountState() === 'error'" role="alert" class="store-utility-card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 class="font-display font-semibold text-xl text-[#1d1d1f]">We could not load your plan</h2>
            <p class="text-sm text-[#6e6e73] mt-1">Please check your connection and try again.</p>
          </div>
          <button type="button" (click)="loadAccount()" class="btn-apple-pill-secondary text-sm !py-2.5 !px-6 whitespace-nowrap">Try again</button>
        </div>

        <!-- ===================== ACCOUNT VIEW ===================== -->
        <ng-container *ngIf="accountState() === 'enrolled'">
        <ng-container *ngIf="account() as acct">

          <!-- Matured -->
          <div *ngIf="acct.status === 'MATURED'" role="status" class="rounded-[18px] border border-green-100 bg-green-50 p-6 md:p-8 flex items-start gap-4 animate-fade-in-up">
            <div class="w-12 h-12 rounded-full bg-white border border-green-100 flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
            </div>
            <div>
              <h2 class="font-display font-semibold text-2xl text-[#1d1d1f]">Your Treasure Plan has matured</h2>
              <p class="text-sm text-[#1d1d1f] mt-2">
                All {{ acct.totalInstallments }} installments are in and your bonus of
                <span class="font-semibold">{{ currencyService.format(bonusAmount(acct)) }}</span> has been added.
                <span class="font-semibold">{{ currencyService.format(acct.balance) }}</span> is ready to redeem on any certified diamond or gold creation.
              </p>
              <a routerLink="/products" class="btn-apple-pill inline-flex text-sm !py-2.5 !px-6 mt-4">Redeem on the collection</a>
            </div>
          </div>

          <!-- Closed -->
          <div *ngIf="acct.status === 'CLOSED'" role="status" class="rounded-[18px] border border-[#e0e0e0] bg-[#f5f5f7] p-6 text-sm text-[#1d1d1f]">
            This plan has been closed. Contact us if you have questions about your balance of {{ currencyService.format(acct.balance) }}.
          </div>

          <div class="store-utility-card !p-0 overflow-hidden animate-fade-in">
            <div class="grid grid-cols-1 md:grid-cols-5">

              <!-- Left: balance and progress -->
              <div class="md:col-span-3 p-8 md:p-12">
                <div class="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <span class="text-xs uppercase tracking-wider font-semibold text-[#7a7a7a] block mb-2">{{ acct.planName || 'Treasure Plan' }}</span>
                    <h2 class="font-display font-semibold text-2xl text-[#1d1d1f]">Your Savings</h2>
                  </div>
                  <span class="badge" [ngClass]="statusBadgeClass(acct.status)">{{ statusLabel(acct.status) }}</span>
                </div>

                <span class="text-xs uppercase tracking-wider text-[#7a7a7a] block mb-1">Current balance</span>
                <div class="font-display font-semibold text-4xl md:text-5xl text-[#1d1d1f] tracking-tight mb-8">{{ currencyService.format(acct.balance) }}</div>

                <div class="mb-2 flex justify-between text-xs">
                  <span class="text-[#7a7a7a]">Installments paid</span>
                  <span class="font-semibold text-[#1d1d1f]">{{ acct.installmentsPaid }} of {{ acct.totalInstallments }}</span>
                </div>
                <div class="h-2 w-full rounded-full bg-[#e0e0e0] overflow-hidden" role="progressbar"
                     [attr.aria-valuenow]="acct.installmentsPaid" aria-valuemin="0" [attr.aria-valuemax]="acct.totalInstallments"
                     aria-label="Installments paid">
                  <div class="h-full bg-[#D4AF37] rounded-full transition-all duration-500" [style.width.%]="progressPercent(acct)"></div>
                </div>

                <dl class="grid grid-cols-2 gap-x-6 gap-y-5 mt-8 text-sm">
                  <div>
                    <dt class="text-xs uppercase tracking-wider text-[#7a7a7a] mb-1">Monthly installment</dt>
                    <dd class="font-semibold text-[#1d1d1f]">{{ currencyService.format(acct.installmentAmount) }}</dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wider text-[#7a7a7a] mb-1">Next due</dt>
                    <dd class="font-semibold text-[#1d1d1f]">
                      <ng-container *ngIf="acct.status === 'ACTIVE' && acct.nextDueDate; else noDue">{{ acct.nextDueDate | date:'d MMM y' }}</ng-container>
                      <ng-template #noDue>&mdash;</ng-template>
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wider text-[#7a7a7a] mb-1">Started</dt>
                    <dd class="font-semibold text-[#1d1d1f]"><ng-container *ngIf="acct.startDate; else noStart">{{ acct.startDate | date:'d MMM y' }}</ng-container>
                      <ng-template #noStart>&mdash;</ng-template></dd>
                  </div>
                  <div>
                    <dt class="text-xs uppercase tracking-wider text-[#7a7a7a] mb-1">Remaining</dt>
                    <dd class="font-semibold text-[#1d1d1f]">{{ remainingInstallments(acct) }} installment{{ remainingInstallments(acct) === 1 ? '' : 's' }}</dd>
                  </div>
                </dl>
              </div>

              <!-- Right: maturity and pay -->
              <div class="md:col-span-2 bg-[#fafafc] border-t md:border-t-0 md:border-l border-[#e0e0e0] p-8 md:p-12 flex flex-col justify-between">
                <div>
                  <span class="text-xs uppercase tracking-wider font-semibold text-[#D4AF37] block mb-2">At Maturity</span>
                  <h3 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">Plan Value</h3>

                  <div class="space-y-4 text-xs mb-8">
                    <div class="flex justify-between items-center pb-3 border-b border-[#e0e0e0]">
                      <span class="text-[#7a7a7a]">Your Contribution ({{ acct.totalInstallments }} Mos)</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ currencyService.format(acct.installmentAmount * acct.totalInstallments) }}</span>
                    </div>
                    <div class="flex justify-between items-center pb-3 border-b border-[#e0e0e0] text-[#D4AF37]">
                      <span class="font-semibold">Caratloop Bonus</span>
                      <span class="font-semibold">+ {{ currencyService.format(bonusAmount(acct)) }}</span>
                    </div>
                    <div class="flex justify-between items-center pt-3 text-base">
                      <span class="font-semibold text-[#1d1d1f]">Maturity Value</span>
                      <span class="font-semibold text-2xl text-[#1d1d1f]">{{ currencyService.format(maturityAmount(acct)) }}</span>
                    </div>
                  </div>
                </div>

                <div *ngIf="acct.status === 'ACTIVE'">
                  <div *ngIf="payError()" role="alert" class="mb-4 flex items-start gap-3 rounded-[12px] border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                    <svg class="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"/></svg>
                    <span>{{ payError() }}</span>
                  </div>
                  <div *ngIf="payNotice()" role="status" class="mb-4 rounded-[12px] border border-[#e0e0e0] bg-white p-4 text-sm text-[#1d1d1f]">
                    {{ payNotice() }}
                  </div>

                  <ng-container *ngIf="remainingInstallments(acct) > 0; else fullyPaid">
                    <button type="button" (click)="payInstallment()" [disabled]="isPaying()" class="btn-apple-pill w-full !py-3.5 text-sm disabled:opacity-50">
                      {{ payLabel() }}
                    </button>
                    <p class="text-[11px] text-[#7a7a7a] mt-3 text-center">Secure payment via Razorpay. Installment {{ acct.installmentsPaid + 1 }} of {{ acct.totalInstallments }}.</p>
                  </ng-container>
                  <ng-template #fullyPaid>
                    <div class="rounded-[12px] border border-[#e0e0e0] bg-white p-4 text-xs text-[#6e6e73]">
                      All installments are paid. Your bonus is being applied.
                    </div>
                  </ng-template>
                </div>
              </div>
            </div>
          </div>

          <!-- History -->
          <section class="store-utility-card !p-0 overflow-hidden" aria-labelledby="installment-history">
            <div class="flex items-center justify-between px-8 py-6 border-b border-[#f0f0f0]">
              <h2 id="installment-history" class="font-display font-semibold text-xl text-[#1d1d1f]">Installment History</h2>
              <span class="text-xs text-[#7a7a7a]">{{ installments().length }} record{{ installments().length === 1 ? '' : 's' }}</span>
            </div>

            <div *ngIf="historyLoading()" class="px-8 py-10 text-center text-sm text-[#6e6e73]">Loading history...</div>
            <div *ngIf="!historyLoading() && historyError()" class="px-8 py-6 flex items-center justify-between gap-4 text-sm">
              <span class="text-[#6e6e73]">{{ historyError() }}</span>
              <button type="button" (click)="loadInstallments()" class="btn-ghost text-sm">Retry</button>
            </div>
            <div *ngIf="!historyLoading() && !historyError() && installments().length === 0" class="px-8 py-10 text-center text-sm text-[#6e6e73]">
              No installments yet. Your first payment will appear here.
            </div>

            <ul *ngIf="!historyLoading() && installments().length > 0" class="divide-y divide-[#f0f0f0]">
              <li *ngFor="let inst of installments(); trackBy: trackByInstallment" class="px-8 py-4 flex items-center justify-between gap-4">
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-[#1d1d1f]">Installment {{ inst.installmentNumber }}</div>
                  <div class="text-xs text-[#7a7a7a] mt-0.5">
                    <ng-container *ngIf="inst.paidAt; else pendingSince">Paid {{ inst.paidAt | date:'d MMM y' }}</ng-container>
                    <ng-template #pendingSince>{{ inst.createdAt ? (inst.createdAt | date:'d MMM y') : '' }}</ng-template>
                    <span *ngIf="inst.method"> &middot; {{ methodLabel(inst.method) }}</span>
                    <span *ngIf="inst.note"> &middot; {{ inst.note }}</span>
                  </div>
                </div>
                <div class="text-right flex-shrink-0">
                  <div class="text-sm font-semibold text-[#1d1d1f]">{{ currencyService.format(inst.amount) }}</div>
                  <span class="badge text-[10px] !py-0.5 mt-1" [ngClass]="installmentBadgeClass(inst.status)">{{ installmentStatusLabel(inst.status) }}</span>
                </div>
              </li>
            </ul>
          </section>
        </ng-container>
        </ng-container>

        <!-- ===================== CALCULATOR / ENROL ===================== -->
        <div *ngIf="accountState() === 'guest' || accountState() === 'none'" class="store-utility-card !p-0 overflow-hidden">
          <div class="grid grid-cols-1 md:grid-cols-2">

            <!-- Left: Input Controls -->
            <div class="p-8 md:p-12">
              <span class="text-xs uppercase tracking-wider font-semibold text-[#7a7a7a] block mb-2">Savings Estimator</span>
              <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">Monthly Contribution</h2>

              <div class="mb-8">
                <label for="installmentAmount" class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-4">Select Installment Amount</label>
                <div class="flex items-center gap-3 mb-6 bg-[#f5f5f7] border border-[#e0e0e0] rounded-[12px] p-4">
                  <span class="text-2xl font-bold text-[#D4AF37]">&#8377;</span>
                  <input type="number" id="installmentAmount" aria-label="Installment Amount" [ngModel]="installment()" (ngModelChange)="updateInstallment($event)"
                         [min]="config().minAmount" [max]="config().maxAmount" step="500" inputmode="numeric"
                         class="w-full text-2xl font-semibold text-[#1d1d1f] outline-none bg-transparent">
                </div>

                <input type="range" aria-label="Installment Amount Slider" [ngModel]="installment()" (ngModelChange)="updateInstallment($event)"
                       [min]="config().minAmount" [max]="config().maxAmount" step="500"
                       class="w-full h-2 bg-[#e0e0e0] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]">

                <div class="flex justify-between text-[11px] text-[#7a7a7a] mt-2 font-mono">
                  <span>{{ currencyService.format(config().minAmount) }} / mo</span>
                  <span>{{ currencyService.format(config().maxAmount) }} / mo</span>
                </div>
                <p *ngIf="enrolError()" role="alert" class="text-red-600 text-xs mt-3">{{ enrolError() }}</p>
              </div>

              <ng-container *ngIf="accountState() === 'none'; else signInPrompt">
                <button (click)="enroll()" [disabled]="loading()" class="btn-apple-pill w-full !py-3.5 text-sm disabled:opacity-50">
                  <span *ngIf="!loading()">Enroll in Treasure Plan</span>
                  <span *ngIf="loading()">Processing...</span>
                </button>
                <p class="text-[11px] text-[#7a7a7a] mt-3 text-center">Your first installment is paid after enrolment, right here on this page.</p>
              </ng-container>
              <ng-template #signInPrompt>
                <a [routerLink]="['/login']" [queryParams]="{ returnUrl: '/treasure' }" class="btn-apple-pill w-full !py-3.5 text-sm flex justify-center">Sign in to enrol</a>
                <p class="text-[11px] text-[#7a7a7a] mt-3 text-center">Sign in or create a Caratloop account to start your plan and pay installments online.</p>
              </ng-template>
            </div>

            <!-- Right: Summary Card -->
            <div class="bg-[#fafafc] border-t md:border-t-0 md:border-l border-[#e0e0e0] p-8 md:p-12 flex flex-col justify-between">
              <div>
                <span class="text-xs uppercase tracking-wider font-semibold text-[#D4AF37] block mb-2">Maturity Breakdown</span>
                <h3 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">Plan Benefits</h3>

                <div class="space-y-4 text-xs mb-8">
                  <div class="flex justify-between items-center pb-3 border-b border-[#e0e0e0]">
                    <span class="text-[#7a7a7a]">Your Contribution ({{ paidMonths() }} Mos)</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ currencyService.format(summary().youPay) }}</span>
                  </div>
                  <div class="flex justify-between items-center pb-3 border-b border-[#e0e0e0] text-[#D4AF37]">
                    <span class="font-semibold">Caratloop Bonus ({{ bonusMonthsLabel() }})</span>
                    <span class="font-semibold">+ {{ currencyService.format(summary().weAdd) }}</span>
                  </div>
                  <div class="flex justify-between items-center pt-3 text-base">
                    <span class="font-semibold text-[#1d1d1f]">Total Redeemable Value</span>
                    <span class="font-semibold text-2xl text-[#1d1d1f]">{{ currencyService.format(summary().total) }}</span>
                  </div>
                </div>
              </div>

              <div class="bg-white p-4 rounded-[12px] border border-[#e0e0e0] text-xs text-[#7a7a7a]">
                &#10022; Redeemable on all certified diamonds and gold creations across our collections.
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `
})
export class TreasureChestComponent implements OnInit {
  currencyService = inject(CurrencyService);
  private treasureService = inject(TreasureService);
  private toastService = inject(ToastService);
  private authService = inject(AuthService);
  private platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);

  readonly config = this.treasureService.config;

  installment = signal(5000);
  loading = signal(false);
  enrolError = signal('');

  accountState = signal<AccountState>('loading');
  account = signal<TreasureChestAccount | null>(null);
  installments = signal<TreasureInstallment[]>([]);
  historyLoading = signal(false);
  historyError = signal('');

  payStage = signal<PayStage>('idle');
  isPaying = computed(() => this.payStage() !== 'idle');
  payError = signal('');
  payNotice = signal('');

  payLabel = computed(() => {
    switch (this.payStage()) {
      case 'creating': return 'Preparing payment...';
      case 'paying': return 'Complete payment in the Razorpay window';
      case 'confirming': return 'Recording your installment...';
      default: {
        const acct = this.account();
        return acct ? "Pay this month's installment · " + this.formatInr(acct.installmentAmount) : "Pay this month's installment";
      }
    }
  });

  summary = computed(() => {
    return this.treasureService.calculateMaturity(this.installment());
  });

  paidMonths = computed(() => this.config().durationMonths);
  bonusMonthsLabel = computed(() => {
    const n = this.config().bonusMonths;
    return n === 1 ? '1 month' : n + ' months';
  });

  /**
   * The bonus as a percentage of what the customer actually pays in.
   *
   * This was advertised as a flat "100% Bonus Match". The scheme pays one
   * bonus month on the paid months, so the real figure is about 9% -- the
   * headline overstated the return on a deposit-like product roughly
   * tenfold. Deriving it from the same calculation the maturity figure uses
   * means the two can no longer disagree.
   */
  bonusPercent = computed(() => {
    const { youPay, weAdd } = this.summary();
    if (!youPay) return 0;
    return Math.round((weAdd / youPay) * 100);
  });

  private accountRequested = false;

  ngOnInit(): void {
    this.loadRazorpayScript();
    this.treasureService.loadConfig().pipe(takeUntilDestroyed(this.destroyRef)).subscribe();

    // With a stored token the user object arrives after a refresh; the token
    // alone is enough to ask for the account, so do not flash the guest pitch.
    this.authService.user().pipe(takeUntilDestroyed(this.destroyRef)).subscribe((user) => {
      const signedIn = !!user || this.authService.isAuthenticated();
      if (!signedIn) {
        this.accountRequested = false;
        this.account.set(null);
        this.installments.set([]);
        this.accountState.set('guest');
        return;
      }
      if (!this.accountRequested) {
        this.accountRequested = true;
        this.loadAccount();
      }
    });
  }

  // ---- account -----------------------------------------------------------

  loadAccount() {
    this.accountState.set('loading');
    this.treasureService.getAccount().subscribe({
      next: (acct) => {
        this.account.set(acct);
        this.accountState.set('enrolled');
        this.loadInstallments();
      },
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.account.set(null);
          this.accountState.set('none');
        } else if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
          this.accountRequested = false;
          this.accountState.set('guest');
        } else {
          this.accountState.set('error');
        }
      },
    });
  }

  loadInstallments() {
    this.historyLoading.set(true);
    this.historyError.set('');
    this.treasureService.getInstallments().subscribe({
      next: (list) => {
        this.installments.set(Array.isArray(list) ? list : []);
        this.historyLoading.set(false);
      },
      error: () => {
        this.historyLoading.set(false);
        this.historyError.set('We could not load your installment history.');
      },
    });
  }

  updateInstallment(val: string | number) {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    this.installment.set(isNaN(num) ? this.config().minAmount : num);
    this.enrolError.set('');
  }

  enroll() {
    if (this.loading()) return;
    const amount = this.installment();
    const { minAmount, maxAmount } = this.config();
    if (!Number.isInteger(amount)) {
      this.enrolError.set('Please enter a whole-rupee amount.');
      return;
    }
    if (amount < minAmount || amount > maxAmount) {
      this.enrolError.set('Installment must be between ' + this.formatInr(minAmount) + ' and ' + this.formatInr(maxAmount) + '.');
      return;
    }
    this.enrolError.set('');
    this.loading.set(true);
    this.treasureService.enroll(amount).subscribe({
      next: (acct) => {
        this.loading.set(false);
        this.account.set(acct);
        this.accountState.set('enrolled');
        this.installments.set([]);
        this.loadInstallments();
        this.toastService.show(`Successfully enrolled in the Treasure Plan for ${this.currencyService.format(amount)}/mo!`, 'success');
      },
      error: (err: unknown) => {
        this.loading.set(false);
        const message = err instanceof HttpErrorResponse ? err.error?.message : '';
        this.enrolError.set(message || 'We could not enrol you right now. Please try again.');
      },
    });
  }

  // ---- installment payment (mirrors the gift-card Razorpay flow) --------

  payInstallment() {
    if (this.isPaying()) return;
    this.payError.set('');
    this.payNotice.set('');

    if (!isPlatformBrowser(this.platformId) || typeof Razorpay === 'undefined') {
      this.payError.set('The payment window could not load. Please check your connection or disable ad blockers, then try again.');
      return;
    }

    this.payStage.set('creating');
    this.treasureService.createInstallmentOrder().subscribe({
      next: (order) => this.openRazorpay(order),
      error: (err: unknown) => {
        this.payStage.set('idle');
        if (err instanceof HttpErrorResponse && err.status === 503) {
          // The interceptor's generic 5xx toast has already fired; the inline
          // copy is the specific explanation, not a second toast.
          this.payError.set('Online payment is not available right now. Please try again later, or visit a Caratloop store to pay this installment in person.');
        } else if (err instanceof HttpErrorResponse && err.status === 400) {
          this.payError.set(err.error?.message || 'This installment cannot be paid right now. Please refresh the page and try again.');
          this.refreshAccountQuietly();
        } else if (err instanceof HttpErrorResponse) {
          this.payError.set('We could not start your payment. Please try again.');
        } else {
          this.payError.set('Something went wrong. Please try again.');
        }
      },
    });
  }

  private openRazorpay(order: TreasureInstallmentOrderResponse) {
    this.payStage.set('paying');
    const acct = this.account();
    const user = this.authService.currentUser();
    const options: Razorpay.Options = {
      key: environment.razorpayKey,
      amount: order.amount,
      currency: order.currency || 'INR',
      name: 'Caratloop',
      description: (acct?.planName || 'Treasure Plan') + ' installment' + (acct ? ' ' + (acct.installmentsPaid + 1) + ' of ' + acct.totalInstallments : ''),
      order_id: order.razorpayOrderId,
      prefill: {
        name: user ? [user.firstName, user.lastName].filter(Boolean).join(' ') : undefined,
        email: user?.email,
        contact: user?.phone,
      },
      theme: {
        color: '#D4AF37',
      },
      handler: (response: Razorpay.PaymentSuccessResponse) => {
        this.confirmInstallment(order.installmentId, response);
      },
      modal: {
        ondismiss: () => {
          // Fires after a successful handler too; only treat it as a cancel
          // while we are still waiting on the payment.
          if (this.payStage() === 'paying') {
            this.payStage.set('idle');
            this.payNotice.set('Payment cancelled. Nothing has been charged; you can pay this installment whenever you are ready.');
          }
        },
      },
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', (response: Razorpay.PaymentFailedResponse) => {
      this.payStage.set('idle');
      const reason = response?.error?.description || 'The payment could not be completed.';
      this.payError.set('Payment failed: ' + reason + ' Nothing has been charged; you can try again.');
    });
    rzp.open();
  }

  private confirmInstallment(installmentId: string, response: Razorpay.PaymentSuccessResponse) {
    this.payStage.set('confirming');
    this.treasureService
      .confirmInstallment(installmentId, {
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      })
      .subscribe({
        next: (acct) => {
          // Use the returned account when it looks like one, then re-fetch so
          // the balance, status and history all come from the same source.
          if (acct && typeof acct === 'object' && 'installmentsPaid' in acct) {
            this.account.set(acct);
          }
          this.payStage.set('idle');
          this.toastService.show('Installment received. Thank you!', 'success');
          this.refreshAccountQuietly();
          this.loadInstallments();
        },
        error: () => {
          // Interceptor has toasted the server's message; leave the payment id
          // on screen so support can trace it.
          this.payStage.set('idle');
          this.payError.set(
            'Your payment went through but we could not record the installment. Please contact support and quote payment ID ' +
              response.razorpay_payment_id + '.',
          );
          this.refreshAccountQuietly();
        },
      });
  }

  /** Re-reads the account without flipping the page back into the loading state. */
  private refreshAccountQuietly() {
    this.treasureService.getAccount().subscribe({
      next: (acct) => {
        this.account.set(acct);
        this.accountState.set('enrolled');
      },
      error: () => {
        // Keep whatever is on screen; the next explicit action reloads.
      },
    });
  }

  // ---- display helpers ---------------------------------------------------

  bonusAmount(acct: TreasureChestAccount): number {
    if (typeof acct.bonusAmount === 'number') return acct.bonusAmount;
    return acct.installmentAmount * this.config().bonusMonths;
  }

  maturityAmount(acct: TreasureChestAccount): number {
    if (typeof acct.maturityAmount === 'number') return acct.maturityAmount;
    return acct.installmentAmount * acct.totalInstallments + this.bonusAmount(acct);
  }

  remainingInstallments(acct: TreasureChestAccount): number {
    return Math.max(0, (acct.totalInstallments || 0) - (acct.installmentsPaid || 0));
  }

  progressPercent(acct: TreasureChestAccount): number {
    if (!acct.totalInstallments) return 0;
    return Math.min(100, Math.round((acct.installmentsPaid / acct.totalInstallments) * 100));
  }

  statusLabel(status: TreasureChestAccount['status']): string {
    switch (status) {
      case 'ACTIVE': return 'Active';
      case 'MATURED': return 'Matured';
      case 'CLOSED': return 'Closed';
      default: return status;
    }
  }

  statusBadgeClass(status: TreasureChestAccount['status']): string {
    switch (status) {
      case 'ACTIVE': return '!bg-[#fbf8ef] !text-[#B5952F]';
      case 'MATURED': return '!bg-green-50 !text-green-700';
      default: return '!bg-[#f5f5f7] !text-[#6e6e73]';
    }
  }

  installmentStatusLabel(status: TreasureInstallment['status']): string {
    switch (status) {
      case 'PAID': return 'Paid';
      case 'PENDING': return 'Awaiting payment';
      case 'FAILED': return 'Failed';
      default: return status;
    }
  }

  installmentBadgeClass(status: TreasureInstallment['status']): string {
    switch (status) {
      case 'PAID': return '!bg-green-50 !text-green-700';
      case 'FAILED': return '!bg-red-50 !text-red-600';
      default: return '!bg-amber-50 !text-amber-700';
    }
  }

  methodLabel(method: TreasureInstallment['method']): string {
    switch (method) {
      case 'RAZORPAY': return 'Paid online';
      case 'CASH': return 'Paid in store';
      case 'ADMIN': return 'Recorded by Caratloop';
      default: return method;
    }
  }

  trackByInstallment(_index: number, inst: TreasureInstallment): string {
    return inst.id;
  }

  /** Installments are INR by contract; button labels must not follow the display currency. */
  private formatInr(value: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  }

  // ---- razorpay ---------------------------------------------------------

  private loadRazorpayScript() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) return;
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }
}
