import {
  Component,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import { GiftCardService } from '../services/gift-card.service';
import { AuthService } from '../services/auth.service';
import {
  GIFT_CARD_AMOUNT,
  GiftCardBalanceResponse,
  GiftCardDTO,
  GiftCardPurchaseResponse,
  GiftCardTheme,
} from '../core/dtos';
import { environment } from '../../environments/environment';

type PurchaseStage = 'form' | 'creating' | 'paying' | 'confirming' | 'done';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_MAX = 500;

type GiftCardFieldKey = 'amount' | 'purchaserEmail' | 'recipientName' | 'recipientEmail' | 'message';
type GiftCardFieldErrors = Partial<Record<GiftCardFieldKey, string>>;

@Component({
  selector: 'app-gift-card',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyConvertPipe],
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">
      <!-- Hero Section -->
      <div class="bg-[#1c1c1e] text-white py-20 border-b border-white/10">
        <div class="max-w-[1080px] mx-auto px-6 md:px-12 text-center">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-3">Caratloop Digital Gift Card</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl tracking-tight text-white mb-4">The Gift of Choice</h1>
          <p class="text-lg md:text-xl max-w-2xl mx-auto text-[#a1a1a6]">Give them the luxury of choosing their own perfect piece with a Caratloop Digital Gift Card.</p>
        </div>
      </div>

      <!-- Main Content -->
      <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-16 md:py-24">
        <div class="flex flex-col md:flex-row gap-12 lg:gap-24 max-w-6xl mx-auto">

          <!-- Left: Gift Card Visual -->
          <div class="md:w-1/2">
            <div class="sticky top-[120px]">
              <div class="relative w-full aspect-[1.586/1] rounded-[18px] overflow-hidden product-surface-shadow transition-transform duration-500 hover:scale-[1.02]"
                   [ngClass]="getCardBgClass(selectedTheme())">

                <!-- Card Inner Styling -->
                <div class="absolute inset-0 p-8 flex flex-col justify-between">
                  <div class="flex justify-between items-start">
                    <img src="/logo-with-name.webp" alt="Caratloop" class="h-8 brightness-0 invert opacity-90">
                    <span class="text-white font-sans tracking-[0.2em] text-xs opacity-80 uppercase">Gift Card</span>
                  </div>

                  <div class="text-white">
                    <div class="font-display font-semibold text-4xl tracking-tight mb-2">
                      {{ amount() | currencyConvert }}
                    </div>
                    <div class="flex items-end justify-between gap-4">
                      <div class="text-xs font-medium tracking-[0.15em] opacity-80 uppercase">{{ getThemeName(selectedTheme()) }} Edition</div>
                      <div *ngIf="issuedCard() as card" class="font-mono text-sm tracking-[0.15em] opacity-90">{{ card.code }}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div class="mt-8 grid grid-cols-3 gap-4">
                <button *ngFor="let theme of themes"
                        type="button"
                        (click)="selectedTheme.set(theme.id)"
                        [disabled]="isBusy()"
                        [attr.aria-label]="theme.name"
                        [attr.aria-pressed]="selectedTheme() === theme.id"
                        class="h-16 rounded-[12px] border-2 transition-all relative overflow-hidden active-press"
                        [ngClass]="[
                          getCardBgClass(theme.id),
                          selectedTheme() === theme.id ? 'border-[#D4AF37]' : 'border-transparent hover:border-[#D4AF37]/50'
                        ]">
                   <span class="absolute inset-0 flex items-center justify-center text-white font-medium text-xs bg-black/30 backdrop-blur-[2px] opacity-0 hover:opacity-100 transition-opacity">{{theme.name}}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Right: Purchase Form / Success -->
          <div class="md:w-1/2">

            <!-- Success state -->
            <div *ngIf="issuedCard() as card; else purchaseForm" class="bg-white p-8 rounded-[18px] border border-[#e0e0e0] animate-fade-in-up" aria-live="polite">
              <div class="w-14 h-14 rounded-full bg-green-50 border border-green-100 flex items-center justify-center mb-6">
                <svg class="w-7 h-7 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
              </div>
              <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">Payment received</span>
              <h2 class="font-display font-semibold text-2xl md:text-3xl tracking-tight text-[#1d1d1f] mb-3">Your gift card is on its way.</h2>
              <p class="text-sm text-[#6e6e73] mb-8">
                We have emailed the card to <span class="font-semibold text-[#1d1d1f]">{{ card.recipientEmail }}</span>
                and a receipt to <span class="font-semibold text-[#1d1d1f]">{{ purchaserEmail() }}</span>.
              </p>

              <div class="bg-[#f5f5f7] rounded-[12px] p-6 mb-6">
                <p class="text-xs uppercase tracking-wider font-semibold text-[#6e6e73] mb-2">Gift card code</p>
                <p class="font-mono text-2xl tracking-[0.1em] text-[#1d1d1f] break-all">{{ card.code }}</p>
              </div>

              <dl class="grid grid-cols-2 gap-4 text-sm mb-8">
                <div>
                  <dt class="text-[#6e6e73]">Balance</dt>
                  <dd class="font-semibold text-[#1d1d1f] text-lg">{{ card.balance | currencyConvert }}</dd>
                </div>
                <div>
                  <dt class="text-[#6e6e73]">Valid until</dt>
                  <dd class="font-semibold text-[#1d1d1f] text-lg">{{ card.expiresAt | date:'d MMM y' }}</dd>
                </div>
                <div>
                  <dt class="text-[#6e6e73]">Recipient</dt>
                  <dd class="font-semibold text-[#1d1d1f]">{{ card.recipientName }}</dd>
                </div>
                <div>
                  <dt class="text-[#6e6e73]">Edition</dt>
                  <dd class="font-semibold text-[#1d1d1f]">{{ getThemeName(card.theme) }}</dd>
                </div>
              </dl>

              <div class="flex flex-col sm:flex-row gap-3">
                <button type="button" (click)="checkIssuedCardBalance(card)" class="btn-apple-pill flex-1 text-sm !py-3">Check balance</button>
                <button type="button" (click)="startAnother()" class="btn-outline flex-1 text-sm !py-3">Buy another</button>
              </div>
              <p class="text-center text-xs text-[#6e6e73] mt-6">Redeem it at checkout under "Have a gift card?". The balance carries over across orders.</p>
            </div>

            <!-- Purchase form -->
            <ng-template #purchaseForm>
              <div class="bg-white p-8 rounded-[18px] border border-[#e0e0e0]">
                <h2 class="font-display font-semibold text-2xl md:text-3xl tracking-tight text-[#1d1d1f] mb-8">Customize Your Gift</h2>

                <form (ngSubmit)="buy()" novalidate>

                  <!-- Amount Selection -->
                  <div class="mb-8">
                    <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-4">Select Amount</label>
                    <div class="grid grid-cols-3 gap-3">
                      <button *ngFor="let val of predefinedAmounts"
                              type="button"
                              (click)="selectPreset(val)"
                              [disabled]="isBusy()"
                              [attr.aria-pressed]="amount() === val && customAmount() === null"
                              class="py-3 px-2 rounded-full border font-medium text-sm transition-colors active-press"
                              [ngClass]="amount() === val && customAmount() === null
                                ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]'
                                : 'bg-white text-[#1d1d1f] border-[#e0e0e0] hover:border-[#1d1d1f]'">
                        {{ val | currencyConvert }}
                      </button>
                    </div>

                    <div class="mt-4 relative">
                      <span class="absolute left-4 top-1/2 -translate-y-1/2 text-[#6e6e73] font-medium" aria-hidden="true">&#8377;</span>
                      <input type="number"
                             [ngModel]="customAmount()"
                             (ngModelChange)="onCustomAmountChange($event)"
                             name="customAmount"
                             [min]="minAmount"
                             [max]="maxAmount"
                             step="1"
                             inputmode="numeric"
                             [disabled]="isBusy()"
                             placeholder="Custom amount (INR)"
                             aria-label="Custom amount in rupees"
                             class="input-field !pl-8">
                    </div>
                    <p class="text-xs mt-2" [ngClass]="fieldErrors().amount ? 'text-red-600' : 'text-[#6e6e73]'">
                      {{ fieldErrors().amount || ('Whole rupees, from ' + (minAmount | currencyConvert) + ' to ' + (maxAmount | currencyConvert) + '.') }}
                    </p>
                  </div>

                  <!-- Purchaser -->
                  <div class="space-y-4 mb-8">
                    <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Your Details</label>
                    <div>
                      <input type="email"
                             [ngModel]="purchaserEmail()"
                             (ngModelChange)="purchaserEmail.set($event)"
                             name="purchaserEmail"
                             placeholder="Your email (for the receipt)"
                             required
                             autocomplete="email"
                             [disabled]="isBusy()"
                             aria-label="Your email"
                             class="input-field"
                             [class.!border-red-400]="fieldErrors().purchaserEmail">
                      <p *ngIf="fieldErrors().purchaserEmail" class="text-red-600 text-xs mt-1">{{ fieldErrors().purchaserEmail }}</p>
                    </div>
                  </div>

                  <!-- Recipient Details -->
                  <div class="space-y-4 mb-8">
                    <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Delivery Details</label>

                    <div>
                      <input type="text"
                             [ngModel]="recipientName()"
                             (ngModelChange)="recipientName.set($event)"
                             name="recipientName"
                             placeholder="Recipient's Name"
                             required
                             maxlength="120"
                             [disabled]="isBusy()"
                             aria-label="Recipient's name"
                             class="input-field"
                             [class.!border-red-400]="fieldErrors().recipientName">
                      <p *ngIf="fieldErrors().recipientName" class="text-red-600 text-xs mt-1">{{ fieldErrors().recipientName }}</p>
                    </div>
                    <div>
                      <input type="email"
                             [ngModel]="recipientEmail()"
                             (ngModelChange)="recipientEmail.set($event)"
                             name="recipientEmail"
                             placeholder="Recipient's Email"
                             required
                             [disabled]="isBusy()"
                             aria-label="Recipient's email"
                             class="input-field"
                             [class.!border-red-400]="fieldErrors().recipientEmail">
                      <p *ngIf="fieldErrors().recipientEmail" class="text-red-600 text-xs mt-1">{{ fieldErrors().recipientEmail }}</p>
                    </div>
                    <div>
                      <textarea [ngModel]="message()"
                                (ngModelChange)="message.set($event)"
                                name="message"
                                placeholder="Add a Personal Message (Optional)"
                                rows="3"
                                [maxlength]="messageMax"
                                [disabled]="isBusy()"
                                aria-label="Personal message"
                                class="input-field resize-none"></textarea>
                      <p class="text-xs text-[#6e6e73] mt-1 text-right">{{ message().length }} / {{ messageMax }}</p>
                    </div>
                  </div>

                  <!-- Flow feedback -->
                  <div *ngIf="formError()" role="alert" class="mb-6 flex items-start gap-3 rounded-[12px] border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                    <svg class="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></svg>
                    <span>{{ formError() }}</span>
                  </div>
                  <div *ngIf="formNotice()" role="status" class="mb-6 rounded-[12px] border border-[#e0e0e0] bg-[#f5f5f7] p-4 text-sm text-[#1d1d1f]">
                    {{ formNotice() }}
                  </div>

                  <!-- Actions -->
                  <button type="submit"
                          [disabled]="isBusy()"
                          class="btn-apple-pill w-full !py-4">
                    {{ submitLabel() }}
                  </button>

                  <p class="text-center text-xs text-[#6e6e73] mt-4">Gift cards are delivered by email with instructions to redeem them at checkout. They are valid for 12 months from purchase and carry no processing fees.</p>
                </form>
              </div>
            </ng-template>
          </div>

        </div>
      </div>

      <!-- Balance check -->
      <section id="balance" class="bg-[#f5f5f7] border-t border-[#e0e0e0] py-16 md:py-24">
        <div class="max-w-[1080px] mx-auto px-6 md:px-12">
          <div class="max-w-2xl mx-auto text-center">
            <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-3">Already have one?</span>
            <h2 class="font-display font-semibold text-3xl md:text-4xl tracking-tight text-[#1d1d1f] mb-4">Check a gift card balance</h2>
            <p class="text-[#6e6e73] mb-8">Enter the code from your email to see the remaining balance and expiry date.</p>

            <form (ngSubmit)="checkBalance()" class="flex flex-col sm:flex-row gap-3" novalidate>
              <input type="text"
                     [ngModel]="balanceCode()"
                     (ngModelChange)="balanceCode.set($event)"
                     name="balanceCode"
                     placeholder="CL-XXXX-XXXX-XXXX"
                     autocomplete="off"
                     autocapitalize="characters"
                     spellcheck="false"
                     aria-label="Gift card code"
                     class="input-field flex-1 font-mono uppercase tracking-[0.1em]">
              <button type="submit" [disabled]="balanceLoading()" class="btn-apple-pill text-sm !py-3 !px-8 whitespace-nowrap">
                {{ balanceLoading() ? 'Checking...' : 'Check balance' }}
              </button>
            </form>

            <p *ngIf="balanceError()" role="alert" class="text-red-600 text-sm mt-4">{{ balanceError() }}</p>

            <div *ngIf="balanceResult() as result" class="mt-8 bg-white border border-[#e0e0e0] rounded-[18px] p-6 text-left animate-fade-in" aria-live="polite">
              <div class="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-[#f0f0f0]">
                <span class="font-mono tracking-[0.1em] text-[#1d1d1f]">{{ result.code }}</span>
                <span class="badge" [ngClass]="statusBadgeClass(result.status)">{{ statusLabel(result.status) }}</span>
              </div>
              <dl class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt class="text-[#6e6e73]">Remaining balance</dt>
                  <dd class="font-semibold text-[#1d1d1f] text-2xl">{{ result.balance | currencyConvert }}</dd>
                </div>
                <div>
                  <dt class="text-[#6e6e73]">Valid until</dt>
                  <dd class="font-semibold text-[#1d1d1f] text-2xl">{{ result.expiresAt | date:'d MMM y' }}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      </section>
    </div>
  `
})
export class GiftCardComponent implements OnInit {
  private giftCardService = inject(GiftCardService);
  private authService = inject(AuthService);
  private platformId = inject(PLATFORM_ID);

  readonly predefinedAmounts: readonly number[] = GIFT_CARD_AMOUNT.presets;
  readonly minAmount = GIFT_CARD_AMOUNT.min;
  readonly maxAmount = GIFT_CARD_AMOUNT.max;
  readonly messageMax = MESSAGE_MAX;

  amount = signal<number>(1000);
  customAmount = signal<number | null>(null);
  purchaserEmail = signal('');
  recipientName = signal('');
  recipientEmail = signal('');
  message = signal('');

  themes: { id: GiftCardTheme; name: string }[] = [
    { id: 'classic', name: 'Classic Navy' },
    { id: 'gold', name: 'Rose Gold' },
    { id: 'ruby', name: 'Deep Ruby' }
  ];
  selectedTheme = signal<GiftCardTheme>('classic');

  stage = signal<PurchaseStage>('form');
  isBusy = computed(() => this.stage() !== 'form' && this.stage() !== 'done');
  issuedCard = signal<GiftCardDTO | null>(null);
  formError = signal('');
  formNotice = signal('');
  fieldErrors = signal<GiftCardFieldErrors>({});

  submitLabel = computed(() => {
    switch (this.stage()) {
      case 'creating': return 'Preparing payment...';
      case 'paying': return 'Complete payment in the Razorpay window';
      case 'confirming': return 'Activating your gift card...';
      default: return 'Pay ' + this.formatInr(this.amount());
    }
  });

  balanceCode = signal('');
  balanceLoading = signal(false);
  balanceError = signal('');
  balanceResult = signal<GiftCardBalanceResponse | null>(null);

  ngOnInit(): void {
    this.loadRazorpayScript();
    this.authService.user().subscribe((user) => {
      if (user?.email && !this.purchaserEmail()) {
        this.purchaserEmail.set(user.email);
      }
    });
  }

  // ---- amount ----------------------------------------------------------

  selectPreset(val: number) {
    this.amount.set(val);
    this.customAmount.set(null);
    this.clearFieldError('amount');
  }

  onCustomAmountChange(val: number | string | null) {
    const n = val === null || val === '' ? null : Number(val);
    this.customAmount.set(n);
    if (n !== null && Number.isFinite(n) && n > 0) {
      this.amount.set(n);
    }
    this.clearFieldError('amount');
  }

  // ---- card face --------------------------------------------------------

  // The card face is the product being sold; its themed finish is imagery,
  // not page decoration, so the three finishes stay as gradients.
  getCardBgClass(themeId: string): string {
    switch(themeId) {
      case 'gold': return 'bg-gradient-to-br from-[#c9a15a] via-[#a67c3d] to-[#5c421c]';
      case 'ruby': return 'bg-gradient-to-br from-red-800 via-red-900 to-black';
      case 'classic':
      default:
        return 'bg-gradient-to-br from-[#1e3a5f] via-[#0f2340] to-black';
    }
  }

  getThemeName(themeId: string): string {
    return this.themes.find(t => t.id === themeId)?.name || 'Classic';
  }

  // ---- purchase ---------------------------------------------------------

  buy() {
    if (this.isBusy()) return;
    this.formError.set('');
    this.formNotice.set('');
    if (!this.validate()) return;

    if (!isPlatformBrowser(this.platformId) || typeof Razorpay === 'undefined') {
      this.formError.set('The payment window could not load. Please check your connection or disable ad blockers, then try again.');
      return;
    }

    this.stage.set('creating');
    this.giftCardService
      .purchase({
        amount: this.amount(),
        purchaserEmail: this.purchaserEmail().trim(),
        recipientName: this.recipientName().trim(),
        recipientEmail: this.recipientEmail().trim(),
        message: this.message().trim() || undefined,
        theme: this.selectedTheme(),
      })
      .subscribe({
        next: (res) => this.openRazorpay(res),
        error: (err: unknown) => {
          this.stage.set('form');
          if (err instanceof HttpErrorResponse && err.status === 503) {
            // The interceptor's generic 5xx toast has already fired; the inline
            // copy is the specific explanation, not a second toast.
            this.formError.set('Online payment is not available right now. Please try again later or contact us to buy a gift card directly.');
          } else if (err instanceof HttpErrorResponse) {
            // Server errors are toasted by the interceptor; only mark the form.
            this.formError.set('We could not start your purchase. Please check the details above and try again.');
          } else {
            this.formError.set('Something went wrong. Please try again.');
          }
        },
      });
  }

  private openRazorpay(order: GiftCardPurchaseResponse) {
    this.stage.set('paying');
    const options: Razorpay.Options = {
      key: environment.razorpayKey,
      amount: order.amount,
      currency: order.currency,
      name: 'Caratloop',
      description: 'Caratloop Gift Card for ' + this.recipientName().trim(),
      order_id: order.razorpayOrderId,
      prefill: {
        email: this.purchaserEmail().trim(),
      },
      theme: {
        color: '#D4AF37',
      },
      handler: (response: Razorpay.PaymentSuccessResponse) => {
        this.confirmPayment(order.giftCardId, response);
      },
      modal: {
        ondismiss: () => {
          // Fires after a successful handler too; only treat it as a cancel
          // while we are still waiting on the payment.
          if (this.stage() === 'paying') {
            this.stage.set('form');
            this.formNotice.set('Payment cancelled. Nothing has been charged; your gift card details are still here whenever you are ready.');
          }
        },
      },
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', (response: Razorpay.PaymentFailedResponse) => {
      this.stage.set('form');
      const reason = response?.error?.description || 'The payment could not be completed.';
      this.formError.set('Payment failed: ' + reason + ' Nothing has been charged; you can try again.');
    });
    rzp.open();
  }

  private confirmPayment(giftCardId: string, response: Razorpay.PaymentSuccessResponse) {
    this.stage.set('confirming');
    this.giftCardService
      .confirm(giftCardId, {
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      })
      .subscribe({
        next: (card) => {
          this.issuedCard.set(card);
          this.stage.set('done');
        },
        error: () => {
          // Interceptor has toasted the server's message; leave the payment id
          // on screen so support can trace it.
          this.stage.set('form');
          this.formError.set(
            'Your payment went through but we could not activate the gift card. Please contact support and quote payment ID ' +
              response.razorpay_payment_id + '.',
          );
        },
      });
  }

  startAnother() {
    this.issuedCard.set(null);
    this.stage.set('form');
    this.recipientName.set('');
    this.recipientEmail.set('');
    this.message.set('');
    this.formError.set('');
    this.formNotice.set('');
    this.fieldErrors.set({});
  }

  checkIssuedCardBalance(card: GiftCardDTO) {
    this.balanceCode.set(card.code);
    this.checkBalance();
    if (isPlatformBrowser(this.platformId)) {
      document.getElementById('balance')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ---- validation -------------------------------------------------------

  private validate(): boolean {
    const errors: GiftCardFieldErrors = {};
    const amount = this.amount();

    if (!Number.isInteger(amount)) {
      errors['amount'] = 'Please enter a whole-rupee amount.';
    } else if (amount < this.minAmount || amount > this.maxAmount) {
      errors['amount'] = 'Amount must be between ' + this.formatInr(this.minAmount) + ' and ' + this.formatInr(this.maxAmount) + '.';
    }

    if (!EMAIL_RE.test(this.purchaserEmail().trim())) {
      errors['purchaserEmail'] = 'Enter a valid email so we can send your receipt.';
    }
    if (!this.recipientName().trim()) {
      errors['recipientName'] = "Recipient's name is required.";
    }
    if (!EMAIL_RE.test(this.recipientEmail().trim())) {
      errors['recipientEmail'] = "Enter a valid email for the recipient.";
    }
    if (this.message().length > MESSAGE_MAX) {
      errors['message'] = 'Message must be ' + MESSAGE_MAX + ' characters or fewer.';
    }

    this.fieldErrors.set(errors);
    if (Object.keys(errors).length > 0) {
      this.formError.set('Please fix the highlighted fields.');
      return false;
    }
    return true;
  }

  private clearFieldError(key: GiftCardFieldKey) {
    if (this.fieldErrors()[key]) {
      const { [key]: _removed, ...rest } = this.fieldErrors();
      this.fieldErrors.set(rest);
    }
  }

  /** Card amounts are INR by contract; the button label must not follow the display currency. */
  private formatInr(value: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
  }

  // ---- balance ----------------------------------------------------------

  checkBalance() {
    const code = this.balanceCode().trim().toUpperCase();
    this.balanceError.set('');
    this.balanceResult.set(null);
    if (!code) {
      this.balanceError.set('Enter your gift card code.');
      return;
    }
    this.balanceLoading.set(true);
    this.giftCardService.balance(code).subscribe({
      next: (result) => {
        this.balanceLoading.set(false);
        this.balanceResult.set(result);
      },
      error: (err: unknown) => {
        this.balanceLoading.set(false);
        if (err instanceof HttpErrorResponse && err.status === 404) {
          this.balanceError.set('We could not find a gift card with that code. Check it against your email and try again.');
        } else {
          this.balanceError.set('We could not check that card right now. Please try again in a moment.');
        }
      },
    });
  }

  statusLabel(status: GiftCardBalanceResponse['status']): string {
    switch (status) {
      case 'ACTIVE': return 'Active';
      case 'DEPLETED': return 'Fully used';
      case 'DISABLED': return 'Disabled';
      case 'PENDING_PAYMENT': return 'Awaiting payment';
      default: return status;
    }
  }

  statusBadgeClass(status: GiftCardBalanceResponse['status']): string {
    switch (status) {
      case 'ACTIVE': return '!bg-green-50 !text-green-700';
      case 'DEPLETED':
      case 'DISABLED': return '!bg-red-50 !text-red-600';
      default: return '!bg-amber-50 !text-amber-700';
    }
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
