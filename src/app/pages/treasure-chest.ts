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
    <div class="min-h-screen bg-white font-sans">
      <!-- Hero Banner -->
      <section class="relative py-20 bg-primary-900 text-white overflow-hidden">
         <div class="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/diamond-upholstery.png')]"></div>
         <div class="container-luxury relative z-10 text-center">
            <h1 class="font-display font-bold text-4xl md:text-6xl mb-6">Gemara Treasure Plan</h1>
            <p class="text-xl text-primary-200 max-w-2xl mx-auto mb-8">
              The smartest way to buy your dream jewellery. Pay for 9 months, and we'll pay the 10th installment for you!
            </p>
            <div class="flex justify-center gap-4">
               <div class="flex flex-col items-center">
                  <span class="text-4xl font-bold text-secondary-500">100%</span>
                  <span class="text-sm text-primary-200 uppercase tracking-widest">Return on 1st Month</span>
               </div>
               <div class="w-px bg-primary-700 h-12"></div>
               <div class="flex flex-col items-center">
                  <span class="text-4xl font-bold text-secondary-500">0%</span>
                  <span class="text-sm text-primary-200 uppercase tracking-widest">Making Charges*</span>
               </div>
            </div>
         </div>
      </section>

      <!-- Calculator Section -->
      <section class="py-16 bg-gray-50">
         <div class="container-luxury">
            <div class="max-w-4xl mx-auto bg-white rounded-2xl shadow-luxury-lg overflow-hidden border border-gray-100">
               <div class="grid grid-cols-1 md:grid-cols-2">

                  <!-- Left: Input -->
                  <div class="p-8 md:p-12">
                     <h3 class="font-display font-bold text-2xl text-primary-900 mb-6">Calculate Your Savings</h3>

                     <div class="mb-8">
                        <label class="block text-sm font-bold text-gray-700 mb-4">Monthly Installment Amount</label>
                        <div class="flex items-center gap-4 mb-4">
                           <span class="text-2xl font-bold text-primary-900">₹</span>
                           <input type="number" [ngModel]="installment()" (ngModelChange)="updateInstallment($event)"
                                  min="1000" max="50000" step="500"
                                  class="w-full text-3xl font-bold text-primary-900 border-b-2 border-primary-200 focus:border-secondary-500 outline-none pb-2 bg-transparent">
                        </div>
                        <input type="range" [ngModel]="installment()" (ngModelChange)="updateInstallment($event)"
                               min="1000" max="50000" step="500"
                               class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-secondary-500">
                        <div class="flex justify-between text-xs text-gray-400 mt-2">
                           <span>Min: ₹1,000</span>
                           <span>Max: ₹50,000</span>
                        </div>
                     </div>

                     <button (click)="enroll()" [disabled]="loading()"
                             class="w-full bg-primary-900 hover:bg-primary-800 text-white font-bold py-4 rounded-lg shadow-lg transition-all transform hover:-translate-y-1 disabled:opacity-70 disabled:cursor-not-allowed flex justify-center">
                        <span *ngIf="!loading()">START PLAN NOW</span>
                        <span *ngIf="loading()" class="animate-spin">⏳</span>
                     </button>
                     <p class="text-xs text-center text-gray-500 mt-4">
                        By clicking Start Plan, you agree to our <a href="#" class="underline">Terms & Conditions</a>
                     </p>
                  </div>

                  <!-- Right: Summary -->
                  <div class="bg-primary-50 p-8 md:p-12 flex flex-col justify-center">
                     <h4 class="font-bold text-gray-900 mb-6">Plan Summary</h4>

                     <div class="space-y-4 mb-8">
                        <div class="flex justify-between items-center pb-4 border-b border-primary-100">
                           <span class="text-gray-600">You Pay (9 Months)</span>
                           <span class="font-bold text-gray-900">{{ currencyService.format(summary().youPay) }}</span>
                        </div>
                        <div class="flex justify-between items-center pb-4 border-b border-primary-100">
                           <span class="text-secondary-600 font-bold">Gemara Adds (1 Month)</span>
                           <span class="font-bold text-secondary-600">+ {{ currencyService.format(summary().weAdd) }}</span>
                        </div>
                        <div class="flex justify-between items-center pt-2">
                           <span class="font-display font-bold text-xl text-primary-900">Total Maturity Value</span>
                           <span class="font-bold text-2xl text-primary-900">{{ currencyService.format(summary().total) }}</span>
                        </div>
                     </div>

                     <div class="bg-white p-4 rounded-lg border border-primary-100">
                        <p class="text-sm text-gray-600 mb-2"><strong>🎉 Bonus:</strong> Use this amount to buy any jewellery from our store after 10 months.</p>
                     </div>
                  </div>
               </div>
            </div>
         </div>
      </section>

      <!-- How it Works -->
      <section class="py-16 bg-white">
         <div class="container-luxury text-center">
            <h2 class="font-display font-bold text-3xl text-primary-900 mb-12">How it Works</h2>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
               <!-- Connecting Line (Desktop) -->
               <div class="hidden md:block absolute top-12 left-[16%] right-[16%] h-0.5 bg-primary-100 z-0"></div>

               <!-- Step 1 -->
               <div class="relative z-10">
                  <div class="w-24 h-24 bg-white border-2 border-primary-100 text-primary-900 rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-sm">1</div>
                  <h3 class="font-bold text-xl mb-3">Enroll Online</h3>
                  <p class="text-gray-600">Choose your monthly installment amount starting from just ₹1,000.</p>
               </div>

               <!-- Step 2 -->
               <div class="relative z-10">
                  <div class="w-24 h-24 bg-white border-2 border-primary-100 text-primary-900 rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-sm">2</div>
                  <h3 class="font-bold text-xl mb-3">Pay Monthly</h3>
                  <p class="text-gray-600">Pay 9 easy installments online securely via UPI, Card, or Netbanking.</p>
               </div>

               <!-- Step 3 -->
               <div class="relative z-10">
                  <div class="w-24 h-24 bg-secondary-500 text-white rounded-full flex items-center justify-center text-3xl font-bold mx-auto mb-6 shadow-lg">3</div>
                  <h3 class="font-bold text-xl mb-3">Redeem & Shop</h3>
                  <p class="text-gray-600">After 10 months, redeem your total value (Your 9 + Our 1) to buy your favorite jewellery.</p>
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

  updateInstallment(val: any) {
    const num = parseInt(val, 10);
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
