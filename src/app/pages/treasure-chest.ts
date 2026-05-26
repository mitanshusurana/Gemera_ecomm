import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TreasureService } from '../services/treasure.service';
import { CurrencyService } from '../services/currency.service';
import { ToastService } from '../services/toast.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-treasure-chest',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-surface font-sans">
      <!-- Hero Banner -->
      <section class="relative py-20 bg-primary text-surface overflow-hidden">
         <div class="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/diamond-upholstery.png')]"></div>
         <div class="container-luxury relative z-10 text-center">
            <h1 class="font-display font-bold text-4xl md:text-6xl mb-6">Caratloop Treasure Plan</h1>
            <p class="text-xl text-surface max-w-2xl mx-auto mb-8">
              The smartest way to buy your dream jewellery. Pay for 9 months, and we'll pay the 10th installment for you!
            </p>
            <div class="flex justify-center gap-4">
               <div class="flex flex-col items-center">
                  <span class="text-4xl font-bold text-accent">100%</span>
                  <span class="text-sm text-surface uppercase tracking-widest">Return on 1st Month</span>
               </div>
               <div class="w-px bg-primary h-12"></div>
               <div class="flex flex-col items-center">
                  <span class="text-4xl font-bold text-accent">0%</span>
                  <span class="text-sm text-surface uppercase tracking-widest">Making Charges*</span>
               </div>
            </div>
         </div>
      </section>

      <!-- Calculator Section -->
      <section class="py-16 bg-surface">
         <div class="container-luxury">
            <div class="max-w-4xl mx-auto bg-surface rounded-2xl shadow-luxury-lg overflow-hidden border border-ink">
               <div class="grid grid-cols-1 md:grid-cols-2">

                  <!-- Left: Input -->
                  <div class="p-8 md:p-12">
                     <h2 class="font-display font-bold text-2xl text-ink mb-6">Calculate Your Savings</h2>

                     <div class="mb-8">
                        <label for="installmentAmount" class="block text-sm font-bold text-ink mb-4">Monthly Installment Amount</label>
                        <div class="flex items-center gap-4 mb-4">
                           <span class="text-2xl font-bold text-ink">₹</span>
                           <input type="number" id="installmentAmount" aria-label="Installment Amount" [ngModel]="installment()" (ngModelChange)="updateInstallment($event)"
                                  min="1000" max="50000" step="500"
                                  class="w-full text-3xl font-bold text-ink border-b-2 border-primary-200 focus:border-secondary-500 outline-none pb-2 bg-transparent">
                        </div>
                        <input type="range" aria-label="Installment Amount Slider" [ngModel]="installment()" (ngModelChange)="updateInstallment($event)"
                               min="1000" max="50000" step="500"
                               class="w-full h-2 bg-surface rounded-lg appearance-none cursor-pointer accent-secondary-500">
                        <div class="flex justify-between text-xs text-ink mt-2">
                           <span>Min: ₹1,000</span>
                           <span>Max: ₹50,000</span>
                        </div>
                     </div>

                     <button (click)="enroll()" [disabled]="loading()"
                             class="w-full bg-primary hover:bg-primary text-surface font-bold py-4 rounded-lg shadow-lg transition-all transform hover:-translate-y-1 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center">
                        <span *ngIf="!loading()">START PLAN NOW</span>
                        <span *ngIf="loading()" class="animate-spin">⏳</span>
                     </button>
                     <p class="text-xs text-center text-ink mt-4">
                        By clicking Start Plan, you agree to our <a href="#" class="underline">Terms & Conditions</a>
                     </p>
                  </div>

                  <!-- Right: Summary -->
                  <div class="bg-primary-50 p-8 md:p-12 flex flex-col justify-center">
                     <h3 class="font-bold text-ink mb-6">Plan Summary</h3>

                     <div class="space-y-4 mb-8">
                        <div class="flex justify-between items-center pb-4 border-b border-primary-100">
                           <span class="text-ink">You Pay (9 Months)</span>
                           <span class="font-bold text-ink">{{ currencyService.format(summary().youPay) }}</span>
                        </div>
                        <div class="flex justify-between items-center pb-4 border-b border-primary-100">
                           <span class="text-accent font-bold">Caratloop Adds (1 Month)</span>
                           <span class="font-bold text-accent">+ {{ currencyService.format(summary().weAdd) }}</span>
                        </div>
                        <div class="flex justify-between items-center pt-2">
                           <span class="font-display font-bold text-xl text-ink">Total Maturity Value</span>
                           <span class="font-bold text-2xl text-ink">{{ currencyService.format(summary().total) }}</span>
                        </div>
                     </div>

                     <div class="bg-surface p-4 rounded-lg border border-primary-100">
                        <p class="text-sm text-ink mb-2"><strong>🎉 Bonus:</strong> Use this amount to buy any jewellery from our store after 10 months.</p>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </section>

      <!-- How it Works -->
      <section class="py-16 bg-surface">
         <div class="container-luxury text-center">
            <h2 class="font-display font-bold text-3xl text-ink mb-12">How it Works</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
               <!-- Connecting Line (Desktop) -->
               <div class="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-primary z-0"></div>

               <!-- Step 1 -->
               <div class="relative z-10">
                  <div class="w-24 h-24 bg-surface border-2 border-primary-100 text-ink rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-sm">1</div>
                  <h3 class="font-bold text-xl mb-3">Enroll Online</h3>
                  <p class="text-ink">Choose your monthly installment amount starting from just ₹1,000.</p>
               </div>

               <!-- Step 2 -->
               <div class="relative z-10">
                  <div class="w-24 h-24 bg-surface border-2 border-primary-100 text-ink rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-sm">2</div>
                  <h3 class="font-bold text-xl mb-3">Pay Monthly</h3>
                  <p class="text-ink">Pay 9 easy installments online securely via UPI, Card, or Netbanking.</p>
               </div>

               <!-- Step 3 -->
               <div class="relative z-10">
                  <div class="w-24 h-24 bg-accent text-surface rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-lg">3</div>
                  <h3 class="font-bold text-xl mb-3">Redeem & Shop</h3>
                  <p class="text-ink">After 10 months, redeem your total value (Your 9 + Our 1) to buy your favorite jewellery.</p>
               </div>
            </div>
         </div>
      </section>
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
