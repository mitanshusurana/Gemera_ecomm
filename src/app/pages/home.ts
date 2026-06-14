import { Component, signal, OnInit, inject, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { RouterLink, Router } from "@angular/router";
import { QuickViewModalComponent } from "../components/quick-view-modal";
import { ProductService } from "../services/product.service";
import { CartService } from "../services/cart.service";
import { Product, ProductDetail, Category } from "../core/models";
import { CurrencyService } from "../services/currency.service";
import { SeoService } from "../services/seo.service";
import { ToastService } from "../services/toast.service";
import { CurrencyConvertPipe } from "../pipes/currency-convert.pipe";

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
    CurrencyConvertPipe
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Hero Slider (Modern Corporate) -->
    <section class="relative w-full h-[550px] md:h-[650px] bg-gradient-to-br from-primary to-primary overflow-hidden flex items-center text-white">
       <!-- Abstract Background Shapes -->
       <div class="absolute top-0 right-0 w-[800px] h-[800px] bg-surface/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
       <div class="absolute bottom-0 left-0 w-[600px] h-[600px] bg-accent/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/3"></div>

       <div class="container-luxury grid grid-cols-1 md:grid-cols-2 gap-12 items-center h-full px-6 md:px-12 relative z-10">
          <div class="animate-fade-in-up text-center md:text-left">
            <span class="inline-block py-1 px-3 border border-secondary-400 text-accent text-xs font-extrabold tracking-[0.2em] uppercase mb-6 rounded-full">New Season Collection</span>
            <h1 class="text-5xl md:text-7xl font-display font-bold mb-6 leading-tight">
              Elevate Your <br/> <span class="text-transparent bg-clip-text bg-gradient-to-r from-secondary-200 to-secondary-500">Everyday</span>
            </h1>
            <p class="text-white text-lg mb-10 max-w-lg mx-auto md:mx-0 leading-relaxed font-light" style="color: var(--color-text-muted-light, #d1fae5);">
               Lightweight, premium designer jewelry crafted for the modern professional. Seamlessly transition from the boardroom to the ballroom.
            </p>
            <div class="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
               <a routerLink="/products" class="btn-primary bg-accent hover:bg-accent border-none text-white px-8 py-4 text-lg">
                 Shop Collection
               </a>
               <a routerLink="/treasure" class="px-8 py-4 rounded-lg border border-white/30 hover:bg-surface/10 transition-colors font-semibold text-white text-lg">
                 Start Treasure Plan
               </a>
            </div>
          </div>
          <div class="relative h-full w-full flex items-center justify-center hidden md:flex">
             <!-- Hero Image Placeholder -->
             <div class="w-[450px] h-[550px] bg-surface rounded-t-[10rem] rounded-b-3xl relative overflow-hidden shadow-2xl border-4 border-white/10">
                <img ngSrc="Hero%20%26%20Office%20Wear%20Sophisticated%20Professional.webp" fill priority sizes="450px" class="object-cover" alt="Modern Corporate Jewelry" ngSrcset="400w, 800w, 1200w">
                <div class="absolute inset-0 bg-gradient-to-t from-primary/80 to-transparent"></div>
                <div class="absolute bottom-8 left-8 text-white">
                   <p class="text-sm uppercase tracking-widest mb-1 text-accent font-extrabold">Featured</p>
                   <p class="font-display text-2xl">The Executive Edit</p>
                </div>
             </div>
          </div>
       </div>
    </section>

    <!-- Shop By Occasion (New Section) -->
    <section class="py-20 bg-surface">
       <div class="container-luxury px-6">
          <div class="text-center mb-16">
             <h2 class="text-3xl md:text-4xl font-display font-bold text-ink mb-4">Shop By Occasion</h2>
             <p class="text-ink">Curated edits for every moment of your life</p>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
             <!-- Card 1 -->
             <a routerLink="/products" [queryParams]="{category: 'Office Wear'}" class="group relative aspect-[3/4] overflow-hidden rounded-xl cursor-pointer bg-diamond-100">
                <img ngSrc="Hero%20%26%20Office%20Wear%20Sophisticated%20Professional.webp" fill class="object-cover transition-transform duration-700 group-hover:scale-110" alt="Office Wear">
                <div class="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
                <div class="absolute bottom-6 left-6 text-white">
                   <h3 class="text-xl font-bold font-display mb-1">Office Wear</h3>
                   <span class="text-xs uppercase tracking-widest text-accent font-extrabold opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 block duration-300">Shop Now</span>
                </div>
             </a>
             <!-- Card 2 -->
             <a routerLink="/products" [queryParams]="{category: 'Daily Wear'}" class="group relative aspect-[3/4] overflow-hidden rounded-xl cursor-pointer bg-diamond-100">
                <img ngSrc="Daily%20Wear%20Elevated%20Essentials.webp" fill class="object-cover transition-transform duration-700 group-hover:scale-110" alt="Daily Wear">
                <div class="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
                <div class="absolute bottom-6 left-6 text-white">
                   <h3 class="text-xl font-bold font-display mb-1">Daily Wear</h3>
                   <span class="text-xs uppercase tracking-widest text-accent font-extrabold opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 block duration-300">Shop Now</span>
                </div>
             </a>
             <!-- Card 3 -->
             <a routerLink="/products" [queryParams]="{category: 'Party Wear'}" class="group relative aspect-[3/4] overflow-hidden rounded-xl cursor-pointer bg-diamond-100">
                <img ngSrc="https://images.pexels.com/photos/177332/pexels-photo-177332.jpeg?auto=compress&cs=tinysrgb&w=600" fill class="object-cover transition-transform duration-700 group-hover:scale-110" alt="Party Wear">
                <div class="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
                <div class="absolute bottom-6 left-6 text-white">
                   <h3 class="text-xl font-bold font-display mb-1">Party Wear</h3>
                   <span class="text-xs uppercase tracking-widest text-accent font-extrabold opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 block duration-300">Shop Now</span>
                </div>
             </a>
             <!-- Card 4 -->
             <a routerLink="/products" [queryParams]="{category: 'Gifting'}" class="group relative aspect-[3/4] overflow-hidden rounded-xl cursor-pointer bg-diamond-100">
                <img ngSrc="Gifting%20The%20Unboxing%20Experience.webp" fill class="object-cover transition-transform duration-700 group-hover:scale-110" alt="Gifting">
                <div class="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors"></div>
                <div class="absolute bottom-6 left-6 text-white">
                   <h3 class="text-xl font-bold font-display mb-1">Gifting</h3>
                   <span class="text-xs uppercase tracking-widest text-accent font-extrabold opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 block duration-300">Shop Now</span>
                </div>
             </a>
          </div>
       </div>
    </section>

    <!-- Featured Collections -->
    <section class="py-20 bg-surface">
      <div class="container-luxury">
        <div class="flex flex-col md:flex-row justify-between items-end mb-12 gap-4 px-6">
            <div>
                <h2 class="text-3xl md:text-4xl font-display font-bold text-ink mb-2">
                  Best Sellers
                </h2>
                <p class="text-ink">
                  Pieces loved by our community
                </p>
            </div>
            <a routerLink="/products" class="text-ink font-bold hover:text-ink flex items-center gap-2 group text-sm uppercase tracking-wider">
                View All Products
                <span class="group-hover:translate-x-1 transition-transform">→</span>
            </a>
        </div>

        <!-- Featured Items Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 px-6">
          <a
            *ngFor="let product of featuredProducts()"
            [routerLink]="['/products', product.id]"
            class="group bg-surface rounded-none overflow-hidden hover:shadow-luxury transition-all duration-300 block cursor-pointer"
          >
            <!-- Image Container -->
            <div
              class="relative overflow-hidden aspect-[4/5] bg-surface"
            >
              <img *ngIf="product.imageUrl || product.images?.[0]" [ngSrc]="product.imageUrl || product.images?.[0] || ''" fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw" class="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-700" [alt]="product.name">
              <div
                *ngIf="!product.imageUrl && !product.images?.[0]"
                class="w-full h-full flex items-center justify-center text-5xl bg-surface"
              >
                {{ getProductEmoji(product.category) }}
              </div>

              <!-- Quick Add Overlay -->
              <button
                (click)="handleAddToCart($event, product)"
                class="absolute bottom-0 left-0 w-full bg-primary text-white font-bold py-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 text-sm uppercase tracking-widest"
              >
                Add to Cart
              </button>
            </div>

            <!-- Product Info -->
            <div class="pt-4 pb-2">
              <h3 class="font-medium text-ink text-sm mb-1 line-clamp-1 group-hover:text-ink transition-colors">
                {{ product.name }}
              </h3>

              <div class="flex items-center gap-2">
                <span class="font-bold text-ink">{{ product.price | currencyConvert }}</span>
                <span *ngIf="product.originalPrice" class="text-xs text-ink line-through">{{ product.originalPrice | currencyConvert }}</span>
              </div>
            </div>
          </a>
        </div>
      </div>
    </section>

    <!-- Client Diaries (Testimonials) -->
    <section class="py-24 bg-primary text-white overflow-hidden relative">
      <!-- Decor -->
      <div class="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
         <div class="absolute top-10 left-10 text-9xl">❝</div>
         <div class="absolute bottom-10 right-10 text-9xl rotate-180">❝</div>
      </div>

      <div class="container-luxury px-6 relative z-10">
         <div class="text-center mb-16">
            <h2 class="text-3xl md:text-5xl font-display font-bold mb-4">Client Diaries</h2>
            <p class="text-white opacity-90"><span class="text-[#FAFAFA]">Stories of sparkle from our cherished customers</span></p>
         </div>

         <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
            <!-- Testimonial 1 -->
            <div class="bg-primary p-8 rounded-2xl border border-primary shadow-xl relative hover:-translate-y-2 transition-transform duration-300">
               <div class="flex gap-1 text-accent mb-4 text-sm font-extrabold">★★★★★</div>
               <p class="text-lg leading-relaxed mb-6 font-light !text-white opacity-90">"I was looking for something elegant for my daily office wear, and Caratloop's collection is just perfect. Lightweight yet so premium!"</p>
               <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold text-xl text-white">S</div>
                  <div>
                     <h3 class="font-bold text-white text-lg">Sneha Kapoor</h3>
                     <p class="text-xs uppercase tracking-wider text-[#FDE68A] font-extrabold !text-[#FDE68A]">Marketing Head</p>
                  </div>
               </div>
            </div>

            <!-- Testimonial 2 -->
            <div class="bg-primary p-8 rounded-2xl border border-primary shadow-xl relative hover:-translate-y-2 transition-transform duration-300">
               <div class="flex gap-1 text-accent mb-4 text-sm font-extrabold">★★★★★</div>
               <p class="text-lg leading-relaxed mb-6 font-light !text-white opacity-90">"The Treasure Plan helped me save up for my anniversary gift without any stress. The 100% off on the last installment is a game changer."</p>
               <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold text-xl text-white">A</div>
                  <div>
                     <h3 class="font-bold text-white text-lg">Ankit Sharma</h3>
                     <p class="text-xs uppercase tracking-wider text-[#FDE68A] font-extrabold !text-[#FDE68A]">Entrepreneur</p>
                  </div>
               </div>
            </div>

            <!-- Testimonial 3 -->
            <div class="bg-primary p-8 rounded-2xl border border-primary shadow-xl relative hover:-translate-y-2 transition-transform duration-300">
               <div class="flex gap-1 text-accent mb-4 text-sm font-extrabold">★★★★★</div>
               <p class="text-lg leading-relaxed mb-6 font-light !text-white opacity-90">"Absolutely in love with the customization options. I got my ring engraved and resizing was hassle-free. Highly recommended!"</p>
               <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold text-xl text-white">P</div>
                  <div>
                     <h3 class="font-bold text-white text-lg">Priya Menon</h3>
                     <p class="text-xs uppercase tracking-wider text-[#FDE68A] font-extrabold !text-[#FDE68A]">Doctor</p>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </section>

    <!-- Treasure Plan Banner (Compact) -->
    <section class="py-20 bg-secondary-50">
       <div class="container-luxury flex flex-col md:flex-row items-center justify-between gap-12 px-6">
          <div class="flex-1">
             <span class="text-[#B45309] font-extrabold uppercase tracking-widest text-xs mb-2 block">Smart Investment</span>
             <h2 class="text-3xl md:text-5xl font-display font-bold text-ink mb-6">Caratloop <span class="text-[#B45309]">Treasure Plan</span></h2>
             <p class="text-ink text-lg mb-8 max-w-xl">
               The smartest way to buy jewellery. Pay for 10 months, and we pay the 11th installment for you.
             </p>
             <div class="flex gap-4">
                <a routerLink="/treasure" class="btn-primary">Learn more about the Caratloop Treasure Plan</a>
             </div>
          </div>
          <div class="flex-1 flex justify-center">
             <div class="relative w-64 h-64 md:w-80 md:h-80 bg-surface rounded-full flex items-center justify-center shadow-2xl border-8 border-white">
                <span class="text-8xl">💎</span>
                <div class="absolute bottom-4 bg-primary text-white px-4 py-1 rounded-full text-xs font-bold shadow-lg">10 + 1 Plan</div>
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


  `,
})
export class HomeComponent implements OnInit {
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private currencyService = inject(CurrencyService);
  private seoService = inject(SeoService);
  private toastService = inject(ToastService);
  private router = inject(Router);

  quickViewOpen = signal(false);
  selectedProduct = signal<ProductDetail | null>(null);

  collections = signal<CollectionUI[]>([]);
  featuredProducts = signal<Product[]>([]);

  ngOnInit() {
    this.seoService.updateTags({
      title: 'Caratloop | Modern Fine Jewelry for the Corporate Age',
      description: 'Discover lightweight, premium designer jewelry crafted for the modern professional. Shop office wear, daily wear, and gifts. Certified Authenticity.'
    });

    this.productService.getProducts(0, 8).subscribe(res => {
        this.featuredProducts.set(res.content);
    });

    // Fetch categories dynamically
    this.productService.getCategories().subscribe(res => {
        const mappedCollections: CollectionUI[] = res.categories.map(cat => ({
            id: cat.id,
            name: cat.name,
            title: cat.displayName,
            icon: this.getProductEmoji(cat.name)
        }));
        this.collections.set(mappedCollections);
    });
  }

  getProductEmoji(category: string): string {
    const emojiMap: { [key: string]: string } = {
      "Engagement Ring": "💍",
      "Loose Gemstone": "💎",
      "Spiritual Idol": "🕉️",
      "Gemstone Ring": "👑",
      "Precious Metal": "🏆",
      "DIAMOND": "💎",
      "GEMSTONE": "🔮",
      "PRECIOUS_METAL": "🥇",
    };
    // Normalize key
    const normalized = category.replace('_', ' ').toLowerCase();

    // Simple fallback logic
    if (normalized.includes('ring')) return "💍";
    if (normalized.includes('diamond')) return "💎";
    if (normalized.includes('gemstone')) return "🔮";
    if (normalized.includes('idol')) return "🕉️";
    if (normalized.includes('metal') || normalized.includes('gold')) return "🏆";
    if (normalized.includes('earring')) return "👂";
    if (normalized.includes('pendant')) return "📿";
    if (normalized.includes('bracelet')) return "💫";

    return emojiMap[category] || "✦";
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

  handleAddToCart(event: Event, product: any): void {
    event.preventDefault();
    event.stopPropagation();
    const options = { product, price: product.price };
    this.cartService.addToCart(product.id, 1, options).subscribe(() => {
        this.toastService.show('Added to cart!', 'success');
    });
  }

  handleWishlist(event: Event, productId: string): void {
      event.preventDefault();
      event.stopPropagation();
      this.toastService.show('Added to Wishlist', 'success');
  }

  handleAddToCartFromModal(event: { productId: string; quantity: number; product?: any }): void {
    const options = event.product ? { product: event.product, price: event.product.price } : {};
    this.cartService.addToCart(event.productId, event.quantity, options).subscribe(() => {
        this.toastService.show(`Added ${event.quantity} item(s) to cart`, 'success');
        this.closeQuickView();
    });
  }

  handleViewDetails(productId: string): void {
    this.router.navigate(['/products', productId]);
    this.closeQuickView();
  }
}
