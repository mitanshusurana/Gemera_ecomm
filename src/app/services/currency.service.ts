import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SettingService } from './setting.service';
import { hasConsent } from '../components/cookie-consent';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'INR';

@Injectable({
  providedIn: 'root'
})
export class CurrencyService {
  private settingService = inject(SettingService);
  private http = inject(HttpClient);

  currentCurrency = signal<CurrencyCode>(this.getStoredCurrency());

  // INR is base 1
  private rates: Record<CurrencyCode, number> = {
    'INR': 1,
    'USD': 0.012,
    'EUR': 0.011,
    'GBP': 0.009
  };

  readonly availableCurrencies: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'INR'];

  constructor() {
    this.settingService.getSettings().subscribe({
      next: (settings) => {
        if (settings) {
          if (settings.usdRate) this.rates['USD'] = parseFloat(settings.usdRate);
          if (settings.eurRate) this.rates['EUR'] = parseFloat(settings.eurRate);
          if (settings.gbpRate) this.rates['GBP'] = parseFloat(settings.gbpRate);
        }
      },
      error: (err) => console.error('Failed to load currency rates from settings', err)
    });

    // Geo detection sends the visitor's IP to a third party. Under the DPDP
    // Act that needs consent first, and the absence of a choice is not
    // consent -- so this stays off until the visitor opts in.
    if (
      typeof window !== 'undefined' &&
      typeof localStorage !== 'undefined' &&
      !localStorage.getItem('currency') &&
      hasConsent()
    ) {
      this.http.get('https://ipapi.co/currency/', { responseType: 'text' }).subscribe({
        next: (currency) => {
          if (this.availableCurrencies.includes(currency.trim() as CurrencyCode)) {
            this.setCurrency(currency.trim() as CurrencyCode);
          } else {
            this.setCurrency('USD'); // Default for unknown international
          }
        },
        error: () => console.log('IP currency detection failed.')
      });
    }
  }

  private getStoredCurrency(): CurrencyCode {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('currency');
      if (stored && ['USD', 'EUR', 'GBP', 'INR'].includes(stored)) {
        return stored as CurrencyCode;
      }
    }
    return 'INR';
  }

  setCurrency(code: CurrencyCode) {
    this.currentCurrency.set(code);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('currency', code);
    }
  }

  format(amount: number | string): string {
    const code = this.currentCurrency();
    const rate = this.rates[code];
    const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    const value = (parsedAmount || 0) * rate;

    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  convert(amount: number | string, toCurrency: CurrencyCode): number {
    const rate = this.rates[toCurrency];
    const parsedAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return (parsedAmount || 0) * rate;
  }
}
