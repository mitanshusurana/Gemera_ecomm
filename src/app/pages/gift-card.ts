import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

@Component({
  selector: 'app-gift-card',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyConvertPipe],
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">
      <!-- Hero Section -->
      <div class="bg-[#1c1c1e] text-white py-20 border-b border-white/10">
        <div class="max-w-[1080px] mx-auto px-6 md:px-12 text-center">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-3">Gemera Digital Gift Card</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl tracking-tight text-white mb-4">The Gift of Choice</h1>
          <p class="text-lg md:text-xl max-w-2xl mx-auto text-[#a1a1a6]">Give them the luxury of choosing their own perfect piece with a Gemera Digital Gift Card.</p>
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
                    <img src="/logo-with-name.webp" alt="Gemera" class="h-8 brightness-0 invert opacity-90">
                    <span class="text-white font-sans tracking-[0.2em] text-xs opacity-80 uppercase">Gift Card</span>
                  </div>

                  <div class="text-white">
                    <div class="font-display font-semibold text-4xl tracking-tight mb-2">
                      {{ amount() | currencyConvert }}
                    </div>
                    <div class="text-xs font-medium tracking-[0.15em] opacity-80 uppercase">{{ getThemeName(selectedTheme()) }} Edition</div>
                  </div>
                </div>
              </div>

              <div class="mt-8 grid grid-cols-3 gap-4">
                <button *ngFor="let theme of themes"
                        type="button"
                        (click)="selectedTheme.set(theme.id)"
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

          <!-- Right: Purchase Form -->
          <div class="md:w-1/2">
            <div class="bg-white p-8 rounded-[18px] border border-[#e0e0e0]">
              <h2 class="font-display font-semibold text-2xl md:text-3xl tracking-tight text-[#1d1d1f] mb-8">Customize Your Gift</h2>

              <form (submit)="addToBag($event)">

                <!-- Amount Selection -->
                <div class="mb-8">
                  <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-4">Select Amount</label>
                  <div class="grid grid-cols-3 gap-3">
                    <button *ngFor="let val of predefinedAmounts"
                            type="button"
                            (click)="amount.set(val); customAmount.set(null)"
                            [attr.aria-pressed]="amount() === val"
                            class="py-3 px-2 rounded-full border font-medium text-sm transition-colors active-press"
                            [ngClass]="amount() === val
                              ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]'
                              : 'bg-white text-[#1d1d1f] border-[#e0e0e0] hover:border-[#1d1d1f]'">
                      {{ val | currencyConvert }}
                    </button>
                  </div>

                  <div class="mt-4 relative">
                    <span class="absolute left-4 top-1/2 -translate-y-1/2 text-[#6e6e73] font-medium">$</span>
                    <input type="number"
                           [ngModel]="customAmount()"
                           (ngModelChange)="onCustomAmountChange($event)"
                           name="customAmount"
                           placeholder="Enter Custom Amount"
                           aria-label="Custom amount"
                           class="input-field !pl-8">
                  </div>
                </div>

                <!-- Recipient Details -->
                <div class="space-y-4 mb-8">
                  <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Delivery Details</label>

                  <div>
                    <input type="text" placeholder="Recipient's Name" required aria-label="Recipient's name"
                           class="input-field">
                  </div>
                  <div>
                    <input type="email" placeholder="Recipient's Email" required aria-label="Recipient's email"
                           class="input-field">
                  </div>
                  <div>
                    <textarea placeholder="Add a Personal Message (Optional)" rows="3" aria-label="Personal message"
                              class="input-field resize-none"></textarea>
                  </div>
                </div>

                <!-- Actions -->
                <button type="submit"
                        class="btn-apple-pill w-full !py-4">
                  Add to Shopping Bag
                </button>

                <p class="text-center text-xs text-[#6e6e73] mt-4">Gift cards are delivered by email and contain instructions to redeem them at checkout. Our gift cards have no additional processing fees.</p>
              </form>
            </div>
          </div>

        </div>
      </div>
    </div>
  `
})
export class GiftCardComponent {
  predefinedAmounts = [100, 250, 500, 1000, 2500, 5000];
  amount = signal<number>(250);
  customAmount = signal<number | null>(null);

  themes = [
    { id: 'classic', name: 'Classic Navy' },
    { id: 'gold', name: 'Rose Gold' },
    { id: 'ruby', name: 'Deep Ruby' }
  ];
  selectedTheme = signal<string>('classic');

  onCustomAmountChange(val: number) {
    this.customAmount.set(val);
    if (val && val > 0) {
      this.amount.set(val);
    }
  }

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

  addToBag(event: Event) {
    event.preventDefault();
    alert('Added $' + this.amount() + ' Gift Card to bag!');
  }
}
