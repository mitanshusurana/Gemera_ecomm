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
            <!-- Vertical Thumbnails -->
            <div class="hidden lg:flex flex-col gap-3 w-20 flex-shrink-0">
               <button *ngFor="let img of product()?.images"
                       (click)="selectedImage.set(img); showVideo.set(false)"
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
               <video *ngIf="showVideo() && product()?.videoUrl" [src]="product()?.videoUrl" controls autoplay class="w-full h-full object-cover"></video>
               <img *ngIf="!showVideo() && (selectedImage() || product()?.images?.[0] || product()?.imageUrl)"
                    [ngSrc]="selectedImage() || product()?.images?.[0] || product()?.imageUrl || ''"
                    fill priority class="object-contain p-4 hover:scale-110 transition-transform duration-700 cursor-zoom-in"
                    [alt]="product()?.name">
                <span *ngIf="!showVideo() && !selectedImage() && !product()?.images?.[0] && !product()?.imageUrl" class="text-9xl text-gray-200">{{ getProductEmoji(product()?.category || '') }}</span>
               <div class="absolute top-4 left-4 flex flex-col gap-2">
                 <span *ngIf="getBadge(product()!)" class="px-2 py-1 bg-secondary-500 text-white text-[10px] font-bold uppercase tracking-wider rounded">{{ getBadge(product()!) }}</span>
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

            <!-- Description -->
            <p class="text-gray-600 mb-6 leading-relaxed text-sm md:text-base">
               {{ product()?.description || 'Experience the timeless elegance of this handcrafted masterpiece. Each stone is carefully selected for its brilliance and set by our master artisans.' }}
            </p>

            <!-- Price Section -->
            <div class="mb-6">
               <div class="flex items-baseline gap-3 mb-2">
                  <span class="text-3xl font-bold text-gray-900">{{ formatPrice(currentPriceBreakup()?.total || currentPrice()) }}</span>
                  <span *ngIf="product()?.originalPrice" class="text-lg text-gray-400 line-through decoration-1">{{ formatPrice(product()?.originalPrice || 0) }}</span>
               </div>
               <p class="text-xs text-green-700 font-semibold mb-4">Inclusive of all taxes</p>
               <button (click)="showPriceBreakup.set(!showPriceBreakup())" class="text-sm text-primary-600 font-semibold flex items-center gap-1 hover:underline">
                 View Price Breakup <span class="transform transition-transform" [class.rotate-180]="showPriceBreakup()">▼</span>
               </button>
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

            <!-- Customization -->
            <div class="mb-8 space-y-6">
               <!-- Postcards Feature (Video Message) -->
               <div class="flex items-center justify-between bg-primary-50 p-3 rounded-lg border border-primary-100">
                  <div class="flex items-center gap-2">
                     <span class="text-2xl">💌</span>
                     <div>
                        <span class="text-sm font-bold text-primary-900 block">Add Video Message (Postcards)</span>
                        <span class="text-xs text-gray-600">Embed a digital message with this gift.</span>
                     </div>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" [ngModel]="addPostcard()" (ngModelChange)="addPostcard.set($event)" class="sr-only peer">
                    <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-secondary-500"></div>
                  </label>
               </div>

               <!-- Metal -->
               <div *ngIf="hasOption('metal')">
                  <span class="text-sm font-bold text-gray-700 block mb-2">Metal Color</span>
                  <div class="flex gap-3">
                     <button *ngFor="let opt of getOptions('metal')" (click)="selectedMetal.set(opt)"
                             [class.ring-2]="selectedMetal()?.id === opt.id"
                             [class.ring-primary-500]="selectedMetal()?.id === opt.id"
                             [class.ring-offset-2]="selectedMetal()?.id === opt.id"
                             class="w-8 h-8 rounded-full border border-gray-200 shadow-sm transition-all relative group"
                             [style.background-color]="getMetalColor(opt.name)" [title]="opt.name">
                     </button>
                  </div>
               </div>

               <!-- Diamond & Size (simplified for brevity) -->
               <div *ngIf="hasOption('diamond')" class="flex flex-wrap gap-2">
                  <button *ngFor="let opt of getOptions('diamond')" (click)="selectedDiamondQuality.set(opt)"
                          [class.bg-primary-900]="selectedDiamondQuality()?.id === opt.id"
                          [class.text-white]="selectedDiamondQuality()?.id === opt.id"
                          class="px-3 py-1.5 border border-gray-300 rounded text-xs font-medium transition-all hover:border-primary-500">
                     {{ opt.name }}
                  </button>
               </div>
            </div>

            <!-- Delivery Check -->
            <div class="mb-6 flex gap-2">
               <input type="text" [ngModel]="pincode()" (ngModelChange)="pincode.set($event)" placeholder="Enter Pincode" class="input-field w-40">
               <button (click)="checkDelivery()" class="text-sm font-bold text-secondary-600 px-2">Check</button>
            </div>
            <p *ngIf="deliveryDate()" class="text-xs text-green-700 font-semibold mb-6">Delivery by {{ deliveryDate() }}</p>

            <!-- Actions -->
            <div class="flex flex-col gap-3 mb-6">
               <div class="flex gap-4">
                  <button (click)="handleAddToCart()" class="flex-1 btn-primary py-3.5 rounded-lg shadow-lg">ADD TO CART</button>
                  <button (click)="openTryAtHome()" class="flex-1 btn-secondary py-3.5 rounded-lg border-2">🏠 TRY AT HOME</button>
               </div>
            </div>

            <!-- Product Details / Specifications -->
            <div class="mt-8 pt-6 border-t border-gray-100 bg-gray-50 p-4 rounded-lg">
               <h3 class="font-display font-bold text-gray-900 mb-4 text-lg">Product Details</h3>
               <div class="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
                  <ng-container *ngIf="product()?.specifications as specs">
                     <div *ngIf="specs.carat" class="flex justify-between border-b border-gray-200 pb-1">
                        <span class="text-gray-500">Carat</span>
                        <span class="font-medium text-gray-900">{{ specs.carat }}</span>
                     </div>
                     <div *ngIf="specs.clarity" class="flex justify-between border-b border-gray-200 pb-1">
                        <span class="text-gray-500">Clarity</span>
                        <span class="font-medium text-gray-900">{{ specs.clarity }}</span>
                     </div>
                     <div *ngIf="specs.color" class="flex justify-between border-b border-gray-200 pb-1">
                        <span class="text-gray-500">Color</span>
                        <span class="font-medium text-gray-900">{{ specs.color }}</span>
                     </div>
                     <div *ngIf="specs.metal" class="flex justify-between border-b border-gray-200 pb-1">
                        <span class="text-gray-500">Metal</span>
                        <span class="font-medium text-gray-900">{{ specs.metal }}</span>
                     </div>
                     <div *ngIf="specs.cut" class="flex justify-between border-b border-gray-200 pb-1">
                        <span class="text-gray-500">Cut</span>
                        <span class="font-medium text-gray-900">{{ specs.cut }}</span>
                     </div>
                  </ng-container>
                  <div *ngIf="product()?.weight" class="flex justify-between border-b border-gray-200 pb-1">
                     <span class="text-gray-500">Gross Weight</span>
                     <span class="font-medium text-gray-900">{{ product()?.weight }}g</span>
                  </div>
                  <div *ngIf="product()?.sku" class="flex justify-between border-b border-gray-200 pb-1">
                     <span class="text-gray-500">SKU</span>
                     <span class="font-medium text-gray-900">{{ product()?.sku }}</span>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Try At Home Modal -->
      <div *ngIf="tryAtHomeOpen()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in-up">
         <div class="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative">
            <button (click)="tryAtHomeOpen.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            <div class="bg-primary-900 text-white p-6 text-center">
               <h3 class="font-display font-bold text-xl">Book Try at Home</h3>
               <p class="text-primary-200 text-sm mt-1">Experience this jewellery at your doorstep.</p>
            </div>
            <div class="p-6 space-y-4">
               <div>
                  <label class="block text-xs font-bold text-gray-700 mb-1">Preferred Date</label>
                  <input type="date" class="input-field">
               </div>
               <div>
                  <label class="block text-xs font-bold text-gray-700 mb-1">Time Slot</label>
                  <select class="input-field">
                     <option>10:00 AM - 12:00 PM</option>
                     <option>12:00 PM - 02:00 PM</option>
                     <option>04:00 PM - 06:00 PM</option>
                  </select>
               </div>
               <button (click)="confirmTryAtHome()" class="w-full btn-primary mt-2">Confirm Booking</button>
            </div>
         </div>
      </div>

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
  private toastService = inject(ToastService);
  private historyService = inject(HistoryService);
  private seoService = inject(SeoService);
  private currencyService = inject(CurrencyService);

  loading = signal(true);
  product = signal<ProductDetail | null>(null);

  // UI State
  selectedImage = signal<string | null>(null);
  showVideo = signal(false);
  show360 = signal(false);
  sizeGuideOpen = signal(false);
  educationOpen = signal(false);
  educationTab = signal('4cs');
  showPriceBreakup = signal(false);
  tryAtHomeOpen = signal(false);

  // Customization
  selectedMetal = signal<CustomizationOption | null>(null);
  selectedDiamondQuality = signal<CustomizationOption | null>(null);
  selectedSize = signal<number | null>(null);
  addPostcard = signal(false);
  engravingText = signal('');

  // Delivery
  pincode = signal('');
  deliveryDate = signal<string | null>(null);
  isCheckingDelivery = signal(false);

  // Price Logic
  currentPrice = computed(() => {
    let price = this.product()?.price || 0;
    if (this.selectedMetal()) price += this.selectedMetal()!.priceModifier;
    if (this.selectedDiamondQuality()) price += this.selectedDiamondQuality()!.priceModifier;
    return price;
  });

  currentPriceBreakup = computed(() => {
    const base = this.product()?.priceBreakup;
    if (!base) return null;
    let metalPrice = base.metal;
    let gemstonePrice = base.gemstone;
    if (this.selectedMetal()) metalPrice += this.selectedMetal()!.priceModifier;
    if (this.selectedDiamondQuality()) gemstonePrice += this.selectedDiamondQuality()!.priceModifier;
    const subtotal = metalPrice + gemstonePrice + base.makingCharges;
    const tax = Math.round(subtotal * 0.03); // Approx 3%
    return { metal: metalPrice, gemstone: gemstonePrice, makingCharges: base.makingCharges, tax, total: subtotal + tax };
  });

  ngOnInit(): void {
    this.route.params.subscribe(p => { if(p['id']) this.loadProduct(p['id']); });
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
           this.selectedMetal.set(p.customizationOptions.find(o => o.type === 'metal' && o.priceModifier === 0) || null);
           this.selectedDiamondQuality.set(p.customizationOptions.find(o => o.type === 'diamond' && o.priceModifier === 0) || null);
        }
      },
      error: () => this.loading.set(false)
    });
  }

  handleAddToCart(): void {
    if (this.product()) {
        const options = {
          metal: this.selectedMetal()?.name,
          diamond: this.selectedDiamondQuality()?.name,
          postcard: this.addPostcard(),
          price: this.currentPrice(),
          product: this.product()
        };
        this.cartService.addToCart(this.product()!.id, 1, options).subscribe(() => {
            this.toastService.show(this.addPostcard() ? 'Added to cart with Video Message!' : 'Added to cart', 'success');
        });
    }
  }

  openTryAtHome() { this.tryAtHomeOpen.set(true); }
  confirmTryAtHome() {
     this.tryAtHomeOpen.set(false);
     this.toastService.show('Try at Home request booked! Our agent will call you.', 'success');
  }

  formatPrice(p: number) { return this.currencyService.format(p); }

  checkDelivery() {
    if (this.pincode().length < 4) return this.toastService.show('Invalid pincode', 'error');
    this.isCheckingDelivery.set(true);
    setTimeout(() => {
       this.deliveryDate.set('Mon, 15 Aug');
       this.isCheckingDelivery.set(false);
    }, 500);
  }

  // Helpers
  openEducation(t: string) { this.educationTab.set(t); this.educationOpen.set(true); }
  getProductEmoji(c: string) { return '💍'; } // Simplified
  getBadge(p: Product) { return p.stock < 3 ? 'Low Stock' : undefined; }
  hasOption(t: string) { return !!this.product()?.customizationOptions?.some(o => o.type === t); }
  getOptions(t: string) { return this.product()?.customizationOptions?.filter(o => o.type === t) || []; }
  getMetalColor(n: string) { return n.includes('Rose') ? '#e6a49a' : n.includes('White') ? '#e8e8e8' : '#e5c973'; }
}
