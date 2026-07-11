import { Component, Input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

interface EmiOption {
  months: number;
  interestRate: number;
}

@Component({
  selector: 'app-emi-calculator',
  standalone: true,
  imports: [CommonModule, CurrencyConvertPipe],
  template: `
    <div class="border border-diamond-200 rounded-lg p-4 bg-surface mt-4">
      <div class="flex items-center gap-2 mb-3">
        <svg class="w-5 h-5 text-gold-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <h4 class="font-bold text-ink">EMI Options</h4>
      </div>
      
      <p class="text-sm text-ink/80 mb-4">Pay in easy monthly installments. No cost EMI available.</p>
      
      <div class="space-y-3">
        <div *ngFor="let option of emiOptions" class="flex justify-between items-center p-3 border border-diamond-100 rounded-md hover:border-gold-300 hover:bg-gold-50/20 transition-colors cursor-pointer group">
          <div>
            <div class="font-semibold text-ink group-hover:text-gold-700 transition-colors">{{ option.months }} Months</div>
            <div class="text-xs text-ink/70">{{ option.interestRate === 0 ? 'No Cost EMI' : option.interestRate + '% Interest' }}</div>
          </div>
          <div class="text-right">
            <div class="font-bold text-ink">{{ calculateEmi(option) | currencyConvert }}<span class="text-xs font-normal text-ink/70">/mo</span></div>
            <div class="text-xs text-ink/70" *ngIf="option.interestRate > 0">Total: {{ calculateTotal(option) | currencyConvert }}</div>
          </div>
        </div>
      </div>
      
      <div class="mt-4 text-xs text-ink/60 bg-diamond-50 p-3 rounded">
        * Standard terms and conditions apply. Final EMI is calculated at checkout based on your selected bank.
      </div>
    </div>
  `
})
export class EmiCalculatorComponent {
  @Input() price!: number;

  emiOptions: EmiOption[] = [
    { months: 3, interestRate: 0 },
    { months: 6, interestRate: 0 },
    { months: 9, interestRate: 12 },
    { months: 12, interestRate: 15 }
  ];

  calculateEmi(option: EmiOption): number {
    if (!this.price) return 0;
    
    if (option.interestRate === 0) {
      return this.price / option.months;
    }
    
    // Standard EMI formula: P x R x (1+R)^N / [(1+R)^N-1]
    const p = this.price;
    const r = (option.interestRate / 12) / 100;
    const n = option.months;
    
    const emi = (p * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    return emi;
  }
  
  calculateTotal(option: EmiOption): number {
    return this.calculateEmi(option) * option.months;
  }
}
