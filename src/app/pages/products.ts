import { Component, OnInit, signal, computed, inject, ChangeDetectionStrategy, DestroyRef } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { ActivatedRoute, RouterLink, Router } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { SeoService } from '../services/seo.service';
import { ProductService } from "../services/product.service";
import { CartService } from "../services/cart.service";
import { Product, ProductDetail } from "../core/models";
import { CompareService } from '../services/compare.service';
import { QuickViewModalComponent } from '../components/quick-view-modal';
import { ToastService } from '../services/toast.service';
import { OCCASIONS_LIST } from '../core/constants';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

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
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-2 block">Gemera Fine Jewelry</span>
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
              *ngFor="let cat of categories"
              (click)="toggleCategory(cat.name)"
              [class.bg-white]="selectedCategories().includes(cat.name)"
              [class.border-[#D4AF37]]="selectedCategories().includes(cat.name)"
              [class.border-2]="selectedCategories().includes(cat.name)"
              [class.text-[#1d1d1f]]="selectedCategories().includes(cat.name)"
              [class.font-semibold]="selectedCategories().includes(cat.name)"
              [class.text-[#7a7a7a]]="!selectedCategories().includes(cat.name)"
              class="px-4 py-2 rounded-full border border-[#e0e0e0] whitespace-nowrap active-press transition-all hover:text-[#1d1d1f]"
            >
              {{ cat.displayName }}
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
                (keyup.enter)="loadProducts()"
                placeholder="Search gems, rings..."
                aria-label="Search products"
                class="w-full bg-[#f5f5f7] border border-[#e0e0e0] rounded-full pl-9 pr-4 py-2 text-xs text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37] transition-colors"
              />
              <svg class="w-4 h-4 text-[#7a7a7a] absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>

            <!-- Metal Quick Chips -->
            <div class="hidden lg:flex items-center space-x-2">
              <button
                *ngFor="let metal of metalTypes"
                (click)="toggleFilter('metal', metal)"
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
                <option value="popular">Most Popular</option>
                <option value="rated">Best Rated</option>
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
                <button (click)="handleWishlist($event, product.id)" class="absolute top-3 left-3 w-8 h-8 bg-white/80 hover:bg-white text-[#1d1d1f] rounded-full flex items-center justify-center backdrop-blur-md transition-all active-press shadow-sm" title="Wishlist" aria-label="Add to wishlist">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  {{ product.category }}
                </span>
                <span *ngIf="product.isBestSeller || (product.reviewCount && product.reviewCount > 50)" class="bg-[#D4AF37]/15 text-[#D4AF37] text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase">Best Seller</span>
              </div>

              <h3 class="font-sans font-semibold text-base text-[#1d1d1f] group-hover:text-[#D4AF37] transition-colors mb-2 line-clamp-2">
                {{ product.name }}
              </h3>

              <!-- Price -->
              <div class="mb-3">
                <span class="text-lg font-semibold text-[#1d1d1f]">
                  {{ product.price | currencyConvert }}
                </span>
              </div>

              <!-- Stock Alert -->
              <div *ngIf="product.stock !== undefined && product.stock <= 5 && product.stock > 0" class="mb-2 text-xs text-amber-600 font-medium">
                Only {{ product.stock }} left in stock
              </div>
              <div *ngIf="product.stock === 0" class="mb-2 text-xs text-red-600 font-medium">
                Out of Stock
              </div>
            </div>

            <!-- Apple Pill Action Buttons -->
            <div class="flex gap-2 pt-4 border-t border-[#f0f0f0]">
              <button
                (click)="handleAddToCart($event, product)"
                [disabled]="product.stock === 0"
                class="flex-1 btn-apple-pill text-xs !py-2 !px-3 disabled:opacity-50"
              >
                {{ product.stock === 0 ? 'Sold Out' : 'Add to Bag' }}
              </button>
              <button
                (click)="handleBuyNow($event, product)"
                [disabled]="product.stock === 0"
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
            <label>Items per page:</label>
            <select [(ngModel)]="pagination().pageSize" (change)="onPageSizeChange()" aria-label="Items per page" class="bg-white border border-[#e0e0e0] rounded-full px-3 py-1 text-xs">
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
                    <span>{{ range.label }}</span>
                  </label>
                </div>
              </div>

              <!-- Metal Types -->
              <div class="mb-6">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Metal Type</h4>
                <div class="flex flex-wrap gap-2">
                  <button
                    *ngFor="let metal of metalTypes"
                    (click)="toggleFilter('metal', metal)"
                    [class.bg-[#D4AF37]]="selectedMetals().includes(metal)"
                    [class.text-black]="selectedMetals().includes(metal)"
                    [class.font-semibold]="selectedMetals().includes(metal)"
                    class="px-3 py-1.5 rounded-full border border-[#e0e0e0] text-xs text-[#333333] transition-all"
                  >
                    {{ metal }}
                  </button>
                </div>
              </div>

              <!-- Certifications -->
              <div class="mb-6">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Gem Certificate</h4>
                <div class="flex flex-wrap gap-2">
                  <button
                    *ngFor="let cert of certificationsList"
                    (click)="toggleFilter('certification', cert)"
                    [class.bg-[#1d1d1f]]="selectedCertifications().includes(cert)"
                    [class.text-white]="selectedCertifications().includes(cert)"
                    class="px-3 py-1.5 rounded-full border border-[#e0e0e0] text-xs text-[#333333] transition-all"
                  >
                    {{ cert }}
                  </button>
                </div>
              </div>

              <!-- Gemstone Types -->
              <div class="mb-6" *ngIf="gemstoneTypes.length > 0">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Gemstone Spec</h4>
                <div class="space-y-2 max-h-40 overflow-y-auto hide-scrollbar">
                  <label *ngFor="let gemstone of gemstoneTypes" class="flex items-center gap-3 cursor-pointer text-xs text-[#333333]">
                    <input
                      type="checkbox"
                      [checked]="selectedGemstones().includes(gemstone)"
                      (change)="toggleFilter('gemstone', gemstone)"
                      class="rounded border-[#e0e0e0] text-[#D4AF37] focus:ring-[#D4AF37]"
                    />
                    <span>{{ gemstone }}</span>
                  </label>
                </div>
              </div>

              <!-- Occasion -->
              <div class="mb-6">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Occasion</h4>
                <div class="space-y-2">
                  <label *ngFor="let occasion of occasionsList" class="flex items-center gap-3 cursor-pointer text-xs text-[#333333]">
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
  categories: any[] = [];
  occasionsList = OCCASIONS_LIST;
  gemstoneTypes: any[] = [];
  metalTypes = ['Gold', 'Platinum', 'Silver', 'White Gold'];
  certificationsList = ['GIA', 'IGI', 'AGS', 'BIS'];

  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private activatedRoute = inject(ActivatedRoute);
  private compareService = inject(CompareService);
  private toastService = inject(ToastService);
  private seoService = inject(SeoService);
  private destroyRef = inject(DestroyRef);

  // State management
  isFilterOpen = signal(false);
  // categories = signal<Category[]>([]); // Removed in favor of constant
  selectedCategories = signal<string[]>([]);
  selectedOccasions = signal<string[]>([]);
  selectedStyles = signal<string[]>([]);
  selectedGemstones = signal<string[]>([]);
  selectedPriceRanges = signal<string[]>([]);
  selectedMetals = signal<string[]>([]);
  selectedCertifications = signal<string[]>([]);
  searchQuery = signal<string>('');
  products = signal<Product[]>([]);
  sortBy = "newest";
  isLoading = signal(false);

  trackByProductId(_index: number, product: Product): any {
    return product.id;
  }

  // Price Ranges
  priceRanges = [
    { label: 'Under $10,000', min: 0, max: 10000, id: '0-10000' },
    { label: '$10,000 - $25,000', min: 10000, max: 25000, id: '10000-25000' },
    { label: '$25,000 - $50,000', min: 25000, max: 50000, id: '25000-50000' },
    { label: '$50,000+', min: 50000, max: null, id: '50000-plus' }
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

  private router = inject(Router);

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


    this.productService.getCategories().subscribe((res: any) => {
      this.categories = res.categories;

      // Find category with showGemstoneFields = true and use its subcategories
      const gemstoneCat = this.categories.find(c => c.showGemstoneFields);
      if (gemstoneCat && gemstoneCat.subcategories) {
          this.gemstoneTypes = gemstoneCat.subcategories.map((sc: any) => sc.displayName);
      } else {
          this.gemstoneTypes = [];
      }
    });

    this.activatedRoute.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
      if (params["category"]) {
        const categoryId = params["category"];
        this.selectedCategories.set([categoryId]);
      }
      this.loadProducts();
    });
  }

  loadProducts(): void {
    this.isLoading.set(true);
    const filters = {
        category: this.selectedCategories().length > 0 ? this.selectedCategories()[0] : undefined,
        sortBy: this.sortBy === "newest" ? "newest" : 
                this.sortBy.startsWith("price") ? "price" : 
                this.sortBy === "popular" ? "popular" :
                this.sortBy === "rated" ? "rating" : "newest",
        order: this.sortBy === "price-high" || this.sortBy === "popular" || this.sortBy === "rated" ? "desc" : "asc",
        // Pass custom filters to API (mock service will likely ignore but good for structure)
        occasions: this.selectedOccasions().join(','),
        styles: this.selectedStyles().join(','),
        subCategory: this.selectedGemstones().length > 0 ? this.selectedGemstones().join(',') : undefined,
        metals: this.selectedMetals().join(','),
        certifications: this.selectedCertifications().join(','),
        search: this.searchQuery() || undefined
    };

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
            },
            error: () => {
                this.isLoading.set(false);
            }
        });
  }

  toggleCategory(categoryId: string): void {
    if (categoryId === "all") {
      this.selectedCategories.set([]);
    } else {
      const current = this.selectedCategories();
      if (current.includes(categoryId)) {
        this.selectedCategories.set(current.filter((id) => id !== categoryId));
      } else {
        this.selectedCategories.set([...current, categoryId]);
      }
    }
    this.pagination.update(p => ({ ...p, currentPage: 1 }));
    this.loadProducts();
  }

  toggleFilter(type: 'occasion' | 'style' | 'gemstone' | 'metal' | 'certification', value: string): void {
      if (type === 'occasion') {
          const current = this.selectedOccasions();
          if (current.includes(value)) {
              this.selectedOccasions.set(current.filter(v => v !== value));
          } else {
              this.selectedOccasions.set([...current, value]);
          }
      } else if (type === 'style') {
          const current = this.selectedStyles();
          if (current.includes(value)) {
              this.selectedStyles.set(current.filter(v => v !== value));
          } else {
              this.selectedStyles.set([...current, value]);
          }
      } else if (type === 'gemstone') {
          const current = this.selectedGemstones();
          if (current.includes(value)) {
              this.selectedGemstones.set(current.filter(v => v !== value));
          } else {
              this.selectedGemstones.set([...current, value]);
          }
      } else if (type === 'metal') {
          const current = this.selectedMetals();
          if (current.includes(value)) {
              this.selectedMetals.set(current.filter(v => v !== value));
          } else {
              this.selectedMetals.set([...current, value]);
          }
      } else if (type === 'certification') {
          const current = this.selectedCertifications();
          if (current.includes(value)) {
              this.selectedCertifications.set(current.filter(v => v !== value));
          } else {
              this.selectedCertifications.set([...current, value]);
          }
      }
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
      this.selectedOccasions().length +
      this.selectedStyles().length +
      this.selectedGemstones().length +
      this.selectedPriceRanges().length +
      this.selectedMetals().length +
      this.selectedCertifications().length +
      (this.searchQuery() ? 1 : 0);
  });

  clearFilters(): void {
    this.selectedCategories.set([]);
    this.selectedOccasions.set([]);
    this.selectedStyles.set([]);
    this.selectedGemstones.set([]);
    this.selectedPriceRanges.set([]);
    this.selectedMetals.set([]);
    this.selectedCertifications.set([]);
    this.searchQuery.set('');
    this.sortBy = "newest";
    this.pagination.update(p => ({ ...p, currentPage: 1 }));
    this.loadProducts();
  }

  handleWishlist(event: Event, _productId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.toastService.show('Added to Wishlist', 'success');
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
