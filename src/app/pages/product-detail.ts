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
  ViewChildren,
  QueryList,
} from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ProductService } from '../services/product.service';
import { CartService } from '../services/cart.service';
import {
  ProductDetail,
  Product,
  CustomizationOption,
  PriceBreakup,
} from '../core/models';
import { ToastService } from '../services/toast.service';
import { FormsModule } from '@angular/forms';
import { SizeGuideModalComponent } from '../components/size-guide-modal';
import { HistoryService } from '../services/history.service';
import { CurrencyService } from '../services/currency.service';
import { RING_CATEGORIES } from '../core/constants';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import { environment } from '../../environments/environment';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [
    CommonModule,
    NgOptimizedImage,
    RouterLink,
    FormsModule,
    SizeGuideModalComponent,
    CurrencyConvertPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div [innerHTML]="productSchema()"></div>
    <div class="min-h-screen bg-white font-sans text-primary-900">
      <!-- Breadcrumb -->
      <nav class="bg-white border-b border-gray-100">
        <div class="container mx-auto px-4 lg:px-12 py-3">
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <a routerLink="/" class="hover:text-secondary-600 transition-colors"
              >Home</a
            >
            <span>/</span>
            <a
              routerLink="/products"
              class="hover:text-secondary-600 transition-colors"
              >Products</a
            >
            <span>/</span>
            <span class="text-gray-900 font-medium truncate max-w-[200px]">{{
              product()?.name
            }}</span>
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
              <div class="h-4 w-1/4 bg-gray-200 rounded mb-4"></div>
              <!-- SKU -->
              <div class="h-10 w-3/4 bg-gray-200 rounded mb-6"></div>
              <!-- Title -->
              <div class="h-8 w-1/2 bg-gray-200 rounded mb-6"></div>
              <!-- Price -->

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
            <!-- Image Gallery -->
            <div class="flex flex-col gap-4">
              <div class="flex flex-col md:flex-row gap-4">
                <!-- Thumbnails -->
                <div
                  class="order-2 md:order-1 flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto w-full md:w-24 pb-2 md:pb-0 md:pr-2 hide-scrollbar snap-x snap-mandatory shrink-0"
                >
                  <!-- Video Thumbnail -->
                  <div
                    *ngIf="product()?.videoUrl"
                    (click)="scrollToMedia(0)"
                    class="snap-start relative w-20 h-20 md:w-full md:h-24 rounded-lg overflow-hidden border-2 cursor-pointer transition-all shrink-0 bg-gray-100 flex items-center justify-center"
                    [class.border-primary-800]="selectedMediaIndex() === 0"
                    [class.border-transparent]="selectedMediaIndex() !== 0"
                  >
                    <div
                      class="absolute inset-0 bg-black/20 flex items-center justify-center z-10"
                    >
                      <svg
                        class="w-8 h-8 text-white drop-shadow-md"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                    <video
                      [src]="product()?.videoUrl"
                      autoplay
                      loop
                      muted
                      playsinline
                      class="w-full h-full object-cover opacity-50"
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
                    class="snap-start relative w-20 h-20 md:w-full md:h-24 bg-gray-50 rounded-lg overflow-hidden border-2 cursor-pointer hover:opacity-90 transition-all shrink-0"
                    [class.border-primary-800]="
                      selectedMediaIndex() === (product()?.videoUrl ? i + 1 : i)
                    "
                    [class.border-transparent]="
                      selectedMediaIndex() !== (product()?.videoUrl ? i + 1 : i)
                    "
                  >
                    <img
                      *ngIf="img"
                      [ngSrc]="img"
                      fill
                      sizes="100px"
                      class="object-cover"
                    />
                  </div>
                </div>

                <!-- Main Display Area -->
                <div
                  #scrollContainer
                  (scroll)="onGalleryScroll($event)"
                  id="main-media-scroll"
                  class="scroll-smooth order-1 md:order-2 flex-1 relative bg-white rounded-lg overflow-x-auto overflow-y-hidden snap-x snap-mandatory hide-scrollbar flex items-center border border-gray-100 aspect-square md:aspect-auto"
                >
                  <div class="absolute top-4 left-4 z-10 flex flex-col gap-2">
                    <!-- Stock Warning (Warm/Amber Glass) -->
                    <span
                      *ngIf="
                        (product()?.stock ?? 0) < 5 &&
                        (product()?.stock ?? 0) > 0
                      "
                      class="glass-tag glass-warning"
                    >
                      Only {{ product()?.stock }} left
                    </span>

                    <!-- Out of Stock (Red Glass) -->
                    <span
                      *ngIf="product()?.stock === 0"
                      class="glass-tag glass-error"
                    >
                      Out of Stock
                    </span>

                    <!-- Best Seller (Classic White Glass) -->
                    <span class="glass-tag glass-neutral"> Best Seller </span>
                  </div>

                  <!-- Video Item -->
                  <div
                    *ngIf="product()?.videoUrl"
                    class="w-full h-full shrink-0 snap-center flex items-center justify-center bg-black"
                  >
                    <video
                      [src]="product()?.videoUrl"
                      autoplay
                      loop
                      muted
                      playsinline
                      class="w-full h-full object-contain"
                    ></video>
                  </div>

                  <!-- Image Items -->
                  <div
                    *ngFor="let img of product()?.images || []; let i = index"
                    class="w-full h-full shrink-0 snap-center relative"
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

            <ng-template #productDetailsTpl>
              <!-- PRODUCT DETAILS (Moved Below Images) -->
              <div class="border-t border-gray-200 pt-8 mt-8 lg:mt-0">
                <h3 class="text-xl font-bold text-primary-800 mb-6 font-serif">
                  Product Details
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                  <!-- Dynamic Category Rendering -->
                  <ng-container [ngSwitch]="product()?.category">
                    <!-- Finished Jewelry -->
                    <ng-container *ngSwitchCase="'Jewelry'">
                      <div
                        *ngIf="
                          product()?.metalDetails ||
                          product()?.grossWeight ||
                          product()?.stoneDetails
                        "
                      >
                        <h4
                          class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3"
                        >
                          Product Specifications
                        </h4>
                        <div class="space-y-2 text-sm">
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.grossWeight"
                          >
                            <span class="text-gray-500">Gross Weight</span
                            ><span class="font-medium text-gray-900"
                              >{{ product()?.grossWeight }} g</span
                            >
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.metalDetails?.metalType"
                          >
                            <span class="text-gray-500">Metal Type</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.metalDetails?.metalType
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.metalDetails?.metalPurity"
                          >
                            <span class="text-gray-500">Purity</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.metalDetails?.metalPurity
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.metalColor"
                          >
                            <span class="text-gray-500">Metal Color</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.metalColor
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.metalDetails?.netWeight"
                          >
                            <span class="text-gray-500">Net Weight</span
                            ><span class="font-medium text-gray-900"
                              >{{ product()?.metalDetails?.netWeight }} g</span
                            >
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.dimensions"
                          >
                            <span class="text-gray-500">Dimensions</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.dimensions
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.bisHallmark"
                          >
                            <span class="text-gray-500">BIS Hallmark</span
                            ><span class="font-medium text-gray-900">Yes</span>
                          </div>
                        </div>

                        <ng-container *ngIf="product()?.stoneDetails?.length">
                          <h5
                            class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3 mt-4"
                          >
                            Stone Details
                          </h5>
                          <div class="space-y-3">
                            <div
                              *ngFor="let stone of product()?.stoneDetails"
                              class="bg-gray-50 p-3 rounded-md text-sm border border-gray-100"
                            >
                              <div class="grid grid-cols-2 gap-2">
                                <div>
                                  <span class="text-gray-500 block text-xs"
                                    >Type</span
                                  ><span class="font-medium text-gray-900">{{
                                    stone.stoneType || 'N/A'
                                  }}</span>
                                </div>
                                <div>
                                  <span class="text-gray-500 block text-xs"
                                    >Shape</span
                                  ><span class="font-medium text-gray-900">{{
                                    stone.shape || 'N/A'
                                  }}</span>
                                </div>
                                <div>
                                  <span class="text-gray-500 block text-xs"
                                    >Pieces</span
                                  ><span class="font-medium text-gray-900">{{
                                    stone.pieceCount || '0'
                                  }}</span>
                                </div>
                                <div>
                                  <span class="text-gray-500 block text-xs"
                                    >Carat Weight</span
                                  ><span class="font-medium text-gray-900"
                                    >{{
                                      stone.totalCaratWeight || '0'
                                    }}
                                    ct</span
                                  >
                                </div>
                              </div>
                            </div>
                          </div>
                        </ng-container>
                      </div>
                    </ng-container>

                    <!-- Loose Gemstones -->
                    <ng-container *ngSwitchCase="'Gemstones'">
                      <div *ngIf="product()?.shape || product()?.caratWeight">
                        <h4
                          class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3"
                        >
                          Gemstone Details
                        </h4>
                        <div class="space-y-2 text-sm">
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.species"
                          >
                            <span class="text-gray-500">Species</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.species
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.variety"
                          >
                            <span class="text-gray-500">Variety</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.variety
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.shape"
                          >
                            <span class="text-gray-500">Shape</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.shape
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.cut"
                          >
                            <span class="text-gray-500">Cut</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.cut
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.caratWeight"
                          >
                            <span class="text-gray-500">Carat Weight</span
                            ><span class="font-medium text-gray-900"
                              >{{ product()?.caratWeight }} ct</span
                            >
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.colorHue"
                          >
                            <span class="text-gray-500">Color Hue</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.colorHue
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.colorTradeTerm"
                          >
                            <span class="text-gray-500">Trade Color</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.colorTradeTerm
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.clarity"
                          >
                            <span class="text-gray-500">Clarity</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.clarity
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.measurements"
                          >
                            <span class="text-gray-500">Measurements</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.measurements
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.treatmentStatus"
                          >
                            <span class="text-gray-500">Treatment</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.treatmentStatus
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.originProvenance"
                          >
                            <span class="text-gray-500">Origin</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.originProvenance
                            }}</span>
                          </div>
                          <div
                            class="flex justify-between"
                            *ngIf="product()?.labReportNumber"
                          >
                            <span class="text-gray-500">Lab Report</span
                            ><span class="font-medium text-gray-900">{{
                              product()?.labReportNumber
                            }}</span>
                          </div>
                        </div>
                      </div>
                    </ng-container>

                    <!-- Dynamic Catch-all Specs -->
                    <ng-container *ngSwitchDefault>
                      <div *ngIf="productSpecs().length > 0">
                        <h4
                          class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3"
                        >
                          Product Specifications
                        </h4>
                        <div class="space-y-2 text-sm">
                          <div
                            class="flex justify-between"
                            *ngFor="let spec of productSpecs()"
                          >
                            <span class="text-gray-500 capitalize">{{
                              spec.key
                            }}</span>
                            <span
                              class="font-medium text-gray-900 text-right w-1/2"
                              >{{ spec.value }}</span
                            >
                          </div>
                        </div>
                      </div>
                    </ng-container>
                  </ng-container>
                </div>

                <!-- Diamond Details Table -->
                <div
                  *ngIf="product()?.specifications?.diamondDetails as dd"
                  class="mt-8"
                >
                  <h4
                    class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4"
                  >
                    Diamond Specifications
                  </h4>
                  <div
                    class="overflow-hidden border border-gray-200 rounded-lg"
                  >
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
                          <td class="px-4 py-3 font-medium text-gray-900">
                            {{ d.type }}
                          </td>
                          <td class="px-4 py-3 text-gray-600">{{ d.shape }}</td>
                          <td class="px-4 py-3 text-gray-600">
                            {{ d.carat }} ct
                          </td>
                          <td class="px-4 py-3 text-gray-600">
                            {{ d.color }} / {{ d.clarity }}
                          </td>
                          <td class="px-4 py-3 text-gray-600">
                            {{ d.settingType }}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </ng-template>

            <!-- Render details here only on large screens -->
            <div class="hidden lg:block">
              <ng-container
                *ngTemplateOutlet="productDetailsTpl"
              ></ng-container>
            </div>
          </div>

          <!-- RIGHT COLUMN: Sticky Buy Box -->
          <div class="lg:w-[42%] relative">
            <div
              class="sticky top-24 bg-white p-6 rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)] max-h-[calc(100vh-8rem)] overflow-y-auto hide-scrollbar"
            >
              <!-- Product Header -->
              <div class="mb-4">
                <div class="flex items-center justify-between mb-1">
                  <div class="flex items-center gap-1">
                    <span class="text-orange-400">★★★★☆</span>
                    <span class="text-xs text-gray-500"
                      >({{ product()?.reviewCount }} Reviews)</span
                    >
                  </div>
                  <span class="text-xs text-gray-400"
                    >SKU:
                    {{
                      product()?.specifications?.productDetails?.sku ||
                        product()?.sku
                    }}</span
                  >
                </div>
                <h1
                  class="text-2xl font-serif font-bold text-primary-900 leading-snug"
                >
                  {{ product()?.name }}
                </h1>
              </div>

              <!-- Price Section -->
              <div class="mb-6 pb-6 border-b border-gray-100">
                <div class="flex items-baseline gap-3 mb-1">
                  <span class="text-3xl font-bold text-gray-900">{{
                    currentPriceBreakup()?.total || currentPrice()
                      | currencyConvert
                  }}</span>
                  <span
                    *ngIf="product()?.originalPrice"
                    class="text-lg text-gray-400 line-through"
                    >{{ product()?.originalPrice || 0 | currencyConvert }}</span
                  >
                </div>
                <p class="text-xs text-green-700 font-medium mb-3">
                  Inclusive of all taxes
                </p>

                <!-- Price Breakup Toggle -->
                <button
                  *ngIf="hasPriceBreakup()"
                  (click)="togglePriceBreakup()"
                  class="text-xs font-bold text-secondary-600 hover:text-secondary-800 flex items-center gap-1 uppercase tracking-wide mt-2"
                >
                  View Price Breakup
                  <span
                    class="transition-transform"
                    [class.rotate-180]="showPriceBreakup()"
                    >▼</span
                  >
                </button>

                <!-- Transparent Price Breakdown Accordion -->
                <div
                  *ngIf="showPriceBreakup() && hasPriceBreakup()"
                  class="mt-4 bg-white border border-gray-200 shadow-sm p-4 rounded-lg text-sm text-gray-700 animate-fade-in transition-all duration-300"
                >
                  <h4
                    class="font-semibold text-gray-900 mb-3 border-b border-gray-100 pb-2"
                  >
                    Price Breakdown
                  </h4>
                  <div class="space-y-3">
                    <div class="flex justify-between items-center">
                      <span class="flex items-center gap-2"
                        ><svg
                          class="w-4 h-4 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          ></path>
                        </svg>
                        Metal</span
                      >
                      <span class="font-medium">{{
                        currentPriceBreakup()!.metal | currencyConvert
                      }}</span>
                    </div>
                    <div class="flex justify-between items-center">
                      <span class="flex items-center gap-2"
                        ><svg
                          class="w-4 h-4 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                          ></path>
                        </svg>
                        Stones</span
                      >
                      <span class="font-medium">{{
                        currentPriceBreakup()!.gemstone | currencyConvert
                      }}</span>
                    </div>
                    <div class="flex justify-between items-center">
                      <span class="flex items-center gap-2"
                        ><svg
                          class="w-4 h-4 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                          ></path>
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          ></path>
                        </svg>
                        Making Charges</span
                      >
                      <span class="font-medium">{{
                        currentPriceBreakup()!.makingCharges | currencyConvert
                      }}</span>
                    </div>
                    <div class="flex justify-between items-center">
                      <span class="flex items-center gap-2"
                        ><svg
                          class="w-4 h-4 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2zM10 8.5a.5.5 0 11-1 0 .5.5 0 011 0zm5 5a.5.5 0 11-1 0 .5.5 0 011 0z"
                          ></path>
                        </svg>
                        Tax (3%)</span
                      >
                      <span class="font-medium">{{
                        currentPriceBreakup()!.tax | currencyConvert
                      }}</span>
                    </div>
                    <div
                      class="flex justify-between items-center pt-3 border-t border-gray-200 mt-2"
                    >
                      <span class="font-bold text-gray-900 text-base"
                        >Grand Total</span
                      >
                      <span class="font-bold text-secondary-600 text-lg">{{
                        currentPriceBreakup()!.total | currencyConvert
                      }}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Customization Configurator -->
              <div class="space-y-5 mb-8">
                <!-- Metal -->
                <div *ngIf="hasOption('metal')">
                  <span
                    class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2"
                    >Metal Color & Purity</span
                  >
                  <div class="flex flex-wrap gap-2">
                    <button
                      *ngFor="let opt of getOptions('metal')"
                      (click)="selectedMetal.set(opt)"
                      class="px-4 py-2 rounded-full border text-sm font-medium transition-all"
                      [class.bg-primary-800]="selectedMetal()?.id === opt.id"
                      [class.text-white]="selectedMetal()?.id === opt.id"
                      [class.border-primary-800]="
                        selectedMetal()?.id === opt.id
                      "
                      [class.bg-white]="selectedMetal()?.id !== opt.id"
                      [class.text-gray-700]="selectedMetal()?.id !== opt.id"
                      [class.border-gray-200]="selectedMetal()?.id !== opt.id"
                    >
                      {{ opt.name }}
                    </button>
                  </div>
                </div>

                <!-- Diamond -->
                <div *ngIf="hasOption('diamond')">
                  <div class="flex justify-between mb-2">
                    <span
                      class="text-xs font-bold text-gray-500 uppercase tracking-wider"
                      >Diamond Quality</span
                    >
                    <button class="text-xs text-secondary-600 underline">
                      Guide
                    </button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      *ngFor="let opt of getOptions('diamond')"
                      (click)="selectedDiamondQuality.set(opt)"
                      class="flex-1 px-3 py-2 rounded border text-center text-xs font-medium transition-all"
                      [class.border-primary-800]="
                        selectedDiamondQuality()?.id === opt.id
                      "
                      [class.text-primary-800]="
                        selectedDiamondQuality()?.id === opt.id
                      "
                      [class.bg-primary-50]="
                        selectedDiamondQuality()?.id === opt.id
                      "
                      [class.border-gray-200]="
                        selectedDiamondQuality()?.id !== opt.id
                      "
                      [class.text-gray-600]="
                        selectedDiamondQuality()?.id !== opt.id
                      "
                    >
                      {{ opt.name }}
                    </button>
                  </div>
                </div>

                <!-- Size -->
                <div *ngIf="isRingCategory()">
                  <div class="flex justify-between mb-2">
                    <span
                      class="text-xs font-bold text-gray-500 uppercase tracking-wider"
                      >Ring Size</span
                    >
                    <button
                      (click)="sizeGuideOpen.set(true)"
                      class="text-xs text-secondary-600 underline"
                    >
                      Size Guide
                    </button>
                  </div>
                  <select
                    [ngModel]="selectedSize()"
                    (ngModelChange)="selectedSize.set($event)"
                    class="w-full p-3 border border-gray-200 rounded-lg bg-white text-sm focus:border-primary-800 outline-none"
                  >
                    <option [ngValue]="null">Select Size</option>
                    <option
                      *ngFor="
                        let i of [
                          6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
                          20,
                        ]
                      "
                      [ngValue]="i"
                    >
                      Size {{ i }}
                    </option>
                  </select>
                </div>
              </div>

              <!-- Delivery -->
              <div class="mb-6">
                <div class="relative">
                  <input
                    type="text"
                    [ngModel]="pincode()"
                    (ngModelChange)="pincode.set($event)"
                    placeholder="Enter Pincode for Delivery"
                    class="w-full pl-4 pr-20 py-3 border border-gray-200 rounded-lg text-sm focus:border-primary-800 outline-none"
                  />
                  <button
                    (click)="checkDelivery()"
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-primary-800 px-3 py-1.5 hover:bg-gray-50 rounded"
                  >
                    CHECK
                  </button>
                </div>
                <p
                  *ngIf="deliveryDate()"
                  class="text-xs text-green-700 font-medium mt-2 pl-1"
                >
                  Expected delivery by {{ deliveryDate() }}
                </p>
              </div>

              <!-- Actions -->
              <div class="flex flex-col gap-3">
                <div class="flex gap-3">
                  <button
                    (click)="handleAddToCart()"
                    [disabled]="product()?.stock === 0"
                    class="flex-1 bg-gradient-to-r from-primary-800 to-primary-600 text-white font-bold py-4 rounded-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.99] uppercase tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {{
                      product()?.stock === 0 ? 'Out of Stock' : 'Add to Cart'
                    }}
                  </button>
                  <button
                    (click)="handleBuyNow()"
                    [disabled]="product()?.stock === 0"
                    class="flex-1 bg-white border-2 border-primary-800 text-primary-800 font-bold py-4 rounded-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.99] uppercase tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Buy Now
                  </button>
                </div>
                <button
                  (click)="openTryAtHome()"
                  class="w-full border border-secondary-600 text-primary-800 font-bold py-3 rounded-lg hover:bg-secondary-50 transition-colors uppercase tracking-wider text-xs flex items-center justify-center gap-2"
                >
                  <span>🏠</span> Book Try at Home
                </button>
              </div>

              <!-- Trust Badges (Moved to Buy Box) -->
              <div class="flex flex-wrap gap-2 mt-6">
                <div
                  class="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg w-full sm:w-auto"
                >
                  <span class="text-lg">🛡️</span> 15-Day Money Back
                </div>
                <div
                  class="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg w-full sm:w-auto"
                >
                  <span class="text-lg">💎</span> Lifetime Exchange
                </div>
                <div
                  class="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg w-full sm:w-auto"
                >
                  <span class="text-lg">📜</span> BIS Hallmarked
                </div>
              </div>

              <div
                class="mt-6 pt-4 border-t border-gray-100 flex justify-center gap-6 text-xs font-medium text-gray-500"
              >
                <a
                  routerLink="/contact"
                  class="hover:text-primary-800 transition-colors"
                  >Contact Us</a
                >
                <span>|</span>
                <button
                  (click)="openWhatsApp()"
                  class="hover:text-primary-800 transition-colors"
                >
                  Chat on WhatsApp
                </button>
              </div>
            </div>
          </div>

          <!-- Render details here only on small screens -->
          <div class="block lg:hidden mt-8 w-full">
            <ng-container *ngTemplateOutlet="productDetailsTpl"></ng-container>
          </div>

          <!-- Sticky Mobile Add to Cart Bar -->
          <div
            class="lg:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 p-4 shadow-[0_-4px_10px_rgb(0,0,0,0.05)] z-40 flex items-center justify-between gap-4 animate-fade-in-up"
          >
            <div>
              <p class="text-xs text-gray-500 mb-0.5 truncate max-w-[150px]">
                {{ product()?.name }}
              </p>
              <p class="font-bold text-gray-900 text-lg leading-none">
                {{
                  currentPriceBreakup()?.total || currentPrice()
                    | currencyConvert
                }}
              </p>
            </div>
            <button
              (click)="handleAddToCart()"
              [disabled]="product()?.stock === 0"
              class="bg-gradient-to-r from-primary-800 to-primary-600 text-white font-bold py-3 px-8 rounded-lg shadow-md hover:shadow-lg active:scale-95 transition-all text-sm uppercase tracking-wider flex-shrink-0"
            >
              {{ product()?.stock === 0 ? 'Out of Stock' : 'Add to Cart' }}
            </button>
          </div>
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
          class="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative"
        >
          <button
            (click)="tryAtHomeOpen.set(false)"
            class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl z-10"
          >
            &times;
          </button>
          <div
            class="bg-gradient-to-r from-primary-800 to-primary-950 text-white p-6 text-center"
          >
            <h3 class="font-serif font-bold text-xl">Book Try at Home</h3>
          </div>
          <div class="p-6 space-y-4">
            <p class="text-sm text-gray-600 text-center mb-4">
              Our consultant will bring this jewellery to your doorstep.
            </p>
            <input type="date" class="w-full p-2 border rounded" />
            <button
              (click)="confirmTryAtHome()"
              class="w-full bg-primary-800 text-white py-3 rounded font-bold"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        overflow-x: hidden;
      }

      .hide-scrollbar::-webkit-scrollbar {
        width: 4px;
      }
      .hide-scrollbar::-webkit-scrollbar-thumb {
        background: #e5e7eb;
        border-radius: 10px;
      }

      .glass-tag {
        padding: 0.375rem 0.75rem;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-radius: 0.5rem;
        border-width: 1px;
        box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        display: inline-flex;
        align-items: center;
      }

      /* Neutral/White Glass */
      .glass-neutral {
        background-color: rgb(255 255 255 / 0.7);
        border-color: rgb(255 255 255 / 0.4);
        color: rgb(31 41 55);
      }

      /* Warning/Low Stock Glass */
      .glass-warning {
        background-color: rgb(255 247 237 / 0.6);
        border-color: rgb(254 215 170 / 0.5);
        color: rgb(194 65 12);
      }

      /* Error/OOS Glass */
      .glass-error {
        background-color: rgb(254 242 242 / 0.6);
        border-color: rgb(254 202 202 / 0.5);
        color: rgb(185 28 28);
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
  private currencyService = inject(CurrencyService);
  private sanitizer = inject(DomSanitizer);

  loading = signal(true);
  product = signal<ProductDetail | null>(null);
  productSchema = signal<SafeHtml>('');

  // UI State
  selectedImage = signal<string | null>(null);
  selectedMediaIndex = signal<number>(0);
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
    if (calculatedSubtotal === 0 || (baseProductPrice > 0 && Math.abs(calculatedSubtotal - baseProductPrice) > (baseProductPrice * 0.1))) {
        // Assume the entire price is just "gemstone/product cost" if breakup is missing/wrong
        gemstonePrice = baseProductPrice;
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
    this.route.params.subscribe((p) => {
      if (p['id']) {
        this.loadProduct(p['id']);
      }
    });
  }

  ngOnDestroy(): void {}

  private loadProduct(id: string): void {
    this.loading.set(true);
    this.productService.getProductById(id).subscribe({
      next: (p) => {
        this.product.set(p);
        this.historyService.add(p);
        this.loading.set(false);
        this.selectedImage.set(null);
        if (p.customizationOptions) {
          this.selectedMetal.set(
            p.customizationOptions.find(
              (o) => o.type === 'metal' && o.priceModifier === 0,
            ) || null,
          );
          this.selectedDiamondQuality.set(
            p.customizationOptions.find(
              (o) => o.type === 'diamond' && o.priceModifier === 0,
            ) || null,
          );
        }
        const schema = {
          '@context': 'https://schema.org/',
          '@type': 'Product',
          name: p.name,
          image: p.images?.length ? p.images : [p.imageUrl],
          description: p.description || p.name,
          sku: p.sku || p.specifications?.productDetails?.sku,
          offers: {
            '@type': 'Offer',
            url: 'https://www.caratloop.com/products/' + p.id,
            priceCurrency: 'INR',
            price: p.price,
            availability:
              p.stock > 0
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
            hasMerchantReturnPolicy: {
              '@type': 'MerchantReturnPolicy',
              applicableCountry: 'IN',
              returnPolicyCategory:
                'https://schema.org/MerchantReturnFiniteReturnWindow',
              merchantReturnDays: 30,
              returnMethod: 'https://schema.org/ReturnByMail',
              returnFees: 'https://schema.org/FreeReturn',
            },
          },
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: '4.8',
            reviewCount: p.reviewCount || 10,
          },
        };
        this.productSchema.set(
          this.sanitizer.bypassSecurityTrustHtml(
            '<script type="application/ld+json">' +
              JSON.stringify(schema).replace(/</g, '\\u003c') +
              '</script>',
          ),
        );
      },
      error: () => this.loading.set(false),
    });
  }

  handleAddToCart(): void {
    if (this.product()) {
      const options = {
        metal: this.selectedMetal()?.name,
        diamond: this.selectedDiamondQuality()?.name,
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
      const options = {
        metal: this.selectedMetal()?.name,
        diamond: this.selectedDiamondQuality()?.name,
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

  openWhatsApp(): void {
    const p = this.product();
    if (!p) return;
    const text = `Hi, I am interested in ${p.name} (SKU: ${p.specifications?.productDetails?.sku || p.sku}). Can you help me?`;
    const url = `https://wa.me/${environment.whatsappNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  togglePriceBreakup() {
    this.showPriceBreakup.set(!this.showPriceBreakup());
  }
  openTryAtHome() {
    this.tryAtHomeOpen.set(true);
  }
  confirmTryAtHome() {
    this.tryAtHomeOpen.set(false);
    this.toastService.show('Booking Confirmed! Check your email.', 'success');
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
    // Check if there is valid numerical data beyond just 0
    return (
      pb.metal > 0 || pb.gemstone > 0 || pb.makingCharges > 0 || pb.total > 0
    );
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
}
