import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-size-guide-modal',
  standalone: true,
  imports: [CommonModule],
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

        <!-- Body -->
        <div class="p-6">
          <p class="text-gray-600 mb-6">
            Use the chart below to find your ring size. If you are between sizes, we recommend choosing the larger size.
          </p>

          <!-- Size Chart -->
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
                <tr class="hover:bg-gold-50/50">
                  <td class="px-4 py-3 font-medium">5</td>
                  <td class="px-4 py-3">J ½</td>
                  <td class="px-4 py-3">49</td>
                  <td class="px-4 py-3">15.7 mm</td>
                </tr>
                <tr class="hover:bg-gold-50/50">
                  <td class="px-4 py-3 font-medium">6</td>
                  <td class="px-4 py-3">L ½</td>
                  <td class="px-4 py-3">52</td>
                  <td class="px-4 py-3">16.5 mm</td>
                </tr>
                <tr class="hover:bg-gold-50/50">
                  <td class="px-4 py-3 font-medium">7</td>
                  <td class="px-4 py-3">N ½</td>
                  <td class="px-4 py-3">54</td>
                  <td class="px-4 py-3">17.3 mm</td>
                </tr>
                <tr class="hover:bg-gold-50/50">
                  <td class="px-4 py-3 font-medium">8</td>
                  <td class="px-4 py-3">P ½</td>
                  <td class="px-4 py-3">57</td>
                  <td class="px-4 py-3">18.1 mm</td>
                </tr>
                <tr class="hover:bg-gold-50/50">
                  <td class="px-4 py-3 font-medium">9</td>
                  <td class="px-4 py-3">R ½</td>
                  <td class="px-4 py-3">59</td>
                  <td class="px-4 py-3">19.0 mm</td>
                </tr>
                <tr class="hover:bg-gold-50/50">
                  <td class="px-4 py-3 font-medium">10</td>
                  <td class="px-4 py-3">T ½</td>
                  <td class="px-4 py-3">62</td>
                  <td class="px-4 py-3">19.8 mm</td>
                </tr>
                <tr class="hover:bg-gold-50/50">
                  <td class="px-4 py-3 font-medium">11</td>
                  <td class="px-4 py-3">V ½</td>
                  <td class="px-4 py-3">65</td>
                  <td class="px-4 py-3">20.6 mm</td>
                </tr>
                <tr class="hover:bg-gold-50/50">
                  <td class="px-4 py-3 font-medium">12</td>
                  <td class="px-4 py-3">Y</td>
                  <td class="px-4 py-3">68</td>
                  <td class="px-4 py-3">21.4 mm</td>
                </tr>
                <tr class="hover:bg-gold-50/50">
                  <td class="px-4 py-3 font-medium">13</td>
                  <td class="px-4 py-3">Z ½</td>
                  <td class="px-4 py-3">70</td>
                  <td class="px-4 py-3">22.2 mm</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Measuring Guide -->
          <div class="bg-diamond-50 rounded-xl p-6">
            <h3 class="font-bold text-gray-900 mb-4">How to Measure</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 class="font-semibold text-gold-600 mb-2">Option 1: Measure a Ring</h4>
                <p class="text-sm text-gray-700">
                  Select a ring that properly fits the intended finger. Measure the inside diameter of the ring and match it to the chart above.
                </p>
              </div>
              <div>
                <h4 class="font-semibold text-gold-600 mb-2">Option 2: Measure Your Finger</h4>
                <p class="text-sm text-gray-700">
                  Wrap a strip of paper around your finger where you'd like your ring to be. Make sure that the paper is pulled snug to your finger, the tighter the better. Mark the spot where the paper meets and measure the distance with a ruler (mm).
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="p-6 border-t border-diamond-200 bg-gray-50 rounded-b-2xl">
           <p class="text-center text-sm text-gray-500">
             Need a ring sizer? <a href="#contact" class="text-gold-600 underline font-semibold">Contact us</a> to request a complimentary sizing kit.
           </p>
        </div>
      </div>
    </div>
  `
})
export class SizeGuideModalComponent {
  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();
}
