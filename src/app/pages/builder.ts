import { forkJoin } from 'rxjs';
import { Component, signal, inject, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { BuilderService, JewelryCategoryType } from '../services/builder.service';
import { ProductService } from '../services/product.service';
import { CartService } from '../services/cart.service';
import { Product } from '../core/models';
import { CurrencyService } from '../services/currency.service';
import { ToastService } from '../services/toast.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import { VirtualTryOnComponent } from '../components/virtual-try-on';

@Component({
  selector: 'app-builder',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyConvertPipe, VirtualTryOnComponent],
  template: `
    <!-- APPLE DESIGN SYSTEM: BESPOKE FINE JEWELRY ATELIER (ANY PIECE) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pt-[96px] pb-28">
      
      <!-- Sticky Frosted Stepper Header -->
      <div class="sub-nav-frosted sticky top-[96px] z-30 py-4 px-6 md:px-12 border-b border-[#e0e0e0]">
        <div class="max-w-[1440px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37]">Haute Joaillerie Atelier</span>
            <h1 class="font-display font-semibold text-xl md:text-2xl text-[#1d1d1f]">Bespoke Jewelry Studio</h1>
          </div>

          <!-- 4-Step Apple Pill Progress Indicator -->
          <div class="flex items-center space-x-2 sm:space-x-3 text-xs overflow-x-auto hide-scrollbar max-w-full py-1">
            
            <!-- Step 1: Category -->
            <button
              (click)="builder.goToStep(1)"
              [class.bg-[#1d1d1f]]="builder.currentStep() === 1"
              [class.text-white]="builder.currentStep() === 1"
              [class.border-[#1d1d1f]]="builder.currentStep() === 1"
              class="px-3.5 py-2 rounded-full border border-[#e0e0e0] font-medium transition-all active-press whitespace-nowrap"
            >
              1. Type
            </button>

            <!-- Step 2: Mounting -->
            <button
              (click)="builder.goToStep(2)"
              [disabled]="!builder.selectedCategory()"
              [class.bg-[#1d1d1f]]="builder.currentStep() === 2"
              [class.text-white]="builder.currentStep() === 2"
              [class.border-[#1d1d1f]]="builder.currentStep() === 2"
              class="px-3.5 py-2 rounded-full border border-[#e0e0e0] font-medium transition-all active-press disabled:opacity-40 whitespace-nowrap"
            >
              2. Mounting
            </button>

            <!-- Step 3: Gemstone -->
            <button
              (click)="builder.goToStep(3)"
              [disabled]="!builder.selectedSetting()"
              [class.bg-[#1d1d1f]]="builder.currentStep() === 3"
              [class.text-white]="builder.currentStep() === 3"
              [class.border-[#1d1d1f]]="builder.currentStep() === 3"
              class="px-3.5 py-2 rounded-full border border-[#e0e0e0] font-medium transition-all active-press disabled:opacity-40 whitespace-nowrap"
            >
              3. Gemstone
            </button>

            <!-- Step 4: Personalize & Review -->
            <button
              (click)="builder.goToStep(4)"
              [disabled]="!builder.selectedSetting() || !builder.selectedStone()"
              [class.bg-[#D4AF37]]="builder.currentStep() === 4"
              [class.text-black]="builder.currentStep() === 4"
              [class.font-semibold]="builder.currentStep() === 4"
              class="px-3.5 py-2 rounded-full border border-[#e0e0e0] font-medium transition-all active-press disabled:opacity-40 whitespace-nowrap"
            >
              4. Review
            </button>
          </div>

          <!-- Total Summary -->
          <div class="text-right hidden md:block">
            <span class="text-[11px] text-[#7a7a7a] uppercase tracking-wider block">Estimated Valuation</span>
            <span class="font-sans font-semibold text-lg text-[#1d1d1f]">{{ builder.totalPrice() | currencyConvert }}</span>
          </div>
        </div>
      </div>

      <main class="max-w-[1440px] mx-auto px-4 md:px-12 py-12">

        <!-- STEP 1: JEWELRY CATEGORY SELECTION -->
        <div *ngIf="builder.currentStep() === 1" class="animate-fadeIn">
          <div class="max-w-[800px] mx-auto text-center mb-12">
            <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">Step 1 of 4</span>
            <h2 class="font-display font-semibold text-3xl md:text-5xl text-[#1d1d1f] tracking-tight">
              What Shall We Craft For You?
            </h2>
            <p class="text-sm text-[#7a7a7a] mt-3">
              Select the category of fine jewelry to begin designing with our master goldsmiths.
            </p>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <article
              *ngFor="let cat of builder.categoryOptions"
              (click)="selectCategory(cat.id)"
              class="store-utility-card cursor-pointer group transition-all p-8 flex flex-col justify-between"
              [class.!border-[#D4AF37]]="builder.selectedCategory() === cat.id"
              [class.!border-2]="builder.selectedCategory() === cat.id"
              [class.shadow-xl]="builder.selectedCategory() === cat.id"
            >
              <div>
                <div class="w-16 h-16 rounded-2xl bg-[#f5f5f7] flex items-center justify-center text-3xl mb-6 group-hover:scale-110 transition-transform">
                  {{ cat.icon }}
                </div>
                <h3 class="font-display font-semibold text-xl text-[#1d1d1f] group-hover:text-[#D4AF37] transition-colors mb-2">
                  {{ cat.name }}
                </h3>
                <p class="text-xs text-[#7a7a7a] leading-relaxed mb-6">
                  {{ cat.subtitle }}
                </p>
              </div>

              <div class="flex justify-between items-center pt-4 border-t border-[#f0f0f0]">
                <span class="text-xs font-semibold text-[#D4AF37]">18K & Platinum</span>
                <span class="btn-apple-pill text-xs !py-1.5 !px-4">
                  Select Type &rarr;
                </span>
              </div>
            </article>
          </div>
        </div>

        <!-- STEP 2: MOUNTING / SETTING SELECTION -->
        <div *ngIf="builder.currentStep() === 2" class="animate-fadeIn">
          <div class="max-w-[800px] mx-auto text-center mb-12">
            <button (click)="builder.goToStep(1)" class="text-xs text-[#D4AF37] font-medium hover:underline mb-2 inline-block">← Change Jewelry Type</button>
            <h2 class="font-display font-semibold text-3xl md:text-4xl text-[#1d1d1f]">Choose Your Precious Setting.</h2>
            <p class="text-sm text-[#7a7a7a] mt-2">Precision-engineered mountings cast in solid 18K gold and platinum alloys.</p>

            <!-- Metal Preference Toggles -->
            <div class="flex flex-wrap justify-center gap-2 mt-6">
              <button
                *ngFor="let metal of metalOptions"
                (click)="selectMetalOption(metal)"
                [class.bg-[#1d1d1f]]="builder.selectedMetal() === metal.id"
                [class.text-white]="builder.selectedMetal() === metal.id"
                [class.bg-white]="builder.selectedMetal() !== metal.id"
                class="px-4 py-2 rounded-full border border-[#e0e0e0] text-xs font-medium transition-all shadow-sm flex items-center gap-2"
              >
                <span class="w-3 h-3 rounded-full" [style.background-color]="metal.colorCode"></span>
                <span>{{ metal.name }}</span>
              </button>
            </div>
          </div>

          <!-- Loading State -->
          <div *ngIf="isLoading()" class="text-center py-16 text-sm text-[#7a7a7a]">
            Gathering atelier mountings...
          </div>

          <div *ngIf="!isLoading()" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <article
              *ngFor="let product of filteredSettings()"
              (click)="selectSetting(product)"
              class="store-utility-card cursor-pointer group transition-all"
              [class.!border-[#D4AF37]]="builder.selectedSetting()?.id === product.id"
              [class.!border-2]="builder.selectedSetting()?.id === product.id"
              [class.shadow-lg]="builder.selectedSetting()?.id === product.id"
            >
              <div class="w-full aspect-square bg-[#f5f5f7] rounded-[12px] overflow-hidden relative mb-6 group-hover:scale-105 transition-transform duration-500 flex items-center justify-center p-4">
                <img *ngIf="product.imageUrl || product.images?.[0]" [src]="product.imageUrl || product.images?.[0]" class="w-full h-full object-contain" [alt]="product.name">
                <div *ngIf="!product.imageUrl && !product.images?.[0]" class="w-20 h-20 text-[#D4AF37]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22a8 8 0 100-16 8 8 0 000 16zm0-16V2m-3 2h6M9 6l3-4 3 4" /></svg>
                </div>
              </div>
              <div>
                <span class="text-xs text-[#7a7a7a] uppercase font-mono tracking-wider block mb-1">
                  {{ builder.selectedMetalName() }}
                </span>
                <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] group-hover:text-[#D4AF37] transition-colors mb-2">{{ product.name }}</h3>
                <div class="flex justify-between items-center mt-4 pt-4 border-t border-[#f0f0f0]">
                  <span class="font-sans font-semibold text-base text-[#1d1d1f]">{{ product.price | currencyConvert }}</span>
                  <button class="btn-apple-pill text-xs !py-1.5 !px-4">
                    {{ builder.selectedSetting()?.id === product.id ? '✓ Selected' : 'Select Mounting' }}
                  </button>
                </div>
              </div>
            </article>
          </div>
        </div>

        <!-- STEP 3: GEMSTONE SELECTION -->
        <div *ngIf="builder.currentStep() === 3" class="animate-fadeIn">
          <div class="max-w-[800px] mx-auto text-center mb-12">
            <button (click)="builder.goToStep(2)" class="text-xs text-[#D4AF37] font-medium hover:underline mb-2 inline-block">← Change Mounting</button>
            <h2 class="font-display font-semibold text-3xl md:text-4xl text-[#1d1d1f]">Choose Your Certified Gemstone.</h2>
            <p class="text-sm text-[#7a7a7a] mt-2">Ethical diamonds, royal sapphires, and emeralds graded by GIA, IGI & GRS.</p>

            <!-- Gem Category Filter Chips -->
            <div class="flex flex-wrap justify-center gap-2 mt-6">
              <button
                *ngFor="let fam of gemFamilies"
                (click)="selectedGemFamily.set(fam.id)"
                [class.bg-[#1d1d1f]]="selectedGemFamily() === fam.id"
                [class.text-white]="selectedGemFamily() === fam.id"
                [class.bg-white]="selectedGemFamily() !== fam.id"
                class="px-4 py-2 rounded-full border border-[#e0e0e0] text-xs font-medium transition-all shadow-sm"
              >
                {{ fam.name }}
              </button>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <article
              *ngFor="let product of filteredStones()"
              (click)="selectStone(product)"
              class="store-utility-card cursor-pointer group transition-all"
              [class.!border-[#D4AF37]]="builder.selectedStone()?.id === product.id"
              [class.!border-2]="builder.selectedStone()?.id === product.id"
              [class.shadow-lg]="builder.selectedStone()?.id === product.id"
            >
              <div class="w-full aspect-square bg-[#f5f5f7] rounded-[12px] overflow-hidden relative mb-6 group-hover:scale-105 transition-transform duration-500 flex items-center justify-center p-4">
                <img *ngIf="product.imageUrl || product.images?.[0]" [src]="product.imageUrl || product.images?.[0]" class="w-full h-full object-contain" [alt]="product.name">
                <div *ngIf="!product.imageUrl && !product.images?.[0]" class="w-20 h-20 text-[#D4AF37]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M6 3h12l4 6-10 12L2 9l4-6zM2 9h20M12 21L7.5 9 12 3l4.5 6L12 21z" /></svg>
                </div>
              </div>
              <div>
                <span class="text-xs text-[#D4AF37] uppercase font-mono tracking-wider block mb-1">
                  {{ product.species || 'Certified Natural' }}
                </span>
                <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] group-hover:text-[#D4AF37] transition-colors mb-2">{{ product.name }}</h3>
                
                <div class="grid grid-cols-3 gap-2 text-[11px] text-[#7a7a7a] mb-4 bg-[#f5f5f7] p-2.5 rounded-lg border border-[#e0e0e0]">
                  <div>
                    <span class="block text-[9px] uppercase tracking-wider text-[#1d1d1f]">Carat</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ product.caratWeight || product.specifications?.carat || '1.0' }} ct</span>
                  </div>
                  <div>
                    <span class="block text-[9px] uppercase tracking-wider text-[#1d1d1f]">Shape</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ product.shape || 'Round' }}</span>
                  </div>
                  <div>
                    <span class="block text-[9px] uppercase tracking-wider text-[#1d1d1f]">Clarity</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ product.clarity || 'VVS1' }}</span>
                  </div>
                </div>

                <div class="flex justify-between items-center pt-4 border-t border-[#f0f0f0]">
                  <span class="font-sans font-semibold text-base text-[#1d1d1f]">{{ product.price | currencyConvert }}</span>
                  <button class="btn-apple-pill text-xs !py-1.5 !px-4">
                    {{ builder.selectedStone()?.id === product.id ? '✓ Selected' : 'Select Gemstone' }}
                  </button>
                </div>
              </div>
            </article>
          </div>
        </div>

        <!-- STEP 4: PERSONALIZE & FINAL ATELIER REVIEW -->
        <div *ngIf="builder.currentStep() === 4" class="animate-fadeIn">
          <div class="max-w-[800px] mx-auto text-center mb-12">
            <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">Step 4 of 4</span>
            <h2 class="font-display font-semibold text-3xl md:text-4xl text-[#1d1d1f]">Your Bespoke Creation.</h2>
            <p class="text-sm text-[#7a7a7a] mt-2">Inspect proportions, customize sizing, laser engraving, and try on virtually.</p>
          </div>

          <div class="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            
            <!-- Left: Visual Atelier Showcase & Virtual Try-On -->
            <div class="lg:col-span-7 bg-[#f5f5f7] rounded-[28px] border border-[#e0e0e0] p-8 md:p-12 flex flex-col items-center justify-center text-center product-surface-shadow relative">
              
              <!-- AR Try-On Action Button -->
              <button (click)="tryOnOpen.set(true)"
                      class="absolute top-5 right-5 btn-apple-pill text-xs !py-2 !px-4 !bg-white !text-[#1d1d1f] hover:!bg-[#f0f0f0] border border-[#e0e0e0] shadow-md flex items-center gap-1.5">
                <span>✨</span> AR Virtual Try-On
              </button>

              <div class="w-64 h-64 relative mb-6 flex items-center justify-center">
                <img *ngIf="builder.selectedSetting()?.imageUrl || builder.selectedStone()?.imageUrl"
                     [src]="builder.selectedSetting()?.imageUrl || builder.selectedStone()?.imageUrl"
                     class="w-full h-full object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-500">
                <div *ngIf="!builder.selectedSetting()?.imageUrl && !builder.selectedStone()?.imageUrl" class="w-full h-full flex items-center justify-center text-[#D4AF37]">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-32 h-32"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22a8 8 0 100-16 8 8 0 000 16zm0-16V2m-3 2h6M9 6l3-4 3 4" /></svg>
                </div>
              </div>

              <!-- Hallmarked Badge -->
              <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-1">
                {{ builder.selectedMetalName() }}
              </span>
              <h3 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-1">
                {{ builder.selectedSetting()?.name }}
              </h3>
              <span class="text-xs text-[#7a7a7a] uppercase tracking-widest my-2">— handset with —</span>
              <h4 class="font-sans font-semibold text-lg text-[#1d1d1f]">{{ builder.selectedStone()?.name }}</h4>

              <!-- Engraving Live Tag (if set) -->
              <div *ngIf="builder.customEngraving().trim()" class="mt-4 bg-white/80 backdrop-blur-md px-4 py-1.5 rounded-full border border-[#D4AF37]/50 text-xs font-mono text-[#1d1d1f]">
                Laser Engraving: "{{ builder.customEngraving() }}"
              </div>
            </div>

            <!-- Right: Personalization & Summary Box -->
            <div class="lg:col-span-5 bg-white border border-[#e0e0e0] rounded-[28px] p-8 shadow-sm space-y-6">
              <h3 class="font-semibold text-base text-[#1d1d1f] border-b border-[#e0e0e0] pb-3">Bespoke Specifications</h3>

              <!-- Sizing Selector -->
              <div>
                <span class="text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider block mb-2">
                  {{ getSizingLabel() }}
                </span>
                <select [(ngModel)]="selectedSize" (ngModelChange)="builder.selectedSizeOrLength.set($event)"
                        class="w-full bg-[#f5f5f7] border border-[#e0e0e0] rounded-full px-4 py-2.5 text-xs text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37]">
                  <option *ngFor="let s of getSizingOptions()" [value]="s">{{ s }}</option>
                </select>
              </div>

              <!-- Laser Engraving Input -->
              <div>
                <div class="flex justify-between items-center mb-2">
                  <span class="text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider">Secret Laser Engraving</span>
                  <span class="text-[11px] text-[#7a7a7a]">+ {{ 1500 | currencyConvert }}</span>
                </div>
                <input type="text"
                       [ngModel]="builder.customEngraving()"
                       (ngModelChange)="builder.customEngraving.set($event)"
                       maxlength="20"
                       placeholder="e.g. Forever & Always • 2026"
                       class="w-full bg-[#f5f5f7] border border-[#e0e0e0] rounded-full px-4 py-2.5 text-xs text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37]">
              </div>

              <!-- Valuation Breakdown -->
              <div class="space-y-3 pt-4 border-t border-[#e0e0e0] text-xs">
                <div class="flex justify-between items-center text-[#7a7a7a]">
                  <div>
                    <span class="font-medium text-[#1d1d1f] block">{{ builder.selectedSetting()?.name }}</span>
                    <button (click)="builder.goToStep(2)" class="text-[11px] text-[#D4AF37] hover:underline">Change Mounting</button>
                  </div>
                  <span class="font-semibold text-[#1d1d1f]">{{ builder.selectedSetting()?.price || 0 | currencyConvert }}</span>
                </div>

                <div class="flex justify-between items-center text-[#7a7a7a]">
                  <div>
                    <span class="font-medium text-[#1d1d1f] block">{{ builder.selectedStone()?.name }}</span>
                    <button (click)="builder.goToStep(3)" class="text-[11px] text-[#D4AF37] hover:underline">Change Gemstone</button>
                  </div>
                  <span class="font-semibold text-[#1d1d1f]">{{ builder.selectedStone()?.price || 0 | currencyConvert }}</span>
                </div>

                <div *ngIf="builder.customEngraving().trim()" class="flex justify-between items-center text-[#7a7a7a]">
                  <span>Precision Laser Engraving</span>
                  <span class="font-semibold text-[#1d1d1f]">{{ 1500 | currencyConvert }}</span>
                </div>

                <div class="flex justify-between items-center pt-4 border-t border-[#e0e0e0] text-base">
                  <span class="font-semibold text-[#1d1d1f]">Total Valuation</span>
                  <span class="font-sans font-semibold text-2xl text-[#1d1d1f]">{{ builder.totalPrice() | currencyConvert }}</span>
                </div>
              </div>

              <button (click)="addToCart()" class="btn-apple-pill w-full !py-3.5 text-sm">
                Add Bespoke Creation to Bag
              </button>
              <p class="text-[11px] text-[#7a7a7a] text-center">
                Includes fully insured delivery. Certification and warranty as stated on the product.
              </p>
            </div>

          </div>
        </div>

      </main>

      <!-- Apple Floating Sticky Bar -->
      <div *ngIf="builder.selectedSetting() || builder.selectedStone()" class="fixed bottom-0 left-0 w-full bg-[#f5f5f7]/95 backdrop-blur-xl border-t border-[#e0e0e0] py-3.5 px-6 md:px-12 z-40 shadow-2xl">
        <div class="max-w-[1440px] mx-auto flex items-center justify-between">
          <div class="truncate max-w-sm sm:max-w-md">
            <span class="text-xs text-[#7a7a7a] block">Current Atelier Configuration</span>
            <span class="font-sans font-semibold text-sm sm:text-base text-[#1d1d1f] truncate block">
              {{ builder.selectedSetting()?.name || 'Select Mounting' }} 
              <span *ngIf="builder.selectedStone()"> + {{ builder.selectedStone()?.name }}</span>
            </span>
          </div>

          <div class="flex items-center space-x-4">
            <span class="font-sans font-semibold text-base sm:text-lg text-[#1d1d1f]">{{ builder.totalPrice() | currencyConvert }}</span>
            <button *ngIf="builder.currentStep() < 4" (click)="nextStep()" class="btn-apple-pill text-xs !py-2 !px-4">
              Next Step &rarr;
            </button>
            <button *ngIf="builder.currentStep() === 4" (click)="addToCart()" class="btn-apple-pill text-xs !py-2 !px-4">
              Add to Bag
            </button>
          </div>
        </div>
      </div>

      <!-- AR Try-On Modal -->
      <app-virtual-try-on
        [isOpen]="tryOnOpen()"
        [productImageUrl]="builder.selectedSetting()?.imageUrl || builder.selectedStone()?.imageUrl"
        [productName]="builder.selectedSetting()?.name || 'Bespoke Creation'"
        [productCategory]="builder.selectedCategory()"
        (closeEvent)="tryOnOpen.set(false)">
      </app-virtual-try-on>

    </div>
  `
})
export class BuilderComponent implements OnInit {
  builder = inject(BuilderService);
  productService = inject(ProductService);
  cartService = inject(CartService);
  currency = inject(CurrencyService);
  toast = inject(ToastService);
  router = inject(Router);

  settings = signal<Product[]>([]);
  stones = signal<Product[]>([]);
  isLoading = signal(true);
  tryOnOpen = signal(false);

  selectedGemFamily = signal<'all' | 'diamonds' | 'sapphires' | 'emeralds' | 'rubies'>('all');
  selectedSize = 'Size 7 (US)';

  metalOptions = [
    { id: '18k-yellow', name: '18K Yellow Gold', colorCode: '#D4AF37' },
    { id: '18k-rose', name: '18K Rose Gold', colorCode: '#B76E79' },
    { id: '18k-white', name: '18K White Gold', colorCode: '#E5E4E2' },
    { id: 'platinum', name: 'Platinum 950', colorCode: '#C0C0C0' }
  ];

  gemFamilies: { id: 'all' | 'diamonds' | 'sapphires' | 'emeralds' | 'rubies'; name: string }[] = [
    { id: 'all', name: 'All Gemstones' },
    { id: 'diamonds', name: 'GIA Diamonds' },
    { id: 'sapphires', name: 'Ceylon Sapphires' },
    { id: 'emeralds', name: 'Zambian Emeralds' },
    { id: 'rubies', name: 'Burmese Rubies' }
  ];

  filteredSettings = computed(() => {
    const all = this.settings();
    const cat = this.builder.selectedCategory();
    if (!all.length) return [];
    
    // Filter settings according to selected category
    if (cat === 'rings') {
      const match = all.filter(p => p.category?.toLowerCase().includes('ring') || p.category?.toLowerCase().includes('setting'));
      return match.length ? match : all;
    } else if (cat === 'pendants') {
      const match = all.filter(p => p.category?.toLowerCase().includes('pendant'));
      return match.length ? match : all;
    } else if (cat === 'necklaces') {
      const match = all.filter(p => p.category?.toLowerCase().includes('necklace') || p.category?.toLowerCase().includes('choker'));
      return match.length ? match : all;
    } else if (cat === 'earrings') {
      const match = all.filter(p => p.category?.toLowerCase().includes('earring') || p.category?.toLowerCase().includes('stud'));
      return match.length ? match : all;
    } else if (cat === 'bracelets') {
      const match = all.filter(p => p.category?.toLowerCase().includes('bracelet') || p.category?.toLowerCase().includes('bangle'));
      return match.length ? match : all;
    }
    return all;
  });

  filteredStones = computed(() => {
    const all = this.stones();
    const fam = this.selectedGemFamily();
    if (fam === 'all') return all;
    if (fam === 'diamonds') return all.filter(s => s.name?.toLowerCase().includes('diamond') || s.species?.toLowerCase().includes('diamond'));
    if (fam === 'sapphires') return all.filter(s => s.name?.toLowerCase().includes('sapphire') || s.species?.toLowerCase().includes('corundum'));
    if (fam === 'emeralds') return all.filter(s => s.name?.toLowerCase().includes('emerald') || s.species?.toLowerCase().includes('beryl'));
    if (fam === 'rubies') return all.filter(s => s.name?.toLowerCase().includes('ruby'));
    return all;
  });

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.isLoading.set(true);
    // Load Settings
    this.productService.getProducts(0, 100).subscribe({
      next: (res) => {
        this.settings.set(res.content);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false)
    });

    // Load Stones
    this.productService.getProducts(0, 100, { category: 'Loose Gemstone' }).subscribe({
      next: (res) => {
        this.stones.set(res.content);
      }
    });
  }

  selectCategory(category: JewelryCategoryType) {
    this.builder.setCategory(category);
  }

  selectMetalOption(metal: any) {
    this.builder.selectedMetal.set(metal.id);
    this.builder.selectedMetalName.set(metal.name);
  }

  selectSetting(p: Product) {
    this.builder.setSetting(p);
  }

  selectStone(p: Product) {
    this.builder.setStone(p);
  }

  nextStep() {
    const current = this.builder.currentStep();
    if (current === 1) this.builder.goToStep(2);
    else if (current === 2) this.builder.goToStep(3);
    else if (current === 3) this.builder.goToStep(4);
  }

  getSizingLabel(): string {
    const cat = this.builder.selectedCategory();
    if (cat === 'rings') return 'Select Ring Size (US)';
    if (cat === 'necklaces' || cat === 'pendants') return 'Select Chain Length';
    if (cat === 'bracelets') return 'Select Wrist Circumference';
    if (cat === 'earrings') return 'Select Earring Backing Type';
    return 'Size / Specification';
  }

  getSizingOptions(): string[] {
    const cat = this.builder.selectedCategory();
    if (cat === 'rings') return ['Size 5 (US)', 'Size 6 (US)', 'Size 7 (US)', 'Size 8 (US)', 'Size 9 (US)', 'Size 10 (US)'];
    if (cat === 'necklaces' || cat === 'pendants') return ['16 Inches (Choker Style)', '18 Inches (Standard Princess)', '20 Inches (Matinee)', '22 Inches (Opera)'];
    if (cat === 'bracelets') return ['6.5 Inches (Petite)', '7.0 Inches (Standard)', '7.5 Inches (Medium)', '8.0 Inches (Large)'];
    if (cat === 'earrings') return ['Secure Screw Back', 'Comfort Push Back', 'La Pousette Lock (Haute Joaillerie)'];
    return ['Standard Fit'];
  }

  addToCart() {
    const setting = this.builder.selectedSetting();
    const stone = this.builder.selectedStone();

    if (!setting || !stone) {
      return;
    }

    // The setting and the stone are separate catalogue products and must both
    // be charged. Previously only the setting was added, with the stone passed
    // as an option -- and the server prices a line from its product, so the
    // centre stone (usually the larger half of the price) was free. It also
    // meant a guest cart showed the bespoke piece at zero, because no price
    // was supplied at all.
    const reference = `Bespoke ${this.builder.selectedCategory().toUpperCase()} Creation`;
    const shared = {
      metal: this.builder.selectedMetalName(),
      size: this.builder.selectedSizeOrLength(),
      engraving: this.builder.customEngraving(),
      customization: reference,
    };

    forkJoin([
      this.cartService.addToCart(setting.id, 1, {
        ...shared,
        product: setting,
        price: setting.price,
        stoneId: stone.id,
        stoneName: stone.name,
      }),
      this.cartService.addToCart(stone.id, 1, {
        ...shared,
        product: stone,
        price: stone.price,
      }),
    ]).subscribe({
      next: () => {
        this.toast.show(`Custom bespoke creation added to bag! ✦`, 'success');
        this.router.navigate(['/cart']);
      },
      error: () => {
        this.toast.show(
          'We could not add your creation to the bag. Please try again.',
          'error',
        );
      },
    });
  }
}
