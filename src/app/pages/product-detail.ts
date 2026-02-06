import { Component, OnInit, OnDestroy, signal, computed, inject, ChangeDetectionStrategy, ViewEncapsulation } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ProductService } from '../services/product.service';
import { CartService } from '../services/cart.service';
import { ProductDetail, Product, CustomizationOption, PriceBreakup } from '../core/models';
import { ToastService } from '../services/toast.service';
import { FormsModule } from '@angular/forms';
import { SizeGuideModalComponent } from '../components/size-guide-modal';
import { HistoryService } from '../services/history.service';
import { CurrencyService } from '../services/currency.service';
import { RING_CATEGORIES } from '../core/constants';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, RouterLink, FormsModule, SizeGuideModalComponent, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="min-h-screen bg-white font-sans text-[#4f3267]">

      <!-- Breadcrumb -->
      <nav class="bg-white border-b border-gray-100">
        <div class="container mx-auto px-4 lg:px-12 py-3">
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <a routerLink="/" class="hover:text-[#deaa6f] transition-colors">Home</a>
            <span>/</span>
            <a routerLink="/products" class="hover:text-[#deaa6f] transition-colors">Products</a>
            <span>/</span>
            <span class="text-gray-900 font-medium truncate max-w-[200px]">{{ product()?.name }}</span>
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
              <div class="h-4 w-1/4 bg-gray-200 rounded mb-4"></div> <!-- SKU -->
              <div class="h-10 w-3/4 bg-gray-200 rounded mb-6"></div> <!-- Title -->
              <div class="h-8 w-1/2 bg-gray-200 rounded mb-6"></div> <!-- Price -->

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

            <!-- Image Gallery (Stacked/Grid) -->
            <div class="flex flex-col gap-4">
              <!-- Main Image -->
               <div class="relative w-full bg-gray-50 rounded-lg overflow-hidden border border-gray-100 group cursor-zoom-in h-[500px] flex items-center justify-center">
                  <div class="absolute top-4 left-4 z-10 flex flex-col gap-2">
                    <span *ngIf="(product()?.stock ?? 0) < 5 && (product()?.stock ?? 0) > 0" class="px-2 py-1 bg-yellow-50 text-yellow-700 text-[10px] font-bold uppercase tracking-wider rounded border border-yellow-100">Only {{product()?.stock}} left</span>
                    <span *ngIf="product()?.stock === 0" class="px-2 py-1 bg-red-50 text-red-700 text-[10px] font-bold uppercase tracking-wider rounded border border-red-100">Out of Stock</span>
                    <span class="px-2 py-1 bg-white/90 backdrop-blur text-gray-600 text-[10px] font-bold uppercase tracking-wider rounded border border-gray-200 shadow-sm">Best Seller</span>
                  </div>

                  <img [ngSrc]="selectedImage() || product()?.images?.[0] || product()?.imageUrl || ''"
                       fill priority
                       class="object-contain p-8 transition-transform duration-500 hover:scale-110"
                       [alt]="product()?.name">
               </div>

               <!-- Thumbnails / Secondary Images Grid -->
               <div class="grid grid-cols-2 gap-4">
                  <ng-container *ngFor="let img of product()?.images; let i = index">
                    <div *ngIf="i > 0" (click)="selectedImage.set(img)"
                         class="aspect-square bg-gray-50 rounded-lg overflow-hidden border border-gray-100 cursor-pointer hover:opacity-90 transition-opacity relative h-[300px] flex items-center justify-center">
                       <img [ngSrc]="img" fill class="object-contain p-4 hover:scale-105 transition-transform duration-500">
                    </div>
                  </ng-container>
               </div>
            </div>

            <!-- PRODUCT DETAILS (Moved Below Images) -->
            <div class="border-t border-gray-200 pt-8">
               <h3 class="text-xl font-bold text-[#4f3267] mb-6 font-serif">Product Details</h3>

               <div class="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">

                  <!-- Product Specs -->
                  <div *ngIf="product()?.specifications?.productDetails as pd">
                     <h4 class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3">Product Specifications</h4>
                     <div class="space-y-2 text-sm">
                        <div class="flex justify-between" *ngFor="let item of pd | keyvalue">
                           <span class="text-gray-500 capitalize">{{ formatKey(item.key) }}</span>
                           <span class="font-medium text-gray-900">{{ item.value }}</span>
                        </div>
                     </div>
                  </div>

                  <!-- Metal Specs -->
                  <div *ngIf="product()?.specifications?.metalDetails as md">
                     <h4 class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-3">Metal Specifications</h4>
                     <div *ngFor="let metal of md" class="space-y-2 text-sm">
                        <div class="flex justify-between">
                           <span class="text-gray-500">Type</span>
                           <span class="font-medium text-gray-900">{{ metal.type }}</span>
                        </div>
                        <div class="flex justify-between">
                           <span class="text-gray-500">Purity</span>
                           <span class="font-medium text-gray-900">{{ metal.purity }}</span>
                        </div>
                        <div class="flex justify-between">
                           <span class="text-gray-500">Weight</span>
                           <span class="font-medium text-gray-900">{{ metal.weight }} g</span>
                        </div>
                     </div>
                  </div>
               </div>

               <!-- Diamond Details Table -->
               <div *ngIf="product()?.specifications?.diamondDetails as dd" class="mt-8">
                  <h4 class="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Diamond Specifications</h4>
                  <div class="overflow-hidden border border-gray-200 rounded-lg">
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
                              <td class="px-4 py-3 font-medium text-gray-900">{{ d.type }}</td>
                              <td class="px-4 py-3 text-gray-600">{{ d.shape }}</td>
                              <td class="px-4 py-3 text-gray-600">{{ d.carat }} ct</td>
                              <td class="px-4 py-3 text-gray-600">{{ d.color }} / {{ d.clarity }}</td>
                              <td class="px-4 py-3 text-gray-600">{{ d.settingType }}</td>
                           </tr>
                        </tbody>
                     </table>
                  </div>
               </div>
            </div>

            <!-- Tags/Footer of Left Column -->
            <div class="flex gap-4 mt-4">
              <div class="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-full">
                <span class="text-xl">🛡️</span> 15-Day Money Back
              </div>
              <div class="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-full">
                 <span class="text-xl">💎</span> Lifetime Exchange
              </div>
              <div class="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded-full">
                 <span class="text-xl">📜</span> BIS Hallmarked
              </div>
            </div>

          </div>

          <!-- RIGHT COLUMN: Sticky Buy Box -->
          <div class="lg:w-[42%] relative">
             <div class="sticky top-24 bg-white p-6 rounded-2xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">

                <!-- Product Header -->
                <div class="mb-4">
                   <div class="flex items-center justify-between mb-1">
                      <div class="flex items-center gap-1">
                         <span class="text-orange-400">★★★★☆</span>
                         <span class="text-xs text-gray-500">({{ product()?.reviewCount }} Reviews)</span>
                      </div>
                      <span class="text-xs text-gray-400">SKU: {{ product()?.specifications?.productDetails?.sku || product()?.sku }}</span>
                   </div>
                   <h1 class="text-2xl font-serif font-bold text-[#4f3267] leading-snug">{{ product()?.name }}</h1>
                </div>

                <!-- Price Section -->
                <div class="mb-6 pb-6 border-b border-gray-100">
                   <div class="flex items-baseline gap-3 mb-1">
                      <span class="text-3xl font-bold text-gray-900">{{ (currentPriceBreakup()?.total || currentPrice()) | currencyConvert }}</span>
                      <span *ngIf="product()?.originalPrice" class="text-lg text-gray-400 line-through">{{ (product()?.originalPrice || 0) | currencyConvert }}</span>
                   </div>
                   <p class="text-xs text-green-700 font-medium mb-3">Inclusive of all taxes</p>

                   <!-- Price Breakup Toggle -->
                   <button (click)="togglePriceBreakup()" class="text-xs font-bold text-[#deaa6f] hover:text-[#c59358] flex items-center gap-1 uppercase tracking-wide">
                      View Price Breakup <span class="transition-transform" [class.rotate-180]="showPriceBreakup()">▼</span>
                   </button>

                   <div *ngIf="showPriceBreakup() && currentPriceBreakup()" class="mt-3 bg-gray-50 p-3 rounded text-sm text-gray-600 animate-fade-in space-y-2">
                      <div class="flex justify-between"><span>Metal</span> <span>{{ currentPriceBreakup()!.metal | currencyConvert }}</span></div>
                      <div class="flex justify-between"><span>Stone</span> <span>{{ currentPriceBreakup()!.gemstone | currencyConvert }}</span></div>
                      <div class="flex justify-between"><span>Making</span> <span>{{ currentPriceBreakup()!.makingCharges | currencyConvert }}</span></div>
                      <div class="flex justify-between"><span>GST (3%)</span> <span>{{ currentPriceBreakup()!.tax | currencyConvert }}</span></div>
                      <div class="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200"><span>Grand Total</span> <span>{{ currentPriceBreakup()!.total | currencyConvert }}</span></div>
                   </div>
                </div>

                <!-- Customization Configurator -->
                <div class="space-y-5 mb-8">
                   <!-- Metal -->
                   <div *ngIf="hasOption('metal')">
                      <span class="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">Metal Color & Purity</span>
                      <div class="flex flex-wrap gap-2">
                         <button *ngFor="let opt of getOptions('metal')"
                                 (click)="selectedMetal.set(opt)"
                                 class="px-4 py-2 rounded-full border text-sm font-medium transition-all"
                                 [class.bg-[#4f3267]]="selectedMetal()?.id === opt.id"
                                 [class.text-white]="selectedMetal()?.id === opt.id"
                                 [class.border-[#4f3267]]="selectedMetal()?.id === opt.id"
                                 [class.bg-white]="selectedMetal()?.id !== opt.id"
                                 [class.text-gray-700]="selectedMetal()?.id !== opt.id"
                                 [class.border-gray-200]="selectedMetal()?.id !== opt.id">
                            {{ opt.name }}
                         </button>
                      </div>
                   </div>

                   <!-- Diamond -->
                   <div *ngIf="hasOption('diamond')">
                      <div class="flex justify-between mb-2">
                         <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Diamond Quality</span>
                         <button class="text-xs text-[#deaa6f] underline">Guide</button>
                      </div>
                      <div class="flex flex-wrap gap-2">
                         <button *ngFor="let opt of getOptions('diamond')"
                                 (click)="selectedDiamondQuality.set(opt)"
                                 class="flex-1 px-3 py-2 rounded border text-center text-xs font-medium transition-all"
                                 [class.border-[#4f3267]]="selectedDiamondQuality()?.id === opt.id"
                                 [class.text-[#4f3267]]="selectedDiamondQuality()?.id === opt.id"
                                 [class.bg-[#fbf5ff]]="selectedDiamondQuality()?.id === opt.id"
                                 [class.border-gray-200]="selectedDiamondQuality()?.id !== opt.id"
                                 [class.text-gray-600]="selectedDiamondQuality()?.id !== opt.id">
                            {{ opt.name }}
                         </button>
                      </div>
                   </div>

                   <!-- Size -->
                   <div *ngIf="isRingCategory()">
                      <div class="flex justify-between mb-2">
                         <span class="text-xs font-bold text-gray-500 uppercase tracking-wider">Ring Size</span>
                         <button (click)="sizeGuideOpen.set(true)" class="text-xs text-[#deaa6f] underline">Size Guide</button>
                      </div>
                      <select [ngModel]="selectedSize()" (ngModelChange)="selectedSize.set($event)" class="w-full p-3 border border-gray-200 rounded-lg bg-white text-sm focus:border-[#4f3267] outline-none">
                         <option [ngValue]="null">Select Size</option>
                         <option *ngFor="let i of [6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]" [ngValue]="i">Size {{ i }}</option>
                      </select>
                   </div>
                </div>

                <!-- Delivery -->
                <div class="mb-6">
                   <div class="relative">
                      <input type="text" [ngModel]="pincode()" (ngModelChange)="pincode.set($event)"
                             placeholder="Enter Pincode for Delivery"
                             class="w-full pl-4 pr-20 py-3 border border-gray-200 rounded-lg text-sm focus:border-[#4f3267] outline-none">
                      <button (click)="checkDelivery()" class="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[#4f3267] px-3 py-1.5 hover:bg-gray-50 rounded">
                         CHECK
                      </button>
                   </div>
                   <p *ngIf="deliveryDate()" class="text-xs text-green-700 font-medium mt-2 pl-1">
                      Expected delivery by {{ deliveryDate() }}
                   </p>
                </div>

                <!-- Actions -->
                <div class="flex flex-col gap-3">
                   <div class="flex gap-3">
                       <button (click)="handleAddToCart()"
                               [disabled]="product()?.stock === 0"
                               class="flex-1 bg-gradient-to-r from-[#4f3267] to-[#6d448e] text-white font-bold py-4 rounded-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.99] uppercase tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                          {{ product()?.stock === 0 ? 'Out of Stock' : 'Add to Cart' }}
                       </button>
                       <button (click)="handleBuyNow()"
                               [disabled]="product()?.stock === 0"
                               class="flex-1 bg-white border-2 border-[#4f3267] text-[#4f3267] font-bold py-4 rounded-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.99] uppercase tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                          Buy Now
                       </button>
                   </div>
                   <button (click)="openTryAtHome()"
                           class="w-full border border-[#deaa6f] text-[#4f3267] font-bold py-3 rounded-lg hover:bg-[#fff9f0] transition-colors uppercase tracking-wider text-xs flex items-center justify-center gap-2">
                      <span>🏠</span> Book Try at Home
                   </button>
                </div>

                <div class="mt-6 pt-4 border-t border-gray-100 flex justify-center gap-6 text-xs font-medium text-gray-500">
                   <button class="hover:text-[#4f3267]">Contact Us</button>
                   <span>|</span>
                   <button class="hover:text-[#4f3267]">Chat on WhatsApp</button>
                </div>

             </div>
          </div>

        </div>
      </div>

      <!-- Modals -->
      <app-size-guide-modal [isOpen]="sizeGuideOpen()" (close)="sizeGuideOpen.set(false)"></app-size-guide-modal>

      <!-- Try At Home Modal (Same as before) -->
      <div *ngIf="tryAtHomeOpen()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
         <div class="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl relative">
            <button (click)="tryAtHomeOpen.set(false)" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl z-10">&times;</button>
            <div class="bg-gradient-to-r from-[#4f3267] to-[#362247] text-white p-6 text-center">
               <h3 class="font-serif font-bold text-xl">Book Try at Home</h3>
            </div>
            <div class="p-6 space-y-4">
               <p class="text-sm text-gray-600 text-center mb-4">Our consultant will bring this jewellery to your doorstep.</p>
               <input type="date" class="w-full p-2 border rounded">
               <button (click)="confirmTryAtHome()" class="w-full bg-[#4f3267] text-white py-3 rounded font-bold">Confirm</button>
            </div>
         </div>
      </div>

    </div>
  `,
  styles: [`
    :host { display: block; }
  `]
})
export class ProductDetailComponent implements OnInit, OnDestroy {
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastService = inject(ToastService);
  private historyService = inject(HistoryService);
  private currencyService = inject(CurrencyService);

  loading = signal(true);
  product = signal<ProductDetail | null>(null);

  // UI State
  selectedImage = signal<string | null>(null);
  showVideo = signal(false);
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

  // Computed Prices
  currentPrice = computed(() => {
    let price = this.product()?.price || 0;
    if (this.selectedMetal()) price += this.selectedMetal()?.priceModifier ?? 0;
    if (this.selectedDiamondQuality()) price += this.selectedDiamondQuality()?.priceModifier ?? 0;
    return price;
  });

  currentPriceBreakup = computed(() => {
    const base = this.product()?.priceBreakup;
    if (!base) return null;
    let metalPrice = base.metal;
    let gemstonePrice = base.gemstone;

    // Adjust logic based on modifiers
    if (this.selectedMetal()) metalPrice += this.selectedMetal()?.priceModifier ?? 0;
    if (this.selectedDiamondQuality()) gemstonePrice += this.selectedDiamondQuality()?.priceModifier ?? 0;

    const subtotal = metalPrice + gemstonePrice + base.makingCharges;
    const tax = Math.round(subtotal * 0.03);
    return { metal: metalPrice, gemstone: gemstonePrice, makingCharges: base.makingCharges, tax, total: subtotal + tax };
  });

  ngOnInit(): void {
    this.route.params.subscribe(p => {
        if(p['id']) {
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
          price: this.currentPrice(),
          product: this.product()
        };
        this.cartService.addToCart(this.product()!.id, 1, options).subscribe(() => {
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
          product: this.product()
        };
        this.cartService.addToCart(this.product()!.id, 1, options).subscribe(() => {
            this.router.navigate(['/cart']);
        });
    }
  }

  togglePriceBreakup() { this.showPriceBreakup.set(!this.showPriceBreakup()); }
  openTryAtHome() { this.tryAtHomeOpen.set(true); }
  confirmTryAtHome() {
     this.tryAtHomeOpen.set(false);
     this.toastService.show('Booking Confirmed! Check your email.', 'success');
  }

  checkDelivery() {
    if (this.pincode().length < 6) return this.toastService.show('Please enter a valid 6-digit pincode', 'error');
    this.toastService.show('Checking availability...', 'info');

    this.productService.checkDeliveryAvailability(this.pincode()).subscribe({
        next: (response) => {
            if (response.available) {
                this.deliveryDate.set(response.estimatedDate || 'Available');
                this.toastService.show(response.message || 'Delivery available', 'success');
            } else {
                this.deliveryDate.set(null);
                this.toastService.show(response.message || 'Delivery not available', 'error');
            }
        },
        error: () => {
             this.deliveryDate.set(null);
             this.toastService.show('Could not check delivery', 'error');
        }
    });
  }

  isRingCategory(): boolean {
      const cat = this.product()?.category;
      if (!cat) return false;
      return RING_CATEGORIES.some(c => cat.includes(c));
  }

  // Helpers
  hasOption(t: string) { return !!this.product()?.customizationOptions?.some(o => o.type === t); }
  getOptions(t: string) { return this.product()?.customizationOptions?.filter(o => o.type === t) || []; }
  formatKey(k: string) { return k.replace(/([A-Z])/g, ' $1').trim(); }
}
