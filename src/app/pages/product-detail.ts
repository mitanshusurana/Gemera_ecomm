import { Component, OnInit, OnDestroy, signal, computed, inject, ViewChild, ElementRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { ProductService } from '../services/product.service';
import { CartService } from '../services/cart.service';
import { ProductDetail, Product, CustomizationOption, PriceBreakup } from '../core/models';
import { CompareService } from '../services/compare.service';
import { ToastService } from '../services/toast.service';
import { SeoService } from '../services/seo.service';
import { FormsModule } from '@angular/forms';
import { SizeGuideModalComponent } from '../components/size-guide-modal';
import { EducationModalComponent } from '../components/education-modal';
import { RecentlyViewedComponent } from '../components/recently-viewed';
import { HistoryService } from '../services/history.service';
import { CurrencyService } from '../services/currency.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, RouterLink, FormsModule, SizeGuideModalComponent, EducationModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white font-sans">
      <!-- Breadcrumb -->
      <div class="bg-gray-50 border-b border-gray-100">
        <div class="container-luxury py-3">
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <a routerLink="/" class="hover:text-primary-600">Home</a>
            <span>/</span>
            <a routerLink="/products" class="hover:text-primary-600">Products</a>
            <span>/</span>
            <span class="text-gray-900 font-medium">{{ product()?.name }}</span>
          </div>
        </div>
      </div>

      <!-- Product Details -->
      <div class="container-luxury section-padding pt-8">
        <div *ngIf="!loading() && product()" class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">

          <!-- Image Gallery (Left Side - Col 7) -->
          <div class="lg:col-span-7 flex flex-col-reverse lg:flex-row gap-4">
            <!-- Vertical Thumbnails (Desktop) -->
            <div class="hidden lg:flex flex-col gap-3 w-20 flex-shrink-0">
               <button *ngFor="let img of product()?.images"
                       (click)="selectedImage.set(img); showVideo.set(false); show360.set(false)"
                       [class.ring-2]="!showVideo() && selectedImage() === img"
                       [class.ring-primary-500]="!showVideo() && selectedImage() === img"
                       class="aspect-square bg-gray-50 rounded-lg overflow-hidden hover:opacity-80 transition-opacity border border-gray-200">
                  <img [ngSrc]="img || ''" width="80" height="80" class="w-full h-full object-cover">
               </button>
               <button *ngIf="product()?.videoUrl"
                        (click)="showVideo.set(true)"
                        [class.ring-2]="showVideo()"
                        class="aspect-square bg-gray-100 rounded-lg flex items-center justify-center text-2xl text-primary-800">
                  ▶️
               </button>
            </div>

            <!-- Main Image Area -->
            <div class="flex-1 bg-white rounded-xl overflow-hidden relative group border border-gray-100 h-[400px] md:h-[600px] flex items-center justify-center">
               <!-- Video -->
               <video *ngIf="showVideo() && product()?.videoUrl"
                      [src]="product()?.videoUrl" controls autoplay
                      class="w-full h-full object-cover"></video>

               <!-- Image -->
               <img *ngIf="!showVideo() && (selectedImage() || product()?.images?.[0] || product()?.imageUrl)"
                    [ngSrc]="selectedImage() || product()?.images?.[0] || product()?.imageUrl || ''"
                    fill
                    priority
                    class="object-contain p-4 hover:scale-110 transition-transform duration-700 cursor-zoom-in"
                    [alt]="product()?.name">

                <!-- Fallback -->
                <span *ngIf="!showVideo() && !selectedImage() && !product()?.images?.[0] && !product()?.imageUrl"
                     class="text-9xl text-gray-200">
                 {{ getProductEmoji(product()?.category || '') }}
               </span>

               <!-- Badges -->
               <div class="absolute top-4 left-4 flex flex-col gap-2">
                 <span *ngIf="getBadge(product()!)" class="px-2 py-1 bg-secondary-500 text-white text-[10px] font-bold uppercase tracking-wider rounded">
                    {{ getBadge(product()!) }}
                 </span>
               </div>

               <!-- Mobile Thumbnails (Horizontal) -->
               <div class="lg:hidden absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4 overflow-x-auto">
                  <button *ngFor="let img of product()?.images"
                         (click)="selectedImage.set(img); showVideo.set(false)"
                         class="w-12 h-12 rounded border border-gray-300 overflow-hidden bg-white flex-shrink-0">
                     <img [src]="img" class="w-full h-full object-cover">
                  </button>
               </div>
            </div>
          </div>

          <!-- Product Info (Right Side - Col 5) -->
          <div class="lg:col-span-5">
            <h1 class="text-2xl md:text-3xl font-display font-bold text-gray-900 mb-2 leading-tight">
              {{ product()?.name }}
            </h1>

            <div class="flex items-center gap-4 mb-6">
              <div class="flex items-center gap-1 bg-green-50 px-2 py-1 rounded border border-green-100">
                 <span class="text-green-700 font-bold text-sm">{{ product()?.rating || '4.8' }} ★</span>
              </div>
              <span class="text-sm text-gray-500 underline hover:text-primary-600 cursor-pointer">{{ product()?.reviewCount || 12 }} Reviews</span>
              <span class="text-gray-300">|</span>
              <span class="text-sm text-gray-500">SKU: {{ product()?.sku || 'GEM-001' }}</span>
            </div>

            <div class="h-px bg-gray-100 mb-6"></div>

            <!-- Price Section -->
            <div class="mb-6">
               <div class="flex items-baseline gap-3 mb-2">
                  <span class="text-3xl font-bold text-gray-900">{{ formatPrice(currentPriceBreakup()?.total || currentPrice()) }}</span>
                  <span *ngIf="product()?.originalPrice" class="text-lg text-gray-400 line-through decoration-1">{{ formatPrice(product()?.originalPrice || 0) }}</span>
               </div>
               <p class="text-xs text-green-700 font-semibold mb-4">Inclusive of all taxes</p>

               <!-- Price Breakup Link -->
               <button (click)="showPriceBreakup.set(!showPriceBreakup())" class="text-sm text-primary-600 font-semibold flex items-center gap-1 hover:underline">
                 View Price Breakup
                 <span class="transform transition-transform" [class.rotate-180]="showPriceBreakup()">▼</span>
               </button>

               <!-- Price Breakup Panel -->
               <div *ngIf="showPriceBreakup() && currentPriceBreakup()" class="mt-4 bg-gray-50 rounded-lg p-4 border border-gray-200 text-sm animate-fade-in-up">
                  <div class="flex justify-between mb-2 pb-2 border-b border-gray-200">
                     <span class="text-gray-600">Gold/Metal Value</span>
                     <span class="font-medium">{{ formatPrice(currentPriceBreakup()!.metal) }}</span>
                  </div>
                  <div class="flex justify-between mb-2 pb-2 border-b border-gray-200">
                     <span class="text-gray-600">Stone Value</span>
                     <span class="font-medium">{{ formatPrice(currentPriceBreakup()!.gemstone) }}</span>
                  </div>
                  <div class="flex justify-between mb-2 pb-2 border-b border-gray-200">
                     <span class="text-gray-600">Making Charges</span>
                     <span class="font-medium">{{ formatPrice(currentPriceBreakup()!.makingCharges) }}</span>
                  </div>
                  <div class="flex justify-between font-bold text-gray-900 pt-1">
                     <span>Grand Total</span>
                     <span>{{ formatPrice(currentPriceBreakup()!.total) }}</span>
                  </div>
               </div>
            </div>

            <!-- Treasure Plan Nudge -->
            <div class="bg-primary-50 border border-primary-100 rounded-lg p-4 mb-8 flex items-start gap-3">
               <div class="text-2xl">💎</div>
               <div>
                  <h4 class="font-bold text-primary-900 text-sm mb-1">Buy with Treasure Plan</h4>
                  <p class="text-xs text-primary-700 mb-2">Pay in 9 installments of <span class="font-bold">{{ formatPrice((currentPriceBreakup()?.total || currentPrice()) / 10) }}/mo</span>. We pay the 10th!</p>
                  <a routerLink="/treasure" class="text-xs font-bold text-secondary-600 hover:text-secondary-700 underline">Learn More</a>
               </div>
            </div>

            <!-- Customization -->
            <div class="mb-8 space-y-6">
               <!-- Metal -->
               <div *ngIf="hasOption('metal')">
                  <span class="text-sm font-bold text-gray-700 block mb-2">Metal Color</span>
                  <div class="flex gap-3">
                     <button *ngFor="let opt of getOptions('metal')"
                             (click)="selectedMetal.set(opt)"
                             [class.ring-2]="selectedMetal()?.id === opt.id"
                             [class.ring-primary-500]="selectedMetal()?.id === opt.id"
                             [class.ring-offset-2]="selectedMetal()?.id === opt.id"
                             class="w-8 h-8 rounded-full border border-gray-200 shadow-sm transition-all relative group"
                             [style.background-color]="getMetalColor(opt.name)"
                             [title]="opt.name">
                        <span class="sr-only">{{ opt.name }}</span>
                     </button>
                  </div>
                  <p class="text-xs text-gray-500 mt-1">{{ selectedMetal()?.name }}</p>
               </div>

               <!-- Diamond Quality -->
               <div *ngIf="hasOption('diamond')">
                  <div class="flex justify-between mb-2">
                     <span class="text-sm font-bold text-gray-700">Diamond Quality</span>
                     <button (click)="openEducation('4cs')" class="text-xs text-primary-600 hover:underline">Guide</button>
                  </div>
                  <div class="flex flex-wrap gap-2">
                     <button *ngFor="let opt of getOptions('diamond')"
                             (click)="selectedDiamondQuality.set(opt)"
                             [class.bg-primary-900]="selectedDiamondQuality()?.id === opt.id"
                             [class.text-white]="selectedDiamondQuality()?.id === opt.id"
                             [class.border-primary-900]="selectedDiamondQuality()?.id === opt.id"
                             [class.bg-white]="selectedDiamondQuality()?.id !== opt.id"
                             [class.text-gray-700]="selectedDiamondQuality()?.id !== opt.id"
                             class="px-4 py-2 border border-gray-300 rounded text-sm font-medium transition-all hover:border-primary-500">
                        {{ opt.name }}
                     </button>
                  </div>
               </div>

               <!-- Size -->
               <div *ngIf="product()?.category?.includes('Ring')">
                  <div class="flex justify-between mb-2">
                     <span class="text-sm font-bold text-gray-700">Ring Size</span>
                     <button (click)="sizeGuideOpen.set(true)" class="text-xs text-primary-600 hover:underline">Size Guide</button>
                  </div>
                  <select [ngModel]="selectedSize()" (ngModelChange)="selectedSize.set($event)" class="w-full md:w-1/2 p-2 border border-gray-300 rounded text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500 outline-none">
                     <option [value]="null" disabled>Select Size</option>
                     <option *ngFor="let size of [6,7,8,9,10,11,12,13,14,15,16]" [value]="size">{{ size }}</option>
                  </select>
               </div>
            </div>

            <!-- Delivery Check -->
            <div class="mb-8 flex gap-2">
               <div class="relative flex-1">
                  <input type="text" [ngModel]="pincode()" (ngModelChange)="pincode.set($event)" placeholder="Enter Pincode" class="w-full pl-8 pr-4 py-2 border border-gray-300 rounded text-sm focus:border-secondary-500 outline-none">
                  <span class="absolute left-2.5 top-2.5 text-gray-400">📍</span>
               </div>
               <button (click)="checkDelivery()" class="text-sm font-bold text-secondary-600 hover:text-secondary-700 px-2">Check</button>
            </div>
            <p *ngIf="deliveryDate()" class="text-xs text-green-700 font-semibold mb-6 -mt-6 ml-1">
               Delivery by {{ deliveryDate() }}
            </p>

            <!-- Actions -->
            <div class="flex gap-4 mb-6">
               <button (click)="handleAddToCart()" class="flex-1 bg-secondary-500 hover:bg-secondary-600 text-white font-bold py-3.5 rounded-lg shadow-lg hover:shadow-xl transition-all">
                  ADD TO CART
               </button>
               <button class="flex-1 bg-primary-900 hover:bg-primary-800 text-white font-bold py-3.5 rounded-lg shadow-lg hover:shadow-xl transition-all">
                  BUY NOW
               </button>
            </div>

            <div class="flex justify-center gap-8 text-xs text-gray-500 font-medium">
               <span class="flex items-center gap-1">🔒 Lifetime Buyback</span>
               <span class="flex items-center gap-1">🛡️ Insured Shipping</span>
               <span class="flex items-center gap-1">✅ Certified Jewellery</span>
            </div>
          </div>
        </div>

        <!-- Skeleton Loading -->
        <div *ngIf="loading()" class="h-96 flex items-center justify-center">
           <div class="animate-pulse text-primary-300">Loading details...</div>
        </div>
      </div>

      <!-- Product Description & Specs -->
      <section class="border-t border-gray-100 bg-gray-50 section-padding">
         <div class="container-luxury grid grid-cols-1 md:grid-cols-2 gap-12">
            <div>
               <h3 class="font-display font-bold text-xl mb-4 text-gray-900">Product Details</h3>
               <div class="bg-white p-6 rounded-xl border border-gray-100 shadow-sm text-sm space-y-3">
                  <div class="flex justify-between py-2 border-b border-gray-50">
                     <span class="text-gray-500">Product Code</span>
                     <span class="text-gray-900 font-medium">{{ product()?.sku || 'N/A' }}</span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-gray-50" *ngIf="product()?.weight">
                     <span class="text-gray-500">Gross Weight</span>
                     <span class="text-gray-900 font-medium">{{ product()?.weight }} g</span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-gray-50" *ngIf="product()?.specifications?.carat">
                     <span class="text-gray-500">Carat Weight</span>
                     <span class="text-gray-900 font-medium">{{ product()?.specifications?.carat }} ct</span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-gray-50" *ngIf="product()?.specifications?.clarity">
                     <span class="text-gray-500">Clarity</span>
                     <span class="text-gray-900 font-medium">{{ product()?.specifications?.clarity }}</span>
                  </div>
                  <div class="flex justify-between py-2 border-b border-gray-50" *ngIf="product()?.specifications?.color">
                     <span class="text-gray-500">Color</span>
                     <span class="text-gray-900 font-medium">{{ product()?.specifications?.color }}</span>
                  </div>
               </div>
            </div>
            <div>
               <h3 class="font-display font-bold text-xl mb-4 text-gray-900">Description</h3>
               <p class="text-gray-600 leading-relaxed mb-6">{{ product()?.description }}</p>

               <h3 class="font-display font-bold text-xl mb-4 text-gray-900">Certifications</h3>
               <div class="flex gap-4">
                  <div *ngFor="let cert of product()?.certifications" class="bg-white px-4 py-2 border border-gray-200 rounded flex items-center gap-2 shadow-sm">
                     <span>🏆</span>
                     <span class="font-bold text-gray-700 text-sm">{{ cert }}</span>
                  </div>
               </div>
            </div>
         </div>
      </section>

      <!-- Related Products -->
      <section class="section-padding bg-white" *ngIf="relatedProducts().length > 0">
         <div class="container-luxury">
            <h2 class="font-display font-bold text-2xl mb-8 text-gray-900">Similar Designs</h2>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
               <a *ngFor="let rp of relatedProducts()" [routerLink]="['/products', rp.id]" class="group block">
                  <div class="aspect-square bg-gray-50 rounded-lg overflow-hidden mb-3 relative">
                     <img *ngIf="rp.imageUrl || rp.images?.[0]" [src]="rp.imageUrl || rp.images?.[0]" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                  </div>
                  <h3 class="font-semibold text-gray-900 text-sm truncate">{{ rp.name }}</h3>
                  <p class="font-bold text-gray-900">{{ formatPrice(rp.price) }}</p>
               </a>
            </div>
         </div>
      </section>

      <!-- Modals -->
      <app-size-guide-modal [isOpen]="sizeGuideOpen()" (close)="sizeGuideOpen.set(false)"></app-size-guide-modal>
      <app-education-modal [isOpen]="educationOpen()" [activeTab]="educationTab()" (close)="educationOpen.set(false)"></app-education-modal>
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

  ngOnDestroy(): void {}

  private loadProduct(productId: string): void {
    this.loading.set(true);
    this.productService.getProductById(productId).subscribe({
      next: (product) => {
        this.product.set(product);
        this.historyService.add(product);
        this.seoService.updateTags({
            title: `${product.name} | Gemara`,
            description: product.description,
            image: product.imageUrl || product.images?.[0]
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
          size: this.selectedSize(),
          price: this.currentPrice(),
          product: p
        };

        this.cartService.addToCart(p.id, this.quantity(), options).subscribe(() => {
            this.toastService.show(
              `Added to cart`,
              'success'
            );
        });
    }
  }

  formatPrice(price: number): string {
    return this.currencyService.format(price);
  }

  checkDelivery(): void {
    if (!this.pincode() || this.pincode().length < 4) {
      this.toastService.show('Please enter a valid pincode', 'error');
      return;
    }
    this.isCheckingDelivery.set(true);
    setTimeout(() => {
      const today = new Date();
      const daysToAdd = 3;
      const delivery = new Date(today);
      delivery.setDate(today.getDate() + daysToAdd);
      this.deliveryDate.set(delivery.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }));
      this.isCheckingDelivery.set(false);
    }, 800);
  }

  openEducation(tab: string): void {
    this.educationTab.set(tab);
    this.educationOpen.set(true);
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
    if (product.stock <= 3) return 'Only 1 Left';
    if (product.price > 40000) return 'Ready to Ship';
    return undefined;
  }

  hasOption(type: string): boolean {
    return !!this.product()?.customizationOptions?.some(o => o.type === type);
  }

  getOptions(type: string): CustomizationOption[] {
    return this.product()?.customizationOptions?.filter(o => o.type === type) || [];
  }

  getMetalColor(name: string): string {
    if (name.toLowerCase().includes('rose')) return '#e6a49a';
    if (name.toLowerCase().includes('white')) return '#e8e8e8';
    if (name.toLowerCase().includes('yellow')) return '#e5c973';
    return '#e5c973';
  }
}
