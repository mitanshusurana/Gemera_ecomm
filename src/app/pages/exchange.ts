import { Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, switchMap, tap } from 'rxjs/operators';
import { ExchangeService } from '../services/exchange.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { SeoService } from '../services/seo.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import {
  EXCHANGE_PAN_THRESHOLD,
  EXCHANGE_PURITIES,
  EXCHANGE_STEPS,
  ExchangeMetal,
  ExchangeQuote,
  ExchangeRequest,
  exchangeStatusLabel,
  exchangeStepIndex,
  isExchangeOpen,
} from '../core/exchange.models';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

type FieldKey = 'weight' | 'customerName' | 'phone' | 'email' | 'pan';

/**
 * Old gold exchange: live estimate from the metal rate, a request form with
 * Rule 114B PAN capture, and a public tracker by request number + phone.
 */
@Component({
  selector: 'app-exchange',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CurrencyConvertPipe],
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">

      <!-- Hero -->
      <section class="bg-[#1c1c1e] text-white py-20 border-b border-white/10">
        <div class="max-w-[1080px] mx-auto px-6 md:px-12 text-center">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-3">Old gold exchange</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl tracking-tight text-white mb-4">Turn old gold into something new</h1>
          <p class="text-lg md:text-xl max-w-2xl mx-auto text-[#a1a1a6]">
            Bring in or send us old jewellery. We assay it, value it at the rate of the day, and issue the amount as store credit you can spend on any Caratloop piece.
          </p>
        </div>
      </section>

      <!-- Success panel -->
      <section *ngIf="submitted()" class="max-w-[880px] mx-auto px-6 md:px-12 pt-16">
        <div class="bg-[#fafafc] border border-[#e0e0e0] rounded-[18px] p-8 md:p-10 text-center">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-3">Request placed</span>
          <h2 class="font-display font-semibold text-3xl tracking-tight mb-2">Your request number</h2>
          <p class="font-mono text-2xl md:text-3xl tracking-[0.08em] text-[#1d1d1f] mb-6">{{ submitted()!.requestNumber }}</p>
          <p class="text-[#6e6e73] max-w-xl mx-auto mb-8">
            Keep this number. The estimate of <strong class="text-[#1d1d1f]">{{ submitted()!.quotedValue | currencyConvert }}</strong>
            is based on your declared {{ submitted()!.declaredPurity }} {{ submitted()!.metal | titlecase }} and {{ submitted()!.declaredWeightGrams }} g;
            the final value follows our assay at the rate on that day.
          </p>
          <ol class="grid sm:grid-cols-3 gap-6 text-left mb-8">
            <li class="border border-[#e0e0e0] rounded-[12px] p-5 bg-white">
              <p class="text-[#D4AF37] font-semibold text-xs uppercase tracking-wider mb-2">1. Send or bring</p>
              <p class="text-sm text-[#6e6e73]">Visit any Caratloop store with a photo ID, or reply to our e-mail to arrange insured pickup.</p>
            </li>
            <li class="border border-[#e0e0e0] rounded-[12px] p-5 bg-white">
              <p class="text-[#D4AF37] font-semibold text-xs uppercase tracking-wider mb-2">2. Assay</p>
              <p class="text-sm text-[#6e6e73]">We test the purity and weigh the piece net of stones and solder while you watch or within a day of receipt.</p>
            </li>
            <li class="border border-[#e0e0e0] rounded-[12px] p-5 bg-white">
              <p class="text-[#D4AF37] font-semibold text-xs uppercase tracking-wider mb-2">3. Credit</p>
              <p class="text-sm text-[#6e6e73]">The value is e-mailed to you as a store-credit code. Enter it in the gift card field at checkout.</p>
            </li>
          </ol>
          <div class="flex flex-col sm:flex-row gap-3 justify-center">
            <a routerLink="/products" class="btn-apple-pill">Browse the collection</a>
            <button type="button" (click)="reset()" class="btn-outline">Start another estimate</button>
          </div>
        </div>
      </section>

      <!-- Calculator + request form -->
      <section *ngIf="!submitted()" class="max-w-[1440px] mx-auto px-6 md:px-12 py-16 md:py-24">
        <div class="flex flex-col lg:flex-row gap-12 lg:gap-20 max-w-6xl mx-auto">

          <!-- Left: calculator -->
          <div class="lg:w-1/2 space-y-10">
            <div>
              <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">Step 1</span>
              <h2 class="font-display font-semibold text-3xl tracking-tight mb-6">Estimate the value</h2>

              <div class="space-y-6">
                <!-- Metal -->
                <div>
                  <label class="block text-sm font-semibold mb-2">Metal</label>
                  <div class="grid grid-cols-2 gap-3">
                    <button type="button" (click)="setMetal('GOLD')"
                            class="active-press border rounded-[12px] py-3 text-sm font-medium transition-colors"
                            [ngClass]="metal() === 'GOLD' ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#1d1d1f]' : 'border-[#e0e0e0] text-[#6e6e73] hover:border-[#1d1d1f]'">Gold</button>
                    <button type="button" (click)="setMetal('SILVER')"
                            class="active-press border rounded-[12px] py-3 text-sm font-medium transition-colors"
                            [ngClass]="metal() === 'SILVER' ? 'border-[#D4AF37] bg-[#D4AF37]/10 text-[#1d1d1f]' : 'border-[#e0e0e0] text-[#6e6e73] hover:border-[#1d1d1f]'">Silver</button>
                  </div>
                </div>

                <!-- Purity -->
                <div>
                  <label for="ex-purity" class="block text-sm font-semibold mb-2">Purity as marked or declared</label>
                  <select id="ex-purity" class="input-field" [ngModel]="purity()" (ngModelChange)="setPurity($event)">
                    <option *ngFor="let p of purities()" [value]="p.value">{{ p.label }}</option>
                  </select>
                  <p class="text-xs text-[#7a7a7a] mt-2">Hallmarked pieces carry the fineness (916, 750). If unsure, pick what you believe; our assay decides the final value.</p>
                </div>

                <!-- Weight -->
                <div>
                  <label for="ex-weight" class="block text-sm font-semibold mb-2">Approximate weight (grams)</label>
                  <input id="ex-weight" type="number" inputmode="decimal" min="0.1" step="0.1" class="input-field"
                         [ngModel]="weight()" (ngModelChange)="setWeight($event)" placeholder="e.g. 12.5">
                  <p *ngIf="fieldErrors().weight" class="text-xs text-red-600 mt-2">{{ fieldErrors().weight }}</p>
                </div>
              </div>
            </div>

            <!-- Estimate -->
            <div class="bg-[#1c1c1e] text-white rounded-[18px] p-8">
              <p class="text-[#a1a1a6] text-xs font-semibold uppercase tracking-[0.15em] mb-1">Estimated store credit</p>
              <ng-container *ngIf="quote(); else noQuote">
                <p class="font-display font-semibold text-4xl tracking-tight">{{ quote()!.estimatedValue | currencyConvert }}</p>
                <dl class="grid grid-cols-2 gap-x-6 gap-y-3 mt-6 text-sm">
                  <dt class="text-[#a1a1a6]">Rate at {{ quote()!.purity }}</dt>
                  <dd class="text-right">{{ quote()!.rate | currencyConvert }} / g</dd>
                  <dt class="text-[#a1a1a6]">Fine {{ quote()!.metal | titlecase }} rate</dt>
                  <dd class="text-right">{{ quote()!.ratePerGramFine | currencyConvert }} / g</dd>
                  <dt class="text-[#a1a1a6]">Purity</dt>
                  <dd class="text-right">{{ quote()!.purityFraction * 100 | number:'1.1-1' }}%</dd>
                  <dt class="text-[#a1a1a6]">Melting deduction</dt>
                  <dd class="text-right">{{ quote()!.deductionPct | number:'1.0-2' }}%</dd>
                </dl>
                <p class="text-xs text-[#a1a1a6] mt-6 leading-relaxed">
                  <ng-container *ngIf="quote()!.indicative">
                    <span class="text-[#D4AF37] font-semibold">Indicative:</span> the live market feed is unavailable right now, so this uses our reference rate.
                  </ng-container>
                  <ng-container *ngIf="!quote()!.indicative">Based on the live market rate.</ng-container>
                  The final value is fixed only after assay, at the rate of that day, on the net metal weight (stones, solder and dirt removed).
                </p>
              </ng-container>
              <ng-template #noQuote>
                <p class="font-display font-semibold text-4xl tracking-tight text-[#6e6e73]">{{ quoting() ? 'Calculating…' : '—' }}</p>
                <p class="text-xs text-[#a1a1a6] mt-4">{{ quoteError() || 'Enter the weight to see an estimate.' }}</p>
              </ng-template>
            </div>
          </div>

          <!-- Right: request form -->
          <div class="lg:w-1/2">
            <div class="lg:sticky lg:top-[120px] bg-white border border-[#e0e0e0] rounded-[18px] p-8">
              <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">Step 2</span>
              <h2 class="font-display font-semibold text-3xl tracking-tight mb-2">Request the exchange</h2>
              <p class="text-sm text-[#6e6e73] mb-6">We lock your estimate on file, give you a request number and tell you how to get the piece to us.</p>

              <form (ngSubmit)="submit()" class="space-y-5" novalidate>
                <div>
                  <label for="ex-name" class="block text-sm font-semibold mb-2">Full name</label>
                  <input id="ex-name" type="text" class="input-field" [(ngModel)]="form.customerName" name="customerName" autocomplete="name">
                  <p *ngIf="fieldErrors().customerName" class="text-xs text-red-600 mt-2">{{ fieldErrors().customerName }}</p>
                </div>
                <div class="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label for="ex-phone" class="block text-sm font-semibold mb-2">Phone</label>
                    <input id="ex-phone" type="tel" class="input-field" [(ngModel)]="form.phone" name="phone" autocomplete="tel" placeholder="+91 98xxx xxxxx">
                    <p *ngIf="fieldErrors().phone" class="text-xs text-red-600 mt-2">{{ fieldErrors().phone }}</p>
                  </div>
                  <div>
                    <label for="ex-email" class="block text-sm font-semibold mb-2">Email</label>
                    <input id="ex-email" type="email" class="input-field" [(ngModel)]="form.email" name="email" autocomplete="email">
                    <p *ngIf="fieldErrors().email" class="text-xs text-red-600 mt-2">{{ fieldErrors().email }}</p>
                  </div>
                </div>

                <!-- PAN (Rule 114B) -->
                <div>
                  <label for="ex-pan" class="block text-sm font-semibold mb-2">
                    PAN <span *ngIf="panRequired()" class="text-red-600">*</span>
                    <span *ngIf="!panRequired()" class="text-[#7a7a7a] font-normal">(optional)</span>
                  </label>
                  <input id="ex-pan" type="text" class="input-field uppercase font-mono tracking-[0.08em]" maxlength="10"
                         [(ngModel)]="form.pan" name="pan" placeholder="ABCDE1234F" autocomplete="off">
                  <p *ngIf="fieldErrors().pan" class="text-xs text-red-600 mt-2">{{ fieldErrors().pan }}</p>
                  <p *ngIf="panRequired()" class="text-xs text-[#7a7a7a] mt-2">
                    Your estimate is ₹2,00,000 or more. Income-tax Rule 114B requires us to record the seller's PAN for a purchase of this value, so we cannot issue the credit without it.
                  </p>
                </div>

                <div>
                  <label for="ex-state" class="block text-sm font-semibold mb-2">State <span class="text-[#7a7a7a] font-normal">(optional)</span></label>
                  <input id="ex-state" type="text" class="input-field" [(ngModel)]="form.state" name="state" placeholder="e.g. Rajasthan" autocomplete="address-level1">
                </div>

                <div>
                  <label for="ex-desc" class="block text-sm font-semibold mb-2">Describe the item <span class="text-[#7a7a7a] font-normal">(optional)</span></label>
                  <textarea id="ex-desc" rows="3" maxlength="2000" class="input-field" [(ngModel)]="form.itemDescription" name="itemDescription"
                            placeholder="e.g. 22K bangle pair, one with a small dent; no stones"></textarea>
                </div>

                <p *ngIf="submitError()" class="text-sm text-red-600">{{ submitError() }}</p>

                <button type="submit" class="btn-apple-pill w-full" [disabled]="submitting() || !quote()">
                  {{ submitting() ? 'Placing request…' : 'Place exchange request' }}
                </button>
                <p class="text-[11px] text-[#7a7a7a] leading-relaxed">
                  By continuing you confirm the item is yours to sell. Credit is issued as a Caratloop store-credit code valid for 12 months; it is not paid out in cash.
                </p>
              </form>
            </div>
          </div>
        </div>
      </section>

      <!-- How it works -->
      <section class="bg-[#f5f5f7] border-y border-[#e0e0e0] py-16 md:py-20">
        <div class="max-w-[1080px] mx-auto px-6 md:px-12">
          <div class="text-center mb-12">
            <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">How it works</span>
            <h2 class="font-display font-semibold text-3xl md:text-4xl tracking-tight">Transparent from estimate to credit</h2>
          </div>
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div class="store-utility-card p-6">
              <p class="font-display font-semibold text-2xl text-[#D4AF37] mb-2">01</p>
              <h3 class="font-semibold mb-2">Estimate online</h3>
              <p class="text-sm text-[#6e6e73]">The calculator applies the live fine-metal rate, your declared purity and a small melting deduction.</p>
            </div>
            <div class="store-utility-card p-6">
              <p class="font-display font-semibold text-2xl text-[#D4AF37] mb-2">02</p>
              <h3 class="font-semibold mb-2">Hand in or ship</h3>
              <p class="text-sm text-[#6e6e73]">Bring the piece to a store with photo ID, or arrange an insured pickup with our concierge.</p>
            </div>
            <div class="store-utility-card p-6">
              <p class="font-display font-semibold text-2xl text-[#D4AF37] mb-2">03</p>
              <h3 class="font-semibold mb-2">Assay</h3>
              <p class="text-sm text-[#6e6e73]">Purity is tested and the piece is weighed net of stones and solder. You see the reading.</p>
            </div>
            <div class="store-utility-card p-6">
              <p class="font-display font-semibold text-2xl text-[#D4AF37] mb-2">04</p>
              <h3 class="font-semibold mb-2">Store credit</h3>
              <p class="text-sm text-[#6e6e73]">The value arrives by e-mail as a code. Use it in the gift card field at checkout, on anything, any time within 12 months.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Track -->
      <section id="track" class="max-w-[720px] mx-auto px-6 md:px-12 py-16 md:py-24">
        <div class="text-center mb-10">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">Already handed in?</span>
          <h2 class="font-display font-semibold text-3xl tracking-tight">Track an exchange</h2>
        </div>
        <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
          <div class="grid sm:grid-cols-2 gap-5">
            <div>
              <label for="track-number" class="block text-sm font-semibold mb-2">Request number</label>
              <input id="track-number" type="text" class="input-field font-mono uppercase" [(ngModel)]="track.requestNumber" name="trackNumber" placeholder="EX-2026-00001">
            </div>
            <div>
              <label for="track-phone" class="block text-sm font-semibold mb-2">Phone used on the request</label>
              <input id="track-phone" type="tel" class="input-field" [(ngModel)]="track.phone" name="trackPhone" placeholder="+91 98xxx xxxxx">
            </div>
          </div>
          <button type="button" (click)="doTrack()" [disabled]="tracking()" class="btn-apple-pill w-full mt-6">
            {{ tracking() ? 'Looking up…' : 'Track exchange' }}
          </button>
        </div>

        <div *ngIf="tracked()" class="mt-8 bg-white border border-[#e0e0e0] rounded-[18px] p-8 animate-fadeIn">
          <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-6 border-b border-[#e0e0e0]">
            <div>
              <p class="font-mono text-[#D4AF37] font-semibold">{{ tracked()!.requestNumber }}</p>
              <p class="text-sm text-[#6e6e73] mt-1">{{ tracked()!.declaredWeightGrams }} g {{ tracked()!.declaredPurity }} {{ tracked()!.metal | titlecase }} &middot; placed {{ tracked()!.createdAt | date:'mediumDate' }}</p>
            </div>
            <div class="sm:text-right">
              <p class="font-sans font-semibold text-2xl">{{ (tracked()!.finalValue ?? tracked()!.quotedValue) | currencyConvert }}</p>
              <span class="badge mt-1">{{ statusLabel(tracked()!.status) }}</span>
            </div>
          </div>

          <!-- Progress strip -->
          <div *ngIf="isOpen(tracked()!.status) || tracked()!.status === 'CREDITED'" class="relative flex items-center justify-between my-8">
            <div class="absolute top-4 left-8 right-8 h-1 bg-[#e0e0e0] -translate-y-1/2 z-0"></div>
            <div class="absolute top-4 left-8 h-1 bg-[#D4AF37] -translate-y-1/2 z-0 transition-all duration-700"
                 [style.width]="progressWidth(tracked()!.status)"></div>
            <div *ngFor="let step of steps; let i = index" class="flex flex-col items-center gap-2 z-10 w-16">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ring-4 ring-white"
                   [ngClass]="stepIndex(tracked()!.status) >= i ? 'bg-[#D4AF37] text-black' : 'bg-[#f5f5f7] border border-[#e0e0e0] text-[#6e6e73]'">
                {{ stepIndex(tracked()!.status) >= i ? '✓' : i + 1 }}
              </div>
              <span class="text-xs font-medium text-center">{{ statusLabel(step) }}</span>
            </div>
          </div>

          <div *ngIf="tracked()!.status === 'CREDITED'" class="bg-[#fafafc] border border-[#e0e0e0] rounded-[12px] p-5 mb-6 text-sm">
            <p class="font-semibold mb-1">Store credit issued</p>
            <p class="text-[#6e6e73]">Code {{ tracked()!.creditGiftCardCode }} for {{ (tracked()!.finalValue ?? 0) | currencyConvert }}. The full code is in the e-mail we sent to {{ tracked()!.email }}; enter it in the gift card field at checkout.</p>
          </div>
          <div *ngIf="tracked()!.status === 'REJECTED'" class="bg-[#fafafc] border border-[#e0e0e0] rounded-[12px] p-5 mb-6 text-sm">
            <p class="font-semibold mb-1">Not accepted</p>
            <p class="text-[#6e6e73]">{{ tracked()!.rejectionReason || 'Please contact us for details.' }}</p>
          </div>

          <!-- Timeline -->
          <ol class="space-y-4">
            <li *ngFor="let e of tracked()!.events" class="flex gap-4 text-sm">
              <span class="mt-1.5 w-2 h-2 rounded-full bg-[#D4AF37] shrink-0"></span>
              <div>
                <p class="font-semibold">{{ statusLabel(e.status) }} <span class="text-[#7a7a7a] font-normal">&middot; {{ e.at | date:'medium' }}</span></p>
                <p *ngIf="e.note" class="text-[#6e6e73]">{{ e.note }}</p>
              </div>
            </li>
          </ol>
        </div>
      </section>
    </div>
  `,
})
export class ExchangeComponent implements OnInit {
  private exchangeService = inject(ExchangeService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private seo = inject(SeoService);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  // Calculator state
  metal = signal<ExchangeMetal>('GOLD');
  purity = signal('22K');
  weight = signal<number | null>(null);
  purities = computed(() => EXCHANGE_PURITIES[this.metal()]);

  quote = signal<ExchangeQuote | null>(null);
  quoting = signal(false);
  quoteError = signal<string | null>(null);
  panRequired = computed(() => (this.quote()?.estimatedValue ?? 0) >= EXCHANGE_PAN_THRESHOLD);

  // Request form
  form = { customerName: '', phone: '', email: '', pan: '', state: '', itemDescription: '' };
  fieldErrors = signal<Partial<Record<FieldKey, string>>>({});
  submitting = signal(false);
  submitError = signal<string | null>(null);
  submitted = signal<ExchangeRequest | null>(null);

  // Tracker
  track = { requestNumber: '', phone: '' };
  tracking = signal(false);
  tracked = signal<ExchangeRequest | null>(null);
  readonly steps = EXCHANGE_STEPS;

  private quote$ = new Subject<void>();

  constructor() {
    this.quote$
      .pipe(
        debounceTime(350),
        tap(() => {
          this.quoting.set(true);
          this.quoteError.set(null);
        }),
        switchMap(() => {
          const w = this.weight();
          if (!w || w <= 0) {
            this.quoting.set(false);
            return of(null);
          }
          return this.exchangeService.quote(this.metal(), this.purity(), w).pipe(
            catchError((err: HttpErrorResponse) => {
              this.quoteError.set(err?.error?.message || 'Could not fetch a rate right now.');
              return of(null);
            }),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((q) => {
        this.quote.set(q);
        this.quoting.set(false);
      });

    // Prefill contact details for a signed-in customer; never overwrite what they typed.
    effect(() => {
      const user = this.authService.currentUser();
      if (!user) return;
      if (!this.form.customerName) this.form.customerName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
      if (!this.form.email) this.form.email = user.email ?? '';
      if (!this.form.phone) this.form.phone = user.phone ?? '';
    });
  }

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Old Gold Exchange | Caratloop',
      description: 'Exchange old gold or silver jewellery for Caratloop store credit. Live estimate from the market rate, assay at the counter, credit usable on any piece.',
      url: '/exchange',
    });
    this.route.queryParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (params['track']) {
        this.track.requestNumber = String(params['track']);
      }
    });
  }

  // ---- calculator ----

  setMetal(metal: ExchangeMetal): void {
    if (this.metal() === metal) return;
    this.metal.set(metal);
    // Default to the common hallmark: 22K for gold, sterling 925 for silver.
    this.purity.set(EXCHANGE_PURITIES[metal][1].value);
    this.quote$.next();
  }

  setPurity(value: string): void {
    this.purity.set(value);
    this.quote$.next();
  }

  setWeight(value: unknown): void {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
    this.weight.set(Number.isFinite(n) && n > 0 ? n : null);
    this.fieldErrors.update((e) => ({ ...e, weight: undefined }));
    if (this.weight() === null) {
      this.quote.set(null);
    }
    this.quote$.next();
  }

  // ---- request ----

  submit(): void {
    const errors: Partial<Record<FieldKey, string>> = {};
    const w = this.weight();
    if (!w || w <= 0) errors.weight = 'Enter the approximate weight in grams.';
    if (!this.form.customerName.trim()) errors.customerName = 'Your name is required.';
    if (this.form.phone.replace(/\D/g, '').length < 6) errors.phone = 'A phone number is required so we can reach you.';
    if (!EMAIL_RE.test(this.form.email.trim())) errors.email = 'Enter a valid email address; the credit code is sent there.';
    const pan = this.form.pan.trim().toUpperCase();
    if (pan && !PAN_RE.test(pan)) errors.pan = 'PAN must be 10 characters in the form ABCDE1234F.';
    if (!pan && this.panRequired()) errors.pan = 'PAN is required for a value of ₹2,00,000 or more (Rule 114B).';
    this.fieldErrors.set(errors);
    if (Object.values(errors).some(Boolean) || !w) {
      return;
    }

    this.submitting.set(true);
    this.submitError.set(null);
    this.exchangeService
      .create({
        metal: this.metal(),
        purity: this.purity(),
        weightGrams: w,
        customerName: this.form.customerName.trim(),
        phone: this.form.phone.trim(),
        email: this.form.email.trim(),
        pan: pan || undefined,
        state: this.form.state.trim() || undefined,
        itemDescription: this.form.itemDescription.trim() || undefined,
      })
      .subscribe({
        next: (req) => {
          this.submitting.set(false);
          this.submitted.set(req);
          this.toast.show(`Exchange request ${req.requestNumber} placed`, 'success');
        },
        error: (err: HttpErrorResponse) => {
          this.submitting.set(false);
          this.submitError.set(err?.error?.message || 'Could not place the request. Please try again.');
        },
      });
  }

  reset(): void {
    this.submitted.set(null);
    this.form.pan = '';
    this.form.itemDescription = '';
    this.weight.set(null);
    this.quote.set(null);
  }

  // ---- tracker ----

  doTrack(): void {
    if (!this.track.requestNumber.trim() || !this.track.phone.trim()) {
      this.toast.show('Enter the request number and the phone used on it', 'error');
      return;
    }
    this.tracking.set(true);
    this.tracked.set(null);
    this.exchangeService.track(this.track.requestNumber, this.track.phone).subscribe({
      next: (req) => {
        this.tracked.set(req);
        this.tracking.set(false);
      },
      error: () => {
        this.tracking.set(false);
        this.toast.show('No exchange request matches that number and phone', 'error');
      },
    });
  }

  statusLabel(status: string): string {
    return exchangeStatusLabel(status);
  }

  stepIndex(status: string): number {
    return exchangeStepIndex(status);
  }

  isOpen(status: string): boolean {
    return isExchangeOpen(status);
  }

  progressWidth(status: string): string {
    const i = exchangeStepIndex(status);
    const total = EXCHANGE_STEPS.length - 1;
    if (i <= 0) return '0%';
    if (i >= total) return 'calc(100% - 4rem)';
    return `calc(${(i / total) * 100}% - ${(i / total) * 4}rem)`;
  }
}
