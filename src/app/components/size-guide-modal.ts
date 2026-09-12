import { Component, Input, Output, EventEmitter, signal, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-size-guide-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div *ngIf="isOpen" class="fixed inset-0 z-[60] flex items-center justify-center p-4 font-sans">
      <!-- Backdrop -->
      <div (click)="close.emit()" class="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"></div>

      <!-- Modal Content -->
      <div #modalContainer class="relative bg-white rounded-[18px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in-up">
        <!-- Header -->
        <div class="sticky top-0 bg-white border-b border-[#e0e0e0] p-6 flex justify-between items-center z-10">
          <h2 class="text-2xl font-display font-semibold tracking-tight text-[#1d1d1f]">Ring Size Guide</h2>
          <button (click)="close.emit()" aria-label="Close size guide" class="p-2 hover:bg-[#f5f5f7] rounded-full transition-colors active-press">
            <svg class="w-6 h-6 text-[#6e6e73]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <!-- Tabs -->
        <div class="flex border-b border-[#e0e0e0]">
          <button (click)="activeTab.set('chart')"
                  [ngClass]="activeTab() === 'chart' ? 'text-[#1d1d1f] border-[#D4AF37]' : 'text-[#6e6e73] border-transparent'"
                  class="flex-1 py-4 text-center text-sm font-medium border-b-2 hover:text-[#1d1d1f] transition-colors">
            Size Chart
          </button>
          <button (click)="activeTab.set('virtual')"
                  [ngClass]="activeTab() === 'virtual' ? 'text-[#1d1d1f] border-[#D4AF37]' : 'text-[#6e6e73] border-transparent'"
                  class="flex-1 py-4 text-center text-sm font-medium border-b-2 hover:text-[#1d1d1f] transition-colors">
            Virtual Sizer
          </button>
          <button (click)="activeTab.set('kit')"
                  [ngClass]="activeTab() === 'kit' ? 'text-[#1d1d1f] border-[#D4AF37]' : 'text-[#6e6e73] border-transparent'"
                  class="flex-1 py-4 text-center text-sm font-medium border-b-2 hover:text-[#1d1d1f] transition-colors">
            Request Kit
          </button>
        </div>

        <!-- Body -->
        <div class="p-6">

          <!-- TAB: CHART -->
          <div *ngIf="activeTab() === 'chart'" class="animate-fade-in">
            <p class="text-[#6e6e73] mb-6">
              Use the chart below to find your ring size. If you are between sizes, we recommend choosing the larger size.
            </p>

            <div class="overflow-x-auto mb-8 border border-[#e0e0e0] rounded-[12px]">
              <table class="w-full text-sm text-left text-[#1d1d1f]">
                <thead class="bg-[#f5f5f7] text-[#1d1d1f] font-semibold">
                  <tr>
                    <th class="px-4 py-3">US & Canada</th>
                    <th class="px-4 py-3">UK & Australia</th>
                    <th class="px-4 py-3">EU & ISO</th>
                    <th class="px-4 py-3">Inside Diameter (mm)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[#f0f0f0]">
                  <tr *ngFor="let size of sizes" class="hover:bg-[#fafafc]">
                    <td class="px-4 py-3 font-medium">{{ size.us }}</td>
                    <td class="px-4 py-3">{{ size.uk }}</td>
                    <td class="px-4 py-3">{{ size.eu }}</td>
                    <td class="px-4 py-3">{{ size.mm }} mm</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="bg-[#f5f5f7] rounded-[18px] p-6">
              <h3 class="font-display font-semibold text-xl tracking-tight text-[#1d1d1f] mb-4">How to Measure</h3>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 class="font-semibold text-base text-[#1d1d1f] mb-2">Option 1: Measure a Ring</h4>
                  <p class="text-sm text-[#6e6e73]">
                    Select a ring that properly fits the intended finger. Measure the inside diameter.
                  </p>
                </div>
                <div>
                  <h4 class="font-semibold text-base text-[#1d1d1f] mb-2">Option 2: Measure Your Finger</h4>
                  <p class="text-sm text-[#6e6e73]">
                    Wrap a strip of paper around your finger. Mark the spot where it meets and measure the distance.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB: VIRTUAL SIZER -->
          <div *ngIf="activeTab() === 'virtual'" class="animate-fade-in text-center">
            <h3 class="font-display font-semibold text-xl tracking-tight text-[#1d1d1f] mb-2">Match Your Ring</h3>
            <p class="text-[#6e6e73] mb-8 max-w-md mx-auto">
              Place a ring that fits you well on the screen. Adjust the slider until the circle below perfectly fills the <strong>inside</strong> of your ring.
            </p>

            <div class="bg-[#f5f5f7] rounded-[18px] p-8 mb-8 flex items-center justify-center relative min-h-[300px]">
              <!-- The Circle -->
              <div class="rounded-full bg-[#D4AF37] border-4 border-[#B5952F] flex items-center justify-center transition-all duration-75"
                   [style.width.mm]="sliderValue()"
                   [style.height.mm]="sliderValue()">
                 <span class="text-black font-semibold text-xs">{{ sliderValue() | number:'1.1-1' }} mm</span>
              </div>
            </div>

            <div class="max-w-md mx-auto">
              <input type="range"
                     aria-label="Ring inside diameter in millimetres"
                     [min]="14" [max]="24" [step]="0.1"
                     [ngModel]="sliderValue()"
                     (ngModelChange)="updateSlider($event)"
                     class="w-full h-2 bg-[#e0e0e0] rounded-full appearance-none cursor-pointer accent-[#D4AF37]">
              <div class="flex justify-between text-xs text-[#6e6e73] mt-2">
                <span>14mm</span>
                <span>Move slider to adjust size</span>
                <span>24mm</span>
              </div>

              <div class="mt-8 p-4 bg-white rounded-[12px] border border-[#e0e0e0]">
                <p class="font-semibold text-[#1d1d1f]">Estimated Size: <span class="text-2xl font-display text-[#D4AF37]">{{ estimatedSize() }}</span></p>
                <p class="text-xs text-[#6e6e73] mt-1">(US Standard)</p>
              </div>
            </div>
          </div>

          <!-- TAB: REQUEST KIT -->
          <div *ngIf="activeTab() === 'kit'" class="animate-fade-in">
             <div class="text-center mb-8">
               <span class="text-4xl">📦</span>
               <h3 class="font-display font-semibold text-xl tracking-tight text-[#1d1d1f] mt-2">Free Ring Sizer Kit</h3>
               <p class="text-[#6e6e73] mt-2">We'll ship a professional sizing tool to your doorstep, free of charge.</p>
             </div>

             <form (submit)="submitKitRequest()" class="space-y-4 max-w-md mx-auto">
               <div class="grid grid-cols-2 gap-4">
                 <input type="text" placeholder="First Name" aria-label="First Name" class="input-field" required>
                 <input type="text" placeholder="Last Name" aria-label="Last Name" class="input-field" required>
               </div>
               <input type="email" placeholder="Email Address" aria-label="Email Address" class="input-field" required>
               <input type="text" placeholder="Street Address" aria-label="Street Address" class="input-field" required>
               <div class="grid grid-cols-2 gap-4">
                 <input type="text" placeholder="City" aria-label="City" class="input-field" required>
                 <input type="text" placeholder="Zip Code" aria-label="Zip Code" class="input-field" required>
               </div>

               <button type="submit" class="btn-apple-pill w-full">Request Sizer</button>

               <p *ngIf="kitSent()" class="text-green-600 text-center font-semibold animate-fade-in">
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

  @HostListener('document:keydown.escape')
  onKeydownHandler() {
    if (this.isOpen) {
      this.close.emit();
    }
  }

  @ViewChild('modalContainer') modalContainer?: ElementRef;

  @HostListener('document:keydown.tab', ['$event'])
  onTabHandler(event: any) {
    if (!this.isOpen || !this.modalContainer) return;

    const focusableElements = this.modalContainer.nativeElement.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement.focus();
        event.preventDefault();
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement.focus();
        event.preventDefault();
      }
    }
  }
}
