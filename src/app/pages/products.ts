import { Component, OnInit, signal, computed, inject, ChangeDetectionStrategy, DestroyRef, WritableSignal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { ActivatedRoute, RouterLink, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { SeoService } from '../services/seo.service';
import { ProductService, ProductFilters, ProductSort } from "../services/product.service";
import { CartService } from "../services/cart.service";
import { WishlistService } from "../services/wishlist.service";
import { AuthService } from "../services/auth.service";
import { Product, ProductDetail, ProductFacets } from "../core/models";
import { CompareService } from '../services/compare.service';
import { QuickViewModalComponent } from '../components/quick-view-modal';
import { ToastService } from '../services/toast.service';
import { CategoryLabelService } from '../services/category-label.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import { unitLabel, unitRate, totalSuffix, secondaryLine, gemGradeLabel } from '../core/product-display';

type ListFilter = 'subCategory' | 'metal' | 'stone' | 'designStyle' | 'occasion' | 'style' | 'gemGrade' | 'craft';

interface PriceRange {
  id: string;
  min: number;
  max: number | null;
}

const EMPTY_FACETS: ProductFacets = {
  categories: [],
  subCategories: [],
  metals: [],
  stones: [],
  designStyles: [],
  occasions: [],
  styles: [],
  gemGrades: [],
  crafts: [],
  saleModes: [],
  priceMin: null,
  priceMax: null,
};

@Component({
  selector: "app-products",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, QuickViewModalComponent, NgOptimizedImage, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- APPLE DESIGN SYSTEM: FINE JEWELRY ARCHIVES (100% SCREEN UTILIZATION) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">

      <!-- Top Parchment Header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-12 px-6 text-center">
        <div class="max-w-[980px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-2 block">Caratloop Fine Jewelry</span>
          <h1 class="font-display font-semibold text-3xl sm:text-4xl md:text-5xl text-[#1d1d1f] tracking-tight leading-tight mb-3">
            Fine Jewels & Gemstones.
          </h1>
          <p class="font-sans text-base md:text-lg text-[#7a7a7a] font-normal max-w-xl mx-auto">
            Certified ethical diamonds, 18K solid gold, and hand-selected natural gems.
          </p>
        </div>
      </section>

      <!-- Sticky Apple Option Chip Carousel Bar (Tier 2 Sub-Nav) -->
      <nav class="sub-nav-frosted sticky top-[96px] z-30 py-3.5 px-4 md:px-12 border-b border-[#e0e0e0]">
        <div class="max-w-[1440px] mx-auto flex items-center justify-between gap-4">

          <!-- Category Option Chips (Horizontal Scrollable) -->
          <div class="flex items-center space-x-2 overflow-x-auto hide-scrollbar py-1 text-xs">
            <button
              (click)="toggleCategory('all')"
              [class.bg-white]="selectedCategories().length === 0"
              [class.border-[#D4AF37]]="selectedCategories().length === 0"
              [class.border-2]="selectedCategories().length === 0"
              [class.text-[#1d1d1f]]="selectedCategories().length === 0"
              [class.font-semibold]="selectedCategories().length === 0"
              [class.text-[#7a7a7a]]="selectedCategories().length > 0"
              class="px-4 py-2 rounded-full border border-[#e0e0e0] whitespace-nowrap active-press transition-all hover:text-[#1d1d1f]"
            >
              All Collections
            </button>

            <button
              *ngFor="let cat of facets().categories"
              (click)="toggleCategory(cat)"
              [class.bg-white]="isCategorySelected(cat)"
              [class.border-[#D4AF37]]="isCategorySelected(cat)"
              [class.border-2]="isCategorySelected(cat)"
              [class.text-[#1d1d1f]]="isCategorySelected(cat)"
              [class.font-semibold]="isCategorySelected(cat)"
              [class.text-[#7a7a7a]]="!isCategorySelected(cat)"
              class="px-4 py-2 rounded-full border border-[#e0e0e0] whitespace-nowrap active-press transition-all hover:text-[#1d1d1f]"
            >
              {{ categoryLabels.label(cat) }}
            </button>
          </div>

          <!-- Quick Action: Ring Builder -->
          <a routerLink="/builder" class="btn-apple-pill text-xs !py-1.5 !px-4 hidden sm:inline-flex whitespace-nowrap flex-shrink-0">
            ✦ Custom Studio
          </a>

        </div>
      </nav>

      <!-- Utility Filter Control Bar (100% Screen Width) -->
      <section class="bg-white border-b border-[#e0e0e0] py-4 px-4 md:px-12">
        <div class="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">

          <!-- Left Controls: Search Pill & Quick Metals -->
          <div class="flex flex-wrap items-center gap-3">

            <!-- Pill Search Input -->
            <div class="relative w-48 sm:w-64">
              <input
                type="text"
                [(ngModel)]="searchQuery"
                (keyup.enter)="onSearch()"
                placeholder="Search gems, rings..."
                aria-label="Search products"
                class="w-full bg-[#f5f5f7] border border-[#e0e0e0] rounded-full pl-9 pr-4 py-2 text-xs text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37] transition-colors"
              />
              <svg class="w-4 h-4 text-[#7a7a7a] absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>

            <!-- Metal Quick Chips -->
            <div *ngIf="facets().metals.length > 0" class="hidden lg:flex items-center space-x-2">
              <button
                *ngFor="let metal of facets().metals"
                (click)="toggleFilter('metal', metal)"
                [attr.aria-pressed]="selectedMetals().includes(metal)"
                [class.bg-[#1d1d1f]]="selectedMetals().includes(metal)"
                [class.text-white]="selectedMetals().includes(metal)"
                [class.border-[#1d1d1f]]="selectedMetals().includes(metal)"
                class="px-3 py-1.5 rounded-full border border-[#e0e0e0] text-[11px] text-[#7a7a7a] hover:text-[#1d1d1f] transition-all"
              >
                {{ metal }}
              </button>
            </div>

            <!-- Active Filters Badge & Clear Pill -->
            <button
              *ngIf="activeFilterCount() > 0"
              (click)="clearFilters()"
              class="px-3 py-1.5 rounded-full bg-[#D4AF37]/10 text-[#D4AF37] font-medium border border-[#D4AF37]/30 hover:bg-[#D4AF37]/20 transition-all flex items-center gap-1.5"
            >
              <span>Reset Filters ({{ activeFilterCount() }})</span>
              <span>✕</span>
            </button>

          </div>

          <!-- Right Controls: Refine Modal Trigger & Sort -->
          <div class="flex items-center space-x-3 ml-auto">

            <!-- Refine Drawer Toggle Pill -->
            <button
              (click)="isFilterOpen.set(true)"
              class="btn-apple-dark text-xs !py-2 !px-4 flex items-center gap-2"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
              </svg>
              <span>Filters</span>
              <span *ngIf="activeFilterCount() > 0" class="bg-[#D4AF37] text-black text-[10px] font-bold px-1.5 rounded-full">
                {{ activeFilterCount() }}
              </span>
            </button>

            <!-- Sort Selector Pill -->
            <div class="relative">
              <select
                [(ngModel)]="sortBy"
                (change)="loadProducts()"
                aria-label="Sort products"
                class="bg-white border border-[#e0e0e0] rounded-full px-4 py-2 text-xs text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37] appearance-none pr-8 cursor-pointer"
              >
                <option value="newest">Sort: Newest</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
                <option value="name">Name: A to Z</option>
              </select>
              <span class="absolute right-3 top-2.5 pointer-events-none text-[#7a7a7a]">▾</span>
            </div>

          </div>

        </div>
      </section>

      <!-- Main Content: Full Screen Width 4-Column Utility Grid (100% Screen Utilization) -->
      <div class="max-w-[1440px] mx-auto px-4 md:px-12 py-8">

        <!-- Results Counter Bar -->
        <div class="flex justify-between items-center mb-6 text-xs text-[#7a7a7a]">
          <p>
            Showing <span class="font-semibold text-[#1d1d1f]">{{ paginationInfo().start }}-{{ paginationInfo().end }}</span> of
            <span class="font-semibold text-[#1d1d1f]">{{ pagination().totalItems }}</span> luxury items
          </p>
        </div>

        <!-- Skeleton Loader -->
        <div *ngIf="isLoading()" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-12">
          <div *ngFor="let item of [1,2,3,4,5,6,7,8]" class="store-utility-card animate-pulse">
            <div class="w-full aspect-square bg-[#f5f5f7] rounded-[12px] mb-4"></div>
            <div class="h-4 bg-[#f5f5f7] rounded w-3/4 mb-2"></div>
            <div class="h-5 bg-[#f5f5f7] rounded w-1/2 mb-4"></div>
            <div class="h-9 bg-[#f5f5f7] rounded-full w-full"></div>
          </div>
        </div>

        <!-- Products 4-Column Grid -->
        <div *ngIf="!isLoading()" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-12">
          <article *ngFor="let product of products(); trackBy: trackByProductId" [routerLink]="['/products', product.id]" class="store-utility-card cursor-pointer group flex flex-col justify-between">
            <div>
              <!-- Image Viewport with Surface Product Shadow -->
              <div class="relative overflow-hidden aspect-square bg-[#f5f5f7] rounded-[12px] mb-4">
                <img *ngIf="product.imageUrl || product.images?.[0]" [ngSrc]="product.imageUrl || product.images?.[0] || ''" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" [alt]="product.name">
                <div *ngIf="!product.imageUrl && !product.images?.[0]" class="w-full h-full flex items-center justify-center text-[#D4AF37] p-8">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-16 h-16"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22a8 8 0 100-16 8 8 0 000 16zm0-16V2m-3 2h6M9 6l3-4 3 4" /></svg>
                </div>

                <!-- Circular Floating Translucent Actions -->
                <button
                  (click)="handleWishlist($event, product.id)"
                  [attr.aria-pressed]="wishlistService.has(product.id)"
                  [attr.aria-label]="wishlistService.has(product.id) ? 'Remove from wishlist' : 'Add to wishlist'"
                  [title]="wishlistService.has(product.id) ? 'Saved' : 'Wishlist'"
                  [class.text-[#D4AF37]]="wishlistService.has(product.id)"
                  [class.text-[#1d1d1f]]="!wishlistService.has(product.id)"
                  class="absolute top-3 left-3 w-8 h-8 bg-white/80 hover:bg-white rounded-full flex items-center justify-center backdrop-blur-md transition-all active-press shadow-sm">
                  <svg class="w-3.5 h-3.5" [attr.fill]="wishlistService.has(product.id) ? 'currentColor' : 'none'" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                  </svg>
                </button>
                <button (click)="handleAddToCompare($event, product)" class="absolute top-3 right-3 w-8 h-8 bg-white/80 hover:bg-white text-[#1d1d1f] rounded-full flex items-center justify-center backdrop-blur-md transition-all active-press shadow-sm" title="Compare" aria-label="Add to compare">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
                </button>
              </div>

              <!-- Meta & Name -->
              <div class="flex justify-between items-start mb-1">
                <span class="text-[11px] text-[#7a7a7a] uppercase font-mono tracking-wider block">
                  {{ categoryLabels.label(product.category) }}
                </span>
                <span *ngIf="product.isBestSeller || (product.reviewCount && product.reviewCount > 50)" class="bg-[#D4AF37]/15 text-[#D4AF37] text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase">Best Seller</span>
              </div>

              <h3 class="font-sans font-semibold text-base text-[#1d1d1f] group-hover:text-[#D4AF37] transition-colors mb-2 line-clamp-2">
                {{ product.name }}
              </h3>

              <!-- Price -->
              <div class="mb-3">
                <span class="text-lg font-semibold text-[#1d1d1f]">
                  {{ product.price | currencyConvert }}<span *ngIf="totalSuffix(product)" class="text-xs font-normal text-[#7a7a7a] ml-1">{{ totalSuffix(product) }}</span>
                </span>
                <span *ngIf="unitRate(product) as rate" class="block text-xs text-[#7a7a7a] mt-0.5">
                  {{ rate | currencyConvert }} {{ unitLabel(product) }}
                </span>
                <span *ngIf="secondaryLine(product)" class="block text-xs text-[#7a7a7a] mt-0.5">
                  {{ secondaryLine(product) }}
                </span>
              </div>

              <!-- Stock Alert -->
              <div *ngIf="product.stock !== undefined && product.stock <= 5 && product.stock > 0" class="mb-2 text-xs text-amber-600 font-medium">
                Only {{ product.stock }} left in stock
              </div>
              <div *ngIf="(product.stock ?? 1) <= 0" class="mb-2">
                <span class="inline-flex items-center bg-[#1d1d1f] text-white text-[11px] font-semibold px-3 py-1 rounded-full">Sold out</span>
              </div>
            </div>

            <!-- Apple Pill Action Buttons -->
            <div class="flex gap-2 pt-4 border-t border-[#f0f0f0]">
              <button
                (click)="handleAddToCart($event, product)"
                [disabled]="(product.stock ?? 1) <= 0"
                [attr.aria-disabled]="(product.stock ?? 1) <= 0 ? 'true' : null"
                class="flex-1 btn-apple-pill text-xs !py-2 !px-3 disabled:opacity-50"
              >
                {{ (product.stock ?? 1) <= 0 ? 'Sold out' : 'Add to Bag' }}
              </button>
              <button
                (click)="handleBuyNow($event, product)"
                [disabled]="(product.stock ?? 1) <= 0"
                class="btn-apple-pill-secondary text-xs !py-2 !px-3 disabled:opacity-50"
              >
                Buy
              </button>
            </div>
          </article>
        </div>

        <!-- Empty State -->
        <div *ngIf="!isLoading() && products().length === 0" class="text-center py-24 bg-[#f5f5f7] rounded-[18px] border border-[#e0e0e0]">
          <div class="text-6xl mb-4">💎</div>
          <h3 class="text-2xl font-display font-semibold text-[#1d1d1f] mb-2">No matching artifacts found</h3>
          <p class="text-sm text-[#7a7a7a] mb-6">Try selecting a different category or clearing active filters.</p>
          <button (click)="clearFilters()" class="btn-apple-pill">Reset All Filters</button>
        </div>

        <!-- Pagination Controls -->
        <div *ngIf="!isLoading() && products().length > 0" class="flex flex-col sm:flex-row justify-between items-center gap-4 border-t border-[#e0e0e0] pt-6">
          <div class="flex items-center gap-2 text-xs text-[#7a7a7a]">
            <label for="products-page-size">Items per page:</label>
            <select id="products-page-size" [(ngModel)]="pagination().pageSize" (change)="onPageSizeChange()" aria-label="Items per page" class="bg-white border border-[#e0e0e0] rounded-full px-3 py-1 text-xs">
              <option value="12">12</option>
              <option value="24">24</option>
              <option value="48">48</option>
            </select>
          </div>

          <div class="flex items-center gap-2">
            <button
              (click)="previousPage()"
              [disabled]="pagination().currentPage <= 1"
              aria-label="Previous page"
              class="w-9 h-9 rounded-full border border-[#e0e0e0] flex items-center justify-center text-sm disabled:opacity-30 hover:bg-[#f5f5f7] transition-colors"
            >
              ‹
            </button>
            <span class="text-xs text-[#7a7a7a] px-2">Page {{ pagination().currentPage }} of {{ pagination().totalPages }}</span>
            <button
              (click)="nextPage()"
              [disabled]="pagination().currentPage >= pagination().totalPages"
              aria-label="Next page"
              class="w-9 h-9 rounded-full border border-[#e0e0e0] flex items-center justify-center text-sm disabled:opacity-30 hover:bg-[#f5f5f7] transition-colors"
            >
              ›
            </button>
          </div>
        </div>
      </div>

      <!-- APPLE REFINE SLIDE-OVER DRAWER (MODAL) -->
      <div *ngIf="isFilterOpen()" class="fixed inset-0 z-50 overflow-hidden animate-fadeIn">
        <div (click)="isFilterOpen.set(false)" class="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"></div>

        <div class="absolute inset-y-0 right-0 max-w-full flex pl-10">
          <div class="w-screen max-w-md bg-white shadow-2xl flex flex-col justify-between p-6 overflow-y-auto">

            <!-- Drawer Header -->
            <div>
              <div class="flex items-center justify-between border-b border-[#e0e0e0] pb-4 mb-6">
                <div>
                  <h3 class="font-display font-semibold text-xl text-[#1d1d1f]">Refine Jewelry</h3>
                  <p class="text-xs text-[#7a7a7a]">Filter by price, certifications, metals, and gemstones.</p>
                </div>
                <button (click)="isFilterOpen.set(false)" aria-label="Close filters" class="w-8 h-8 rounded-full bg-[#f5f5f7] flex items-center justify-center text-xs text-[#1d1d1f] hover:bg-[#e0e0e0]">
                  ✕
                </button>
              </div>

              <!-- Price Ranges -->
              <div class="mb-6">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Price Tier</h4>
                <div class="space-y-2">
                  <label *ngFor="let range of priceRanges" class="flex items-center gap-3 cursor-pointer text-xs text-[#333333] hover:text-[#1d1d1f]">
                    <input
                      type="checkbox"
                      [checked]="selectedPriceRanges().includes(range.id)"
                      (change)="togglePriceRange(range.id)"
                      class="rounded border-[#e0e0e0] text-[#D4AF37] focus:ring-[#D4AF37]"
                    />
                    <span *ngIf="range.min === 0 && range.max !== null">Under {{ range.max | currencyConvert }}</span>
                    <span *ngIf="range.min > 0 && range.max !== null">{{ range.min | currencyConvert }} – {{ range.max | currencyConvert }}</span>
                    <span *ngIf="range.max === null">{{ range.min | currencyConvert }}+</span>
                  </label>
                </div>
              </div>

              <!-- Collection / Sub-category -->
              <div class="mb-6" *ngIf="facets().subCategories.length > 0">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Collection</h4>
                <div class="flex flex-wrap gap-2">
                  <button
                    *ngFor="let sub of facets().subCategories"
                    (click)="toggleFilter('subCategory', sub)"
                    [attr.aria-pressed]="selectedSubCategories().includes(sub)"
                    [class.bg-[#D4AF37]]="selectedSubCategories().includes(sub)"
                    [class.text-black]="selectedSubCategories().includes(sub)"
                    [class.font-semibold]="selectedSubCategories().includes(sub)"
                    class="px-3 py-1.5 rounded-full border border-[#e0e0e0] text-xs text-[#333333] transition-all"
                  >
                    {{ sub }}
                  </button>
                </div>
              </div>

              <!-- Metal Types -->
              <div class="mb-6" *ngIf="facets().metals.length > 0">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Metal Type</h4>
                <div class="flex flex-wrap gap-2">
                  <button
                    *ngFor="let metal of facets().metals"
                    (click)="toggleFilter('metal', metal)"
                    [attr.aria-pressed]="selectedMetals().includes(metal)"
                    [class.bg-[#D4AF37]]="selectedMetals().includes(metal)"
                    [class.text-black]="selectedMetals().includes(metal)"
                    [class.font-semibold]="selectedMetals().includes(metal)"
                    class="px-3 py-1.5 rounded-full border border-[#e0e0e0] text-xs text-[#333333] transition-all"
                  >
                    {{ metal }}
                  </button>
                </div>
              </div>

              <!-- Certification -->
              <div class="mb-6">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Gem Certificate</h4>
                <label class="flex items-center gap-3 cursor-pointer text-xs text-[#333333] hover:text-[#1d1d1f]">
                  <input
                    type="checkbox"
                    [checked]="certifiedOnly()"
                    (change)="toggleCertified()"
                    class="rounded border-[#e0e0e0] text-[#D4AF37] focus:ring-[#D4AF37]"
                  />
                  <span>Certified only (lab report or certificate on file)</span>
                </label>
              </div>

              <!-- Gemstone Types -->
              <div class="mb-6" *ngIf="facets().stones.length > 0">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Gemstone Spec</h4>
                <div class="space-y-2 max-h-40 overflow-y-auto hide-scrollbar">
                  <label *ngFor="let gemstone of facets().stones" class="flex items-center gap-3 cursor-pointer text-xs text-[#333333]">
                    <input
                      type="checkbox"
                      [checked]="selectedGemstones().includes(gemstone)"
                      (change)="toggleFilter('stone', gemstone)"
                      class="rounded border-[#e0e0e0] text-[#D4AF37] focus:ring-[#D4AF37]"
                    />
                    <span>{{ gemstone }}</span>
                  </label>
                </div>
              </div>

              <!-- Stone Grade -->
              <div class="mb-6" *ngIf="facets().gemGrades?.length">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Stone Grade</h4>
                <div class="flex flex-wrap gap-2">
                  <button
                    *ngFor="let grade of facets().gemGrades"
                    (click)="toggleFilter('gemGrade', grade)"
                    [attr.aria-pressed]="selectedGemGrades().includes(grade)"
                    [class.bg-[#D4AF37]]="selectedGemGrades().includes(grade)"
                    [class.text-black]="selectedGemGrades().includes(grade)"
                    [class.font-semibold]="selectedGemGrades().includes(grade)"
                    class="px-3 py-1.5 rounded-full border border-[#e0e0e0] text-xs text-[#333333] transition-all"
                  >
                    {{ gemGradeLabel(grade) }}
                  </button>
                </div>
              </div>

              <!-- Craft -->
              <div class="mb-6" *ngIf="facets().crafts?.length">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Craft</h4>
                <div class="flex flex-wrap gap-2">
                  <button
                    *ngFor="let craft of facets().crafts"
                    (click)="toggleFilter('craft', craft)"
                    [attr.aria-pressed]="selectedCrafts().includes(craft)"
                    [class.bg-[#D4AF37]]="selectedCrafts().includes(craft)"
                    [class.text-black]="selectedCrafts().includes(craft)"
                    [class.font-semibold]="selectedCrafts().includes(craft)"
                    class="px-3 py-1.5 rounded-full border border-[#e0e0e0] text-xs text-[#333333] transition-all"
                  >
                    {{ craft }}
                  </button>
                </div>
              </div>

              <!-- Design Style -->
              <div class="mb-6" *ngIf="facets().designStyles.length > 0">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Design Style</h4>
                <div class="flex flex-wrap gap-2">
                  <button
                    *ngFor="let style of facets().designStyles"
                    (click)="toggleFilter('designStyle', style)"
                    [attr.aria-pressed]="selectedDesignStyles().includes(style)"
                    [class.bg-[#1d1d1f]]="selectedDesignStyles().includes(style)"
                    [class.text-white]="selectedDesignStyles().includes(style)"
                    class="px-3 py-1.5 rounded-full border border-[#e0e0e0] text-xs text-[#333333] transition-all"
                  >
                    {{ style }}
                  </button>
                </div>
              </div>

              <!-- Style -->
              <div class="mb-6" *ngIf="facets().styles.length > 0">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Style</h4>
                <div class="flex flex-wrap gap-2">
                  <button
                    *ngFor="let style of facets().styles"
                    (click)="toggleFilter('style', style)"
                    [attr.aria-pressed]="selectedStyles().includes(style)"
                    [class.bg-[#1d1d1f]]="selectedStyles().includes(style)"
                    [class.text-white]="selectedStyles().includes(style)"
                    class="px-3 py-1.5 rounded-full border border-[#e0e0e0] text-xs text-[#333333] transition-all"
                  >
                    {{ style }}
                  </button>
                </div>
              </div>

              <!-- Occasion -->
              <div class="mb-6" *ngIf="facets().occasions.length > 0">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Occasion</h4>
                <div class="space-y-2">
                  <label *ngFor="let occasion of facets().occasions" class="flex items-center gap-3 cursor-pointer text-xs text-[#333333]">
                    <input
                      type="checkbox"
                      [checked]="selectedOccasions().includes(occasion)"
                      (change)="toggleFilter('occasion', occasion)"
                      class="rounded border-[#e0e0e0] text-[#D4AF37] focus:ring-[#D4AF37]"
                    />
                    <span>{{ occasion }}</span>
                  </label>
                </div>
              </div>
            </div>

            <!-- Drawer Bottom Actions -->
            <div class="border-t border-[#e0e0e0] pt-4 flex gap-3">
              <button (click)="clearFilters()" class="btn-apple-pill-secondary flex-1 text-xs">
                Reset All
              </button>
              <button (click)="isFilterOpen.set(false)" class="btn-apple-pill flex-1 text-xs">
                Done
              </button>
            </div>

          </div>
        </div>
      </div>

      <!-- Quick View Modal -->
      <app-quick-view-modal
        [isOpen]="quickViewOpen()"
        [product]="quickViewProduct()"
        (close)="quickViewOpen.set(false)"
        (addToCart)="handleQuickViewAddToCart($event)"
        (viewDetails)="handleViewDetails($event)">
      </app-quick-view-modal>
    </div>
  `,
})
export class ProductsComponent implements OnInit {
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private authService = inject(AuthService);
  private activatedRoute = inject(ActivatedRoute);
  private compareService = inject(CompareService);
  private toastService = inject(ToastService);
  private seoService = inject(SeoService);
  private destroyRef = inject(DestroyRef);
  private router = inject(Router);
  wishlistService = inject(WishlistService);
  categoryLabels = inject(CategoryLabelService);

  /** Filter values the catalogue actually contains; groups with no values are hidden. */
  facets = signal<ProductFacets>(EMPTY_FACETS);

  // State management
  isFilterOpen = signal(false);
  selectedCategories = signal<string[]>([]);
  selectedSubCategories = signal<string[]>([]);
  selectedOccasions = signal<string[]>([]);
  selectedStyles = signal<string[]>([]);
  selectedDesignStyles = signal<string[]>([]);
  selectedGemstones = signal<string[]>([]);
  selectedPriceRanges = signal<string[]>([]);
  selectedMetals = signal<string[]>([]);
  selectedGemGrades = signal<string[]>([]);
  selectedCrafts = signal<string[]>([]);
  certifiedOnly = signal(false);
  searchQuery = signal<string>('');
  products = signal<Product[]>([]);
  sortBy: ProductSort = "newest";
  isLoading = signal(false);

  private readonly listSignals: Record<ListFilter, WritableSignal<string[]>> = {
    subCategory: this.selectedSubCategories,
    metal: this.selectedMetals,
    stone: this.selectedGemstones,
    designStyle: this.selectedDesignStyles,
    occasion: this.selectedOccasions,
    style: this.selectedStyles,
    gemGrade: this.selectedGemGrades,
    craft: this.selectedCrafts,
  };

  // Sale-mode / item-type display helpers (core/product-display) exposed to the template.
  readonly unitLabel = unitLabel;
  readonly unitRate = unitRate;
  readonly totalSuffix = totalSuffix;
  readonly secondaryLine = secondaryLine;
  readonly gemGradeLabel = gemGradeLabel;

  trackByProductId(_index: number, product: Product): any {
    return product.id;
  }

  // Price Ranges (INR; labels are rendered through the currency pipe)
  priceRanges: PriceRange[] = [
    { min: 0, max: 10000, id: '0-10000' },
    { min: 10000, max: 25000, id: '10000-25000' },
    { min: 25000, max: 50000, id: '25000-50000' },
    { min: 50000, max: null, id: '50000-plus' }
  ];

  // Quick View State
  quickViewOpen = signal(false);
  quickViewProduct = signal<ProductDetail | null>(null);

  pagination = signal({
    currentPage: 1,
    pageSize: 12,
    totalItems: 0,
    totalPages: 0,
  });

  paginationInfo = computed(() => {
    const pag = this.pagination();
    const total = pag.totalItems;
    const pageSize = parseInt(pag.pageSize.toString(), 10) || 12;
    const start = (pag.currentPage - 1) * pageSize + 1;
    const end = Math.min(pag.currentPage * pageSize, total);

    return {
      start: total === 0 ? 0 : start,
      end: end,
    };
  });

  ngOnInit(): void {
    this.seoService.updateTags({
      title: 'Fine Jewellery Collections | Caratloop',
      description: 'Browse our complete selection of fine jewellery, loose gemstones, and accessories.'
    });

    const schema = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": "Fine Jewellery Collections",
      "description": "Browse our complete selection of fine jewellery and gemstones"
    };

    this.seoService.setJsonLd(schema);

    this.productService.getFacets()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (facets) => {
          this.facets.set({ ...EMPTY_FACETS, ...facets });
          // Header/footer links pass lowercase slugs (?category=rings); snap the
          // selection to the catalogue's spelling so the chip highlights.
          this.selectedCategories.update(list => list.map(c => this.canonicalCategory(c)));
        },
        error: (err) => console.error('Error loading product facets', err)
      });

    this.activatedRoute.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
      if (params["category"]) {
        this.selectedCategories.set([this.canonicalCategory(params["category"])]);
      }
      this.loadProducts();
    });
  }

  loadProducts(): void {
    this.isLoading.set(true);
    const filters = this.buildFilters();

    // API uses 0-indexed pages
    this.productService.getProducts(this.pagination().currentPage - 1, this.pagination().pageSize, filters)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
            next: (res) => {
                this.products.set(res.content);
                this.pagination.update(p => ({
                    ...p,
                    totalItems: res.totalElements,
                    totalPages: res.totalPages
                }));
                this.isLoading.set(false);
                this.publishItemList(res.content);
            },
            error: (err) => {
                console.error('Error loading products', err);
                this.isLoading.set(false);
            }
        });
  }

  /** ItemList JSON-LD for the products on the current page (finish contract, section 3). */
  private publishItemList(products: Product[]): void {
    const offset = (this.pagination().currentPage - 1) * this.pagination().pageSize;
    this.seoService.setJsonLd(
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        numberOfItems: products.length,
        itemListElement: products.map((product, index) => ({
          '@type': 'ListItem',
          position: offset + index + 1,
          url: this.seoService.absoluteUrl('/products/' + product.id),
          name: product.name,
        })),
      },
      'itemlist',
    );
  }

  /** Maps the UI state onto GET /products params (API contract, section 2). */
  private buildFilters(): ProductFilters {
    const price = this.selectedPriceBounds();
    return {
      category: this.selectedCategories()[0],
      subCategory: this.selectedSubCategories(),
      metals: this.selectedMetals(),
      stones: this.selectedGemstones(),
      designStyles: this.selectedDesignStyles(),
      occasions: this.selectedOccasions(),
      styles: this.selectedStyles(),
      gemGrade: this.selectedGemGrades(),
      craft: this.selectedCrafts(),
      priceMin: price.min,
      priceMax: price.max,
      search: this.searchQuery().trim() || undefined,
      certified: this.certifiedOnly() || undefined,
      sort: this.sortBy,
    };
  }

  /** Overall min/max across every selected tier; an open-ended tier drops the max. */
  private selectedPriceBounds(): { min?: number; max?: number } {
    const ranges = this.priceRanges.filter(r => this.selectedPriceRanges().includes(r.id));
    if (ranges.length === 0) return {};
    const min = Math.min(...ranges.map(r => r.min));
    const openEnded = ranges.some(r => r.max === null);
    const max = openEnded ? undefined : Math.max(...ranges.map(r => r.max as number));
    return { min: min > 0 ? min : undefined, max };
  }

  private canonicalCategory(value: string): string {
    const match = this.facets().categories.find(c => c.toLowerCase() === value.toLowerCase());
    return match ?? value;
  }

  isCategorySelected(category: string): boolean {
    return this.selectedCategories().some(c => c.toLowerCase() === category.toLowerCase());
  }

  onSearch(): void {
    this.pagination.update(p => ({ ...p, currentPage: 1 }));
    this.loadProducts();
  }

  toggleCategory(category: string): void {
    if (category === "all") {
      this.selectedCategories.set([]);
    } else {
      const current = this.selectedCategories();
      if (this.isCategorySelected(category)) {
        this.selectedCategories.set(current.filter((c) => c.toLowerCase() !== category.toLowerCase()));
      } else {
        this.selectedCategories.set([...current, category]);
      }
    }
    this.pagination.update(p => ({ ...p, currentPage: 1 }));
    this.loadProducts();
  }

  toggleFilter(type: ListFilter, value: string): void {
      const target = this.listSignals[type];
      const current = target();
      target.set(current.includes(value) ? current.filter(v => v !== value) : [...current, value]);
      this.pagination.update(p => ({ ...p, currentPage: 1 }));
      this.loadProducts();
  }

  toggleCertified(): void {
      this.certifiedOnly.update(v => !v);
      this.pagination.update(p => ({ ...p, currentPage: 1 }));
      this.loadProducts();
  }

  togglePriceRange(rangeId: string): void {
      const current = this.selectedPriceRanges();
      if (current.includes(rangeId)) {
          this.selectedPriceRanges.set(current.filter(id => id !== rangeId));
      } else {
          this.selectedPriceRanges.set([...current, rangeId]);
      }
      this.pagination.update(p => ({ ...p, currentPage: 1 }));
      this.loadProducts();
  }

  activeFilterCount = computed(() => {
    return this.selectedCategories().length +
      this.selectedSubCategories().length +
      this.selectedOccasions().length +
      this.selectedStyles().length +
      this.selectedDesignStyles().length +
      this.selectedGemstones().length +
      this.selectedPriceRanges().length +
      this.selectedMetals().length +
      this.selectedGemGrades().length +
      this.selectedCrafts().length +
      (this.certifiedOnly() ? 1 : 0) +
      (this.searchQuery() ? 1 : 0);
  });

  clearFilters(): void {
    this.selectedCategories.set([]);
    this.selectedSubCategories.set([]);
    this.selectedOccasions.set([]);
    this.selectedStyles.set([]);
    this.selectedDesignStyles.set([]);
    this.selectedGemstones.set([]);
    this.selectedPriceRanges.set([]);
    this.selectedMetals.set([]);
    this.selectedGemGrades.set([]);
    this.selectedCrafts.set([]);
    this.certifiedOnly.set(false);
    this.searchQuery.set('');
    this.sortBy = "newest";
    this.pagination.update(p => ({ ...p, currentPage: 1 }));
    this.loadProducts();
  }

  handleWishlist(event: Event, productId: string): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.authService.isAuthenticated()) {
      this.toastService.show('Sign in to save items', 'info');
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    const wasSaved = this.wishlistService.has(productId);
    this.wishlistService.toggle(productId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toastService.show(wasSaved ? 'Removed from wishlist' : 'Saved to your wishlist', 'success'),
        error: () => this.toastService.show('Could not update your wishlist. Please try again.', 'error')
      });
  }

  handleAddToCart(event: Event, product: Product): void {
      event.preventDefault();
      event.stopPropagation();
      const options = { product, price: product.price };
      this.cartService.addToCart(product.id, 1, options)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.toastService.show('Added to cart', 'success');
      });
  }

  handleBuyNow(event: Event, product: Product): void {
      event.preventDefault();
      event.stopPropagation();
      const options = { product, price: product.price };
      this.cartService.addToCart(product.id, 1, options)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.router.navigate(['/cart']);
      });
  }

  handleAddToCompare(event: Event, product: Product): void {
      event.preventDefault();
      event.stopPropagation();
      this.compareService.addToCompare(product);
      this.toastService.show('Added to comparison', 'info');
  }

  openQuickView(event: Event, productId: string): void {
    event.preventDefault();
    event.stopPropagation();

    // We need ProductDetail, but list has Product. Fetch detail.
    this.productService.getProductById(productId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(product => {
      this.quickViewProduct.set(product);
      this.quickViewOpen.set(true);
    });
  }

  handleQuickViewAddToCart(event: { productId: string, quantity: number, product?: any }): void {
    const options = event.product ? { product: event.product, price: event.product.price } : {};
    this.cartService.addToCart(event.productId, event.quantity, options)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
        this.toastService.show('Added to cart', 'success');
    });
  }

  handleViewDetails(productId: string): void {
    this.router.navigate(['/products', productId]);
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.pagination().totalPages) {
      this.pagination.update(p => ({ ...p, currentPage: page }));
      this.scrollToTop();
      this.loadProducts();
    }
  }

  nextPage(): void {
    if (this.pagination().currentPage < this.pagination().totalPages) {
      this.goToPage(this.pagination().currentPage + 1);
    }
  }

  previousPage(): void {
    if (this.pagination().currentPage > 1) {
      this.goToPage(this.pagination().currentPage - 1);
    }
  }

  onPageSizeChange(): void {
    this.pagination.update(p => ({ ...p, currentPage: 1, pageSize: parseInt(p.pageSize.toString()) }));
    this.loadProducts();
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
