import { Component, OnInit, signal, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { Title } from '@angular/platform-browser';
import { ApiService, Product, Category, ProductDetail } from "../services/api.service";
import { CompareService } from '../services/compare.service';
import { QuickViewModalComponent } from '../components/quick-view-modal';
import { ToastService } from '../services/toast.service';

@Component({
  selector: "app-products",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, QuickViewModalComponent],
  template: `
    <div class="min-h-screen bg-white">
      <!-- Header -->
      <div class="bg-diamond-50 border-b border-diamond-200 section-padding">
        <div class="container-luxury">
          <h1 class="text-5xl md:text-6xl font-display font-bold text-diamond-900 mb-4">
            Our Collections
          </h1>
          <p class="text-lg text-gray-600">
            Browse our complete selection of fine jewellery and gemstones
          </p>
        </div>
      </div>

      <!-- Main Content -->
      <div class="container-luxury section-padding">
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <!-- Sidebar Filters -->
          <div class="lg:col-span-1">
            <div class="space-y-6">
              <!-- Category Filter -->
              <div class="card p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Categories</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      class="w-4 h-4"
                      [checked]="selectedCategories().length === 0"
                      (change)="toggleCategory('all')"
                    />
                    <span class="text-sm text-gray-700">All Products</span>
                  </label>
                  <label
                    *ngFor="let category of categories()"
                    class="flex items-center gap-3 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      class="w-4 h-4"
                      [checked]="selectedCategories().includes(category.name)"
                      (change)="toggleCategory(category.name)"
                    />
                    <span class="text-sm text-gray-700">{{ category.displayName }}</span>
                  </label>
                </div>
              </div>

              <!-- Price Filter -->
              <div class="card p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Price Range</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" />
                    <span class="text-sm text-gray-700">Under $10,000</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" />
                    <span class="text-sm text-gray-700">$10,000 - $25,000</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" />
                    <span class="text-sm text-gray-700">$25,000 - $50,000</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" />
                    <span class="text-sm text-gray-700">$50,000+</span>
                  </label>
                </div>
              </div>

              <!-- Metal Filter -->
              <div class="card p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Metal Type</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" />
                    <span class="text-sm text-gray-700">Gold</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" />
                    <span class="text-sm text-gray-700">Platinum</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" />
                    <span class="text-sm text-gray-700">Silver</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" />
                    <span class="text-sm text-gray-700">White Gold</span>
                  </label>
                </div>
              </div>

              <!-- Certification Filter -->
              <div class="card p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Certification</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" />
                    <span class="text-sm text-gray-700">GIA</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" />
                    <span class="text-sm text-gray-700">IGI</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" />
                    <span class="text-sm text-gray-700">AGS</span>
                  </label>
                </div>
              </div>

              <!-- Occasion Filter (New) -->
              <div class="card p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Occasion</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" [checked]="selectedOccasions().includes('Engagement')" (change)="toggleFilter('occasion', 'Engagement')" />
                    <span class="text-sm text-gray-700">Engagement</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" [checked]="selectedOccasions().includes('Wedding')" (change)="toggleFilter('occasion', 'Wedding')" />
                    <span class="text-sm text-gray-700">Wedding</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" [checked]="selectedOccasions().includes('Anniversary')" (change)="toggleFilter('occasion', 'Anniversary')" />
                    <span class="text-sm text-gray-700">Anniversary</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" [checked]="selectedOccasions().includes('Daily Wear')" (change)="toggleFilter('occasion', 'Daily Wear')" />
                    <span class="text-sm text-gray-700">Daily Wear</span>
                  </label>
                </div>
              </div>

              <!-- Style Filter (New) -->
              <div class="card p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Shop by Look</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" [checked]="selectedStyles().includes('Modern')" (change)="toggleFilter('style', 'Modern')" />
                    <span class="text-sm text-gray-700">Modern</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" [checked]="selectedStyles().includes('Vintage')" (change)="toggleFilter('style', 'Vintage')" />
                    <span class="text-sm text-gray-700">Vintage</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" [checked]="selectedStyles().includes('Classic Solitaire')" (change)="toggleFilter('style', 'Classic Solitaire')" />
                    <span class="text-sm text-gray-700">Classic Solitaire</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" [checked]="selectedStyles().includes('Halo')" (change)="toggleFilter('style', 'Halo')" />
                    <span class="text-sm text-gray-700">Halo</span>
                  </label>
                </div>
              </div>

              <!-- Clear Filters -->
              <button (click)="clearFilters()" class="w-full btn-ghost border border-diamond-300">
                Clear All Filters
              </button>
            </div>
          </div>

          <!-- Products Grid -->
          <div class="lg:col-span-3">
            <!-- Top Bar -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-diamond-200">
              <div>
                <p class="text-gray-600">
                  Showing <span class="font-semibold">{{ paginationInfo().start }}-{{ paginationInfo().end }}</span> of
                  <span class="font-semibold">{{ pagination().totalItems }}</span> products
                </p>
              </div>
              <div class="flex gap-2">
                <!-- Visual Search Button -->
                <button (click)="fileInput.click()" class="btn-outline flex items-center gap-2" title="Search by Image">
                  <span class="text-xl">📷</span>
                  <span class="hidden sm:inline">Visual Search</span>
                </button>
                <input #fileInput type="file" (change)="handleVisualSearch($event)" class="hidden" accept="image/*">

                <select [(ngModel)]="sortBy" (change)="loadProducts()" class="input-field max-w-xs">
                  <option value="newest">Sort by: Newest</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="popular">Most Popular</option>
                  <option value="rated">Best Rated</option>
                </select>
              </div>
            </div>

            <!-- Loading Skeleton -->
            <div *ngIf="isLoading()" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              <div *ngFor="let item of [1,2,3,4,5,6]" class="card overflow-hidden">
                <div class="skeleton h-64 w-full"></div>
                <div class="p-6">
                  <div class="skeleton h-4 w-3/4 mb-2"></div>
                  <div class="skeleton h-6 w-full mb-4"></div>
                  <div class="skeleton h-4 w-1/2 mb-4"></div>
                  <div class="skeleton h-10 w-full"></div>
                </div>
              </div>
            </div>

            <!-- Products Grid -->
            <div *ngIf="!isLoading()" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              <a *ngFor="let product of products()" [routerLink]="['/products', product.id]" class="card card-hover group overflow-hidden block cursor-pointer w-full">
                <!-- Image Container with Lazy Loading -->
                <div class="relative overflow-hidden h-64 bg-diamond-100">
                  <img *ngIf="product.imageUrl" [src]="product.imageUrl" class="w-full h-full object-cover" [alt]="product.name" onerror="this.style.display='none'">
                  <div *ngIf="!product.imageUrl" class="w-full h-full bg-gradient-to-br from-gold-100 to-gold-50 flex items-center justify-center" [attr.data-product-id]="product.id">
                    <span class="text-4xl">{{ getProductEmoji(product.category) }}</span>
                  </div>
                  <button (click)="$event.preventDefault(); $event.stopPropagation()" class="absolute top-4 left-4 w-10 h-10 bg-white/90 hover:bg-gold-500 hover:text-white rounded-lg flex items-center justify-center transition-all duration-300">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                    </svg>
                  </button>
                  <button (click)="handleAddToCompare($event, product)" class="absolute top-16 left-4 w-10 h-10 bg-white/90 hover:bg-gold-500 hover:text-white rounded-lg flex items-center justify-center transition-all duration-300" title="Compare">
                    <span class="text-lg">⚖️</span>
                  </button>
                  <button (click)="openQuickView($event, product.id)" class="absolute top-28 left-4 w-10 h-10 bg-white/90 hover:bg-gold-500 hover:text-white rounded-lg flex items-center justify-center transition-all duration-300" title="Quick View">
                    <span class="text-lg">👁️</span>
                  </button>
                </div>

                <!-- Product Info -->
                <div class="p-6">
                  <p class="text-xs text-gold-600 font-semibold uppercase tracking-wider mb-1">
                    {{ product.category }}
                  </p>
                  <h3 class="font-semibold text-gray-900 mb-3 line-clamp-2">
                    {{ product.name }}
                  </h3>

                  <!-- Rating -->
                  <div class="flex items-center gap-2 mb-4">
                    <div class="flex gap-1">
                      <span *ngFor="let _ of [1,2,3,4,5]" class="text-gold-500 text-xs">★</span>
                    </div>
                    <span class="text-xs text-gray-600">({{ product.reviewCount }})</span>
                  </div>

                  <!-- Price -->
                  <div class="mb-4">
                    <span class="text-2xl font-bold text-diamond-900">
                      {{ formatPrice(product.price) }}
                    </span>
                  </div>

                  <!-- Stock Status -->
                  <div *ngIf="product.stock && product.stock <= 5" class="mb-3 px-2 py-1 bg-red-50 rounded text-xs font-semibold text-red-700">
                    ⚠️ Only {{ product.stock }} left
                  </div>

                  <!-- Add to Cart -->
                  <button (click)="handleAddToCart($event, product.id)" class="w-full btn-primary">Add to Cart</button>
                </div>
              </a>
            </div>

            <!-- Empty State -->
            <div *ngIf="!isLoading() && products().length === 0" class="text-center py-16">
              <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path>
              </svg>
              <h3 class="text-2xl font-semibold text-gray-900 mb-2">No products found</h3>
              <p class="text-gray-600 mb-6">Try adjusting your filters or search terms</p>
              <button (click)="clearFilters()" class="btn-primary">Clear Filters</button>
            </div>

            <!-- Pagination Controls -->
            <div *ngIf="!isLoading() && products().length > 0" class="flex flex-col sm:flex-row justify-between items-center gap-4">
              <!-- Page Size Selector -->
              <div class="flex items-center gap-2">
                <label class="text-sm text-gray-700">Items per page:</label>
                <select [(ngModel)]="pagination().pageSize" (change)="onPageSizeChange()" class="input-field max-w-xs">
                  <option value="12">12</option>
                  <option value="24">24</option>
                  <option value="48">48</option>
                </select>
              </div>

              <!-- Pagination Buttons -->
              <div class="flex items-center justify-center gap-2 flex-wrap">
                <!-- Previous Button -->
                <button
                  (click)="previousPage()"
                  [disabled]="pagination().currentPage === 1"
                  [class.opacity-50]="pagination().currentPage === 1"
                  [class.cursor-not-allowed]="pagination().currentPage === 1"
                  class="w-10 h-10 border border-diamond-300 rounded-lg hover:bg-gold-50 transition-colors duration-300 disabled:hover:bg-white"
                >
                  ‹
                </button>

                <!-- Page Numbers -->
                <div class="flex gap-1">
                  <!-- First Pages -->
                  <button
                    *ngFor="let page of visiblePages()"
                    (click)="goToPage(page)"
                    [class.bg-gold-500]="pagination().currentPage === page"
                    [class.text-white]="pagination().currentPage === page"
                    [class.border-diamond-300]="pagination().currentPage !== page"
                    [class.text-gray-700]="pagination().currentPage !== page"
                    class="w-10 h-10 border rounded-lg transition-colors duration-300 font-semibold"
                    [class.hover:bg-gold-50]="pagination().currentPage !== page"
                  >
                    {{ page }}
                  </button>

                  <!-- Ellipsis -->
                  <span *ngIf="shouldShowEllipsis()" class="px-2 text-gray-500">...</span>
                </div>

                <!-- Next Button -->
                <button
                  (click)="nextPage()"
                  [disabled]="pagination().currentPage >= pagination().totalPages"
                  [class.opacity-50]="pagination().currentPage >= pagination().totalPages"
                  [class.cursor-not-allowed]="pagination().currentPage >= pagination().totalPages"
                  class="w-10 h-10 border border-diamond-300 rounded-lg hover:bg-gold-50 transition-colors duration-300 disabled:hover:bg-white"
                >
                  ›
                </button>
              </div>

              <!-- Page Info -->
              <div class="text-sm text-gray-600">
                Page {{ pagination().currentPage }} of {{ pagination().totalPages }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick View Modal -->
      <app-quick-view-modal
        [isOpen]="quickViewOpen()"
        [product]="quickViewProduct()"
        (close)="quickViewOpen.set(false)"
        (addToCart)="handleQuickViewAddToCart($event)">
      </app-quick-view-modal>
    </div>
  `,
})
export class ProductsComponent implements OnInit {
  private apiService = inject(ApiService);
  private activatedRoute = inject(ActivatedRoute);
  private compareService = inject(CompareService);
  private toastService = inject(ToastService);
  private titleService = inject(Title);

  // State management
  categories = signal<Category[]>([]);
  selectedCategories = signal<string[]>([]);
  selectedOccasions = signal<string[]>([]);
  selectedStyles = signal<string[]>([]);
  products = signal<Product[]>([]);
  sortBy = "newest";
  isLoading = signal(false);
  
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
    const start = (pag.currentPage - 1) * pag.pageSize + 1;
    const end = Math.min(pag.currentPage * pag.pageSize, total);
    
    return {
      start: total === 0 ? 0 : start,
      end: end,
    };
  });

  ngOnInit(): void {
    this.titleService.setTitle('Fine Jewellery Collections | Gemara');

    // Fetch categories
    this.apiService.getCategories().subscribe(res => {
        this.categories.set(res.categories);
    });

    this.activatedRoute.queryParams.subscribe((params) => {
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
        sortBy: this.sortBy === "newest" ? "newest" : "price",
        order: this.sortBy === "price-high" ? "desc" : "asc",
        // Pass custom filters to API (mock service will likely ignore but good for structure)
        occasions: this.selectedOccasions().join(','),
        styles: this.selectedStyles().join(',')
    };

    // API uses 0-indexed pages
    this.apiService.getProducts(this.pagination().currentPage - 1, this.pagination().pageSize, filters)
        .subscribe({
            next: (res) => {
                // Client-side filtering for new mock filters since API/MockService might not support them yet
                let content = res.content;
                if (this.selectedOccasions().length > 0) {
                    // Mock logic: randomly filter or check if description contains keyword
                    content = content.filter(p =>
                        this.selectedOccasions().some(occ =>
                            p.description.includes(occ) || p.name.includes(occ) || Math.random() > 0.7
                        )
                    );
                }
                if (this.selectedStyles().length > 0) {
                     content = content.filter(p =>
                        this.selectedStyles().some(sty =>
                            p.description.includes(sty) || p.name.includes(sty) || Math.random() > 0.7
                        )
                    );
                }

                this.products.set(content);
                // Adjust total items roughly for mock
                const total = this.selectedOccasions().length || this.selectedStyles().length ? content.length : res.pageable.totalElements;

                this.pagination.update(p => ({
                    ...p,
                    totalItems: total,
                    totalPages: Math.ceil(total / p.pageSize) || 1
                }));
                this.isLoading.set(false);
            },
            error: (err) => {
                console.error(err);
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

  toggleFilter(type: 'occasion' | 'style', value: string): void {
      if (type === 'occasion') {
          const current = this.selectedOccasions();
          if (current.includes(value)) {
              this.selectedOccasions.set(current.filter(v => v !== value));
          } else {
              this.selectedOccasions.set([...current, value]);
          }
      } else {
          const current = this.selectedStyles();
          if (current.includes(value)) {
              this.selectedStyles.set(current.filter(v => v !== value));
          } else {
              this.selectedStyles.set([...current, value]);
          }
      }
      this.pagination.update(p => ({ ...p, currentPage: 1 }));
      this.loadProducts();
  }

  clearFilters(): void {
    this.selectedCategories.set([]);
    this.selectedOccasions.set([]);
    this.selectedStyles.set([]);
    this.sortBy = "newest";
    this.pagination.update(p => ({ ...p, currentPage: 1 }));
    this.loadProducts();
  }

  handleAddToCart(event: Event, productId: string): void {
      event.preventDefault();
      event.stopPropagation();
      this.apiService.addToCart(productId, 1).subscribe(() => {
          this.toastService.show('Added to cart', 'success');
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
    this.apiService.getProductById(productId).subscribe(product => {
      this.quickViewProduct.set(product);
      this.quickViewOpen.set(true);
    });
  }

  handleQuickViewAddToCart(event: { productId: string, quantity: number }): void {
    this.apiService.addToCart(event.productId, event.quantity).subscribe(() => {
        this.toastService.show('Added to cart', 'success');
    });
  }

  handleVisualSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      // Mock visual search
      this.isLoading.set(true);
      setTimeout(() => {
        alert(`Searching for products similar to ${input.files![0].name}... (Mock)`);
        this.isLoading.set(false);
      }, 1500);
    }
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

  visiblePages(): number[] {
    const pages: number[] = [];
    const currentPage = this.pagination().currentPage;
    const total = this.pagination().totalPages;
    const maxVisible = 5;

    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
      let end = Math.min(total, start + maxVisible - 1);

      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
    }

    return pages;
  }

  shouldShowEllipsis(): boolean {
    const pages = this.visiblePages();
    return pages.length > 0 && pages[pages.length - 1] < this.pagination().totalPages;
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(price);
  }

  getProductEmoji(category: string): string {
    const emojiMap: { [key: string]: string } = {
      "Engagement Ring": "💍",
      "Loose Gemstone": "💎",
      "Spiritual Idol": "🕉️",
      "Gemstone Ring": "👑",
      "Precious Metal": "🏆",
      "Diamond": "💎",
      "Gemstone": "💎",
      "Gold": "🏆",
      "Platinum": "✨",
      "Pearl": "⭐",
      "Custom": "🎨",
    };
    return emojiMap[category] || emojiMap[category.split(' ')[0]] || "✦";
  }

  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
