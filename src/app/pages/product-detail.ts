import { Component, OnInit, OnDestroy, AfterViewInit, signal, computed, inject, ChangeDetectionStrategy, ViewEncapsulation, ViewChild, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ProductService } from '../services/product.service';
import { CartService } from '../services/cart.service';
import { ProductDetail, Product, CustomizationOption, PriceBreakup } from '../core/models';
import { ToastService } from '../services/toast.service';
import { FormsModule } from '@angular/forms';
import { SizeGuideModalComponent } from '../components/size-guide-modal';
import { HistoryService } from '../services/history.service';
import { CurrencyService } from '../services/currency.service';
import { RING_CATEGORIES } from '../core/constants';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, RouterLink, FormsModule, SizeGuideModalComponent, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="min-h-screen bg-white font-sans text-primary-900">

      <!-- Breadcrumb -->
      <nav class="bg-white border-b border-gray-100">
        <div class="container mx-auto px-4 lg:px-12 py-3">
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <a routerLink="/" class="hover:text-secondary-600 transition-colors">Home</a>
            <span>/</span>
            <a routerLink="/products" class="hover:text-secondary-600 transition-colors">Products</a>
            <span>/</span>
            <span class="text-gray-900 font-medium truncate max-w-[200px]">{{ product()?.name }}</span>
          </div>
        </div>
      </nav>

      <div class="container mx-auto px-4 lg:px-12 py-8">
        <div *ngIf="loading()" class="animate-pulse lg:flex lg:gap-12 relative">
          <!-- Left Column Skeleton -->
          <div class="lg:w-[58%] flex flex-col gap-12">
            <div class="flex flex-col gap-4">
              <!-- Main Image -->
              <div class="w-full h-[500px] bg-gray-200 rounded-lg"></div>
              <!-- Thumbnails -->
              <div class="grid grid-cols-2 gap-4">
                <div class="h-[300px] bg-gray-200 rounded-lg"></div>
                <div class="h-[300px] bg-gray-200 rounded-lg"></div>
              </div>
            </div>
            <!-- Details -->
            <div class="border-t border-gray-200 pt-8 space-y-4">
              <div class="h-8 w-1/3 bg-gray-200 rounded"></div>
              <div class="h-4 w-full bg-gray-200 rounded"></div>
              <div class="h-4 w-full bg-gray-200 rounded"></div>
              <div class="h-4 w-2/3 bg-gray-200 rounded"></div>
            </div>
          </div>

          <!-- Right Column Skeleton -->
          <div class="lg:w-[42%] relative">
            <div class="sticky top-24 p-6 rounded-2xl border border-gray-100">
              <div class="h-4 w-1/4 bg-gray-200 rounded mb-4"></div> <!-- SKU -->
              <div class="h-10 w-3/4 bg-gray-200 rounded mb-6"></div> <!-- Title -->
              <div class="h-8 w-1/2 bg-gray-200 rounded mb-6"></div> <!-- Price -->

              <!-- Configurator Skeleton -->
              <div class="space-y-4 mb-8">
                <div class="h-10 w-full bg-gray-200 rounded"></div>
                <div class="h-10 w-full bg-gray-200 rounded"></div>
              </div>

              <!-- Buttons -->
              <div class="flex gap-3 h-14">
                <div class="flex-1 bg-gray-200 rounded-lg"></div>
                <div class="flex-1 bg-gray-200 rounded-lg"></div>
              </div>
            </div>
          </div>
        </div>

        <div *ngIf="!loading() && product()" class="lg:flex lg:gap-12 relative">

          <!-- LEFT COLUMN: Scrollable Content (Images + Details) -->
          <div class="lg:w-[58%] flex flex-col gap-12">

            <!-- Image Gallery (Stacked/Grid) -->
            <div class="flex flex-col gap-4">
              <!-- Desktop / Mobile Media Gallery -->
              <div class="flex flex-col md:flex-row gap-4 h-auto md:h-[600px]">

                <!-- Thumbnails (Left on Desktop, Carousel Dots on Mobile) -->
                <!-- Use 'snap-x snap-mandatory' for touch friendly sliding on mobile -->
                <div class="order-2 md:order-1 flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto w-full md:w-24 pb-2 md:pb-0 md:pr-2 hide-scrollbar snap-x snap-mandatory shrink-0">

                  <!-- Video Thumbnail -->
                  <div *ngIf="product()?.videoUrl"
                       (click)="selectMedia('video')"
                       class="snap-start relative w-20 h-20 md:w-full md:h-24 rounded-lg overflow-hidden border-2 cursor-pointer transition-all shrink-0 bg-gray-100 flex items-center justify-center"
                       [class.border-primary-800]="showVideo()"
                       [class.border-transparent]="!showVideo()">
                     <div class="absolute inset-0 bg-black/20 flex items-center justify-center z-10">
                        <svg class="w-8 h-8 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                     </div>
                     <video [src]="product()?.videoUrl" autoplay loop muted playsinline class="w-full h-full object-cover opacity-50"></video>
                  </div>

                  <!-- Image Thumbnails -->
                  <div *ngFor="let img of product()?.images; let i = index"
                       (click)="selectMedia('image', i)"
                       class="snap-start relative w-20 h-20 md:w-full md:h-24 bg-gray-50 rounded-lg overflow-hidden border-2 cursor-pointer hover:opacity-90 transition-all shrink-0"
                       [class.border-primary-800]="selectedMediaIndex() === i && !showVideo()"
                       [class.border-transparent]="selectedMediaIndex() !== i || showVideo()">
                     <img [ngSrc]="img" fill sizes="(max-width: 1024px) 100vw, 50vw" class="object-cover hover:scale-105 transition-transform duration-500">
                  </div>
                </div>

                <!-- Main Display Area (Touch Swipe on Mobile) -->
                <div id="main-media-scroll" class="scroll-smooth order-1 md:order-2 flex-1 relative bg-gray-50 rounded-lg overflow-hidden border border-gray-100 h-[400px] md:h-full flex items-center justify-start snap-x snap-mandatory overflow-x-auto hide-scrollbar">

                  <div class="absolute top-4 left-4 z-10 flex flex-col gap-2">
                    <span *ngIf="(product()?.stock ?? 0) < 5 && (product()?.stock ?? 0) > 0" class="px-2 py-1 bg-yellow-50 text-yellow-700 text-[10px] font-bold uppercase tracking-wider rounded border border-yellow-100 shadow-sm">Only {{product()?.stock}} left</span>
                    <span *ngIf="product()?.stock === 0" class="px-2 py-1 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider rounded border border-red-100 shadow-sm">Out of Stock</span>
                    <span class="px-2 py-1 bg-white/90 backdrop-blur text-gray-600 text-[10px] font-bold uppercase tracking-wider rounded border border-gray-200 shadow-sm">Best Seller</span>
                  </div>

                  <!-- Video View -->
                  <div #mediaVideo *ngIf="product()?.videoUrl" class="w-full h-full shrink-0 snap-center flex items-center justify-center bg-gray-50 relative pointer-events-none">
                     <video [src]="product()?.videoUrl" autoplay loop muted playsinline class="w-full h-full object-cover pointer-events-auto"></video>
                  </div>

                  <!-- Images View (Loop all images as swipeable items) -->
                  <div #mediaImage *ngFor="let img of (product()?.images?.length ? product()?.images : [product()?.imageUrl || '']); let i = index"
                       class="w-full h-full shrink-0 snap-center relative block"
                       [class.!hidden]="showVideo()">
                    <img *ngIf="img" [ngSrc]="img"
                         fill priority
                         sizes="(max-width: 1024px) 100vw, 50vw"
                         class="object-contain p-4 md:p-8 transition-transform duration-500"
                         [alt]="product()?.name">
                  </div>
                </div>
              </div>

              <!-- Mobile Pagination Dots -->
              <div class="flex justify-center gap-2 mt-2 md:hidden" *ngIf="!showVideo()">
                <div *ngFor="let img of (product()?.images?.length ? product()?.images : [product()?.imageUrl || '']); let i = index"
                     class="w-2 h-2 rounded-full transition-colors duration-300"
                     [ngClass]="selectedMediaIndex() === i ? 'bg-primary-800' : 'bg-gray-300'">
                </div>
              </div>
            </div>

            <ng-template #productDetailsTpl>
               <!-- PRODUCT DETAILS (Moved Below Images) -->
               <div class="border-t border-gray-200 pt-8 mt-8 lg:mt-0">
                  <h3 class="text-xl font-bold text-primary-800 mb-6 font-serif">Product Details</h3>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                     <!-- Dynamic Category Rendering -->
                     <ng-container [ngSwitch]="product()?.category">
                        <!-- Finished Jewelry -->
                        <ng-container *ngSwitchCase="'Finished Jewelry'">
                           <div *ngIf="product()?.metalType || product()?.grossWeight">
                              <h4 class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3">Product Specifications</h4>
                              <div class="space-y-2 text-sm">
                                 <div class="flex justify-between" *ngIf="product()?.metalType"><span class="text-gray-500">Metal Type</span><span class="font-medium text-gray-900">{{ product()?.metalType }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.metalPurity"><span class="text-gray-500">Purity</span><span class="font-medium text-gray-900">{{ product()?.metalPurity }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.metalColor"><span class="text-gray-500">Metal Color</span><span class="font-medium text-gray-900">{{ product()?.metalColor }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.grossWeight"><span class="text-gray-500">Gross Weight</span><span class="font-medium text-gray-900">{{ product()?.grossWeight }} g</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.dimensions"><span class="text-gray-500">Dimensions</span><span class="font-medium text-gray-900">{{ product()?.dimensions }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.bisHallmark"><span class="text-gray-500">BIS Hallmark</span><span class="font-medium text-gray-900">Yes</span></div>
                              </div>
                           </div>
                        </ng-container>

                        <!-- Loose Gemstones -->
                        <ng-container *ngSwitchCase="'Loose Gemstones'">
                           <div *ngIf="product()?.shape || product()?.caratWeight">
                              <h4 class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3">Gemstone Details</h4>
                              <div class="space-y-2 text-sm">
                                 <div class="flex justify-between" *ngIf="product()?.species"><span class="text-gray-500">Species</span><span class="font-medium text-gray-900">{{ product()?.species }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.variety"><span class="text-gray-500">Variety</span><span class="font-medium text-gray-900">{{ product()?.variety }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.shape"><span class="text-gray-500">Shape</span><span class="font-medium text-gray-900">{{ product()?.shape }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.cut"><span class="text-gray-500">Cut</span><span class="font-medium text-gray-900">{{ product()?.cut }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.caratWeight"><span class="text-gray-500">Carat Weight</span><span class="font-medium text-gray-900">{{ product()?.caratWeight }} ct</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.colorHue"><span class="text-gray-500">Color Hue</span><span class="font-medium text-gray-900">{{ product()?.colorHue }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.colorTradeTerm"><span class="text-gray-500">Trade Color</span><span class="font-medium text-gray-900">{{ product()?.colorTradeTerm }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.clarity"><span class="text-gray-500">Clarity</span><span class="font-medium text-gray-900">{{ product()?.clarity }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.measurements"><span class="text-gray-500">Measurements</span><span class="font-medium text-gray-900">{{ product()?.measurements }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.treatmentStatus"><span class="text-gray-500">Treatment</span><span class="font-medium text-gray-900">{{ product()?.treatmentStatus }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.originProvenance"><span class="text-gray-500">Origin</span><span class="font-medium text-gray-900">{{ product()?.originProvenance }}</span></div>
                                 <div class="flex justify-between" *ngIf="product()?.labReportNumber"><span class="text-gray-500">Lab Report</span><span class="font-medium text-gray-900">{{ product()?.labReportNumber }}</span></div>
                              </div>
                           </div>
                        </ng-container>

                        <!-- Fallback / Legacy Specs -->
                        <ng-container *ngSwitchDefault>
                           <div *ngIf="product()?.specifications?.productDetails as pd">
                              <h4 class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3">Product Specifications</h4>
                              <div class="space-y-2 text-sm">
                                 <div class="flex justify-between" *ngFor="let item of pd | keyvalue">
                                    <span class="text-gray-500 capitalize">{{ formatKey(item.key) }}</span>
                                    <span class="font-medium text-gray-900">{{ item.value }}</span>
                                 </div>
                              </div>
                           </div>
                        </ng-container>
                     </ng-container>
                  </div>

                  <!-- Diamond Details Table -->
                  <div *ngIf="product()?.specifications?.diamondDetails as dd" class="mt-8">
                     <h4 class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Diamond Specifications</h4>
                     <div class="overflow-hidden border border-gray-200 rounded-lg">
                        <table class="w-full text-sm text-left">
                           <thead class="bg-gray-50 text-gray-600 font-medium">
                              <tr>
                                 <th class="px-4 py-3">Type</th>
                                 <th class="px-4 py-3">Shape</th>
                                 <th class="px-4 py-3">Weight</th>
                                 <th class="px-4 py-3">Color/Clarity</th>
                                 <th class="px-4 py-3">Setting</th>
                              </tr>
                           </thead>
                           <tbody class="divide-y divide-gray-100">
                              <tr *ngFor="let d of dd">
                                 <td class="px-4 py-3 font-medium text-gray-900">{{ d.type }}</td>
                                 <td class="px-4 py-3 text-gray-600">{{ d.shape }}</td>
                                 <td class="px-4 py-3 text-gray-600">{{ d.carat }} ct</td>
                                 <td class="px-4 py-3 text-gray-600">{{ d.color }} / {{ d.clarity }}</td>
                                 <td class="px-4 py-3 text-gray-600">{{ d.settingType }}</td>
                              </tr>
                           </tbody>
                        </table>
                     </div>
                  </div>
               </div>

               <!-- Tags/Footer of Left Column -->
               <div class="flex gap-4 mt-4 overflow-x-auto pb-2 hide-scrollbar">
                 <div class="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-full whitespace-nowrap">
                   <span class="text-xl">🛡️</span> 15-Day Money Back
                 </div>
                 <div class="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-full whitespace-nowrap">
                    <span class="text-xl">💎</span> Lifetime Exchange
                 </div>
                 <div class="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-full whitespace-nowrap">
                    <span class="text-xl">📜</span> BIS Hallmarked
                 </div>
               </div>
            </ng-template>

            <!-- Render details here only on large screens -->
            <div class="hidden lg:block">
              <ng-container *ngTemplateOutlet="productDetailsTpl"></ng-container>
            </div>
          </div>

          <!-- RIGHT COLUMN: Sticky Buy Box -->
          <div class="lg:w-[42%] relative">
             <div class="sticky top-24 bg-white p-6 rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">

                <!-- Product Header -->
                <div class="mb-4">
                   <div class="flex items-center justify-between mb-1">
                      <div class="flex items-center gap-1">
                         <span class="text-orange-400">★★★★☆</span>
                         <span class="text-xs text-gray-500">({{ product()?.reviewCount }} Reviews)</span>
                      </div>
                      <span class="text-xs text-gray-400">SKU: {{ product()?.specifications?.productDetails?.sku || product()?.sku }}</span>
                   </div>
                   <h1 class="text-2xl font-serif font-bold text-primary-900 leading-snug">{{ product()?.name }}</h1>
                </div>

                <!-- Price Section -->
                <div class="mb-6 pb-6 border-b border-gray-100">
                   <div class="flex items-baseline gap-3 mb-1">
                      <span class="text-3xl font-bold text-gray-900">{{ (currentPriceBreakup()?.total || currentPrice()) | currencyConvert }}</span>
                      <span *ngIf="product()?.originalPrice" class="text-lg text-gray-400 line-through">{{ (product()?.originalPrice || 0) | currencyConvert }}</span>
                   </div>
                   <p class="text-xs text-green-700 font-medium mb-3">Inclusive of all taxes</p>

                   <!-- Price Breakup Toggle -->
                   <button *ngIf="hasPriceBreakup()" (click)="togglePriceBreakup()" class="text-xs font-bold text-secondary-600 hover:text-secondary-800 flex items-center gap-1 uppercase tracking-wide">
                      View Price Breakup <span class="transition-transform" [class.rotate-180]="showPriceBreakup()">▼</span>
                   </button>

                   <div *ngIf="showPriceBreakup() && hasPriceBreakup()" class="mt-3 bg-gray-50 p-3 rounded text-sm text-gray-600 animate-fade-in space-y-2">
                      <div class="flex justify-between"><span>Metal</span> <span>{{ currentPriceBreakup()!.metal | currencyConvert }}</span></div>
                      <div class="flex justify-between"><span>Stone</span> <span>{{ currentPriceBreakup()!.gemstone | currencyConvert }}</span></div>
                      <div class="flex justify-between"><span>Making</span> <span>{{ currentPriceBreakup()!.makingCharges | currencyConvert }}</span></div>
                      <div class="flex justify-between"><span>Tax</span> <span>{{ currentPriceBreakup()!.tax | currencyConvert }}</span></div>
                      <div class="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200"><span>Grand Total</span> <span>{{ currentPriceBreakup()!.total | currencyConvert }}</span></div>
                   </div>
                </div>

                <!-- Customization Configurator -->
                <div class="space-y-5 mb-8">
                   <!-- Metal -->
                   <div *ngIf="hasOption('metal')">
                      <span class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Metal Color & Purity</span>
                      <div class="flex flex-wrap gap-2">
                         <button *ngFor="let opt of getOptions('metal')"
                                 (click)="selectedMetal.set(opt)"
                                 class="px-4 py-2 rounded-full border text-sm font-medium transition-all"
                                 [class.bg-primary-800]="selectedMetal()?.id === opt.id"
                                 [class.text-white]="selectedMetal()?.id === opt.id"
                                 [class.border-primary-800]="selectedMetal()?.id === opt.id"
                                 [class.bg-white]="selectedMetal()?.id !== opt.id"
                                 [class.text-gray-700]="selectedMetal()?.id !== opt.id"
                                 [class.border-gray-200]="selectedMetal()?.id !== opt.id">
                            {{ opt.name }}
                         </button>
                      </div>
                   </div>

                   <!-- Diamond -->
                   <div *ngIf="hasOption('diamond')">
                      <div class="flex justify-between mb-2">
                         <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Diamond Quality</span>
                         <button class="text-xs text-secondary-600 underline">Guide</button>
                      </div>
                      <div class="flex flex-wrap gap-2">
                         <button *ngFor="let opt of getOptions('diamond')"
                                 (click)="selectedDiamondQuality.set(opt)"
                                 class="flex-1 px-3 py-2 rounded border text-center text-xs font-medium transition-all"
                                 [class.border-primary-800]="selectedDiamondQuality()?.id === opt.id"
                                 [class.text-primary-800]="selectedDiamondQuality()?.id === opt.id"
                                 [class.bg-primary-50]="selectedDiamondQuality()?.id === opt.id"
                                 [class.border-gray-200]="selectedDiamondQuality()?.id !== opt.id"
                                 [class.text-gray-600]="selectedDiamondQuality()?.id !== opt.id">
                            {{ opt.name }}
                         </button>
                      </div>
                   </div>

                   <!-- Size -->
                   <div *ngIf="isRingCategory()">
                      <div class="flex justify-between mb-2">
                         <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Ring Size</span>
                         <button (click)="sizeGuideOpen.set(true)" class="text-xs text-secondary-600 underline">Size Guide</button>
                      </div>
                      <select [ngModel]="selectedSize()" (ngModelChange)="selectedSize.set($event)" class="w-full p-3 border border-gray-200 rounded-lg bg-white text-sm focus:border-primary-800 outline-none">
                         <option [ngValue]="null">Select Size</option>
                         <option *ngFor="let i of [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]" [ngValue]="i">Size {{ i }}</option>
                      </select>
                   </div>
                </div>

                <!-- Delivery -->
                <div class="mb-6">
                   <div class="relative">
                      <input type="text" [ngModel]="pincode()" (ngModelChange)="pincode.set($event)"
                             placeholder="Enter Pincode for Delivery"
                             class="w-full pl-4 pr-20 py-3 border border-gray-200 rounded-lg text-sm focus:border-primary-800 outline-none">
                      <button (click)="checkDelivery()" class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-primary-800 px-3 py-1.5 hover:bg-gray-50 rounded">
                         CHECK
                      </button>
                   </div>
                   <p *ngIf="deliveryDate()" class="text-xs text-green-700 font-medium mt-2 pl-1">
                      Expected delivery by {{ deliveryDate() }}
                   </p>
                </div>

                <!-- Actions -->
                <div class="flex flex-col gap-3">
                   <div class="flex gap-3">
                       <button (click)="handleAddToCart()"
                               [disabled]="product()?.stock === 0"
                               class="flex-1 bg-gradient-to-r from-primary-800 to-primary-600 text-white font-bold py-4 rounded-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.99] uppercase tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                          {{ product()?.stock === 0 ? 'Out of Stock' : 'Add to Cart' }}
                       </button>
                       <button (click)="handleBuyNow()"
                               [disabled]="product()?.stock === 0"
                               class="flex-1 bg-white border-2 border-primary-800 text-primary-800 font-bold py-4 rounded-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.99] uppercase tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                          Buy Now
                       </button>
                   </div>
                   <button (click)="openTryAtHome()"
                           class="w-full border border-secondary-600 text-primary-800 font-bold py-3 rounded-lg hover:bg-secondary-50 transition-colors uppercase tracking-wider text-xs flex items-center justify-center gap-2">
                      <span>🏠</span> Book Try at Home
                   </button>
                </div>

                <div class="mt-6 pt-4 border-t border-gray-100 flex justify-center gap-6 text-xs font-medium text-gray-500">
                   <a routerLink="/contact" class="hover:text-primary-800 transition-colors">Contact Us</a>
                   <span>|</span>
                   <button (click)="openWhatsApp()" class="hover:text-primary-800 transition-colors">Chat on WhatsApp</button>
                </div>

             </div>
          </div>

          <!-- Render details here only on small screens -->
          <div class="block lg:hidden mt-8 w-full">
            <ng-container *ngTemplateOutlet="productDetailsTpl"></ng-container>
          </div>

        </div>
      </div>

      <!-- Modals -->
      <app-size-guide-modal [isOpen]="sizeGuideOpen()" (close)="sizeGuideOpen.set(false)"></app-size-guide-modal>

      <!-- Try At Home Modal -->
      <div *ngIf="tryAtHomeOpen()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
         <div class="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative">
            <button (click)="tryAtHomeOpen.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl z-10">&times;</button>
            <div class="bg-gradient-to-r from-primary-800 to-primary-950 text-white p-6 text-center">
               <h3 class="font-serif font-bold text-xl">Book Try at Home</h3>
            </div>
            <div class="p-6 space-y-4">
               <p class="text-sm text-gray-600 text-center mb-4">Our consultant will bring this jewellery to your doorstep.</p>
               <input type="date" class="w-full p-2 border rounded">
               <button (click)="confirmTryAtHome()" class="w-full bg-primary-800 text-white py-3 rounded font-bold">Confirm</button>
            </div>
         </div>
      </div>

    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class ProductDetailComponent implements OnInit, OnDestroy, AfterViewInit {
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private historyService = inject(HistoryService);
  private currencyService = inject(CurrencyService);

  loading = signal(true);
  product = signal<ProductDetail | null>(null);

  // UI State
  selectedImage = signal<string | null>(null);
  selectedMediaIndex = signal<number>(0);
  showVideo = signal(false);
  sizeGuideOpen = signal(false);
  showPriceBreakup = signal(false);
  tryAtHomeOpen = signal(false);

  // Customization
  selectedMetal = signal<CustomizationOption | null>(null);
  selectedDiamondQuality = signal<CustomizationOption | null>(null);
  selectedSize = signal<number | null>(null);

  // Delivery
  pincode = signal('');
  deliveryDate = signal<string | null>(null);

  @ViewChild('mediaVideo') mediaVideoElement!: ElementRef;
  @ViewChildren('mediaImage') mediaImageElements!: QueryList<ElementRef>;

  // Computed Prices
  currentPrice = computed(() => {
    let price = this.product()?.price || 0;
    if (this.selectedMetal()) price += this.selectedMetal()?.priceModifier ?? 0;
    if (this.selectedDiamondQuality()) price += this.selectedDiamondQuality()?.priceModifier ?? 0;
    return price;
  });

  currentPriceBreakup = computed(() => {
    const base = this.product()?.priceBreakup;
    if (!base) return null;
    let metalPrice = base.metal;
    let gemstonePrice = base.gemstone;

    // Adjust logic based on modifiers
    if (this.selectedMetal()) metalPrice += this.selectedMetal()?.priceModifier ?? 0;
    if (this.selectedDiamondQuality()) gemstonePrice += this.selectedDiamondQuality()?.priceModifier ?? 0;

    const subtotal = metalPrice + gemstonePrice + base.makingCharges;
    const tax = Math.round(subtotal * 0.03);
    return { metal: metalPrice, gemstone: gemstonePrice, makingCharges: base.makingCharges, tax, total: subtotal + tax };
  });

  ngOnInit(): void {
    this.route.params.subscribe(p => {
        if(p['id']) {
            this.loadProduct(p['id']);
        }
    });
  }

  ngOnDestroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
  }

  private loadProduct(id: string): void {
    this.loading.set(true);
    this.productService.getProductById(id).subscribe({
      next: (p) => {
        this.product.set(p);
        this.historyService.add(p);
        this.loading.set(false);
        this.selectedImage.set(null);
        if (p.customizationOptions) {
           this.selectedMetal.set(p.customizationOptions.find(o => o.type === 'metal' && o.priceModifier === 0) || null);
           this.selectedDiamondQuality.set(p.customizationOptions.find(o => o.type === 'diamond' && o.priceModifier === 0) || null);
        }
      },
      error: () => this.loading.set(false)
    });
  }

  handleAddToCart(): void {
    if (this.product()) {
        const options = {
          metal: this.selectedMetal()?.name,
          diamond: this.selectedDiamondQuality()?.name,
          price: this.currentPrice(),
          product: this.product()
        };
        this.cartService.addToCart(this.product()!.id, 1, options).subscribe(() => {
            this.toastService.show('Added to Shopping Bag', 'success');
        });
    }
  }

  handleBuyNow(): void {
    if (this.product()) {
        const options = {
          metal: this.selectedMetal()?.name,
          diamond: this.selectedDiamondQuality()?.name,
          price: this.currentPrice(),
          product: this.product()
        };
        this.cartService.addToCart(this.product()!.id, 1, options).subscribe(() => {
            this.router.navigate(['/cart']);
        });
    }
  }

  openWhatsApp(): void {
    const p = this.product();
    if (!p) return;
    const text = `Hi, I am interested in ${p.name} (SKU: ${p.specifications?.productDetails?.sku || p.sku}). Can you help me?`;
    const url = `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  togglePriceBreakup() { this.showPriceBreakup.set(!this.showPriceBreakup()); }
  openTryAtHome() { this.tryAtHomeOpen.set(true); }
  confirmTryAtHome() {
     this.tryAtHomeOpen.set(false);
     this.toastService.show('Booking Confirmed! Check your email.', 'success');
  }

  checkDelivery() {
    if (this.pincode().length < 6) return this.toastService.show('Please enter a valid 6-digit pincode', 'error');
    this.toastService.show('Checking availability...', 'info');

    this.productService.checkDeliveryAvailability(this.pincode()).subscribe({
        next: (response) => {
            if (response.available) {
                this.deliveryDate.set(response.estimatedDate || 'Available');
                this.toastService.show(response.message || 'Delivery available', 'success');
            } else {
                this.deliveryDate.set(null);
                this.toastService.show(response.message || 'Delivery not available', 'error');
            }
        },
        error: () => {
             this.deliveryDate.set(null);
             this.toastService.show('Could not check delivery', 'error');
        }
    });
  }

  isRingCategory(): boolean {
      const cat = this.product()?.category;
      if (!cat) return false;
      return RING_CATEGORIES.some(c => cat.includes(c));
  }

  // Helpers
  hasPriceBreakup(): boolean {
    const pb = this.product()?.priceBreakup;
    if (!pb) return false;
    // Check if there is valid numerical data beyond just 0
    return (pb.metal > 0 || pb.gemstone > 0 || pb.makingCharges > 0 || pb.total > 0);
  }

  hasOption(t: string) { return !!this.product()?.customizationOptions?.some(o => o.type === t); }
  getOptions(t: string) { return this.product()?.customizationOptions?.filter(o => o.type === t) || []; }
  formatKey(k: string) { return k.replace(/([A-Z])/g, ' $1').trim(); }

  private observer: IntersectionObserver | null = null;

  ngAfterViewInit() {
    this.setupIntersectionObserver();
    this.mediaImageElements.changes.subscribe(() => {
      this.setupIntersectionObserver();
    });
  }

  private setupIntersectionObserver() {
    if (this.observer) {
      this.observer.disconnect();
    }

    // Only setup if we have elements to observe
    if (this.mediaImageElements && this.mediaImageElements.length > 0) {
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            // Find the index of the intersecting element
            const index = this.mediaImageElements.toArray().findIndex(el => el.nativeElement === entry.target);
            if (index !== -1 && this.selectedMediaIndex() !== index) {
              this.selectedMediaIndex.set(index);
            }
          }
        });
      }, {
        root: document.getElementById('main-media-scroll'),
        threshold: 0.5
      });

      this.mediaImageElements.forEach(el => {
        if (el.nativeElement) {
          this.observer!.observe(el.nativeElement);
        }
      });
    }
  }

  selectMedia(type: 'video' | 'image', index?: number) {
     if (type === 'video') {
         this.showVideo.set(true);
         this.selectedMediaIndex.set(-1);
         if (this.mediaVideoElement?.nativeElement) {
             this.mediaVideoElement.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
         }
     } else if (index !== undefined) {
         this.showVideo.set(false);
         this.selectedMediaIndex.set(index);
         // Timeout ensures view is updated before scrolling
         setTimeout(() => {
             const el = this.mediaImageElements.toArray()[index];
             if (el?.nativeElement) {
                 el.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
             }
         }, 0);
     }
  }
}
