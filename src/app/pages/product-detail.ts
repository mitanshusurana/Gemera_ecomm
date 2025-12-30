import { Component, OnInit, OnDestroy, signal, computed, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ProductService } from '../services/product.service';
import { CartService } from '../services/cart.service';
import { ProductDetail, Product, CustomizationOption, PriceBreakup } from '../core/models';
import { CompareService } from '../services/compare.service';
import { ToastService } from '../services/toast.service';
import { SeoService } from '../services/seo.service';
import { FocusTrapDirective } from '../directives/focus-trap.directive';
import { FadeInDirective } from '../directives/fade-in.directive';
import { FormsModule } from '@angular/forms';
import { SizeGuideModalComponent } from '../components/size-guide-modal';
import { EducationModalComponent } from '../components/education-modal';
import { RecentlyViewedComponent } from '../components/recently-viewed';
import { HistoryService } from '../services/history.service';
import { CurrencyService } from '../services/currency.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, SizeGuideModalComponent, EducationModalComponent, RecentlyViewedComponent, FocusTrapDirective, FadeInDirective],
  template: `
    <div class="min-h-screen bg-white">
      <!-- Breadcrumb -->
      <div class="bg-diamond-50 border-b border-diamond-200">
        <div class="container-luxury py-4">
          <div class="flex items-center gap-2 text-sm">
            <a routerLink="/" class="text-gold-600 hover:text-gold-700">Home</a>
            <span class="text-gray-500">/</span>
            <a routerLink="/products" class="text-gold-600 hover:text-gold-700">Products</a>
            <span class="text-gray-500">/</span>
            <span class="text-gray-700">{{ product()?.name || 'Product Details' }}</span>
          </div>
        </div>
      </div>

      <!-- Product Details -->
      <div class="container-luxury section-padding">
        <div *ngIf="!loading() && product()" class="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <!-- Image Gallery -->
          <div>
            <div class="bg-diamond-100 rounded-xl overflow-hidden mb-6 h-96 lg:h-[500px] flex items-center justify-center relative group">
               <!-- Video Player -->
               <video *ngIf="showVideo() && product()?.videoUrl"
                      [src]="product()?.videoUrl"
                      controls
                      autoplay
                      class="w-full h-full object-cover">
                 Your browser does not support the video tag.
               </video>

               <!-- Main Image (with 360 rotation class if active) -->
               <img *ngIf="!showVideo() && (selectedImage() || product()?.imageUrl)"
                    [src]="selectedImage() || product()?.imageUrl"
                    class="w-full h-full object-cover transition-transform duration-[3s] ease-linear"
                    [class.animate-spin-slow]="show360()"
                    [alt]="product()?.name">

               <!-- Engraving Preview Overlay -->
               <div *ngIf="engravingText() && !showVideo() && !show360()"
                    class="absolute bottom-[20%] left-1/2 -translate-x-1/2 text-gold-500 font-serif italic text-2xl drop-shadow-md pointer-events-none opacity-80 rotate-[-5deg] z-10">
                 {{ engravingText() }}
               </div>

               <!-- Fallback Emoji -->
               <span *ngIf="!showVideo() && !selectedImage() && !product()?.imageUrl"
                     class="text-7xl transition-transform duration-[3s] ease-linear"
                     [class.animate-spin-slow]="show360()">
                 {{ getProductEmoji(product()?.category || '') }}
               </span>

               <!-- 360 Controls -->
               <div *ngIf="!showVideo()" class="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                 <button (click)="show360.set(!show360())"
                         [class.bg-gold-600]="show360()"
                         [class.text-white]="show360()"
                         class="bg-white/90 hover:bg-gold-500 hover:text-white text-diamond-900 px-4 py-2 rounded-full shadow-lg text-sm font-bold flex items-center gap-2 transition-all">
                   <span>{{ show360() ? '⏹ Stop' : '🔄 360° View' }}</span>
                 </button>
               </div>

               <!-- Badge -->
               <div *ngIf="getBadge(product()!) && !showVideo()" class="absolute top-4 right-4">
                <span class="inline-block px-3 py-1 bg-gold-500 text-white text-xs font-bold rounded-full shadow-md">
                  {{ getBadge(product()!) }}
                </span>
               </div>
            </div>

            <!-- Thumbnails -->
            <div class="grid grid-cols-5 gap-4">
              <!-- Video Thumbnail -->
              <button *ngIf="product()?.videoUrl"
                      (click)="showVideo.set(true); show360.set(false)"
                      [class.ring-2]="showVideo()"
                      [class.ring-gold-500]="showVideo()"
                      class="aspect-square bg-diamond-100 rounded-lg hover:ring-2 hover:ring-gold-500 transition-all duration-300 flex items-center justify-center overflow-hidden group">
                <div class="w-10 h-10 rounded-full bg-white/80 group-hover:bg-gold-500 group-hover:text-white flex items-center justify-center transition-colors">
                  <span class="text-xl ml-1">▶️</span>
                </div>
              </button>

              <!-- Image Thumbnails -->
              <button *ngFor="let img of product()!.images"
                      (click)="selectedImage.set(img.url); showVideo.set(false); show360.set(false)"
                      [class.ring-2]="!showVideo() && selectedImage() === img.url"
                      [class.ring-gold-500]="!showVideo() && selectedImage() === img.url"
                      class="aspect-square bg-diamond-100 rounded-lg hover:ring-2 hover:ring-gold-500 transition-all duration-300 flex items-center justify-center overflow-hidden">
                <img [src]="img.url" [alt]="img.alt" class="w-full h-full object-cover">
              </button>
            </div>
          </div>

          <!-- Product Info -->
          <div>
            <div class="mb-6">
              <h1 class="text-3xl md:text-5xl font-display font-bold text-diamond-900 mb-4 leading-tight">
                {{ product()?.name }}
              </h1>
              <div class="flex items-center gap-4 mb-6">
                <div class="flex gap-1">
                  <span *ngFor="let _ of [1,2,3,4,5]" class="text-gold-500 text-xl">★</span>
                </div>
                <span class="text-gray-600">({{ product()?.reviewCount }} customer reviews)</span>
              </div>
            </div>

            <!-- Price -->
            <div class="mb-8 pb-8 border-b border-diamond-200">
              <div class="flex items-baseline gap-3 mb-4">
                <span class="text-4xl md:text-5xl font-bold text-diamond-900">{{ formatPrice(currentPrice()) }}</span>
                <span *ngIf="product()?.originalPrice" class="text-xl text-gray-500 line-through">{{ formatPrice(product()?.originalPrice || 0) }}</span>
              </div>

              <div class="flex items-center gap-4 mb-4">
                <button *ngIf="product()?.priceBreakup"
                        (click)="showPriceBreakup.set(!showPriceBreakup())"
                        class="text-sm text-gold-600 underline hover:text-gold-700 flex items-center gap-1">
                  <span>ℹ️ View Price Breakup</span>
                </button>
                <button (click)="dropHint()" class="text-sm text-gray-500 underline hover:text-gray-700 flex items-center gap-1">
                  <span>🎁 Drop a Hint</span>
                </button>
              </div>

              <!-- Price Breakup Panel -->
              <div *ngIf="showPriceBreakup() && currentPriceBreakup()" class="mb-4 bg-gray-50 p-4 rounded-lg border border-gray-200 animate-fade-in-up">
                <h4 class="font-bold text-gray-900 mb-2">Price Breakdown</h4>
                <div class="space-y-1 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-600">Metal ({{ selectedMetal()?.name || product()?.metal }})</span>
                    <span class="font-medium">{{ formatPrice(currentPriceBreakup()!.metal) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-600">Gemstone</span>
                    <span class="font-medium">{{ formatPrice(currentPriceBreakup()!.gemstone) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-600">Making Charges</span>
                    <span class="font-medium">{{ formatPrice(currentPriceBreakup()!.makingCharges) }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span class="text-gray-600">Tax</span>
                    <span class="font-medium">{{ formatPrice(currentPriceBreakup()!.tax) }}</span>
                  </div>
                  <div class="border-t border-gray-300 mt-2 pt-2 flex justify-between font-bold">
                    <span>Total</span>
                    <span>{{ formatPrice(currentPriceBreakup()!.total) }}</span>
                  </div>
                </div>
              </div>

              <p class="text-green-700 flex items-center gap-2">
                <span class="font-bold">✓</span> Free insured worldwide shipping
              </p>
            </div>

            <!-- Customization Configurator -->
            <div class="mb-8 pb-8 border-b border-diamond-200" *ngIf="product()?.customizationOptions">
              <!-- Metal Selection -->
              <div class="mb-6">
                <h3 class="font-bold text-gray-900 mb-3">Metal Type</h3>
                <div class="flex flex-wrap gap-2">
                  <button *ngFor="let opt of product()!.customizationOptions"
                          [class.hidden]="opt.type !== 'metal'"
                          (click)="selectedMetal.set(opt)"
                          [class.ring-2]="selectedMetal()?.id === opt.id"
                          [class.ring-gold-500]="selectedMetal()?.id === opt.id"
                          [class.bg-gold-50]="selectedMetal()?.id === opt.id"
                          class="px-4 py-2 border border-diamond-300 rounded-lg hover:border-gold-500 transition-all text-sm flex flex-col items-center min-w-[100px]">
                    <span class="font-semibold text-gray-900">{{ opt.name }}</span>
                    <span class="text-xs text-gray-500" *ngIf="opt.priceModifier !== 0">
                      {{ opt.priceModifier > 0 ? '+' : '' }}{{ formatPrice(opt.priceModifier) }}
                    </span>
                  </button>
                </div>
              </div>

              <!-- Diamond Quality Selection -->
              <div class="mb-6">
                 <div class="flex items-center gap-2 mb-3">
                   <h3 class="font-bold text-gray-900">Diamond Quality</h3>
                   <div class="group relative">
                     <span class="cursor-help text-gray-400">ⓘ</span>
                     <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-xs p-2 rounded hidden group-hover:block z-10">
                       <p><strong>IJ-SI:</strong> Slightly included, great value.</p>
                       <p><strong>GH-VS:</strong> Very slightly included, near colorless.</p>
                       <p><strong>EF-VVS:</strong> Very very slightly included, colorless (Premium).</p>
                     </div>
                   </div>
                 </div>
                <div class="flex flex-wrap gap-2">
                  <button *ngFor="let opt of product()!.customizationOptions"
                          [class.hidden]="opt.type !== 'diamond'"
                          (click)="selectedDiamondQuality.set(opt)"
                          [class.ring-2]="selectedDiamondQuality()?.id === opt.id"
                          [class.ring-gold-500]="selectedDiamondQuality()?.id === opt.id"
                          [class.bg-gold-50]="selectedDiamondQuality()?.id === opt.id"
                          class="px-4 py-2 border border-diamond-300 rounded-lg hover:border-gold-500 transition-all text-sm flex flex-col items-center min-w-[100px]">
                    <span class="font-semibold text-gray-900">{{ opt.name }}</span>
                    <span class="text-xs text-gray-500" *ngIf="opt.priceModifier !== 0">
                      {{ opt.priceModifier > 0 ? '+' : '' }}{{ formatPrice(opt.priceModifier) }}
                    </span>
                  </button>
                </div>
              </div>

              <!-- Engraving Option (Ring Only) -->
              <div *ngIf="product()?.category?.includes('Ring')" class="mb-6 bg-gold-50 p-4 rounded-lg border border-gold-200">
                <h3 class="font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <span>✒️</span> Add Free Engraving
                </h3>
                <input type="text"
                       [ngModel]="engravingText()"
                       (ngModelChange)="engravingText.set($event)"
                       maxlength="15"
                       placeholder="e.g. Forever Yours"
                       class="input-field w-full placeholder:italic font-serif text-lg">
                <p class="text-xs text-gray-500 mt-1 text-right">{{ engravingText().length }}/15 characters</p>
              </div>
            </div>

            <!-- Delivery Checker -->
            <div class="mb-8 pb-8 border-b border-diamond-200">
               <h3 class="font-bold text-gray-900 mb-3">Check Delivery Date</h3>
               <div class="flex gap-2 max-w-sm">
                 <input type="text" [ngModel]="pincode()" (ngModelChange)="pincode.set($event)" placeholder="Enter Pincode" class="input-field flex-1" maxlength="6">
                 <button (click)="checkDelivery()" [disabled]="isCheckingDelivery()" class="btn-secondary px-4 whitespace-nowrap">
                   {{ isCheckingDelivery() ? 'Checking...' : 'Check' }}
                 </button>
               </div>
               <p *ngIf="deliveryDate()" class="mt-2 text-green-700 text-sm font-medium">
                 Expected delivery by <span class="font-bold">{{ deliveryDate() }}</span>
               </p>
            </div>

            <!-- Specifications -->
            <div class="mb-8 pb-8 border-b border-diamond-200">
              <h3 class="font-bold text-gray-900 mb-4">Specifications</h3>
              <div class="grid grid-cols-2 gap-4">
                <div class="card p-3 md:p-4" *ngIf="product()?.specifications?.carat">
                  <p class="text-xs text-gold-600 font-semibold uppercase">Carat Weight</p>
                  <p class="text-base md:text-lg font-semibold text-gray-900">{{ product()?.specifications?.carat }} ct</p>
                </div>
                <div class="card p-3 md:p-4 relative group" *ngIf="product()?.specifications?.clarity">
                  <p class="text-xs text-gold-600 font-semibold uppercase flex justify-between">
                    Clarity
                    <button (click)="openEducation('4cs')" class="text-gray-400 hover:text-gold-600">ⓘ</button>
                  </p>
                  <p class="text-base md:text-lg font-semibold text-gray-900">{{ product()?.specifications?.clarity }}</p>
                </div>
                <div class="card p-3 md:p-4 relative group" *ngIf="product()?.specifications?.color">
                  <p class="text-xs text-gold-600 font-semibold uppercase flex justify-between">
                    Color
                    <button (click)="openEducation('4cs')" class="text-gray-400 hover:text-gold-600">ⓘ</button>
                  </p>
                  <p class="text-base md:text-lg font-semibold text-gray-900">{{ product()?.specifications?.color }}</p>
                </div>
                <div class="card p-3 md:p-4" *ngIf="product()?.specifications?.cut">
                  <p class="text-xs text-gold-600 font-semibold uppercase">Cut</p>
                  <p class="text-base md:text-lg font-semibold text-gray-900">{{ product()?.specifications?.cut }}</p>
                </div>
                <div class="card p-3 md:p-4 relative group" *ngIf="product()?.metal">
                  <p class="text-xs text-gold-600 font-semibold uppercase flex justify-between">
                    Metal
                    <button (click)="openEducation('metal')" class="text-gray-400 hover:text-gold-600">ⓘ</button>
                  </p>
                  <p class="text-base md:text-lg font-semibold text-gray-900">{{ product()?.metal }}</p>
                </div>
                <div class="card p-3 md:p-4" *ngIf="product()?.weight">
                  <p class="text-xs text-gold-600 font-semibold uppercase">Weight</p>
                  <p class="text-base md:text-lg font-semibold text-gray-900">{{ product()?.weight }}g</p>
                </div>
              </div>
            </div>

            <!-- Size Selection (Mock) -->
            <div class="mb-8 pb-8 border-b border-diamond-200" *ngIf="product()?.category?.includes('Ring')">
              <div class="flex justify-between items-center mb-4">
                 <h3 class="font-bold text-gray-900">Ring Size</h3>
                 <button (click)="sizeGuideOpen.set(true)" class="text-sm text-gold-600 hover:text-gold-700 font-semibold flex items-center gap-1 underline">
                   <span class="text-lg">📏</span> Size Guide
                 </button>
              </div>

              <div class="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-5 gap-2">
                <button *ngFor="let size of [5, 6, 7, 8, 9, 10, 11, 12, 13]" 
                        (click)="selectedSize.set(size)"
                        [class.border-gold-500]="selectedSize() === size"
                        [class.bg-gold-50]="selectedSize() === size"
                        [class.text-gold-700]="selectedSize() === size"
                        class="h-12 border-2 border-diamond-300 rounded-lg font-semibold hover:border-gold-500 hover:bg-gold-50 transition-all duration-300">
                  {{ size }}
                </button>
              </div>
            </div>

            <!-- Certifications -->
            <div class="mb-8 pb-8 border-b border-diamond-200" *ngIf="product()?.certifications && product()!.certifications.length > 0">
              <h3 class="font-bold text-gray-900 mb-4">Certifications</h3>
              <div class="flex gap-4 flex-wrap">
                <div class="card p-4 text-center min-w-[120px] group cursor-pointer hover:shadow-md transition-all border border-transparent hover:border-gold-200"
                     *ngFor="let cert of product()!.certifications"
                     (click)="viewCertificate(cert)">
                  <div class="text-2xl mb-2">🏆</div>
                  <p class="text-sm font-semibold text-gray-900">{{ cert }} Certified</p>
                  <p class="text-xs text-gold-600 mt-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                    <span>View Doc</span>
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                  </p>
                </div>
              </div>
            </div>

            <!-- Add to Cart -->
            <div class="flex flex-col sm:flex-row gap-4 mb-8">
              <div class="flex gap-4 w-full sm:w-auto">
                <input type="number" min="1" max="10" [ngModel]="quantity()" (ngModelChange)="quantity.set($event)" class="input-field w-20 text-center">
                <button (click)="handleAddToCart()" class="flex-1 sm:flex-none btn-primary text-lg py-4 px-8">
                  Add to Cart
                </button>
              </div>
              <div class="flex gap-2 w-full sm:w-auto">
                <button class="flex-1 sm:flex-none w-14 h-14 border-2 border-diamond-300 rounded-lg hover:border-gold-500 hover:bg-gold-50 transition-all duration-300 flex items-center justify-center">
                  <svg class="w-6 h-6 text-diamond-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                  </svg>
                </button>
                <button (click)="handleAddToCompare()" class="flex-1 sm:flex-none w-14 h-14 border-2 border-diamond-300 rounded-lg hover:border-gold-500 hover:bg-gold-50 transition-all duration-300 flex items-center justify-center" title="Compare">
                  <span class="text-xl">⚖️</span>
                </button>
                <button (click)="openVirtualTryOn()" class="flex-1 sm:flex-none w-14 h-14 border-2 border-diamond-300 rounded-lg hover:border-gold-500 hover:bg-gold-50 transition-all duration-300 flex items-center justify-center" title="Virtual Try-On">
                  <span class="text-xl">🤳</span>
                </button>
              </div>
            </div>

            <!-- Description -->
            <div class="mb-8">
              <h3 class="font-bold text-gray-900 mb-3">Description</h3>
              <p class="text-gray-700 leading-relaxed mb-4">
                {{ product()?.description }}
              </p>
            </div>

            <!-- Additional Info -->
            <div class="bg-gold-50 border border-gold-200 rounded-lg p-6">
              <h3 class="font-bold text-gray-900 mb-3">Why Choose This Piece?</h3>
              <ul class="space-y-2 text-gray-700">
                <li class="flex items-start gap-2">
                  <span class="text-gold-600 font-bold">✓</span>
                  <span>Handcrafted by master artisans</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-gold-600 font-bold">✓</span>
                  <span>Lifetime warranty and free maintenance</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-gold-600 font-bold">✓</span>
                  <span>Free insured worldwide shipping</span>
                </li>
                <li class="flex items-start gap-2">
                  <span class="text-gold-600 font-bold">✓</span>
                  <span>30-day money-back guarantee</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Loading State -->
        <div *ngIf="loading()" class="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div class="skeleton h-96"></div>
          <div class="space-y-6">
            <div class="skeleton h-12 w-3/4"></div>
            <div class="skeleton h-8 w-1/2"></div>
            <div class="skeleton h-20"></div>
            <div class="skeleton h-16"></div>
          </div>
        </div>
      </div>

      <!-- Related Products -->
      <section class="bg-diamond-50 section-padding border-t border-diamond-200" *ngIf="relatedProducts().length > 0">
        <div class="container-luxury">
          <h2 class="text-4xl font-display font-bold text-diamond-900 mb-12">
            You May Also Like
          </h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <a *ngFor="let product of relatedProducts()" [routerLink]="['/products', product.id]" class="card card-hover group overflow-hidden block cursor-pointer">
              <div class="relative overflow-hidden h-64 bg-diamond-100 flex items-center justify-center">
                 <img *ngIf="product.imageUrl" [src]="product.imageUrl" class="w-full h-full object-cover" [alt]="product.name" onerror="this.style.display='none'">
                 <span *ngIf="!product.imageUrl" class="text-4xl">{{ getProductEmoji(product.category) }}</span>
              </div>
              <div class="p-6">
                <p class="text-xs text-gold-600 font-semibold uppercase mb-1">{{ product.category }}</p>
                <h3 class="font-semibold text-gray-900 mb-3 line-clamp-2">{{ product.name }}</h3>
                <div class="flex items-center gap-2 mb-4">
                  <div class="flex gap-1">
                    <span *ngFor="let i of [1,2,3,4,5]" class="text-gold-500 text-xs">★</span>
                  </div>
                  <span class="text-xs text-gray-600">({{ product.reviewCount }})</span>
                </div>
                <div class="mb-4">
                  <span class="text-2xl font-bold text-diamond-900">{{ formatPrice(product.price) }}</span>
                </div>
                <button class="w-full btn-primary">View Details</button>
              </div>
            </a>
          </div>
        </div>
      </section>

      <!-- Recently Viewed -->
      <app-recently-viewed></app-recently-viewed>

      <!-- Modals -->
      <app-size-guide-modal [isOpen]="sizeGuideOpen()" (close)="sizeGuideOpen.set(false)"></app-size-guide-modal>
      <app-education-modal [isOpen]="educationOpen()" [activeTab]="educationTab()" (close)="educationOpen.set(false)"></app-education-modal>

      <!-- Virtual Try-On Modal -->
      <div *ngIf="showTryOnModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div class="bg-white rounded-2xl overflow-hidden max-w-2xl w-full relative">
           <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gold-50">
             <h3 class="font-display font-bold text-xl text-diamond-900">Virtual Try-On</h3>
             <button (click)="closeTryOn()" class="text-gray-500 hover:text-red-500 text-2xl">&times;</button>
           </div>

           <div class="relative bg-black aspect-[4/3] overflow-hidden group">
             <video #videoElement autoplay playsinline muted class="w-full h-full object-cover transform scale-x-[-1]"></video>

             <!-- Product Overlay (Mock AR) -->
             <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div class="relative w-1/3 opacity-80 animate-pulse">
                    <img *ngIf="product()?.imageUrl" [src]="product()?.imageUrl" class="w-full h-full object-contain drop-shadow-2xl">
                    <span *ngIf="!product()?.imageUrl" class="text-9xl">{{ getProductEmoji(product()?.category || '') }}</span>
                </div>
             </div>

             <div class="absolute bottom-4 left-0 right-0 text-center text-white/80 text-sm px-4">
               <p>Align your hand/face with the overlay. (Basic Demo)</p>
             </div>
           </div>

           <div class="p-4 bg-white flex justify-end gap-2">
             <button (click)="closeTryOn()" class="btn-secondary">Close</button>
             <button (click)="handleAddToCart(); closeTryOn()" class="btn-primary">Add to Cart</button>
           </div>
        </div>
      </div>
    </div>
  `,
})
export class ProductDetailComponent implements OnInit, OnDestroy {
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private route = inject(ActivatedRoute);
  private compareService = inject(CompareService);
  private toastService = inject(ToastService);
  private titleService = inject(Title);
  private historyService = inject(HistoryService);
  private seoService = inject(SeoService);
  private currencyService = inject(CurrencyService);

  loading = signal(true);
  product = signal<ProductDetail | null>(null);
  relatedProducts = signal<Product[]>([]);

  quantity = signal(1);
  selectedImage = signal<string | null>(null);
  selectedSize = signal<number | null>(null);
  showVideo = signal(false);
  show360 = signal(false);
  sizeGuideOpen = signal(false);
  educationOpen = signal(false);
  educationTab = signal('4cs');
  showTryOnModal = signal(false);
  tryOnStream: MediaStream | null = null;
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  // Customization Signals
  selectedMetal = signal<CustomizationOption | null>(null);
  selectedDiamondQuality = signal<CustomizationOption | null>(null);
  engravingText = signal('');

  // Delivery Checker
  pincode = signal('');
  deliveryDate = signal<string | null>(null);
  isCheckingDelivery = signal(false);

  // UI State
  showPriceBreakup = signal(false);

  // Computed Price
  currentPrice = computed(() => {
    let price = this.product()?.price || 0;
    if (this.selectedMetal()) price += this.selectedMetal()!.priceModifier;
    if (this.selectedDiamondQuality()) price += this.selectedDiamondQuality()!.priceModifier;
    return price;
  });

  // Computed Price Breakup
  currentPriceBreakup = computed(() => {
    const base = this.product()?.priceBreakup;
    if (!base) return null;

    let metalPrice = base.metal;
    let gemstonePrice = base.gemstone;

    if (this.selectedMetal()) metalPrice += this.selectedMetal()!.priceModifier;
    if (this.selectedDiamondQuality()) gemstonePrice += this.selectedDiamondQuality()!.priceModifier;

    const subtotal = metalPrice + gemstonePrice + base.makingCharges;
    // Assuming tax is calculated on the new subtotal (approx 3-5% or simplified mock logic)
    // We'll keep the tax proportional for mock purposes or fixed if simpler.
    // Let's make it proportional to the increase.
    const originalSubtotal = base.metal + base.gemstone + base.makingCharges;
    const taxRatio = base.tax / originalSubtotal;
    const newTax = Math.round(subtotal * taxRatio);

    return {
      metal: metalPrice,
      gemstone: gemstonePrice,
      makingCharges: base.makingCharges,
      tax: newTax,
      total: subtotal + newTax
    };
  });

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      if (params['id']) {
        this.loadProduct(params['id']);
      }
    });
  }

  ngOnDestroy(): void {
    this.closeTryOn();
  }

  private loadProduct(productId: string): void {
    this.loading.set(true);
    this.productService.getProductById(productId).subscribe({
      next: (product) => {
        this.product.set(product);
        this.historyService.add(product);
        this.seoService.updateTags({
            title: `${product.name} | Gemara Fine Jewels`,
            description: product.description,
            image: product.imageUrl
        });
        this.loading.set(false);
        this.loadRelatedProducts(product.category);
        this.showVideo.set(false);
        this.selectedImage.set(null);

        // Initialize default selections if available
        if (product.customizationOptions) {
          const defaultMetal = product.customizationOptions.find(o => o.type === 'metal' && o.priceModifier === 0);
          const defaultDiamond = product.customizationOptions.find(o => o.type === 'diamond' && o.priceModifier === 0);
          this.selectedMetal.set(defaultMetal || null);
          this.selectedDiamondQuality.set(defaultDiamond || null);
        }
      },
      error: (error) => {
        console.error('Error loading product:', error);
        this.loading.set(false);
      },
    });
  }

  private loadRelatedProducts(category: string) {
      this.productService.getProducts(0, 4, { category }).subscribe(res => {
          this.relatedProducts.set(res.content.filter(p => p.id !== this.product()?.id));
      });
  }

  handleAddToCart(): void {
    const p = this.product();
    if (p) {
        const options = {
          metal: this.selectedMetal()?.name,
          diamond: this.selectedDiamondQuality()?.name,
          engraving: this.engravingText(),
          price: this.currentPrice()
        };

        this.cartService.addToCart(p.id, this.quantity(), options).subscribe(() => {
            const variantInfo = [];
            if (options.metal) variantInfo.push(options.metal);
            if (options.diamond) variantInfo.push(options.diamond);
            if (options.engraving) variantInfo.push(`Engraving: "${options.engraving}"`);

            this.toastService.show(
              `Added ${this.quantity()} item(s) to cart`,
              'success'
            );
        });
    }
  }

  handleAddToCompare(): void {
    const p = this.product();
    if (p) {
        this.compareService.addToCompare(p);
        this.toastService.show('Product added to comparison', 'info');
    }
  }

  formatPrice(price: number): string {
    return this.currencyService.format(price);
  }

  viewCertificate(cert: string): void {
      this.toastService.show(`Opening ${cert} certificate document...`, 'info');
      // In real app: window.open(product.certificateUrl, '_blank');
  }

  checkDelivery(): void {
    if (!this.pincode() || this.pincode().length < 4) {
      this.toastService.show('Please enter a valid pincode', 'error');
      return;
    }

    this.isCheckingDelivery.set(true);
    // Mock delivery check
    setTimeout(() => {
      const today = new Date();
      const daysToAdd = Math.floor(Math.random() * 5) + 3; // 3-8 days
      const delivery = new Date(today);
      delivery.setDate(today.getDate() + daysToAdd);

      this.deliveryDate.set(delivery.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));
      this.isCheckingDelivery.set(false);
    }, 1000);
  }

  openEducation(tab: string): void {
    this.educationTab.set(tab);
    this.educationOpen.set(true);
  }

  dropHint(): void {
    const email = prompt("Enter the email address to send a hint to:");
    if (email) {
      this.toastService.show(`Hint sent to ${email}! 🤫`, 'success');
    }
  }

  async openVirtualTryOn() {
    this.showTryOnModal.set(true);
    try {
      this.tryOnStream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Small delay to allow modal to render video element
      setTimeout(() => {
        if (this.videoElement?.nativeElement) {
          this.videoElement.nativeElement.srcObject = this.tryOnStream;
        }
      }, 100);
    } catch (err) {
      console.error("Error accessing camera:", err);
      this.toastService.show("Could not access camera. Please check permissions.", 'error');
      this.showTryOnModal.set(false);
    }
  }

  closeTryOn() {
    this.showTryOnModal.set(false);
    if (this.tryOnStream) {
      this.tryOnStream.getTracks().forEach(track => track.stop());
      this.tryOnStream = null;
    }
  }

  getProductEmoji(category: string): string {
    const emojiMap: { [key: string]: string } = {
      "Engagement Ring": "💍",
      "Loose Gemstone": "💎",
      "Spiritual Idol": "🕉️",
      "Gemstone Ring": "👑",
      "Precious Metal": "🏆",
    };
    return emojiMap[category] || "✦";
  }

  getBadge(product: Product): string | undefined {
    if (product.stock <= 3) return 'LOW STOCK';
    if (product.price > 40000) return 'EXCLUSIVE';
    return undefined;
  }
}
