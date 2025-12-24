import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-education-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="isOpen" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
      <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">

        <!-- Header -->
        <div class="bg-diamond-900 text-white p-6 flex justify-between items-center">
          <div>
            <h2 class="text-2xl font-display font-bold">Jewelry Education Hub</h2>
            <p class="text-white/70 text-sm">Learn everything about your precious purchase</p>
          </div>
          <button (click)="close.emit()" class="text-white/70 hover:text-white text-3xl transition-colors">&times;</button>
        </div>

        <!-- Navigation -->
        <div class="flex border-b border-gray-200 overflow-x-auto">
          <button *ngFor="let tab of tabs"
                  (click)="activeTab = tab.id"
                  [class.border-b-2]="activeTab === tab.id"
                  [class.border-gold-500]="activeTab === tab.id"
                  [class.text-gold-700]="activeTab === tab.id"
                  [class.font-bold]="activeTab === tab.id"
                  class="px-6 py-4 whitespace-nowrap text-gray-600 hover:bg-gray-50 hover:text-diamond-900 transition-all">
            {{ tab.label }}
          </button>
        </div>

        <!-- Content -->
        <div class="p-8 overflow-y-auto custom-scrollbar flex-1">

          <!-- 4Cs of Diamond -->
          <div *ngIf="activeTab === '4cs'" class="space-y-8">
            <div class="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <h3 class="text-xl font-bold text-diamond-900 mb-4">Color</h3>
                <p class="text-gray-600 mb-4">Diamond color is graded on a scale from D (colorless) to Z (light yellow). Colorless diamonds are the most rare and valuable.</p>
                <div class="flex h-4 w-full rounded-full bg-gradient-to-r from-blue-50 to-yellow-200 border border-gray-200"></div>
                <div class="flex justify-between text-xs text-gray-500 mt-1">
                  <span>D (Colorless)</span>
                  <span>Z (Yellow)</span>
                </div>
              </div>
              <div class="bg-diamond-50 p-6 rounded-lg text-center">
                <span class="text-6xl">💎</span>
                <p class="mt-2 text-sm font-bold text-gray-900">D-F: Colorless</p>
              </div>
            </div>

            <div class="h-px bg-gray-200 w-full"></div>

            <div class="grid md:grid-cols-2 gap-8 items-center">
               <div class="bg-diamond-50 p-6 rounded-lg text-center order-2 md:order-1">
                <span class="text-6xl">🔍</span>
                <p class="mt-2 text-sm font-bold text-gray-900">FL-IF: Flawless</p>
              </div>
              <div class="order-1 md:order-2">
                <h3 class="text-xl font-bold text-diamond-900 mb-4">Clarity</h3>
                <p class="text-gray-600">Clarity refers to the absence of inclusions and blemishes. We offer diamonds from FL (Flawless) to SI (Slightly Included).</p>
                <ul class="list-disc pl-5 text-gray-600 text-sm space-y-1">
                  <li><strong>FL/IF:</strong> No internal or external flaws (Rare)</li>
                  <li><strong>VVS1/VVS2:</strong> Minute inclusions difficult to see</li>
                  <li><strong>VS1/VS2:</strong> Minor inclusions (Best Value)</li>
                  <li><strong>SI1/SI2:</strong> Noticeable inclusions</li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Metal Guide -->
          <div *ngIf="activeTab === 'metal'" class="space-y-6">
            <h3 class="text-2xl font-bold text-diamond-900">Precious Metals Guide</h3>

            <div class="grid gap-6">
              <div class="card p-6 flex gap-4 items-start">
                <div class="w-16 h-16 rounded-full bg-yellow-100 border-2 border-yellow-300 flex-shrink-0"></div>
                <div>
                  <h4 class="font-bold text-lg text-gray-900">Yellow Gold</h4>
                  <p class="text-gray-600 text-sm mt-1">Classic and traditional. Pure gold is mixed with alloy metals like copper and zinc. 18K (75% gold) is richer in color than 14K (58.3% gold).</p>
                </div>
              </div>

              <div class="card p-6 flex gap-4 items-start">
                <div class="w-16 h-16 rounded-full bg-gray-100 border-2 border-gray-300 flex-shrink-0"></div>
                <div>
                  <h4 class="font-bold text-lg text-gray-900">White Gold</h4>
                  <p class="text-gray-600 text-sm mt-1">Gold mixed with white metals like palladium or silver, and plated with Rhodium for a bright white finish. Needs re-plating over time.</p>
                </div>
              </div>

              <div class="card p-6 flex gap-4 items-start">
                <div class="w-16 h-16 rounded-full bg-gray-200 border-2 border-gray-400 flex-shrink-0"></div>
                <div>
                  <h4 class="font-bold text-lg text-gray-900">Platinum</h4>
                  <p class="text-gray-600 text-sm mt-1">Naturally white, extremely durable, and hypoallergenic. 95% pure. It doesn't fade but develops a patina finish over time.</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Size Guide -->
          <div *ngIf="activeTab === 'sizing'" class="text-center">
             <h3 class="text-2xl font-bold text-diamond-900 mb-6">Find Your Perfect Fit</h3>
             <div class="bg-diamond-50 p-8 rounded-xl inline-block mb-6">
               <div class="text-8xl mb-4">💍</div>
               <p class="text-lg text-gray-700 max-w-lg mx-auto">
                 The most accurate way to measure ring size is using a physical ring sizer or visiting a jeweler.
               </p>
             </div>

             <div class="grid md:grid-cols-2 gap-8 text-left">
               <div>
                 <h4 class="font-bold text-gray-900 mb-2">Method 1: Measure a Ring</h4>
                 <p class="text-sm text-gray-600">Take a ring that fits you well and measure the *inner diameter* in millimeters. Match it to our chart.</p>
               </div>
               <div>
                 <h4 class="font-bold text-gray-900 mb-2">Method 2: String Test</h4>
                 <p class="text-sm text-gray-600">Wrap a string around the base of your finger. Mark where it overlaps. Measure the length in mm (circumference).</p>
               </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  `
})
export class EducationModalComponent {
  @Input() isOpen = false;
  @Input() activeTab = '4cs';
  @Output() close = new EventEmitter<void>();

  tabs = [
    { id: '4cs', label: 'The 4Cs of Diamond' },
    { id: 'metal', label: 'Metal Guide' },
    { id: 'sizing', label: 'Ring Sizing' }
  ];
}
