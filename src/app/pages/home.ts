import { Component, signal, OnInit, inject, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { RouterLink } from "@angular/router";
import { QuickViewModalComponent } from "../components/quick-view-modal";
import { WhatsappButtonComponent } from "../components/whatsapp-button";
import { ProductService } from "../services/product.service";
import { CartService } from "../services/cart.service";
import { Product, ProductDetail } from "../core/models";
import { CurrencyService } from "../services/currency.service";
import { SeoService } from "../services/seo.service";
import { ToastService } from "../services/toast.service";

interface CollectionUI {
  id: string;
  name: string;
  title: string;
  icon: string;
}

@Component({
  selector: "app-home",
  standalone: true,
  imports: [
    CommonModule,
    NgOptimizedImage,
    RouterLink,
    QuickViewModalComponent,
    WhatsappButtonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Hero Slider (Mocked) -->
    <section class="relative w-full h-[500px] md:h-[600px] bg-gradient-to-b from-primary-50 to-white overflow-hidden flex items-center">
       <div class="container-luxury grid grid-cols-1 md:grid-cols-2 gap-8 items-center h-full px-6 md:px-12 pt-20 md:pt-0">
          <div class="z-10 animate-fade-in-up text-center md:text-left">
            <h2 class="text-sm font-bold tracking-[0.2em] text-secondary-600 mb-4 uppercase">New Collection</h2>
            <h1 class="text-4xl md:text-6xl lg:text-7xl font-display font-bold text-primary-900 mb-6 leading-tight">
              Radiance of <br/> <span class="text-primary-600">Rare Gemstones</span>
            </h1>
            <p class="text-gray-600 text-lg mb-8 max-w-md mx-auto md:mx-0 leading-relaxed">
               Explore our latest arrival of certified Sapphires, Rubies and Emeralds set in 18K Gold.
            </p>
            <a routerLink="/products" class="inline-block btn-primary text-lg px-10 py-4 rounded-full shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-1">
              Shop Now
            </a>
          </div>
          <div class="relative h-full w-full flex items-center justify-center">
             <!-- Placeholder for Hero Image -->
             <div class="w-72 h-72 md:w-[450px] md:h-[450px] bg-gradient-to-br from-secondary-100 to-primary-50 rounded-full flex items-center justify-center relative animate-float shadow-2xl border-4 border-white">
                <span class="text-8xl md:text-9xl filter drop-shadow-xl">💍</span>

                <!-- Decorative Elements -->
                <div class="absolute -top-8 -right-8 w-24 h-24 bg-secondary-200 rounded-full mix-blend-multiply filter blur-xl opacity-60 animate-blob"></div>
                <div class="absolute -bottom-12 -left-8 w-32 h-32 bg-primary-200 rounded-full mix-blend-multiply filter blur-xl opacity-60 animate-blob animation-delay-2000"></div>
             </div>
          </div>
       </div>
    </section>

    <!-- Shop By Category (Circular) -->
    <section class="py-16 md:py-20 bg-white">
      <div class="container-luxury">
        <h2 class="text-2xl md:text-4xl font-display font-bold text-primary-900 mb-12 text-center">Shop by Category</h2>
        <div class="flex flex-wrap justify-center gap-8 md:gap-16">
           <a *ngFor="let cat of collections()" routerLink="/products" [queryParams]="{category: cat.name}"
              class="group flex flex-col items-center gap-4 cursor-pointer w-28 md:w-36">
              <div class="w-24 h-24 md:w-32 md:h-32 rounded-full bg-white border border-gray-200 flex items-center justify-center text-4xl md:text-5xl group-hover:border-secondary-500 group-hover:shadow-xl transition-all duration-300 transform group-hover:scale-105 relative overflow-hidden">
                 <div class="absolute inset-0 bg-secondary-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                 <span class="relative z-10">{{ cat.icon }}</span>
              </div>
              <span class="font-semibold text-gray-700 group-hover:text-primary-800 transition-colors text-center text-sm md:text-base">{{ cat.title }}</span>
           </a>
        </div>
      </div>
    </section>

    <!-- Treasure Plan Banner -->
    <section class="py-16 bg-primary-900 text-white overflow-hidden relative">
       <!-- Background Pattern -->
       <div class="absolute inset-0 opacity-5" style="background-image: radial-gradient(#ffffff 1px, transparent 1px); background-size: 20px 20px;"></div>

       <div class="container-luxury relative z-10 flex flex-col md:flex-row items-center justify-between gap-12 px-6">
          <div class="flex-1 text-center md:text-left">
             <div class="inline-block px-4 py-1.5 bg-secondary-500 text-white text-xs font-bold tracking-widest uppercase rounded-full mb-6">Smart Savings</div>
             <h2 class="text-3xl md:text-5xl font-display font-bold mb-6 leading-tight">Gemara <span class="text-secondary-400">Treasure Plan</span></h2>
             <p class="text-primary-100 text-lg mb-8 max-w-xl leading-relaxed">
               Plan your jewellery purchase smartly. Pay for 9 months and get <span class="text-white font-bold">100% off</span> on the 10th month installment by us.
             </p>
             <a routerLink="/treasure" class="inline-block bg-white text-primary-900 font-bold px-8 py-4 rounded-full hover:bg-secondary-50 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-1">
               Start Saving Now
             </a>
          </div>
          <div class="flex-1 flex justify-center">
             <div class="w-72 h-48 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 flex flex-col items-center justify-center p-8 transform rotate-3 hover:rotate-0 transition-transform duration-500 shadow-2xl relative">
                <div class="absolute -top-4 -right-4 bg-secondary-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md">POPULAR</div>
                <span class="text-6xl mb-4">💎</span>
                <span class="font-display font-bold text-2xl">Get 1 Month FREE</span>
             </div>
          </div>
       </div>
    </section>

    <!-- Featured Collections -->
    <section class="py-20 bg-gray-50">
      <div class="container-luxury">
        <div class="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
            <div>
                <h2 class="text-3xl md:text-5xl font-display font-bold text-primary-900 mb-4">
                  Trending Now
                </h2>
                <p class="text-lg text-gray-600">
                  Discover exceptional pieces handpicked by our curators
                </p>
            </div>
            <a routerLink="/products" class="text-primary-700 font-bold hover:text-primary-900 flex items-center gap-2 group">
                View All
                <span class="group-hover:translate-x-1 transition-transform">→</span>
            </a>
        </div>

        <!-- Featured Items Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <a
            *ngFor="let product of featuredProducts()"
            [routerLink]="['/products', product.id]"
            class="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 block cursor-pointer border border-gray-100"
          >
            <!-- Image Container -->
            <div
              class="relative overflow-hidden aspect-[4/5] bg-gray-100"
            >
              <img *ngIf="product.imageUrl || product.images?.[0]" [ngSrc]="product.imageUrl || product.images?.[0] || ''" fill class="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700" [alt]="product.name">
              <div
                *ngIf="!product.imageUrl && !product.images?.[0]"
                class="w-full h-full flex items-center justify-center text-5xl bg-gray-50"
              >
                {{ getProductEmoji(product.category) }}
              </div>

              <!-- Badge -->
              <div *ngIf="getBadge(product)" class="absolute top-3 left-3">
                <span
                  class="inline-block px-2 py-1 bg-primary-900 text-white text-[10px] font-bold tracking-widest uppercase rounded"
                >
                  {{ getBadge(product) }}
                </span>
              </div>

              <!-- Wishlist -->
              <button
                (click)="handleWishlist($event, product.id)"
                class="absolute top-3 right-3 w-8 h-8 bg-white hover:bg-secondary-500 hover:text-white rounded-full flex items-center justify-center transition-all shadow-md opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0"
              >
                <svg
                  class="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  ></path>
                </svg>
              </button>

              <!-- Quick Add Overlay -->
              <button
                (click)="handleAddToCart($event, product.id)"
                class="absolute bottom-4 left-4 right-4 bg-white/90 hover:bg-primary-900 hover:text-white text-primary-900 font-bold py-3 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-300 text-sm backdrop-blur-sm"
              >
                Add to Cart
              </button>
            </div>

            <!-- Product Info -->
            <div class="p-5">
              <div class="flex justify-between items-start mb-2">
                 <p class="text-[10px] text-secondary-600 font-bold uppercase tracking-widest">
                    {{ product.category }}
                 </p>
                 <div class="flex items-center gap-1 bg-green-50 px-1.5 py-0.5 rounded border border-green-100" *ngIf="product.rating">
                    <span class="text-[10px] font-bold text-green-700">{{ product.rating }} ★</span>
                 </div>
              </div>

              <h3 class="font-semibold text-gray-900 text-base mb-2 line-clamp-1 group-hover:text-primary-700 transition-colors">
                {{ product.name }}
              </h3>

              <div class="flex items-baseline gap-2">
                <span class="text-xl font-bold text-gray-900">{{ formatPrice(product.price) }}</span>
                <span
                  *ngIf="product.originalPrice"
                  class="text-xs text-gray-400 line-through"
                  >{{ formatPrice(product.originalPrice) }}</span
                >
              </div>
            </div>
          </a>
        </div>
      </div>
    </section>

    <!-- Instagram Feed (Re-styled) -->
    <section class="py-20 bg-white">
      <div class="container-luxury text-center">
        <h2 class="text-3xl font-display font-bold text-primary-900 mb-2">@GemaraJewels</h2>
        <p class="text-gray-500 mb-10">Follow us on Instagram for daily inspiration</p>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
           <!-- ... (Keep existing simple placeholders but clean up if needed) -->
           <div class="relative group aspect-square overflow-hidden rounded-xl bg-gray-50 cursor-pointer">
              <div class="w-full h-full flex items-center justify-center text-4xl bg-rose-50/50">💍</div>
           </div>
           <div class="relative group aspect-square overflow-hidden rounded-xl bg-gray-50 cursor-pointer">
              <div class="w-full h-full flex items-center justify-center text-4xl bg-blue-50/50">💎</div>
           </div>
           <div class="relative group aspect-square overflow-hidden rounded-xl bg-gray-50 cursor-pointer">
              <div class="w-full h-full flex items-center justify-center text-4xl bg-green-50/50">🕉️</div>
           </div>
           <div class="relative group aspect-square overflow-hidden rounded-xl bg-gray-50 cursor-pointer">
              <div class="w-full h-full flex items-center justify-center text-4xl bg-yellow-50/50">👑</div>
           </div>
        </div>
      </div>
    </section>

    <!-- Quick View Modal -->
    <app-quick-view-modal
      [isOpen]="quickViewOpen()"
      [product]="selectedProduct()"
      (close)="closeQuickView()"
      (addToCart)="handleAddToCartFromModal($event)"
      (viewDetails)="handleViewDetails($event)"
    ></app-quick-view-modal>

    <!-- WhatsApp Button -->
    <app-whatsapp-button></app-whatsapp-button>
  `,
})
export class HomeComponent implements OnInit {
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private currencyService = inject(CurrencyService);
  private seoService = inject(SeoService);
  private toastService = inject(ToastService);

  quickViewOpen = signal(false);
  selectedProduct = signal<ProductDetail | null>(null);

  collections = signal<CollectionUI[]>([]);
  featuredProducts = signal<Product[]>([]);

  // UI Metadata map
  private categoryMeta: {[key: string]: Partial<CollectionUI>} = {
    'engagement-rings': { title: 'Rings', icon: '💍' },
    'loose-gemstones': { title: 'Loose Stones', icon: '💎' },
    'spiritual-idols': { title: 'Idols', icon: '🕉️' },
    'gemstone-jewelry': { title: 'Gemstones', icon: '👑' },
    'precious-metals': { title: 'Gold', icon: '🏆' },
    'bespoke-custom': { title: 'Custom', icon: '✨' },
  };

  ngOnInit() {
    this.seoService.updateTags({
      title: 'Gemara | Curated Heritage Gemstones & Jewelry',
      description: 'Discover museum-quality loose stones, hand-carved idols, and heirloom jewelry collections. Certified authentic and ethically sourced.'
    });

    this.productService.getCategories().subscribe(res => {
        const mapped = res.categories.map(c => ({
            id: c.id,
            name: c.name,
            title: this.categoryMeta[c.name]?.title || c.displayName,
            icon: this.categoryMeta[c.name]?.icon || '💎',
        }));
        this.collections.set(mapped);
    });

    this.productService.getProducts(0, 8).subscribe(res => {
        this.featuredProducts.set(res.content);
    });
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

  formatPrice(price: number): string {
    return this.currencyService.format(price);
  }

  getBadge(product: Product): string | undefined {
    if (product.stock <= 3) return 'LOW STOCK';
    if (product.price > 40000) return 'EXCLUSIVE';
    return undefined;
  }

  openQuickView(product: Product): void {
    this.productService.getProductById(product.id).subscribe(details => {
        this.selectedProduct.set(details);
        this.quickViewOpen.set(true);
    });
  }

  closeQuickView(): void {
    this.quickViewOpen.set(false);
    this.selectedProduct.set(null);
  }

  handleAddToCart(event: Event, productId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.cartService.addToCart(productId, 1).subscribe(() => {
        this.toastService.show('Added to cart!', 'success');
    });
  }

  handleWishlist(event: Event, productId: string): void {
      event.preventDefault();
      event.stopPropagation();
      this.toastService.show('Added to Wishlist', 'success');
  }

  handleAddToCartFromModal(event: { productId: string; quantity: number }): void {
    this.cartService.addToCart(event.productId, event.quantity).subscribe(() => {
        this.toastService.show(`Added ${event.quantity} item(s) to cart`, 'success');
        this.closeQuickView();
    });
  }

  handleViewDetails(productId: string): void {
    // Handled by router link usually
  }
}
