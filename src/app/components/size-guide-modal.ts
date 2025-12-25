import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-size-guide-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div *ngIf="isOpen" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <!-- Backdrop -->
      <div (click)="close.emit()" class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"></div>

      <!-- Modal Content -->
      <div class="relative bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in-up">
        <!-- Header -->
        <div class="sticky top-0 bg-white border-b border-diamond-200 p-6 flex justify-between items-center z-10">
          <h2 class="text-2xl font-display font-bold text-diamond-900">Ring Size Guide</h2>
          <button (click)="close.emit()" class="p-2 hover:bg-diamond-50 rounded-full transition-colors">
            <svg class="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-diamond-200">
          <button (click)="activeTab.set('chart')"
                  [class.text-gold-600]="activeTab() === 'chart'"
                  [class.border-gold-500]="activeTab() === 'chart'"
                  class="flex-1 py-4 text-center font-semibold text-gray-600 border-b-2 border-transparent hover:text-gold-500 transition-colors">
            Size Chart
          </button>
          <button (click)="activeTab.set('virtual')"
                  [class.text-gold-600]="activeTab() === 'virtual'"
                  [class.border-gold-500]="activeTab() === 'virtual'"
                  class="flex-1 py-4 text-center font-semibold text-gray-600 border-b-2 border-transparent hover:text-gold-500 transition-colors">
            Virtual Sizer
          </button>
          <button (click)="activeTab.set('kit')"
                  [class.text-gold-600]="activeTab() === 'kit'"
                  [class.border-gold-500]="activeTab() === 'kit'"
                  class="flex-1 py-4 text-center font-semibold text-gray-600 border-b-2 border-transparent hover:text-gold-500 transition-colors">
            Request Kit
          </button>
        </div>

        <!-- Body -->
        <div class="p-6">

          <!-- TAB: CHART -->
          <div *ngIf="activeTab() === 'chart'" class="animate-fade-in">
            <p class="text-gray-600 mb-6">
              Use the chart below to find your ring size. If you are between sizes, we recommend choosing the larger size.
            </p>

            <div class="overflow-x-auto mb-8">
              <table class="w-full text-sm text-left">
                <thead class="bg-diamond-50 text-gray-700 font-semibold">
                  <tr>
                    <th class="px-4 py-3 rounded-tl-lg">US & Canada</th>
                    <th class="px-4 py-3">UK & Australia</th>
                    <th class="px-4 py-3">EU & ISO</th>
                    <th class="px-4 py-3 rounded-tr-lg">Inside Diameter (mm)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-diamond-100">
                  <tr *ngFor="let size of sizes" class="hover:bg-gold-50/50">
                    <td class="px-4 py-3 font-medium">{{ size.us }}</td>
                    <td class="px-4 py-3">{{ size.uk }}</td>
                    <td class="px-4 py-3">{{ size.eu }}</td>
                    <td class="px-4 py-3">{{ size.mm }} mm</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="bg-diamond-50 rounded-xl p-6">
              <h3 class="font-bold text-gray-900 mb-4">How to Measure</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 class="font-semibold text-gold-600 mb-2">Option 1: Measure a Ring</h4>
                  <p class="text-sm text-gray-700">
                    Select a ring that properly fits the intended finger. Measure the inside diameter.
                  </p>
                </div>
                <div>
                  <h4 class="font-semibold text-gold-600 mb-2">Option 2: Measure Your Finger</h4>
                  <p class="text-sm text-gray-700">
                    Wrap a strip of paper around your finger. Mark the spot where it meets and measure the distance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB: VIRTUAL SIZER -->
          <div *ngIf="activeTab() === 'virtual'" class="animate-fade-in text-center">
            <h3 class="font-bold text-lg text-gray-900 mb-2">Match Your Ring</h3>
            <p class="text-gray-600 mb-8 max-w-md mx-auto">
              Place a ring that fits you well on the screen. Adjust the slider until the circle below perfectly fills the <strong>inside</strong> of your ring.
            </p>

            <div class="bg-gray-100 rounded-2xl p-8 mb-8 flex items-center justify-center relative min-h-[300px]">
              <!-- The Circle -->
              <div class="rounded-full bg-gold-400 border-4 border-gold-600 shadow-inner flex items-center justify-center transition-all duration-75"
                   [style.width.mm]="sliderValue()"
                   [style.height.mm]="sliderValue()">
                 <span class="text-white font-bold text-xs">{{ sliderValue() | number:'1.1-1' }} mm</span>
              </div>
            </div>

            <div class="max-w-md mx-auto">
              <input type="range"
                     [min]="14" [max]="24" [step]="0.1"
                     [ngModel]="sliderValue()"
                     (ngModelChange)="updateSlider($event)"
                     class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-gold-600">
              <div class="flex justify-between text-xs text-gray-500 mt-2">
                <span>14mm</span>
                <span>Move slider to adjust size</span>
                <span>24mm</span>
              </div>

              <div class="mt-8 p-4 bg-gold-50 rounded-lg border border-gold-200">
                <p class="font-bold text-gray-900">Estimated Size: <span class="text-2xl text-gold-600">{{ estimatedSize() }}</span></p>
                <p class="text-xs text-gray-600 mt-1">(US Standard)</p>
              </div>
            </div>
          </div>

          <!-- TAB: REQUEST KIT -->
          <div *ngIf="activeTab() === 'kit'" class="animate-fade-in">
             <div class="text-center mb-8">
               <span class="text-4xl">📦</span>
               <h3 class="font-bold text-xl text-gray-900 mt-2">Free Ring Sizer Kit</h3>
               <p class="text-gray-600 mt-2">We'll ship a professional sizing tool to your doorstep, free of charge.</p>
             </div>

             <form (submit)="submitKitRequest()" class="space-y-4 max-w-md mx-auto">
               <div class="grid grid-cols-2 gap-4">
                 <input type="text" placeholder="First Name" class="input-field" required>
                 <input type="text" placeholder="Last Name" class="input-field" required>
               </div>
               <input type="email" placeholder="Email Address" class="input-field" required>
               <input type="text" placeholder="Street Address" class="input-field" required>
               <div class="grid grid-cols-2 gap-4">
                 <input type="text" placeholder="City" class="input-field" required>
                 <input type="text" placeholder="Zip Code" class="input-field" required>
               </div>

               <button type="submit" class="btn-primary w-full py-3">Request Sizer</button>

               <p *ngIf="kitSent()" class="text-green-600 text-center font-bold animate-fade-in">
                 ✓ Request sent! You'll receive it in 3-5 days.
               </p>
             </form>
          </div>

        </div>
      </div>
    </div>
  `
})
export class SizeGuideModalComponent {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  activeTab = signal<'chart' | 'virtual' | 'kit'>('chart');
  sliderValue = signal(16.5); // Default ~Size 6
  kitSent = signal(false);

  sizes = [
    { us: 5, uk: 'J ½', eu: 49, mm: 15.7 },
    { us: 6, uk: 'L ½', eu: 52, mm: 16.5 },
    { us: 7, uk: 'N ½', eu: 54, mm: 17.3 },
    { us: 8, uk: 'P ½', eu: 57, mm: 18.1 },
    { us: 9, uk: 'R ½', eu: 59, mm: 19.0 },
    { us: 10, uk: 'T ½', eu: 62, mm: 19.8 },
    { us: 11, uk: 'V ½', eu: 65, mm: 20.6 },
    { us: 12, uk: 'Y', eu: 68, mm: 21.4 },
    { us: 13, uk: 'Z ½', eu: 70, mm: 22.2 },
  ];

  updateSlider(val: number) {
    this.sliderValue.set(val);
  }

  estimatedSize() {
    const mm = this.sliderValue();
    // Find closest size
    const closest = this.sizes.reduce((prev, curr) => {
      return (Math.abs(curr.mm - mm) < Math.abs(prev.mm - mm) ? curr : prev);
    });
    return closest.us;
  }

  submitKitRequest() {
    this.kitSent.set(true);
    // Mock API call would go here
  }
}
