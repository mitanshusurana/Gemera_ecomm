import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

@Component({
  selector: 'app-gift-card',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyConvertPipe],
  template: `
    <div class="min-h-screen bg-surface font-sans text-ink">
      <!-- Hero Section -->
      <div class="bg-primary text-surface py-20 relative overflow-hidden">
        <div class="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]"></div>
        <div class="container mx-auto px-4 relative z-10 text-center">
          <h1 class="text-4xl md:text-5xl font-display font-bold mb-4 tracking-wide text-accent">The Gift of Choice</h1>
          <p class="text-lg md:text-xl max-w-2xl mx-auto opacity-90">Give them the luxury of choosing their own perfect piece with a Gemera Digital Gift Card.</p>
        </div>
      </div>

      <!-- Main Content -->
      <div class="container mx-auto px-4 py-16">
        <div class="flex flex-col md:flex-row gap-12 lg:gap-24 max-w-6xl mx-auto">
          
          <!-- Left: Gift Card Visual -->
          <div class="md:w-1/2">
            <div class="sticky top-32">
              <div class="relative w-full aspect-[1.586/1] rounded-2xl overflow-hidden shadow-2xl transition-transform duration-500 hover:scale-105"
                   [ngClass]="getCardBgClass(selectedTheme())">
                
                <!-- Card Inner Styling -->
                <div class="absolute inset-0 p-8 flex flex-col justify-between">
                  <div class="flex justify-between items-start">
                    <img src="/logo-with-name.webp" alt="Gemera" class="h-8 brightness-0 invert opacity-90">
                    <span class="text-white font-serif tracking-[0.2em] text-sm opacity-80 uppercase">Gift Card</span>
                  </div>
                  
                  <div class="text-white">
                    <div class="text-4xl font-display font-bold tracking-wider mb-2 drop-shadow-md">
                      {{ amount() | currencyConvert }}
                    </div>
                    <div class="text-sm font-medium tracking-widest opacity-80 uppercase">{{ getThemeName(selectedTheme()) }} Edition</div>
                  </div>
                </div>
                
                <!-- Shine Effect Overlay -->
                <div class="absolute inset-0 bg-gradient-to-tr from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_3s_infinite]"></div>
              </div>
              
              <div class="mt-8 grid grid-cols-3 gap-4">
                <button *ngFor="let theme of themes" 
                        (click)="selectedTheme.set(theme.id)"
                        class="h-16 rounded-lg border-2 transition-all relative overflow-hidden"
                        [ngClass]="[
                          getCardBgClass(theme.id),
                          selectedTheme() === theme.id ? 'border-primary shadow-md scale-105' : 'border-transparent hover:border-primary/50'
                        ]">
                   <span class="absolute inset-0 flex items-center justify-center text-white font-bold text-xs bg-black/30 backdrop-blur-[2px] opacity-0 hover:opacity-100 transition-opacity">{{theme.name}}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Right: Purchase Form -->
          <div class="md:w-1/2">
            <div class="bg-white p-8 rounded-2xl shadow-xl border border-ink/5">
              <h2 class="text-2xl font-bold font-display text-ink mb-8">Customize Your Gift</h2>
              
              <form (submit)="addToBag($event)">
                
                <!-- Amount Selection -->
                <div class="mb-8">
                  <label class="block text-sm font-bold text-ink uppercase tracking-wider mb-4">Select Amount</label>
                  <div class="grid grid-cols-3 gap-3">
                    <button *ngFor="let val of predefinedAmounts" 
                            type="button"
                            (click)="amount.set(val); customAmount.set(null)"
                            class="py-3 px-2 rounded-lg border font-bold text-sm transition-all"
                            [class.bg-primary]="amount() === val"
                            [class.text-surface]="amount() === val"
                            [class.border-primary]="amount() === val"
                            [class.bg-surface]="amount() !== val"
                            [class.text-ink]="amount() !== val"
                            [class.border-ink/20]="amount() !== val">
                      {{ val | currencyConvert }}
                    </button>
                  </div>
                  
                  <div class="mt-4 relative">
                    <span class="absolute left-4 top-1/2 -translate-y-1/2 text-ink/50 font-bold">$</span>
                    <input type="number" 
                           [ngModel]="customAmount()"
                           (ngModelChange)="onCustomAmountChange($event)"
                           name="customAmount"
                           placeholder="Enter Custom Amount"
                           class="w-full pl-8 pr-4 py-3 border border-ink/20 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                  </div>
                </div>

                <!-- Recipient Details -->
                <div class="space-y-4 mb-8">
                  <label class="block text-sm font-bold text-ink uppercase tracking-wider mb-2">Delivery Details</label>
                  
                  <div>
                    <input type="text" placeholder="Recipient's Name" required
                           class="w-full px-4 py-3 border border-ink/20 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                  </div>
                  <div>
                    <input type="email" placeholder="Recipient's Email" required
                           class="w-full px-4 py-3 border border-ink/20 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all">
                  </div>
                  <div>
                    <textarea placeholder="Add a Personal Message (Optional)" rows="3"
                              class="w-full px-4 py-3 border border-ink/20 rounded-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"></textarea>
                  </div>
                </div>

                <!-- Actions -->
                <button type="submit" 
                        class="w-full bg-primary text-surface font-bold py-4 rounded-lg shadow-lg hover:shadow-xl transition-all uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98]">
                  Add to Shopping Bag
                </button>
                
                <p class="text-center text-xs text-ink/60 mt-4">Gift cards are delivered by email and contain instructions to redeem them at checkout. Our gift cards have no additional processing fees.</p>
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

  getCardBgClass(themeId: string): string {
    switch(themeId) {
      case 'gold': return 'bg-gradient-to-br from-yellow-600 via-yellow-700 to-yellow-900';
      case 'ruby': return 'bg-gradient-to-br from-red-800 via-red-900 to-black';
      case 'classic': 
      default: 
        return 'bg-gradient-to-br from-primary via-blue-900 to-black';
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
