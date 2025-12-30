import { Injectable, signal, computed } from '@angular/core';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR';

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  currentCurrency = signal<CurrencyCode>(this.getStoredCurrency());

  private rates: Record<CurrencyCode, number> = {
    'USD': 1,
    'EUR': 0.92,
    'GBP': 0.79,
    'INR': 83.50
  };

  private symbols: Record<CurrencyCode, string> = {
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'INR': '₹'
  };

  private getStoredCurrency(): CurrencyCode {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('currency');
      if (stored && ['USD', 'EUR', 'GBP', 'INR'].includes(stored)) {
        return stored as CurrencyCode;
      }
    }
    return 'USD';
  }

  setCurrency(code: CurrencyCode) {
    this.currentCurrency.set(code);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('currency', code);
    }
  }

  format(amount: number): string {
    const code = this.currentCurrency();
    const rate = this.rates[code];
    const value = amount * rate;

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }
}
