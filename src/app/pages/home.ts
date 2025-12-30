import { Component, signal, OnInit, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { QuickViewModalComponent } from "../components/quick-view-modal";
import { WhatsappButtonComponent } from "../components/whatsapp-button";
import { ProductService } from "../services/product.service";
import { CartService } from "../services/cart.service";
import { Product, ProductDetail } from "../core/models";
import { CurrencyService } from "../services/currency.service";

interface CollectionUI {
  id: string;
  name: string;
  title: string;
  description: string;
  productCount: number;
  icon: string;
  color: string;
  accentColor: string;
}

@Component({
  selector: "app-home",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    QuickViewModalComponent,
    WhatsappButtonComponent,
  ],
  template: `
    <!-- Premium Hero Section -->
    <section class="relative w-full overflow-hidden min-h-screen flex items-center">
      <!-- Background Image with Overlay -->
      <div
        class="absolute inset-0 bg-gradient-to-r from-diamond-900 via-diamond-800 to-gold-900/30"
      ></div>
      <div class="absolute inset-0 opacity-20 pointer-events-none">
        <svg
          class="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
          viewBox="0 0 1200 600"
        >
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="white"
                stroke-width="0.5"
                opacity="0.1"
              />
            </pattern>
          </defs>
          <rect width="1200" height="600" fill="url(#grid)" />
        </svg>
      </div>

      <div
        class="relative z-10 w-full flex flex-col items-center justify-center text-center px-4 pt-20 pb-12"
      >
        <!-- Trust Badge -->
        <div
          class="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-gold-400/30 animate-fade-in-up"
        >
          <span class="text-sm text-gold-300 font-semibold"
            >🏆 Trusted by Collectors & Connoisseurs</span
          >
        </div>

        <!-- Main Headline -->
        <h1
          class="text-5xl md:text-8xl font-display font-bold text-white mb-6 leading-tight animate-fade-in-up delay-100"
        >
          <span
            class="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 to-gold-500"
            >Curated</span
          ><br />
          Heritage Gemstones
        </h1>

        <!-- Subheading -->
        <p
          class="text-lg md:text-2xl text-gold-100 max-w-3xl mx-auto mb-8 leading-relaxed animate-fade-in-up delay-200"
        >
          Museum-quality loose stones, hand-carved idols, and heirloom jewelry
          collections. Every piece certified and authenticated.
        </p>

        <!-- CTA Buttons -->
        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-12 animate-fade-in-up delay-300 w-full sm:w-auto">
          <a
            routerLink="/products"
            class="group relative px-8 py-4 bg-gold-500 hover:bg-gold-600 text-white font-bold rounded-lg transition-all duration-300 shadow-luxury hover:shadow-luxury-lg hover:-translate-y-1 w-full sm:w-auto"
          >
            <span class="flex items-center justify-center">
              Explore Collections
              <svg
                class="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                ></path>
              </svg>
            </span>
          </a>
          <button
            class="px-8 py-4 border-2 border-gold-400 text-gold-300 hover:bg-gold-400/10 font-bold rounded-lg transition-all duration-300 w-full sm:w-auto"
          >
            View Certifications
          </button>
        </div>

        <!-- Scroll Indicator -->
        <div
          class="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce hidden md:block"
        >
          <svg
            class="w-6 h-6 text-gold-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            ></path>
          </svg>
        </div>
      </div>
    </section>

    <!-- Trust & Heritage Section -->
    <section class="section-padding bg-white border-b border-diamond-200">
      <div class="container-luxury">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-8">
          <div class="text-center">
            <div class="text-4xl mb-3">🔐</div>
            <h3 class="font-bold text-gray-900 mb-2 text-lg md:text-xl">Certified Authentic</h3>
            <p class="text-gray-600 text-sm">
              GIA, IGI & AGS certified
            </p>
          </div>
          <div class="text-center">
            <div class="text-4xl mb-3">👨‍🎨</div>
            <h3 class="font-bold text-gray-900 mb-2 text-lg md:text-xl">Master Artisans</h3>
            <p class="text-gray-600 text-sm">
              Multi-generational craft
            </p>
          </div>
          <div class="text-center">
            <div class="text-4xl mb-3">🌍</div>
            <h3 class="font-bold text-gray-900 mb-2 text-lg md:text-xl">Ethical Sourcing</h3>
            <p class="text-gray-600 text-sm">
              Conflict-free stones
            </p>
          </div>
          <div class="text-center">
            <div class="text-4xl mb-3">♻️</div>
            <h3 class="font-bold text-gray-900 mb-2 text-lg md:text-xl">Lifetime Warranty</h3>
            <p class="text-gray-600 text-sm">
              Care & restoration included
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Collection Categories - Premium Grid -->
    <section class="section-padding bg-diamond-50">
      <div class="container-luxury">
        <div class="text-center mb-12">
          <h2
            class="text-4xl md:text-6xl font-display font-bold text-diamond-900 mb-4"
          >
            Curated Collections
          </h2>
          <p class="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto">
            From precious diamonds to hand-carved spiritual idols
          </p>
        </div>

        <!-- 6-Item Grid Layout -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <a
            *ngFor="let collection of collections()"
            routerLink="/products"
            [queryParams]="{ category: collection.name }"
            class="group relative overflow-hidden rounded-2xl h-80 md:h-96 cursor-pointer card-hover block"
          >
            <!-- Background Gradient -->
            <div
              class="absolute inset-0"
              [ngClass]="'bg-gradient-to-br ' + collection.color"
            ></div>

            <!-- Icon & Content -->
            <div
              class="absolute inset-0 flex flex-col justify-end p-6 md:p-8 text-white"
            >
              <!-- Icon -->
              <div
                class="text-5xl md:text-6xl mb-4 transform group-hover:scale-110 transition-transform duration-300"
              >
                {{ collection.icon }}
              </div>

              <!-- Text -->
              <h3 class="font-display text-2xl md:text-3xl font-bold mb-2">
                {{ collection.title }}
              </h3>
              <p class="text-gray-100 text-sm mb-4 line-clamp-2 md:line-clamp-none">
                {{ collection.description }}
              </p>
              <p class="text-gold-200 text-xs font-semibold mb-4">
                {{ collection.productCount }}+ items
              </p>

              <!-- CTA -->
              <div
                class="inline-flex items-center text-gold-300 group-hover:text-gold-200 transition-colors"
              >
                <span class="text-sm font-semibold">Explore</span>
                <svg
                  class="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  ></path>
                </svg>
              </div>
            </div>

            <!-- Overlay -->
            <div
              class="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-all duration-300"
            ></div>
          </a>
        </div>
      </div>
    </section>

    <!-- Featured Collections Carousel -->
    <section class="section-padding bg-white">
      <div class="container-luxury">
        <h2 class="text-4xl md:text-5xl font-display font-bold text-diamond-900 mb-4">
          Gallery Highlights
        </h2>
        <p class="text-lg md:text-xl text-gray-600 mb-12 max-w-2xl">
          Discover exceptional pieces handpicked by our expert curators
        </p>

        <!-- Featured Items Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <a
            *ngFor="let product of featuredProducts()"
            [routerLink]="['/products', product.id]"
            class="card group overflow-hidden hover:shadow-luxury-lg transition-all duration-300 block cursor-pointer"
          >
            <!-- Image Container -->
            <div
              class="relative overflow-hidden h-72 bg-gradient-to-br from-gold-100 to-diamond-100"
            >
              <img *ngIf="product.imageUrl" [src]="product.imageUrl" class="w-full h-full object-cover" [alt]="product.name" onerror="this.style.display='none'">
              <div
                *ngIf="!product.imageUrl"
                class="w-full h-full flex items-center justify-center text-5xl"
              >
                {{ getProductEmoji(product.category) }}
              </div>

              <!-- Badge -->
              <div *ngIf="getBadge(product)" class="absolute top-4 right-4">
                <span
                  class="inline-block px-3 py-1 bg-gold-500 text-white text-xs font-bold rounded-full"
                >
                  {{ getBadge(product) }}
                </span>
              </div>

              <!-- Wishlist -->
              <button
                (click)="handleWishlist($event, product.id)"
                class="absolute top-4 left-4 w-10 h-10 bg-white/90 hover:bg-gold-500 hover:text-white rounded-lg flex items-center justify-center transition-all shadow-md"
              >
                <svg
                  class="w-5 h-5"
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
            </div>

            <!-- Product Info -->
            <div class="p-6">
              <!-- Category & Name -->
              <p
                class="text-xs text-gold-600 font-bold uppercase tracking-widest mb-2"
              >
                {{ product.category }}
              </p>
              <h3 class="font-semibold text-gray-900 text-lg mb-3 line-clamp-2">
                {{ product.name }}
              </h3>

              <!-- Rating -->
              <div class="flex items-center gap-2 mb-4">
                <div class="flex gap-0.5">
                  <span
                    *ngFor="let i of [1, 2, 3, 4, 5]"
                    class="text-gold-500 text-xs"
                    >★</span
                  >
                </div>
                <span class="text-xs text-gray-500"
                  >({{ product.reviewCount }})</span
                >
              </div>

              <!-- Price -->
              <div class="mb-4">
                <span class="text-2xl font-bold text-diamond-900">{{
                  formatPrice(product.price)
                }}</span>
                <span
                  *ngIf="product.originalPrice"
                  class="text-sm text-gray-500 line-through ml-2"
                  >{{ formatPrice(product.originalPrice) }}</span
                >
              </div>

              <!-- Add to Cart & Quick View -->
              <div class="flex gap-2">
                <button
                  (click)="handleAddToCart($event, product.id)"
                  class="flex-1 btn-primary text-sm px-4"
                >
                  Add to Cart
                </button>
                <button
                  (click)="
                    $event.preventDefault();
                    $event.stopPropagation();
                    openQuickView(product)
                  "
                  class="flex-1 px-4 py-3 border-2 border-gold-500 text-gold-600 hover:bg-gold-50 font-semibold rounded-lg transition-all text-sm"
                >
                  Quick View
                </button>
              </div>
            </div>
          </a>
        </div>

        <!-- View All CTA -->
        <div class="text-center">
          <a
            routerLink="/products"
            class="inline-block px-8 py-4 border-2 border-gold-500 text-gold-600 hover:bg-gold-50 font-bold rounded-lg transition-all w-full sm:w-auto"
          >
            View Complete Collections
          </a>
        </div>
      </div>
    </section>

    <!-- About/Story Section -->
    <section
      class="section-padding bg-gradient-to-r from-diamond-900 to-diamond-800 text-white"
    >
      <div class="container-luxury">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <!-- Left: Image/Visual -->
          <div
            class="relative h-64 md:h-96 rounded-2xl overflow-hidden shadow-luxury-lg"
          >
            <div
              class="w-full h-full bg-gradient-to-br from-gold-300 to-gold-600 flex items-center justify-center"
            >
              <span class="text-9xl">💎</span>
            </div>
          </div>

          <!-- Right: Story -->
          <div>
            <div
              class="inline-block mb-4 px-4 py-2 bg-gold-500/20 rounded-full border border-gold-400/50"
            >
              <span class="text-sm font-semibold text-gold-300"
                >Our Legacy</span
              >
            </div>

            <h2 class="text-3xl md:text-5xl font-display font-bold mb-6">
              Heritage Meets Modern Excellence
            </h2>

            <p class="text-base md:text-lg text-gray-200 mb-4 leading-relaxed">
              With over 25 years of expertise, Gemara stands as a trusted
              custodian of precious gemstones and spiritual artifacts.
            </p>

            <a
              href="#contact"
              class="inline-block px-8 py-4 bg-gold-500 hover:bg-gold-600 text-white font-bold rounded-lg transition-all hover:shadow-luxury w-full sm:w-auto text-center"
            >
              Learn More About Us
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- Instagram Feed -->
    <section id="instagram" class="section-padding bg-white">
      <div class="container-luxury text-center">
        <h2 class="text-3xl font-display font-bold text-diamond-900 mb-2">@GemaraJewels</h2>
        <p class="text-gray-600 mb-8">Follow us on Instagram for daily inspiration</p>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="relative group aspect-square overflow-hidden rounded-lg bg-gray-100 cursor-pointer">
            <div class="w-full h-full flex items-center justify-center text-4xl bg-rose-50">💍</div>
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-4">
              <span class="flex items-center gap-1">❤️ 245</span>
              <span class="flex items-center gap-1">💬 12</span>
            </div>
          </div>
          <div class="relative group aspect-square overflow-hidden rounded-lg bg-gray-100 cursor-pointer">
            <div class="w-full h-full flex items-center justify-center text-4xl bg-blue-50">💎</div>
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-4">
              <span class="flex items-center gap-1">❤️ 189</span>
              <span class="flex items-center gap-1">💬 8</span>
            </div>
          </div>
          <div class="relative group aspect-square overflow-hidden rounded-lg bg-gray-100 cursor-pointer">
            <div class="w-full h-full flex items-center justify-center text-4xl bg-green-50">🕉️</div>
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-4">
              <span class="flex items-center gap-1">❤️ 562</span>
              <span class="flex items-center gap-1">💬 45</span>
            </div>
          </div>
          <div class="relative group aspect-square overflow-hidden rounded-lg bg-gray-100 cursor-pointer">
            <div class="w-full h-full flex items-center justify-center text-4xl bg-yellow-50">👑</div>
            <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-4">
              <span class="flex items-center gap-1">❤️ 321</span>
              <span class="flex items-center gap-1">💬 18</span>
            </div>
          </div>
        </div>

        <div class="mt-8">
          <a href="#" class="btn-outline flex items-center gap-2 mx-auto w-fit">
            <span>📷</span> Follow Us
          </a>
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

  quickViewOpen = signal(false);
  selectedProduct = signal<ProductDetail | null>(null);

  collections = signal<CollectionUI[]>([]);
  featuredProducts = signal<Product[]>([]);

  // UI Metadata map
  private categoryMeta: {[key: string]: Partial<CollectionUI>} = {
    'engagement-rings': { title: 'Diamond Rings', icon: '💍', color: 'from-rose-100 to-rose-200', accentColor: 'text-rose-700', description: 'Certified solitaires and bespoke designs', productCount: 248 },
    'loose-gemstones': { title: 'Loose Stones', icon: '💎', color: 'from-sapphire-100 to-sapphire-200', accentColor: 'text-sapphire-700', description: 'Museum-quality unset precious & semi-precious gems', productCount: 312 },
    'spiritual-idols': { title: 'Carved Figures', icon: '🕉️', color: 'from-emerald-100 to-emerald-200', accentColor: 'text-emerald-700', description: 'Hand-carved spiritual and devotional sculptures', productCount: 156 },
    'gemstone-jewelry': { title: 'Colored Gemstones', icon: '👑', color: 'from-purple-100 to-purple-200', accentColor: 'text-purple-700', description: 'Emerald, sapphire, ruby & precious stone pieces', productCount: 189 },
    'precious-metals': { title: 'Gold & Platinum', icon: '🏆', color: 'from-yellow-100 to-yellow-200', accentColor: 'text-yellow-700', description: '24K gold, platinum & silver collections', productCount: 94 },
    'bespoke-custom': { title: 'Made to Order', icon: '✨', color: 'from-pink-100 to-pink-200', accentColor: 'text-pink-700', description: 'Personalized designs with master craftspeople', productCount: 0 },
  };

  ngOnInit() {
    this.productService.getCategories().subscribe(res => {
        const mapped = res.categories.map(c => ({
            id: c.id,
            name: c.name,
            title: this.categoryMeta[c.name]?.title || c.displayName,
            description: this.categoryMeta[c.name]?.description || '',
            productCount: this.categoryMeta[c.name]?.productCount || 0,
            icon: this.categoryMeta[c.name]?.icon || '💎',
            color: this.categoryMeta[c.name]?.color || 'from-gray-100 to-gray-200',
            accentColor: this.categoryMeta[c.name]?.accentColor || 'text-gray-700'
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
    // Fetch full details
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
    console.log("Add to cart:", productId);
    this.cartService.addToCart(productId, 1).subscribe(() => {
        alert('Added to cart!');
    });
  }

  handleWishlist(event: Event, productId: string): void {
      event.preventDefault();
      event.stopPropagation();
      console.log("Add to wishlist:", productId);
      // Api call would go here
  }

  handleAddToCartFromModal(event: { productId: string; quantity: number }): void {
    console.log("Add to cart from quick view:", event);
    this.cartService.addToCart(event.productId, event.quantity).subscribe(() => {
        alert(`Added ${event.quantity} item(s) to cart`);
        this.closeQuickView();
    });
  }

  handleViewDetails(productId: string): void {
    console.log("View details for product:", productId);
    // In real app, navigate to product detail page
    // RouterLink in template handles navigation if set, but here it's an event
  }
}
