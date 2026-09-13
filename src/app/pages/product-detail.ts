import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  signal,
  computed,
  inject,
  ChangeDetectionStrategy,
  ViewEncapsulation,
  ViewChild,
  ElementRef,
  effect,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ProductService } from '../services/product.service';
import { ReviewService, Review } from '../services/review.service';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import {
  ProductDetail,
  Product,
  CustomizationOption,
} from '../core/models';
import { ToastService } from '../services/toast.service';
import { FormsModule } from '@angular/forms';
import { SizeGuideModalComponent } from '../components/size-guide-modal';
import { HistoryService } from '../services/history.service';
import { SettingService } from '../services/setting.service';
import { RING_CATEGORIES } from '../core/constants';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import { environment } from '../../environments/environment';
import { AppointmentService } from '../services/appointment.service';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { SeoService } from '../services/seo.service';
import { VirtualTryOnComponent } from '../components/virtual-try-on';
import { WishlistService } from '../services/wishlist.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [
    CommonModule,
    NgOptimizedImage,
    RouterLink,
    FormsModule,
    ReactiveFormsModule,
    SizeGuideModalComponent,
    CurrencyConvertPipe,
    VirtualTryOnComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <!-- APPLE DESIGN SYSTEM: PRODUCT DETAIL & CONFIGURATOR (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">
      
      <!-- Sub-Nav Breadcrumb -->
      <nav class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-3 px-6 md:px-12">
        <div class="max-w-[1440px] mx-auto flex items-center justify-between text-xs text-[#7a7a7a]">
          <div class="flex items-center gap-2">
            <a routerLink="/" class="hover:text-[#1d1d1f] transition-colors">Home</a>
            <span>/</span>
            <a routerLink="/products" class="hover:text-[#1d1d1f] transition-colors">Collections</a>
            <span>/</span>
            <span class="text-[#1d1d1f] font-medium truncate max-w-[240px]">{{ product()?.name }}</span>
          </div>
          <span class="hidden sm:inline font-mono text-[11px] text-[#7a7a7a]">
            SKU: {{ product()?.specifications?.productDetails?.sku || product()?.sku || 'GEM-SOL-01' }}
          </span>
        </div>
      </nav>

      <div class="max-w-[1440px] mx-auto px-4 md:px-12 py-10">
        
        <!-- Loading Skeleton -->
        <div *ngIf="loading()" class="animate-pulse lg:flex lg:gap-12 relative">
          <div class="lg:w-[58%] space-y-6">
            <div class="w-full aspect-square bg-[#f5f5f7] rounded-[18px]"></div>
            <div class="grid grid-cols-4 gap-4">
              <div class="h-24 bg-[#f5f5f7] rounded-[12px]"></div>
              <div class="h-24 bg-[#f5f5f7] rounded-[12px]"></div>
              <div class="h-24 bg-[#f5f5f7] rounded-[12px]"></div>
              <div class="h-24 bg-[#f5f5f7] rounded-[12px]"></div>
            </div>
          </div>
          <div class="lg:w-[42%] space-y-6">
            <div class="h-8 bg-[#f5f5f7] rounded-full w-3/4"></div>
            <div class="h-12 bg-[#f5f5f7] rounded-full w-1/2"></div>
            <div class="h-40 bg-[#f5f5f7] rounded-[18px]"></div>
          </div>
        </div>

        <!-- Product Not Found -->
        <div *ngIf="!loading() && productNotFound()" class="text-center py-24">
          <div class="w-16 h-16 mx-auto text-[#D4AF37] mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22a8 8 0 100-16 8 8 0 000 16zm0-16V2m-3 2h6M9 6l3-4 3 4" /></svg>
          </div>
          <h2 class="font-display font-semibold text-3xl text-[#1d1d1f] mb-3">Creation Not Found</h2>
          <p class="text-sm text-[#7a7a7a] mb-8 max-w-md mx-auto">The requested fine jewelry creation is no longer available or the link is invalid.</p>
          <a routerLink="/products" class="btn-apple-pill">Explore Collections</a>
        </div>

        <!-- Main Product Content -->
        <div *ngIf="!loading() && product()" class="lg:flex lg:gap-12 relative items-start">
          
          <!-- LEFT COLUMN: Scrollable Media Gallery + Specifications -->
          <div class="lg:w-[58%] flex flex-col gap-10">
            
            <!-- Gallery Container -->
            <div class="flex flex-col gap-4">
              <div class="flex flex-col md:flex-row gap-4">
                
                <!-- Thumbnails Strip -->
                <div
                  class="order-2 md:order-1 flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto w-full md:w-24 pb-2 md:pb-0 hide-scrollbar snap-x snap-mandatory shrink-0"
                  role="tablist" aria-label="Media Thumbnails"
                >
                  <!-- Video Thumbnail (if available) -->
                  <div
                    *ngIf="product()?.videoUrl"
                    (click)="scrollToMedia(0)"
                    role="tab"
                    [attr.aria-selected]="selectedMediaIndex() === 0"
                    class="snap-start relative w-20 h-20 md:w-full md:h-24 bg-black rounded-[12px] overflow-hidden border border-[#e0e0e0] cursor-pointer hover:opacity-90 transition-all shrink-0 flex items-center justify-center"
                    [class.!border-2]="selectedMediaIndex() === 0"
                    [class.!border-[#D4AF37]]="selectedMediaIndex() === 0"
                  >
                    <div class="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
                      <svg class="w-6 h-6 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </div>
                    <video
                      [src]="product()?.videoUrl"
                      autoplay
                      loop
                      muted
                      playsinline
                      class="w-full h-full object-cover opacity-60"
                    ></video>
                  </div>

                  <!-- Image Thumbnails -->
                  <div
                    *ngFor="
                      let img of product()?.images?.length
                        ? product()?.images
                        : [product()?.imageUrl || ''];
                      let i = index
                    "
                    (click)="scrollToMedia(product()?.videoUrl ? i + 1 : i)"
                    role="tab"
                    [attr.aria-selected]="selectedMediaIndex() === (product()?.videoUrl ? i + 1 : i)"
                    class="snap-start relative w-20 h-20 md:w-full md:h-24 bg-[#f5f5f7] rounded-[12px] overflow-hidden border border-[#e0e0e0] cursor-pointer hover:opacity-90 transition-all shrink-0 flex items-center justify-center p-1.5"
                    [class.!border-2]="selectedMediaIndex() === (product()?.videoUrl ? i + 1 : i)"
                    [class.!border-[#D4AF37]]="selectedMediaIndex() === (product()?.videoUrl ? i + 1 : i)"
                  >
                    <img
                      *ngIf="img"
                      [ngSrc]="img"
                      fill
                      sizes="100px"
                      class="object-contain p-1"
                      [alt]="product()?.name"
                    />
                  </div>
                </div>

                <!-- Main Display Viewport -->
                <div
                  #scrollContainer
                  (scroll)="onGalleryScroll($event)"
                  id="main-media-scroll"
                  class="scroll-smooth order-1 md:order-2 flex-1 relative bg-[#f5f5f7] rounded-[18px] overflow-x-auto overflow-y-hidden snap-x snap-mandatory hide-scrollbar flex items-center border border-[#e0e0e0] aspect-square product-surface-shadow"
                >
                  <!-- Stock & Badge Pill -->
                  <div class="absolute top-5 left-5 z-10 flex flex-col gap-2">
                    <span *ngIf="(product()?.stock ?? 0) < 5 && (product()?.stock ?? 0) > 0" class="bg-amber-100 text-amber-800 text-[11px] font-semibold px-3 py-1 rounded-full border border-amber-300">
                      Limited Edition ({{ product()?.stock }} left)
                    </span>
                    <span *ngIf="product()?.stock === 0" class="bg-red-100 text-red-800 text-[11px] font-semibold px-3 py-1 rounded-full border border-red-300">
                      Vault Reserved
                    </span>
                    <span *ngIf="hasCertification('GIA')" class="bg-white/90 backdrop-blur-md text-[#1d1d1f] text-[11px] font-semibold px-3 py-1 rounded-full border border-[#e0e0e0]">
                      GIA Certified
                    </span>
                  </div>

                  <!-- Try It On Button -->
                  <div class="absolute bottom-5 right-5 z-10">
                    <button (click)="tryOnOpen.set(true)" class="btn-apple-pill text-xs !py-2 !px-4 !bg-white/90 !text-[#1d1d1f] hover:!bg-white border border-[#e0e0e0] shadow-lg backdrop-blur-md flex items-center gap-2">
                      <span>✨</span> Virtual Try-On
                    </button>
                  </div>

                  <!-- Premium Luxury Video Player -->
                  <div *ngIf="product()?.videoUrl" class="w-full h-full shrink-0 snap-center flex items-center justify-center bg-[#09090b] relative group overflow-hidden">
                    <video
                      #luxuryVideo
                      [src]="product()?.videoUrl"
                      autoplay
                      loop
                      [muted]="isVideoMuted()"
                      playsinline
                      (timeupdate)="onVideoTimeUpdate(luxuryVideo)"
                      (click)="toggleVideoPlay(luxuryVideo)"
                      class="w-full h-full object-contain cursor-pointer"
                    ></video>

                    <!-- Top Floating Badge -->
                    <div class="absolute top-4 right-4 z-20 flex items-center gap-2 pointer-events-none">
                      <span class="bg-black/70 backdrop-blur-md text-[#D4AF37] text-[10px] uppercase tracking-[0.2em] font-semibold px-3 py-1 rounded-full border border-[#D4AF37]/30 shadow-lg flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-ping"></span>
                        4K Atelier Film
                      </span>
                    </div>

                    <!-- Center Big Play Indicator when paused -->
                    <div
                      *ngIf="!isVideoPlaying()"
                      (click)="toggleVideoPlay(luxuryVideo)"
                      class="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-20 cursor-pointer animate-fadeIn"
                    >
                      <div class="w-16 h-16 rounded-full bg-white/90 hover:bg-white text-[#1d1d1f] flex items-center justify-center shadow-2xl transition-transform hover:scale-110">
                        <svg class="w-7 h-7 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>

                    <!-- Luxury Frosted Control Pill Bar -->
                    <div class="absolute bottom-4 inset-x-4 md:inset-x-8 z-20 bg-black/70 backdrop-blur-xl border border-white/20 px-4 py-2.5 rounded-full flex items-center gap-3 transition-opacity duration-300 opacity-90 hover:opacity-100 shadow-2xl">
                      
                      <!-- Play/Pause Toggle -->
                      <button
                        (click)="toggleVideoPlay(luxuryVideo)"
                        class="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                        [title]="isVideoPlaying() ? 'Pause' : 'Play'"
                        [attr.aria-label]="isVideoPlaying() ? 'Pause video' : 'Play video'"
                      >
                        <svg *ngIf="isVideoPlaying()" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                        <svg *ngIf="!isVideoPlaying()" class="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                      </button>

                      <!-- Progress Bar -->
                      <div class="flex-1 flex items-center gap-2">
                        <div class="relative w-full h-1.5 bg-white/20 rounded-full overflow-hidden cursor-pointer" (click)="seekVideo($event, luxuryVideo)">
                          <div class="h-full bg-[#D4AF37] rounded-full transition-all duration-100" [style.width.%]="videoProgress()"></div>
                        </div>
                      </div>

                      <!-- Mute / Unmute Toggle -->
                      <button
                        (click)="toggleVideoMute(luxuryVideo)"
                        class="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                        [title]="isVideoMuted() ? 'Unmute' : 'Mute'"
                        [attr.aria-label]="isVideoMuted() ? 'Unmute video' : 'Mute video'"
                      >
                        <svg *ngIf="isVideoMuted()" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                        <svg *ngIf="!isVideoMuted()" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                      </button>

                      <!-- Fullscreen Toggle -->
                      <button
                        (click)="toggleVideoFullscreen(luxuryVideo)"
                        class="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                        title="Expand Fullscreen"
                        aria-label="Toggle fullscreen"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>
                      </button>

                    </div>
                  </div>

                  <!-- Image Items -->
                  <div
                    *ngFor="let img of product()?.images || (product()?.imageUrl ? [product()!.imageUrl] : []); let i = index"
                    class="w-full h-full shrink-0 snap-center relative flex items-center justify-center p-8"
                  >
                    <img
                      *ngIf="img"
                      [ngSrc]="img"
                      fill
                      [priority]="i === 0"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      class="object-contain p-4"
                      [alt]="product()?.name"
                    />
                  </div>
                </div>

              </div>
            </div>

            <!-- COMPREHENSIVE PRODUCT SPECIFICATIONS -->
            <div class="store-utility-card p-8 space-y-8">
              
              <!-- Description -->
              <div *ngIf="product()?.description">
                <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-1">Creation Narrative</span>
                <h3 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-3">About {{ product()?.name }}</h3>
                <p class="text-sm text-[#7a7a7a] leading-relaxed font-sans font-light">
                  {{ product()?.description }}
                </p>
              </div>

              <!-- Master Specifications Header -->
              <div>
                <div class="flex items-center justify-between border-b border-[#e0e0e0] pb-4 mb-6">
                  <div>
                    <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-1">Authenticity & Hallmark</span>
                    <h3 class="font-display font-semibold text-2xl text-[#1d1d1f]">Master Specifications</h3>
                  </div>
                  <div class="flex items-center gap-2">
                    <span
                      *ngIf="certificationLabel()"
                      class="bg-[#f5f5f7] border border-[#e0e0e0] text-[#1d1d1f] text-xs font-semibold px-3 py-1 rounded-full"
                      >{{ certificationLabel() }}</span
                    >
                  </div>
                </div>

                <!-- Precious Metal & Physical Specs -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3 text-xs mb-8">
                  <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.grossWeight">
                    <span class="text-[#7a7a7a]">Gross Weight</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ product()?.grossWeight }} g</span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.metalDetails?.metalType || selectedMetal()">
                    <span class="text-[#7a7a7a]">Metal Alloy</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ selectedMetal()?.name || product()?.metalDetails?.metalType || '18K Solid Gold' }}</span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.metalDetails?.metalPurity">
                    <span class="text-[#7a7a7a]">Purity Hallmark</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ product()?.metalDetails?.metalPurity || '750 (18 Karat)' }}</span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.metalColor">
                    <span class="text-[#7a7a7a]">Metal Tone</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ product()?.metalColor }}</span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.metalDetails?.netWeight">
                    <span class="text-[#7a7a7a]">Net Precious Metal</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ product()?.metalDetails?.netWeight }} g</span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.dimensions">
                    <span class="text-[#7a7a7a]">Dimensions</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ product()?.dimensions }}</span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.bisHallmark">
                    <span class="text-[#7a7a7a]">Government Hallmark</span>
                    <span class="font-semibold text-emerald-700">✓ BIS Hallmarked (Guaranteed Purity)</span>
                  </div>
                </div>

                <!-- Gemstone & Diamond 4Cs Specs -->
                <div *ngIf="product()?.caratWeight || product()?.clarity || product()?.cut || product()?.species || product()?.originProvenance">
                  <h4 class="font-semibold text-sm text-[#1d1d1f] uppercase tracking-wider mb-4 pb-2 border-b border-[#e0e0e0]">
                    Gemological Grading (4Cs & Provenance)
                  </h4>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-3 text-xs mb-8">
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.species">
                      <span class="text-[#7a7a7a]">Species</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.species }}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.variety">
                      <span class="text-[#7a7a7a]">Variety</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.variety }}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.shape">
                      <span class="text-[#7a7a7a]">Shape / Cut Style</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.shape }}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.caratWeight">
                      <span class="text-[#7a7a7a]">Carat Weight</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.caratWeight }} ct</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.clarity">
                      <span class="text-[#7a7a7a]">Clarity Grade</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.clarity }}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.cut">
                      <span class="text-[#7a7a7a]">Cut & Symmetry</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.cut }}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.colorHue">
                      <span class="text-[#7a7a7a]">Color Hue</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.colorHue }}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.colorTradeTerm">
                      <span class="text-[#7a7a7a]">Trade Color</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.colorTradeTerm }}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.measurements">
                      <span class="text-[#7a7a7a]">Measurements</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.measurements }}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.treatmentStatus">
                      <span class="text-[#7a7a7a]">Enhancement / Treatment</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.treatmentStatus }}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.originProvenance">
                      <span class="text-[#7a7a7a]">Geographic Origin</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.originProvenance }}</span>
                    </div>
                    <div class="flex justify-between py-2 border-b border-[#f0f0f0]" *ngIf="product()?.labReportNumber">
                      <span class="text-[#7a7a7a]">Lab Report Number</span>
                      <span class="font-semibold text-[#1d1d1f]">{{ product()?.labReportNumber }}</span>
                    </div>
                  </div>
                </div>

                <!-- Stone Details Breakdown (if multi-stone) -->
                <div *ngIf="product()?.stoneDetails?.length" class="mb-8">
                  <h4 class="font-semibold text-sm text-[#1d1d1f] uppercase tracking-wider mb-4 pb-2 border-b border-[#e0e0e0]">
                    Setting Stone Inventory
                  </h4>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div *ngFor="let s of product()?.stoneDetails" class="bg-[#f5f5f7] border border-[#e0e0e0] p-4 rounded-[12px] text-xs space-y-1">
                      <div class="flex justify-between">
                        <span class="text-[#7a7a7a]">Stone Type</span>
                        <span class="font-semibold text-[#1d1d1f]">{{ s.stoneType || 'Diamond' }}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-[#7a7a7a]">Shape</span>
                        <span class="font-semibold text-[#1d1d1f]">{{ s.shape || 'Round Brilliant' }}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-[#7a7a7a]">Piece Count</span>
                        <span class="font-semibold text-[#1d1d1f]">{{ s.pieceCount || 1 }}</span>
                      </div>
                      <div class="flex justify-between">
                        <span class="text-[#7a7a7a]">Total Weight</span>
                        <span class="font-semibold text-[#1d1d1f]">{{ s.totalCaratWeight || '0' }} ct</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Diamond Details Table -->
                <div *ngIf="product()?.specifications?.diamondDetails as dd" class="mb-8">
                  <h4 class="font-semibold text-sm text-[#1d1d1f] uppercase tracking-wider mb-4 pb-2 border-b border-[#e0e0e0]">
                    Diamond Setting Details
                  </h4>
                  <div class="overflow-x-auto border border-[#e0e0e0] rounded-[12px]">
                    <table class="w-full text-xs text-left">
                      <thead class="bg-[#f5f5f7] text-[#1d1d1f] font-semibold border-b border-[#e0e0e0]">
                        <tr>
                          <th class="px-4 py-3">Type</th>
                          <th class="px-4 py-3">Shape</th>
                          <th class="px-4 py-3">Weight</th>
                          <th class="px-4 py-3">Color / Clarity</th>
                          <th class="px-4 py-3">Setting</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-[#f0f0f0]">
                        <tr *ngFor="let d of dd">
                          <td class="px-4 py-3 font-semibold text-[#1d1d1f]">{{ d.type }}</td>
                          <td class="px-4 py-3 text-[#7a7a7a]">{{ d.shape }}</td>
                          <td class="px-4 py-3 text-[#1d1d1f] font-medium">{{ d.carat }} ct</td>
                          <td class="px-4 py-3 text-[#7a7a7a]">{{ d.color }} / {{ d.clarity }}</td>
                          <td class="px-4 py-3 text-[#7a7a7a]">{{ d.settingType }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- Dynamic Additional Specs Catch-all -->
                <div *ngIf="productSpecs().length > 0">
                  <h4 class="font-semibold text-sm text-[#1d1d1f] uppercase tracking-wider mb-4 pb-2 border-b border-[#e0e0e0]">
                    Additional Specifications
                  </h4>
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-2 text-xs">
                    <div *ngFor="let spec of productSpecs()" class="flex justify-between py-2 border-b border-[#f0f0f0]">
                      <span class="text-[#7a7a7a] capitalize">{{ spec.key }}</span>
                      <span class="font-semibold text-[#1d1d1f] text-right">{{ spec.value }}</span>
                    </div>
                  </div>
                </div>

              </div>

            </div>

          </div>

          <!-- RIGHT COLUMN: Sticky Buy & Configurator Box -->
          <div class="lg:w-[42%] relative mt-8 lg:mt-0">
            <div class="sticky top-[110px] bg-white p-8 rounded-[18px] border border-[#e0e0e0] space-y-6">
              
              <!-- Title & Reviews -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">Haute Joaillerie</span>
                  <div
                    *ngIf="product()?.rating && (product()?.reviewCount ?? 0) > 0"
                    class="flex items-center gap-1 text-xs text-[#7a7a7a]"
                  >
                    <span class="text-amber-500">{{ starsFor(product()?.rating) }}</span>
                    <span>({{ product()?.reviewCount }} reviews)</span>
                  </div>
                </div>
                <div class="flex items-start justify-between gap-4">
                  <h1 class="font-display font-semibold text-3xl text-[#1d1d1f] leading-tight">
                    {{ product()?.name }}
                  </h1>
                  <button
                    type="button"
                    (click)="toggleWishlist()"
                    [attr.aria-label]="isWishlisted() ? 'Remove from wishlist' : 'Save to wishlist'"
                    [attr.aria-pressed]="isWishlisted()"
                    [title]="isWishlisted() ? 'Remove from wishlist' : 'Save to wishlist'"
                    class="shrink-0 w-10 h-10 rounded-full border flex items-center justify-center transition-colors active-press"
                    [class.border-[#e0e0e0]]="!isWishlisted()"
                    [class.text-[#1d1d1f]]="!isWishlisted()"
                    [class.hover:border-[#D4AF37]]="!isWishlisted()"
                    [class.border-red-200]="isWishlisted()"
                    [class.bg-red-50]="isWishlisted()"
                    [class.text-red-600]="isWishlisted()"
                  >
                    <svg class="w-5 h-5" viewBox="0 0 24 24" [attr.fill]="isWishlisted() ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Price Section -->
              <div class="pb-6 border-b border-[#e0e0e0]">
                <div class="flex items-baseline gap-3">
                  <span class="font-sans font-semibold text-3xl text-[#1d1d1f]">
                    {{ currentPriceBreakup()?.total || currentPrice() | currencyConvert }}
                  </span>
                  <span *ngIf="product()?.originalPrice" class="text-base text-[#7a7a7a] line-through">
                    {{ product()?.originalPrice || 0 | currencyConvert }}
                  </span>
                </div>
                <p class="text-xs text-[#7a7a7a] mt-1">Includes all applicable luxury duties, insured delivery & GIA report.</p>

                <!-- Transparent Price Breakup Accordion -->
                <button
                  *ngIf="hasPriceBreakup()"
                  (click)="togglePriceBreakup()"
                  class="text-xs font-semibold text-[#D4AF37] hover:underline flex items-center gap-1 uppercase tracking-wider mt-3"
                >
                  <span>Detailed Valuation Breakdown</span>
                  <span>{{ showPriceBreakup() ? '▲' : '▼' }}</span>
                </button>

                <div *ngIf="showPriceBreakup() && hasPriceBreakup()" class="mt-4 bg-[#f5f5f7] border border-[#e0e0e0] p-4 rounded-[12px] text-xs space-y-2 animate-fadeIn">
                  <div class="flex justify-between text-[#7a7a7a]">
                    <span>Precious Metal (18K)</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ currentPriceBreakup()!.metal | currencyConvert }}</span>
                  </div>
                  <div class="flex justify-between text-[#7a7a7a]">
                    <span>Certified Gemstones</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ currentPriceBreakup()!.gemstone | currencyConvert }}</span>
                  </div>
                  <div class="flex justify-between text-[#7a7a7a]">
                    <span>Artisanal Making & Setting</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ currentPriceBreakup()!.makingCharges | currencyConvert }}</span>
                  </div>
                  <div class="flex justify-between text-[#7a7a7a]">
                    <span>Tax & Insurance</span>
                    <span class="font-semibold text-[#1d1d1f]">{{ currentPriceBreakup()!.tax | currencyConvert }}</span>
                  </div>
                  <div class="flex justify-between pt-2 border-t border-[#e0e0e0] font-semibold text-sm text-[#1d1d1f]">
                    <span>Total Valuation</span>
                    <span class="text-[#D4AF37]">{{ currentPriceBreakup()!.total | currencyConvert }}</span>
                  </div>
                </div>
              </div>

              <!-- Configurator Options -->
              <div class="space-y-5">
                
                <!-- Metal Option Chips -->
                <div *ngIf="hasOption('metal')">
                  <span class="text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider block mb-2">Select Metal Alloy</span>
                  <div class="flex flex-wrap gap-2">
                    <button
                      *ngFor="let opt of getOptions('metal')"
                      (click)="selectedMetal.set(opt)"
                      class="px-4 py-2 rounded-full border text-xs font-medium transition-all active-press"
                      [class.bg-[#1d1d1f]]="selectedMetal()?.id === opt.id"
                      [class.text-white]="selectedMetal()?.id === opt.id"
                      [class.border-[#1d1d1f]]="selectedMetal()?.id === opt.id"
                      [class.bg-[#f5f5f7]]="selectedMetal()?.id !== opt.id"
                      [class.text-[#1d1d1f]]="selectedMetal()?.id !== opt.id"
                      [class.border-[#e0e0e0]]="selectedMetal()?.id !== opt.id"
                    >
                      {{ opt.name }}
                    </button>
                  </div>
                </div>

                <!-- Diamond Quality Option Chips -->
                <div *ngIf="hasOption('diamond')">
                  <span class="text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider block mb-2">Diamond Grading</span>
                  <div class="flex flex-wrap gap-2">
                    <button
                      *ngFor="let opt of getOptions('diamond')"
                      (click)="selectedDiamondQuality.set(opt)"
                      class="px-4 py-2 rounded-full border text-xs font-medium transition-all active-press"
                      [class.bg-[#1d1d1f]]="selectedDiamondQuality()?.id === opt.id"
                      [class.text-white]="selectedDiamondQuality()?.id === opt.id"
                      [class.border-[#1d1d1f]]="selectedDiamondQuality()?.id === opt.id"
                      [class.bg-[#f5f5f7]]="selectedDiamondQuality()?.id !== opt.id"
                      [class.text-[#1d1d1f]]="selectedDiamondQuality()?.id !== opt.id"
                      [class.border-[#e0e0e0]]="selectedDiamondQuality()?.id !== opt.id"
                    >
                      {{ opt.name }}
                    </button>
                  </div>
                </div>

                <!-- Ring Size Selector -->
                <div *ngIf="isRingCategory()">
                  <div class="flex justify-between items-center mb-2">
                    <span class="text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider">Ring Size</span>
                    <button (click)="sizeGuideOpen.set(true)" class="text-xs text-[#D4AF37] hover:underline font-semibold">Size Chart</button>
                  </div>
                  <select
                    [ngModel]="selectedSize()"
                    (ngModelChange)="selectedSize.set($event)"
                    aria-label="Ring size"
                    class="w-full bg-[#f5f5f7] border border-[#e0e0e0] rounded-full px-5 py-2.5 text-xs text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37]"
                  >
                    <option [ngValue]="null">Select Ring Size (US)</option>
                    <option *ngFor="let i of ringSizes" [ngValue]="i">
                      Size {{ i }} (US)
                    </option>
                  </select>
                  <p *ngIf="sizeError()" class="text-xs text-red-600 mt-1.5">
                    Please choose a ring size before adding to your bag.
                  </p>
                </div>

                <!-- Pincode Delivery -->
                <div>
                  <span class="text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider block mb-2">Insured Delivery Verification</span>
                  <div class="flex gap-2">
                    <input
                      type="text"
                      [ngModel]="pincode()"
                      (ngModelChange)="pincode.set($event)"
                      placeholder="Enter postal code"
                      aria-label="Postal code"
                      class="flex-1 bg-[#f5f5f7] border border-[#e0e0e0] rounded-full px-5 py-2 text-xs text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37]"
                    />
                    <button (click)="checkDelivery()" class="btn-apple-pill-secondary text-xs !py-2 !px-4">Check</button>
                  </div>
                  <p *ngIf="deliveryDate()" class="text-xs text-emerald-700 font-semibold mt-2 pl-2">
                    ✓ Estimated delivery by {{ deliveryDate() }}
                  </p>
                </div>

              </div>

              <!-- Action CTAs -->
              <div class="space-y-3 pt-4 border-t border-[#e0e0e0]">
                <button
                  *ngIf="product()?.stock !== 0"
                  (click)="handleAddToCart()"
                  class="btn-apple-pill w-full !py-3.5 text-sm"
                >
                  Add to Bag
                </button>
                <button
                  *ngIf="product()?.stock !== 0"
                  (click)="handleBuyNow()"
                  class="btn-apple-pill-secondary w-full !py-3 text-sm"
                >
                  Instant 1-Click Checkout
                </button>
                <!-- Restock notification (out of stock only) -->
                <form
                  *ngIf="product()?.stock === 0"
                  (ngSubmit)="notifyMe()"
                  class="bg-[#f5f5f7] border border-[#e0e0e0] rounded-[18px] p-4 space-y-3"
                >
                  <span class="text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider block">Notify Me When Restocked</span>
                  <p *ngIf="notifySubscribed()" class="text-xs text-emerald-700 font-semibold">
                    ✓ We will email {{ notifyEmail() }} when this piece is back in stock.
                  </p>
                  <div *ngIf="!notifySubscribed()" class="flex gap-2">
                    <input
                      type="email"
                      name="notifyEmail"
                      [ngModel]="notifyEmail()"
                      (ngModelChange)="notifyEmail.set($event)"
                      placeholder="you@example.com"
                      aria-label="Email address for restock notification"
                      autocomplete="email"
                      required
                      class="flex-1 min-w-0 bg-white border border-[#e0e0e0] rounded-full px-5 py-2 text-xs text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37]"
                    />
                    <button
                      type="submit"
                      [disabled]="notifySubmitting()"
                      class="btn-apple-pill text-xs !py-2 !px-4 !bg-[#1c1c1e] !text-white whitespace-nowrap"
                    >
                      {{ notifySubmitting() ? 'Saving…' : 'Notify me' }}
                    </button>
                  </div>
                </form>

                <!-- Concierge Appointment Strip -->
                <div class="grid grid-cols-2 gap-2 pt-2">
                  <button (click)="openTryAtHome()" class="btn-apple-pill-secondary text-xs !py-2 !px-3">
                    🏡 Try at Home
                  </button>
                  <button (click)="openVideoConsult()" class="btn-apple-pill-secondary text-xs !py-2 !px-3">
                    📹 Video Consult
                  </button>
                </div>
              </div>

              <!-- Trust Guarantee Strip -->
              <div class="grid grid-cols-2 gap-2 text-[11px] text-[#7a7a7a] pt-4 border-t border-[#f0f0f0]">
                <div class="flex items-center gap-1.5">
                  <span>🔒</span>
                  <span>Insured Express Shipping</span>
                </div>
                <div *ngIf="hasCertification('GIA')" class="flex items-center gap-1.5">
                  <span>💎</span>
                  <span>GIA Lab Certificate</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span>🛡️</span>
                  <span>Lifetime Authenticity</span>
                </div>
                <div *ngIf="returnPolicyDays() as days" class="flex items-center gap-1.5">
                  <span>🔄</span>
                  <a routerLink="/returns" class="underline">{{ days }}-Day Returns</a>
                </div>
              </div>

            </div>
          </div>

        </div>

        <!-- REVIEWS SECTION -->
        <section *ngIf="!loading() && product()" class="mt-20 border-t border-[#e0e0e0] pt-16">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-1">Client Testimonials</span>
              <h2 class="font-display font-semibold text-3xl text-[#1d1d1f]">Patron Reviews & Ratings.</h2>
            </div>
            <button *ngIf="isAuthenticated()" (click)="showReviewModal.set(true)" class="btn-apple-pill text-xs !py-2.5 !px-5 self-start sm:self-auto">
              Write a Review
            </button>
          </div>

          <div *ngIf="reviews().length === 0" class="store-utility-card p-12 text-center">
            <span class="text-3xl mb-2 block">✦</span>
            <h3 class="font-display font-semibold text-lg text-[#1d1d1f] mb-1">Be the First to Review</h3>
            <p class="text-xs text-[#7a7a7a]">Share your experience with this bespoke creation.</p>
          </div>

          <div *ngIf="reviews().length > 0" class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <article *ngFor="let review of reviews()" class="store-utility-card p-6">
              <div class="flex items-center justify-between mb-3">
                <span class="font-semibold text-sm text-[#1d1d1f]">{{ review.userName || 'Verified Patron' }}</span>
                <div class="text-amber-500 text-xs">
                  {{ '★'.repeat(review.rating) }}{{ '☆'.repeat(5 - review.rating) }}
                </div>
              </div>
              <p class="text-xs text-[#7a7a7a] leading-relaxed font-light">{{ review.comment }}</p>
              <span class="text-[10px] text-[#a1a1a6] mt-4 block">{{ review.createdAt | date:'mediumDate' }}</span>
            </article>
          </div>
        </section>

        <!-- CURATED RECOMMENDATIONS ("YOU MAY ALSO ADORE") -->
        <section *ngIf="!loading() && similarProducts().length > 0" class="mt-20 border-t border-[#e0e0e0] pt-16">
          <div class="flex items-center justify-between mb-8">
            <div>
              <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-1">Curated Pairings</span>
              <h2 class="font-display font-semibold text-3xl text-[#1d1d1f]">You May Also Adore.</h2>
            </div>
            <a routerLink="/products" class="text-xs font-semibold text-[#D4AF37] hover:underline uppercase tracking-wider">
              View All Collections &rarr;
            </a>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <article *ngFor="let prod of similarProducts() | slice:0:4" [routerLink]="['/products', prod.id]" class="store-utility-card cursor-pointer group flex flex-col justify-between">
              <div>
                <div class="relative overflow-hidden aspect-square bg-[#f5f5f7] rounded-[12px] mb-4">
                  <img [ngSrc]="prod.images?.[0] || prod.imageUrl || ''" fill sizes="280px" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" [alt]="prod.name">
                </div>
                <span class="text-[11px] text-[#7a7a7a] uppercase font-mono tracking-wider block mb-1">{{ prod.category }}</span>
                <h3 class="font-sans font-semibold text-base text-[#1d1d1f] group-hover:text-[#D4AF37] transition-colors mb-2 line-clamp-1">{{ prod.name }}</h3>
                <span class="text-sm font-semibold text-[#1d1d1f]">{{ prod.price | currencyConvert }}</span>
              </div>
            </article>
          </div>
        </section>

      </div>

      <!-- Floating Sticky Bar (Mobile / Scroll) -->
      <div *ngIf="product()" class="fixed bottom-0 left-0 w-full bg-[#f5f5f7]/90 backdrop-blur-xl border-t border-[#e0e0e0] py-3.5 px-6 md:px-12 z-40 shadow-2xl flex items-center justify-between">
        <div class="truncate max-w-[200px] sm:max-w-md">
          <span class="font-sans font-semibold text-sm text-[#1d1d1f] truncate block">{{ product()?.name }}</span>
          <span class="text-xs font-semibold text-[#D4AF37]">{{ currentPriceBreakup()?.total || currentPrice() | currencyConvert }}</span>
        </div>
        <div class="flex items-center gap-3">
          <button *ngIf="product()?.stock !== 0" (click)="handleAddToCart()" class="btn-apple-pill text-xs !py-2 !px-5">
            Add to Bag
          </button>
          <span *ngIf="product()?.stock === 0" class="bg-red-100 text-red-800 text-[11px] font-semibold px-3 py-1 rounded-full border border-red-300">
            Out of Stock
          </span>
        </div>
      </div>


      <!-- Modals -->
      <app-size-guide-modal
        [isOpen]="sizeGuideOpen()"
        (close)="sizeGuideOpen.set(false)"
      ></app-size-guide-modal>

      <!-- Try At Home Modal -->
      <div
        *ngIf="tryAtHomeOpen()"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      >
        <div
          class="bg-white rounded-[18px] w-full max-w-md overflow-hidden shadow-2xl relative"
        >
          <button
            (click)="tryAtHomeOpen.set(false)"
            aria-label="Close"
            class="absolute top-4 right-4 text-[#7a7a7a] hover:text-[#1d1d1f] text-xl z-10"
          >
            &times;
          </button>
          <div
            class="bg-[#f5f5f7] border-b border-[#e0e0e0] text-[#1d1d1f] p-6 text-center"
          >
            <h3 class="font-display font-semibold text-xl text-[#1d1d1f]">Book {{ appointmentType() === 'TRY_AT_HOME' ? 'Try at Home' : (appointmentType() === 'STORE_VISIT' ? 'Store Visit' : 'Video Consult') }}</h3>
          </div>
          <form [formGroup]="appointmentForm" (ngSubmit)="confirmTryAtHome()" class="p-6 space-y-4">
            <p class="text-sm text-[#6e6e73] text-center mb-4">
              {{ appointmentType() === 'TRY_AT_HOME' ? 'Our consultant will bring this jewellery to your doorstep.' : (appointmentType() === 'STORE_VISIT' ? 'Book a VIP consultation at our store.' : 'Our expert will guide you via WhatsApp Video call.') }}
            </p>

            <div class="space-y-3">
              <input type="text" formControlName="name" placeholder="Your Name" aria-label="Your name" class="input-field" required />
              <input type="email" formControlName="email" placeholder="Email Address" aria-label="Email address" class="input-field" required />
              <input type="tel" formControlName="phone" placeholder="Phone Number" aria-label="Phone number" class="input-field" required />
              <input type="date" formControlName="requestedDate" aria-label="Requested date" class="input-field" required />
            </div>

            <button
              type="submit"
              [disabled]="appointmentForm.invalid || submittingAppointment()"
              class="btn-apple-pill w-full"
            >
              {{ submittingAppointment() ? 'Booking...' : 'Confirm' }}
            </button>
          </form>
        </div>
      </div>

      <!-- Write a Review Modal -->
      <div *ngIf="showReviewModal()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
        <div class="bg-white rounded-[18px] w-full max-w-md overflow-hidden shadow-2xl relative p-6">
          <button (click)="showReviewModal.set(false)" aria-label="Close" class="absolute top-4 right-4 text-[#7a7a7a] hover:text-[#1d1d1f] text-xl z-10">&times;</button>
          <h3 class="font-display font-semibold text-xl mb-4 text-[#1d1d1f]">Write a Review</h3>

          <div class="space-y-4">
            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-[#1d1d1f] mb-2">Rating</label>
              <div class="flex gap-2">
                <button *ngFor="let star of [1,2,3,4,5]" (click)="reviewRating.set(star)" [attr.aria-label]="'Rate ' + star + ' out of 5'" class="text-2xl active-press" [class.text-amber-500]="star <= reviewRating()" [class.text-[#e0e0e0]]="star > reviewRating()">
                  ★
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-semibold uppercase tracking-wider text-[#1d1d1f] mb-2">Comment</label>
              <textarea [ngModel]="reviewComment()" (ngModelChange)="reviewComment.set($event)" rows="4" aria-label="Review comment" class="input-field" placeholder="Share your experience..."></textarea>
            </div>

            <button (click)="submitReview()" [disabled]="submittingReview() || !reviewComment()" class="btn-apple-pill w-full">
              {{ submittingReview() ? 'Submitting...' : 'Submit Review' }}
            </button>
          </div>
        </div>
      </div>
      <app-virtual-try-on
        [isOpen]="tryOnOpen()"
        [productImageUrl]="product()?.imageUrl || product()?.images?.[0]"
        [productName]="product()?.name || ''"
        [productCategory]="product()?.category || ''"
        (closeEvent)="tryOnOpen.set(false)"
      ></app-virtual-try-on>

    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        overflow-x: hidden;
      }
    `,
  ],
})
export class ProductDetailComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private historyService = inject(HistoryService);
  private settingService = inject(SettingService);

  /** Store settings, used to decide which promises may be made. */
  storeSettings: Record<string, string> = {};
  private seoService = inject(SeoService);

  private appointmentService = inject(AppointmentService);
  private fb = inject(FormBuilder);

  appointmentForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    requestedDate: ['', Validators.required],
  });

  loading = signal(true);
  productNotFound = signal(false);
  submittingAppointment = signal(false);
  appointmentType = signal<'TRY_AT_HOME' | 'STORE_VISIT' | 'VIDEO_CONSULT'>('TRY_AT_HOME');
  tryOnOpen = signal(false);
  product = signal<ProductDetail | null>(null);

  // Reviews & Recommendations
  private authService = inject(AuthService);
  private reviewService = inject(ReviewService);
  private wishlistService = inject(WishlistService);

  isWishlisted = computed(() => {
    const id = this.product()?.id;
    return !!id && this.wishlistService.has(id);
  });

  // Restock notification form (shown only when out of stock)
  notifyEmail = signal('');
  notifySubmitting = signal(false);
  notifySubscribed = signal(false);

  /** Prefill the restock email from the signed-in user, without overwriting what they typed. */
  private prefillNotifyEmail = effect(() => {
    const email = this.authService.currentUser()?.email;
    if (email && !this.notifyEmail()) {
      this.notifyEmail.set(email);
    }
  });
  
  reviews = signal<Review[]>([]);
  similarProducts = signal<Product[]>([]);
  
  showReviewModal = signal(false);
  reviewRating = signal(5);
  reviewComment = signal('');
  submittingReview = signal(false);
  
  isAuthenticated = computed(() => !!this.authService.currentUser());

  // UI State
  selectedMediaIndex = signal<number>(0);
  sizeGuideOpen = signal(false);
  showPriceBreakup = signal(true);
  tryAtHomeOpen = signal(false);

  // Luxury Video Player State
  isVideoPlaying = signal(true);
  isVideoMuted = signal(true);
  videoProgress = signal(0);

  // Customization
  selectedMetal = signal<CustomizationOption | null>(null);
  selectedDiamondQuality = signal<CustomizationOption | null>(null);
  selectedSize = signal<number | null>(null);
  sizeError = signal(false);

  /**
   * US ring sizes actually manufactured. The selector offered 6-20; US sizing
   * stops around 13, and this app's own size guide lists 5-13. Sizes 14-20
   * were unorderable as labelled.
   */
  readonly ringSizes = [5, 6, 7, 8, 9, 10, 11, 12, 13];

  /** Size as it should appear on the order line, or undefined if N/A. */
  selectedSizeLabel(): string | undefined {
    if (!this.isRingCategory()) return undefined;
    const size = this.selectedSize();
    return size == null ? undefined : `US ${size}`;
  }

  /**
   * A ring cannot be made without a size. This was not checked, so an order
   * could be placed with none and only surface when it reached the workshop.
   */
  private ensureSizeChosen(): boolean {
    if (!this.isRingCategory() || this.selectedSize() != null) {
      this.sizeError.set(false);
      return true;
    }
    this.sizeError.set(true);
    this.toastService.show('Please choose a ring size first.', 'error');
    return false;
  }

  // Delivery
  pincode = signal('');
  deliveryDate = signal<string | null>(null);

  @ViewChild('scrollContainer') scrollContainer!: ElementRef<HTMLDivElement>;

  // Computed Prices
  currentPrice = computed(() => {
    let price = this.product()?.price || 0;
    if (this.selectedMetal()) price += this.selectedMetal()?.priceModifier ?? 0;
    if (this.selectedDiamondQuality())
      price += this.selectedDiamondQuality()?.priceModifier ?? 0;
    return price;
  });

  currentPriceBreakup = computed(() => {
    const base = this.product()?.priceBreakup;
    if (!base) return null;

    let metalPrice = base.metal || 0;
    let gemstonePrice = base.gemstone || 0;
    let makingCharges = base.makingCharges || 0;

    // Adjust logic based on modifiers
    if (this.selectedMetal())
      metalPrice += this.selectedMetal()?.priceModifier ?? 0;
    if (this.selectedDiamondQuality())
      gemstonePrice += this.selectedDiamondQuality()?.priceModifier ?? 0;

    const baseProductPrice = this.product()?.price || 0;
    let calculatedSubtotal = metalPrice + gemstonePrice + makingCharges;

    // If the calculated subtotal is wildly incorrect (e.g., missing components),
    // or if it's completely 0 but the product has a price,
    // we should override the breakup logic to match the trusted base product price.
    // When the stored breakup is missing or does not reconcile with the price,
    // the components are not known. This used to invent one -- assigning the
    // whole price to "gemstone" and showing making charges as zero -- under a
    // heading reading "Detailed Valuation Breakdown". For jewellery, making
    // charges are the single most scrutinised component, and a manufactured
    // zero is a price-transparency failure rather than a display nicety.
    //
    // Mark it unavailable instead, so the template can omit the breakdown and
    // show only the price, which is the part we actually know.
    const breakupIsUsable =
      calculatedSubtotal > 0 &&
      (baseProductPrice === 0 ||
        Math.abs(calculatedSubtotal - baseProductPrice) <= baseProductPrice * 0.1);

    if (!breakupIsUsable) {
        gemstonePrice = 0;
        metalPrice = 0;
        makingCharges = 0;
        calculatedSubtotal = baseProductPrice;
    }

    // Tax calculation
    const tax = base.tax || Math.round(calculatedSubtotal * 0.03);

    // We must ensure the final total strictly equals the subtotal + tax.
    // Overriding this with a wrong `base.total` from the backend creates a mathematically impossible UI.
    const total = calculatedSubtotal + tax;

    return {
      // False when the components could not be reconciled with the price.
      available: breakupIsUsable,
      metal: metalPrice,
      gemstone: gemstonePrice,
      makingCharges: makingCharges,
      tax,
      total: total,
    };
  });

  productSpecs = computed(() => {
    const p = this.product();
    if (!p) return [];

    // Ignore system fields and fields that are already displayed elsewhere
    const ignoredKeys = [
      'id',
      'name',
      'description',
      'price',
      'category',
      'imageUrl',
      'images',
      'videoUrl',
      'seoTitle',
      'seoDescription',
      'seoQualifiers',
      'stock',
      'originalPrice',
      'reviewCount',
      'priceBreakup',
      'customizationOptions',
      'specifications',
      'metalDetails',
      'stoneDetails',
      'createdAt',
      'updatedAt',
      'stoneDetailIds',
      'occasions',
      'styles',
      'ogImage',
      // Internal or duplicate fields to hide from visual specs list
      'subCategory',
      'subcategory',
      'isVerified',
      'inventoryOwnership',
      'bisHallmark',
      'stockStatus',
      'sku',
      'huid',
      'rating',
      'certifications',
    ];

    const specs: { key: string; value: any }[] = [];

    Object.entries(p).forEach(([key, value]) => {
      if (
        !ignoredKeys.includes(key) &&
        value !== null &&
        value !== undefined &&
        value !== ''
      ) {
        // Ignore empty arrays or empty objects
        if (Array.isArray(value) && value.length === 0) return;
        if (typeof value === 'object' && Object.keys(value).length === 0)
          return;

        // Convert booleans to Yes/No
        const displayValue =
          typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value;
        specs.push({ key: this.formatKey(key), value: displayValue });
      }
    });
    return specs;
  });

  ngOnInit(): void {
    this.settingService
      .getSettings()
      .subscribe((s) => (this.storeSettings = s || {}));

    this.route.params.subscribe((p) => {
      if (p['id']) {
        this.loadProduct(p['id']);
        this.loadReviews(p['id']);
        this.loadSimilarProducts(p['id']);
        
        // Log view if authenticated
        if (this.isAuthenticated()) {
           this.productService.logProductView(p['id']).subscribe();
        }
      }
    });

    this.route.queryParams.subscribe((q) => {
      if (q['size']) {
        this.selectedSize.set(Number(q['size']));
      }
    });
  }

  loadReviews(productId: string) {
    this.reviewService.getProductReviews(productId, 0, 10).subscribe({
      next: (res) => this.reviews.set(res.content),
      error: (err) => console.error('Failed to load reviews', err)
    });
  }

  loadSimilarProducts(productId: string) {
    this.productService.getSimilarProducts(productId).subscribe({
      next: (res) => this.similarProducts.set(res.content),
      error: (err) => console.error('Failed to load similar products', err)
    });
  }

  submitReview() {
    if (!this.product()) return;
    this.submittingReview.set(true);
    
    const newReview: Review = {
       rating: this.reviewRating(),
       comment: this.reviewComment(),
       productId: this.product()!.id!
    };
    
    this.reviewService.submitReview(newReview).subscribe({
       next: (res) => {
           this.reviews.update(curr => [res, ...curr]);
           this.showReviewModal.set(false);
           this.reviewComment.set('');
           this.reviewRating.set(5);
           this.toastService.show('Review submitted successfully!', 'success');
           this.submittingReview.set(false);
       },
       error: (err) => {
           this.toastService.show(err.error?.message || 'Failed to submit review.', 'error');
           this.submittingReview.set(false);
       }
    });
  }

  ngOnDestroy(): void {}

  private loadProduct(id: string): void {
    this.loading.set(true);
    this.productService.getProductById(id).subscribe({
      next: (data) => {
        this.product.set(data);
        this.historyService.add(data);
        this.loading.set(false);

        // Update SEO Tags
        this.seoService.updateTags({
          title: `${data.name} | Caratloop`,
          description: data.description || `Buy ${data.name} online at Caratloop.`,
          image: data.imageUrl || (data.images && data.images.length > 0 ? data.images[0] : ''),
          url: `https://www.caratloop.com/products/${data.id}`
        });

        if (data.customizationOptions) {
          this.selectedMetal.set(
            data.customizationOptions.find(
              (o) => o.type === 'metal' && o.priceModifier === 0,
            ) || null,
          );
          this.selectedDiamondQuality.set(
            data.customizationOptions.find(
              (o) => o.type === 'diamond' && o.priceModifier === 0,
            ) || null,
          );
        }
        const schema = {
          '@context': 'https://schema.org/',
          '@type': 'Product',
          name: data.name,
          image: data.images?.length ? data.images : [data.imageUrl],
          description: data.description || data.name,
          sku: data.sku || data.specifications?.productDetails?.sku,
          offers: {
            '@type': 'Offer',
            url: 'https://www.caratloop.com/products/' + data.id,
            priceCurrency: 'INR',
            price: data.price,
            availability:
              data.stock > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
          },
        };

        // A MerchantReturnPolicy declaring a free 30-day window was emitted for
        // every product while no returns policy existed anywhere on the site.
        // Only declare it once the business has actually published one.
        const returnDays = this.returnPolicyDays();
        if (returnDays) {
          (schema.offers as any).hasMerchantReturnPolicy = {
            '@type': 'MerchantReturnPolicy',
            applicableCountry: 'IN',
            returnPolicyCategory:
              'https://schema.org/MerchantReturnFiniteReturnWindow',
            merchantReturnDays: returnDays,
            returnMethod: 'https://schema.org/ReturnByMail',
          };
        }

        // Emit aggregateRating only when the product genuinely has one.
        // A hardcoded 4.8 with an invented count is a fake review signal to
        // Google and a misrepresentation to shoppers.
        if (data.rating && data.reviewCount && data.reviewCount > 0) {
          (schema as any).aggregateRating = {
            '@type': 'AggregateRating',
            ratingValue: String(data.rating),
            reviewCount: data.reviewCount,
          };
        }
        this.seoService.setJsonLd(schema);
      },
      error: () => {
        this.loading.set(false);
        this.productNotFound.set(true);
      },
    });
  }

  /**
   * True only when the product actually records this lab's certificate.
   * The badges used to render unconditionally, so uncertified stock carried a
   * "GIA Certified" mark -- misrepresentation, and for BIS an offence under
   * the BIS Act once hallmarking became mandatory.
   */
  /** Published return window, in days. Null until the business sets one. */
  returnPolicyDays(): number | null {
    const raw = this.storeSettings?.['returnPolicyDays'];
    const n = raw ? parseInt(String(raw), 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  hasCertification(lab: string): boolean {
    const certs = this.product()?.certifications;
    if (!certs || !certs.length) return false;
    return certs.some((c) => (c || '').toUpperCase().includes(lab.toUpperCase()));
  }

  /** Label naming only the accreditations this piece genuinely holds. */
  certificationLabel(): string {
    const held: string[] = [];
    if (this.hasCertification('GIA')) held.push('GIA');
    if (this.hasCertification('IGI')) held.push('IGI');
    if (this.product()?.bisHallmark) held.push('BIS Hallmarked');
    return held.join(' · ');
  }

  /** Star glyphs for a real rating; never a fixed five. */
  starsFor(rating?: number | null): string {
    const r = Math.max(0, Math.min(5, Math.round(rating ?? 0)));
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  }

  handleAddToCart(): void {
    if (this.product()) {
      if (!this.ensureSizeChosen()) return;

      const options = {
        metal: this.selectedMetal()?.name,
        diamond: this.selectedDiamondQuality()?.name,
        // Collected by the selector above and carried by CartItemOptions, but
        // never sent -- so every ring was ordered without a size.
        size: this.selectedSizeLabel(),
        price: this.currentPrice(),
        product: this.product(),
      };
      this.cartService
        .addToCart(this.product()!.id, 1, options)
        .subscribe(() => {
          this.toastService.show('Added to Shopping Bag', 'success');
        });
    }
  }

  handleBuyNow(): void {
    if (this.product()) {
      if (!this.ensureSizeChosen()) return;

      const options = {
        metal: this.selectedMetal()?.name,
        diamond: this.selectedDiamondQuality()?.name,
        size: this.selectedSizeLabel(),
        price: this.currentPrice(),
        product: this.product(),
      };
      this.cartService
        .addToCart(this.product()!.id, 1, options)
        .subscribe(() => {
          this.router.navigate(['/cart']);
        });
    }
  }

  togglePriceBreakup() {
    this.showPriceBreakup.set(!this.showPriceBreakup());
  }

  private http = inject(HttpClient);

  notifyMe(): void {
    const productId = this.product()?.id;
    if (!productId || this.notifySubmitting()) return;

    const email = this.notifyEmail().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.toastService.show('Please enter a valid email address.', 'error');
      return;
    }

    this.notifySubmitting.set(true);
    this.http.post(`${environment.apiUrl}/notifications/stock`, { email, productId }).subscribe({
      next: () => {
        this.notifySubmitting.set(false);
        this.notifySubscribed.set(true);
        this.toastService.show('We will notify you when this item is back in stock!', 'success');
      },
      error: () => {
        this.notifySubmitting.set(false);
        this.toastService.show('Failed to subscribe. Please try again.', 'error');
      }
    });
  }

  toggleWishlist(): void {
    const productId = this.product()?.id;
    if (!productId) return;

    if (!this.authService.isAuthenticated()) {
      this.toastService.show('Sign in to save items', 'info');
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    const wasSaved = this.wishlistService.has(productId);
    this.wishlistService.toggle(productId).subscribe({
      next: () => {
        this.toastService.show(wasSaved ? 'Removed from wishlist' : 'Saved to wishlist', 'success');
      },
      error: () => {
        this.toastService.show('Could not update your wishlist', 'error');
      }
    });
  }
  openTryAtHome() {
    this.appointmentType.set('TRY_AT_HOME');
    this.tryAtHomeOpen.set(true);
    this.appointmentForm.reset();
  }

  openVideoConsult() {
    this.appointmentType.set('VIDEO_CONSULT');
    this.tryAtHomeOpen.set(true);
    this.appointmentForm.reset();
  }

  confirmTryAtHome() {
    if (this.appointmentForm.invalid) return;

    this.submittingAppointment.set(true);

    const productId = this.product()?.id;
    const formData = this.appointmentForm.value;

    this.appointmentService.createAppointment({
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      appointmentType: this.appointmentType(),
      requestedDate: new Date(formData.requestedDate).toISOString(),
      productId: productId
    }).subscribe({
      next: () => {
        this.submittingAppointment.set(false);
        this.tryAtHomeOpen.set(false);
        this.toastService.show('Booking Confirmed! Our team will contact you shortly.', 'success');
      },
      error: () => {
        this.submittingAppointment.set(false);
        this.toastService.show('Failed to book appointment. Please try again.', 'error');
      }
    });
  }

  checkDelivery() {
    if (this.pincode().length < 6)
      return this.toastService.show(
        'Please enter a valid 6-digit pincode',
        'error',
      );
    this.toastService.show('Checking availability...', 'info');

    this.productService.checkDeliveryAvailability(this.pincode()).subscribe({
      next: (response) => {
        if (response.available) {
          this.deliveryDate.set(response.estimatedDate || 'Available');
          this.toastService.show(
            response.message || 'Delivery available',
            'success',
          );
        } else {
          this.deliveryDate.set(null);
          this.toastService.show(
            response.message || 'Delivery not available',
            'error',
          );
        }
      },
      error: () => {
        this.deliveryDate.set(null);
        this.toastService.show('Could not check delivery', 'error');
      },
    });
  }

  isRingCategory(): boolean {
    const cat = this.product()?.category;
    if (!cat) return false;
    return RING_CATEGORIES.some((c) => cat.includes(c));
  }

  // Helpers
  hasPriceBreakup(): boolean {
    const pb = this.product()?.priceBreakup;
    if (!pb) return false;

    // Some component data must exist...
    const hasData =
      pb.metal > 0 || pb.gemstone > 0 || pb.makingCharges > 0 || pb.total > 0;
    if (!hasData) return false;

    // ...and it must reconcile with the price. currentPriceBreakup() reports
    // `available: false` when it does not, and the breakdown is then hidden
    // rather than shown with invented components.
    return this.currentPriceBreakup()?.available === true;
  }

  hasOption(t: string) {
    return !!this.product()?.customizationOptions?.some((o) => o.type === t);
  }
  getOptions(t: string) {
    return (
      this.product()?.customizationOptions?.filter((o) => o.type === t) || []
    );
  }
  formatKey(k: string) {
    return k.replace(/([A-Z])/g, ' $1').trim();
  }

  ngAfterViewInit() {
    // Left empty for now. Can be removed later if not needed by other logic.
  }

  scrollToMedia(index: number) {
    this.selectedMediaIndex.set(index);
    if (!this.scrollContainer?.nativeElement) return;

    const container = this.scrollContainer.nativeElement;
    const width = container.offsetWidth;

    container.scrollTo({
      left: width * index,
      behavior: 'smooth',
    });
  }

  onGalleryScroll(event: Event) {
    const container = event.target as HTMLElement;
    // Use clientWidth for more accuracy in layout calculations
    const width = container.clientWidth;
    if (width === 0) return;

    // Added a small threshold to prevent "flickering" between indices
    const scrollPos = container.scrollLeft + width / 2;
    const index = Math.floor(scrollPos / width);

    if (this.selectedMediaIndex() !== index) {
      this.selectedMediaIndex.set(index);
    }
  }

  // Luxury Video Player Methods
  toggleVideoPlay(video: HTMLVideoElement) {
    if (!video) return;
    if (video.paused) {
      video.play().then(() => this.isVideoPlaying.set(true)).catch(() => {});
    } else {
      video.pause();
      this.isVideoPlaying.set(false);
    }
  }

  toggleVideoMute(video: HTMLVideoElement) {
    if (!video) return;
    video.muted = !video.muted;
    this.isVideoMuted.set(video.muted);
  }

  onVideoTimeUpdate(video: HTMLVideoElement) {
    if (!video || !video.duration) return;
    this.videoProgress.set((video.currentTime / video.duration) * 100);
  }

  seekVideo(event: MouseEvent, video: HTMLVideoElement) {
    if (!video || !video.duration) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const pos = (event.clientX - rect.left) / rect.width;
    video.currentTime = pos * video.duration;
    this.videoProgress.set(pos * 100);
  }

  toggleVideoFullscreen(video: HTMLVideoElement) {
    if (!video) return;
    if (!document.fullscreenElement) {
      video.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }
}
