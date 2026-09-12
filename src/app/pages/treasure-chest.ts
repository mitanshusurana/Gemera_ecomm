import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TreasureService } from '../services/treasure.service';
import { CurrencyService } from '../services/currency.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-treasure-chest',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- APPLE DESIGN SYSTEM: TREASURE PLAN (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">
      
      <!-- Top Parchment Header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-16 px-6 text-center">
        <div class="max-w-[800px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Jewelry Wealth Plan</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl text-[#1d1d1f] tracking-tight">
            Gemera Treasure Vault.
          </h1>
          <p class="text-base text-[#7a7a7a] mt-4 max-w-xl mx-auto">
            Pay for 9 months, and Gemera contributes the 10th month bonus for your bespoke luxury acquisition.
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

      <!-- Main Calculator Card Section -->
      <div class="max-w-[1000px] mx-auto px-6 py-12">
        <div class="store-utility-card !p-0 overflow-hidden">
          <div class="grid grid-cols-1 md:grid-cols-2">
            
            <!-- Left: Input Controls -->
            <div class="p-8 md:p-12">
              <span class="text-xs uppercase tracking-wider font-semibold text-[#7a7a7a] block mb-2">Savings Estimator</span>
              <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">Monthly Contribution</h2>

              <div class="mb-8">
                <label for="installmentAmount" class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-4">Select Installment Amount</label>
                <div class="flex items-center gap-3 mb-6 bg-[#f5f5f7] border border-[#e0e0e0] rounded-[12px] p-4">
                  <span class="text-2xl font-bold text-[#D4AF37]">₹</span>
                  <input type="number" id="installmentAmount" aria-label="Installment Amount" [ngModel]="installment()" (ngModelChange)="updateInstallment($event)"
                         min="1000" max="50000" step="500"
                         class="w-full text-2xl font-semibold text-[#1d1d1f] outline-none bg-transparent">
                </div>
                
                <input type="range" aria-label="Installment Amount Slider" [ngModel]="installment()" (ngModelChange)="updateInstallment($event)"
                       min="1000" max="50000" step="500"
                       class="w-full h-2 bg-[#e0e0e0] rounded-lg appearance-none cursor-pointer accent-[#D4AF37]">
                
                <div class="flex justify-between text-[11px] text-[#7a7a7a] mt-2 font-mono">
                  <span>₹1,000 / mo</span>
                  <span>₹50,000 / mo</span>
                </div>
              </div>

              <button (click)="enroll()" [disabled]="loading()" class="btn-apple-pill w-full !py-3.5 text-sm disabled:opacity-50">
                <span *ngIf="!loading()">Enroll in Treasure Plan</span>
                <span *ngIf="loading()">Processing...</span>
              </button>
            </div>

            <!-- Right: Summary Card -->
            <div class="bg-[#fafafc] border-l border-[#e0e0e0] p-8 md:p-12 flex flex-col justify-between">
              <div>
                <span class="text-xs uppercase tracking-wider font-semibold text-[#D4AF37] block mb-2">Maturity Breakdown</span>
                <h3 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">Plan Benefits</h3>

                <div class="space-y-4 text-xs mb-8">
                  <div class="flex justify-between items-center pb-3 border-b border-[#e0e0e0]">
                    <span class="text-[#7a7a7a]">Your Contribution (9 Mos)</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ currencyService.format(summary().youPay) }}</span>
                  </div>
                  <div class="flex justify-between items-center pb-3 border-b border-[#e0e0e0] text-[#D4AF37]">
                    <span class="font-semibold">Gemera Bonus (10th Month)</span>
                    <span class="font-semibold">+ {{ currencyService.format(summary().weAdd) }}</span>
                  </div>
                  <div class="flex justify-between items-center pt-3 text-base">
                    <span class="font-semibold text-[#1d1d1f]">Total Redeemable Value</span>
                    <span class="font-semibold text-2xl text-[#1d1d1f]">{{ currencyService.format(summary().total) }}</span>
                  </div>
                </div>
              </div>

              <div class="bg-white p-4 rounded-[12px] border border-[#e0e0e0] text-xs text-[#7a7a7a]">
                ✦ Redeemable on all certified diamonds and gold creations across our collections.
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `
})
export class TreasureChestComponent {
  currencyService = inject(CurrencyService);
  private treasureService = inject(TreasureService);
  private toastService = inject(ToastService);

  installment = signal(5000);
  loading = signal(false);

  summary = computed(() => {
    return this.treasureService.calculateMaturity(this.installment());
  });

  /**
   * The bonus as a percentage of what the customer actually pays in.
   *
   * This was advertised as a flat "100% Bonus Match". The scheme pays one
   * bonus month on nine paid months, so the real figure is about 11% -- the
   * headline overstated the return on a deposit-like product roughly ninefold.
   * Deriving it from the same calculation the maturity figure uses means the
   * two can no longer disagree.
   */
  bonusPercent = computed(() => {
    const { youPay, weAdd } = this.summary();
    if (!youPay) return 0;
    return Math.round((weAdd / youPay) * 100);
  });

  updateInstallment(val: string | number) {
    const num = typeof val === 'string' ? parseInt(val, 10) : val;
    this.installment.set(isNaN(num) ? 1000 : num);
  }

  enroll() {
    this.loading.set(true);
    this.treasureService.enroll(this.installment()).subscribe(() => {
       this.loading.set(false);
       this.toastService.show(`🎉 Successfully enrolled in Treasure Plan for ${this.currencyService.format(this.installment())}/mo!`, 'success');
    });
  }
}
