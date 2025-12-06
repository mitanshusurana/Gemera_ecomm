import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, ProductDetail, Product } from '../services/api.service';
import { CompareService } from '../services/compare.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
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
            <span class="text-gray-700">{{ product?.name || 'Product Details' }}</span>
          </div>
        </div>
      </div>

      <!-- Product Details -->
      <div class="container-luxury section-padding">
        <div *ngIf="!loading() && product" class="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <!-- Image Gallery -->
          <div>
            <div class="bg-diamond-100 rounded-xl overflow-hidden mb-6 h-96 lg:h-full flex items-center justify-center relative">
               <img *ngIf="selectedImage() || product?.imageUrl" [src]="selectedImage() || product?.imageUrl" class="w-full h-full object-cover" [alt]="product?.name">
               <span *ngIf="!selectedImage() && !product?.imageUrl" class="text-7xl">{{ getProductEmoji(product?.category || '') }}</span>

               <!-- Badge -->
               <div *ngIf="getBadge(product!)" class="absolute top-4 right-4">
                <span class="inline-block px-3 py-1 bg-gold-500 text-white text-xs font-bold rounded-full">
                  {{ getBadge(product!) }}
                </span>
               </div>
            </div>

            <!-- Thumbnails -->
            <div class="grid grid-cols-4 gap-4" *ngIf="product?.images && product!.images.length > 0">
              <button *ngFor="let img of product!.images"
                      (click)="selectedImage.set(img.url)"
                      class="aspect-square bg-diamond-100 rounded-lg hover:ring-2 hover:ring-gold-500 transition-all duration-300 flex items-center justify-center overflow-hidden">
                <img [src]="img.url" [alt]="img.alt" class="w-full h-full object-cover">
              </button>
            </div>
          </div>

          <!-- Product Info -->
          <div>
            <div class="mb-6">
              <h1 class="text-4xl md:text-5xl font-display font-bold text-diamond-900 mb-4">
                {{ product?.name }}
              </h1>
              <div class="flex items-center gap-4 mb-6">
                <div class="flex gap-1">
                  <span *ngFor="let _ of [1,2,3,4,5]" class="text-gold-500 text-xl">★</span>
                </div>
                <span class="text-gray-600">({{ product?.reviewCount }} customer reviews)</span>
              </div>
            </div>

            <!-- Price -->
            <div class="mb-8 pb-8 border-b border-diamond-200">
              <div class="flex items-baseline gap-3 mb-4">
                <span class="text-5xl font-bold text-diamond-900">{{ formatPrice(product?.price || 0) }}</span>
                <span *ngIf="product?.originalPrice" class="text-2xl text-gray-500 line-through">{{ formatPrice(product?.originalPrice || 0) }}</span>
              </div>
              <p class="text-gray-600">Free insured worldwide shipping</p>
            </div>

            <!-- Specifications -->
            <div class="mb-8 pb-8 border-b border-diamond-200">
              <h3 class="font-bold text-gray-900 mb-4">Specifications</h3>
              <div class="grid grid-cols-2 gap-4">
                <div class="card p-4" *ngIf="product?.specifications?.carat">
                  <p class="text-xs text-gold-600 font-semibold uppercase">Carat Weight</p>
                  <p class="text-lg font-semibold text-gray-900">{{ product?.specifications?.carat }} ct</p>
                </div>
                <div class="card p-4" *ngIf="product?.specifications?.clarity">
                  <p class="text-xs text-gold-600 font-semibold uppercase">Clarity</p>
                  <p class="text-lg font-semibold text-gray-900">{{ product?.specifications?.clarity }}</p>
                </div>
                <div class="card p-4" *ngIf="product?.specifications?.color">
                  <p class="text-xs text-gold-600 font-semibold uppercase">Color</p>
                  <p class="text-lg font-semibold text-gray-900">{{ product?.specifications?.color }}</p>
                </div>
                <div class="card p-4" *ngIf="product?.specifications?.cut">
                  <p class="text-xs text-gold-600 font-semibold uppercase">Cut</p>
                  <p class="text-lg font-semibold text-gray-900">{{ product?.specifications?.cut }}</p>
                </div>
                <div class="card p-4" *ngIf="product?.metal">
                  <p class="text-xs text-gold-600 font-semibold uppercase">Metal</p>
                  <p class="text-lg font-semibold text-gray-900">{{ product?.metal }}</p>
                </div>
                <div class="card p-4" *ngIf="product?.weight">
                  <p class="text-xs text-gold-600 font-semibold uppercase">Weight</p>
                  <p class="text-lg font-semibold text-gray-900">{{ product?.weight }}g</p>
                </div>
              </div>
            </div>

            <!-- Size Selection (Mock) -->
            <div class="mb-8 pb-8 border-b border-diamond-200" *ngIf="product?.category?.includes('Ring')">
              <h3 class="font-bold text-gray-900 mb-4">Ring Size</h3>
              <div class="grid grid-cols-5 gap-2">
                <button *ngFor="let size of [5, 6, 7, 8, 9, 10, 11, 12, 13]" 
                        class="h-12 border-2 border-diamond-300 rounded-lg font-semibold hover:border-gold-500 hover:bg-gold-50 transition-all duration-300">
                  {{ size }}
                </button>
              </div>
            </div>

            <!-- Certifications -->
            <div class="mb-8 pb-8 border-b border-diamond-200" *ngIf="product?.certifications && product!.certifications.length > 0">
              <h3 class="font-bold text-gray-900 mb-4">Certifications</h3>
              <div class="flex gap-4 flex-wrap">
                <div class="card p-4 text-center" *ngFor="let cert of product!.certifications">
                  <div class="text-2xl mb-2">🏆</div>
                  <p class="text-sm font-semibold">{{ cert }} Certified</p>
                </div>
              </div>
            </div>

            <!-- Add to Cart -->
            <div class="flex gap-4 mb-8">
              <input type="number" min="1" max="10" [(ngModel)]="quantity" class="input-field w-20">
              <button (click)="handleAddToCart()" class="flex-1 btn-primary text-lg py-4">
                Add to Cart
              </button>
              <button class="w-14 h-14 border-2 border-diamond-300 rounded-lg hover:border-gold-500 hover:bg-gold-50 transition-all duration-300 flex items-center justify-center">
                <svg class="w-6 h-6 text-diamond-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                </svg>
              </button>
              <button (click)="handleAddToCompare()" class="w-14 h-14 border-2 border-diamond-300 rounded-lg hover:border-gold-500 hover:bg-gold-50 transition-all duration-300 flex items-center justify-center ml-2" title="Compare">
                <span class="text-xl">⚖️</span>
              </button>
            </div>

            <!-- Description -->
            <div class="mb-8">
              <h3 class="font-bold text-gray-900 mb-3">Description</h3>
              <p class="text-gray-700 leading-relaxed mb-4">
                {{ product?.description }}
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
    </div>
  `,
})
export class ProductDetailComponent implements OnInit {
  private apiService = inject(ApiService);
  private route = inject(ActivatedRoute);
  private compareService = inject(CompareService);

  loading = signal(true);
  product: ProductDetail | null = null;
  relatedProducts = signal<Product[]>([]);

  quantity = signal(1);
  selectedImage = signal<string | null>(null);

  ngOnInit(): void {
    this.route.params.subscribe((params) => {
      if (params['id']) {
        this.loadProduct(params['id']);
      }
    });
  }

  private loadProduct(productId: string): void {
    this.loading.set(true);
    this.apiService.getProductById(productId).subscribe({
      next: (product) => {
        this.product = product;
        this.loading.set(false);
        this.loadRelatedProducts(product.category);
      },
      error: (error) => {
        console.error('Error loading product:', error);
        this.loading.set(false);
      },
    });
  }

  private loadRelatedProducts(category: string) {
      this.apiService.getProducts(0, 4, { category }).subscribe(res => {
          this.relatedProducts.set(res.content.filter(p => p.id !== this.product?.id));
      });
  }

  handleAddToCart(): void {
    if (this.product) {
        this.apiService.addToCart(this.product.id, this.quantity()).subscribe(() => {
            alert(`Added ${this.quantity()} item(s) to cart`);
        });
    }
  }

  handleAddToCompare(): void {
    if (this.product) {
        this.compareService.addToCompare(this.product);
    }
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
    };
    return emojiMap[category] || "✦";
  }

  getBadge(product: Product): string | undefined {
    if (product.stock <= 3) return 'LOW STOCK';
    if (product.price > 40000) return 'EXCLUSIVE';
    return undefined;
  }
}
