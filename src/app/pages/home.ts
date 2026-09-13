import { Component, signal, computed, OnInit, inject, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import { switchMap } from "rxjs/operators";
import { of } from "rxjs";
import { ProductService } from "../services/product.service";
import { CartService } from "../services/cart.service";
import { SettingService } from "../services/setting.service";
import { Product } from "../core/models";
import { SeoService } from "../services/seo.service";
import { ToastService } from "../services/toast.service";
import { CurrencyConvertPipe } from "../pipes/currency-convert.pipe";
import { unitLabel, unitRate, totalSuffix } from "../core/product-display";
import { VirtualTryOnComponent } from "../components/virtual-try-on";
import { EmailNotificationService } from "../services/email-notification.service";

interface SimulatorMetal {
  id: string;
  name: string;
  colorCode: string;
  baseModifier: number;
}

interface SimulatorShape {
  name: string;
  multiplier: number;
}

@Component({
  selector: "app-home",
  standalone: true,
  imports: [
    CommonModule,
    NgOptimizedImage,
    RouterLink,
    FormsModule,
    CurrencyConvertPipe,
    VirtualTryOnComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- APPLE DESIGN SYSTEM: FLAGSHIP HAUTE JOAILLERIE HOMEPAGE -->
    <div class="w-full overflow-hidden font-sans bg-white text-[#1d1d1f]">

      <!-- HERO TILE: PURE LIGHT LUXURY SHOWCASE (content from home.* settings) -->
      <section class="relative min-h-[90vh] flex flex-col justify-between py-16 md:py-24 border-b border-[#e0e0e0] bg-[#fafafc]">
        <div class="max-w-[1080px] mx-auto text-center px-4 z-10">

          <!-- Floating Gold Hallmark Pill -->
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white border border-[#e0e0e0] mb-6 animate-fadeIn">
            <span class="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse"></span>
            <span class="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D4AF37]">{{ home().heroEyebrow }}</span>
          </div>

          <h1 class="font-display font-semibold text-4xl sm:text-6xl md:text-7xl text-[#1d1d1f] tracking-tight leading-[1.05] mb-5">
            {{ home().heroTitle }}
          </h1>
          <p class="font-sans text-lg sm:text-xl md:text-2xl text-[#6e6e73] font-normal tracking-tight mb-8 max-w-2xl mx-auto leading-relaxed">
            {{ home().heroSubtitle }}
          </p>

          <!-- CTA Action Buttons -->
          <div class="flex flex-wrap items-center justify-center gap-4 mb-10">
            <a [routerLink]="home().heroPrimaryCtaLink" class="btn-apple-pill !py-3.5 !px-8 text-sm">
              {{ home().heroPrimaryCtaLabel }}
            </a>
            <a [routerLink]="home().heroSecondaryCtaLink" class="btn-apple-pill-secondary !py-3.5 !px-8 text-sm flex items-center gap-2">
              <span>✦</span> {{ home().heroSecondaryCtaLabel }}
            </a>
          </div>

          <!-- Trust Badges Strip -->
          <div class="flex flex-wrap justify-center items-center gap-6 sm:gap-10 text-[11px] font-medium text-[#7a7a7a] uppercase tracking-wider">
            <span *ngFor="let badge of home().trustBadges" class="flex items-center gap-1.5">
              <svg class="w-4 h-4 text-[#D4AF37]" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>
              {{ badge }}
            </span>
          </div>

        </div>

        <!-- Hero Masterpiece Display (hidden until the admin uploads a photo) -->
        <div *ngIf="home().heroImageUrl" class="max-w-[1200px] w-full mx-auto px-4 mt-12 relative flex justify-center">
          <div class="w-full max-w-[960px] aspect-[16/9] relative rounded-[28px] overflow-hidden product-surface-shadow border border-[#e0e0e0]">
            <img [ngSrc]="home().heroImageUrl"
                 fill
                 priority
                 sizes="(max-width: 1200px) 100vw, 80vw"
                 class="object-cover hover:scale-105 transition-transform duration-1000"
                 [alt]="home().heroImageAlt">
            <div *ngIf="home().heroCaptionLabel || home().heroCaptionTitle" class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex items-end p-8">
              <div class="text-white">
                <span *ngIf="home().heroCaptionLabel" class="text-xs font-mono uppercase tracking-[0.2em] text-[#D4AF37] block mb-1">{{ home().heroCaptionLabel }}</span>
                <h3 *ngIf="home().heroCaptionTitle" class="font-display font-semibold text-2xl sm:text-3xl text-white">{{ home().heroCaptionTitle }}</h3>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- INTERACTIVE ATELIER SPOTLIGHT: 4CS SOLITAIRE SIMULATOR -->
      <section *ngIf="home().simulatorEnabled" class="py-24 bg-[#f5f5f7] border-b border-[#e0e0e0]">
        <div class="max-w-[1280px] mx-auto px-6 md:px-12">

          <div class="text-center max-w-2xl mx-auto mb-16">
            <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">Interactive Atelier</span>
            <h2 class="font-display font-semibold text-3xl sm:text-4xl text-[#1d1d1f] tracking-tight mb-4">
              Configure Your Solitaire.
            </h2>
            <p class="text-sm text-[#7a7a7a]">
              Experience real-time proportions. Select precious gold alloy and diamond cut shapes to preview your bespoke creation.
            </p>
          </div>

          <!-- Interactive Atelier Stage Card -->
          <div class="bg-white rounded-[24px] border border-[#e0e0e0] p-8 md:p-12 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">

            <!-- Left: Interactive Visual Stage (metal swatch rendering) -->
            <div class="relative bg-[#f5f5f7] rounded-[20px] aspect-square flex flex-col items-center justify-center p-8 border border-[#e0e0e0] overflow-hidden group"
                 role="img"
                 [attr.aria-label]="selectedMetal().name + ' ' + selectedDiamondShape()">
              <div class="w-56 h-56 rounded-full border-[14px] flex items-center justify-center group-hover:scale-105 transition-transform duration-500"
                   [style.border-color]="selectedMetal().colorCode"
                   [style.background-color]="'#ffffff'">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" class="w-24 h-24 text-[#1d1d1f]" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 3h12l4 6-10 12L2 9l4-6zm0 0l6 18M18 3l-6 18M2 9h20M8.5 9L12 3l3.5 6" />
                </svg>
              </div>
              <div class="mt-8 text-center">
                <span class="text-[11px] uppercase tracking-[0.2em] text-[#7a7a7a] block mb-1">Your setting</span>
                <span class="font-display font-semibold text-xl text-[#1d1d1f]">{{ selectedMetal().name }}</span>
                <span class="block text-sm text-[#6e6e73]">{{ selectedDiamondShape() }}</span>
              </div>

              <!-- Dynamic Specs Badge -->
              <div class="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-[#e0e0e0] text-[11px] font-semibold text-[#1d1d1f] flex items-center gap-2">
                <span class="w-2.5 h-2.5 rounded-full border border-black/10" [style.background-color]="selectedMetal().colorCode"></span>
                {{ selectedMetal().name }} • {{ selectedDiamondShape() }}
              </div>

              <!-- Quick Try On CTA -->
              <button *ngIf="featuredProducts().length > 0"
                      (click)="openSpotlightTryOn()"
                      class="absolute bottom-4 right-4 btn-apple-pill text-xs !py-2 !px-4 !bg-white/95 !text-[#1d1d1f] hover:!bg-white border border-[#e0e0e0] shadow-md flex items-center gap-1.5">
                <span>✨</span> AR Try-On
              </button>
            </div>

            <!-- Right: Configurator Selector Controls -->
            <div class="space-y-8">

              <!-- 1. Metal Alloy Selector -->
              <div>
                <span class="text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider block mb-3">1. Select Precious Metal</span>
                <div class="grid grid-cols-3 gap-3">
                  <button *ngFor="let m of metals"
                          (click)="selectMetal(m)"
                          [attr.aria-pressed]="selectedMetalId() === m.id"
                          [class.bg-[#1d1d1f]]="selectedMetalId() === m.id"
                          [class.text-white]="selectedMetalId() === m.id"
                          [class.border-[#1d1d1f]]="selectedMetalId() === m.id"
                          [class.bg-[#f5f5f7]]="selectedMetalId() !== m.id"
                          [class.text-[#1d1d1f]]="selectedMetalId() !== m.id"
                          class="py-3 px-2 rounded-xl border border-[#e0e0e0] text-center text-xs font-medium transition-all active-press flex flex-col items-center gap-1">
                    <span class="w-4 h-4 rounded-full" [style.background-color]="m.colorCode"></span>
                    <span>{{ m.name }}</span>
                  </button>
                </div>
              </div>

              <!-- 2. Diamond Cut Shape Selector -->
              <div>
                <span class="text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider block mb-3">2. Diamond Cut & Shape</span>
                <div class="grid grid-cols-4 gap-2 text-xs">
                  <button *ngFor="let shape of diamondShapes"
                          (click)="selectShape(shape)"
                          [attr.aria-pressed]="selectedDiamondShape() === shape.name"
                          [class.bg-[#1d1d1f]]="selectedDiamondShape() === shape.name"
                          [class.text-white]="selectedDiamondShape() === shape.name"
                          [class.border-[#1d1d1f]]="selectedDiamondShape() === shape.name"
                          [class.bg-[#f5f5f7]]="selectedDiamondShape() !== shape.name"
                          [class.text-[#1d1d1f]]="selectedDiamondShape() !== shape.name"
                          class="py-2.5 px-2 rounded-xl border border-[#e0e0e0] font-medium text-center transition-all active-press">
                    {{ shape.name }}
                  </button>
                </div>
              </div>

              <!-- 3. Valuation & Atelier CTAs -->
              <div class="pt-6 border-t border-[#e0e0e0] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <span class="text-[11px] uppercase tracking-wider text-[#7a7a7a] block">Estimated Valuation</span>
                  <span class="font-sans font-semibold text-2xl text-[#1d1d1f]">{{ estimatedPrice() | currencyConvert }}</span>
                </div>
                <div class="flex items-center gap-3">
                  <a routerLink="/builder" class="btn-apple-pill text-xs !py-3 !px-6">
                    Launch Ring Studio &rarr;
                  </a>
                </div>
              </div>

            </div>

          </div>

        </div>
      </section>

      <!-- FEATURED HIGH JEWELRY CREATIONS -->
      <section class="py-24 max-w-[1440px] mx-auto px-6 md:px-12">
        <div class="flex flex-col md:flex-row md:items-end justify-between mb-12">
          <div>
            <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-2 block">{{ home().featuredEyebrow }}</span>
            <h2 class="font-display font-semibold text-3xl md:text-4xl text-[#1d1d1f] tracking-tight">{{ home().featuredTitle }}</h2>
          </div>
          <a routerLink="/products" class="text-xs font-semibold text-[#D4AF37] hover:underline uppercase tracking-wider mt-4 md:mt-0">
            View All Collections &rarr;
          </a>
        </div>

        <!-- Products Grid (Cards with Add to Bag + Quick AR Try On) -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">

          <article *ngFor="let item of featuredProducts()" class="store-utility-card cursor-pointer group flex flex-col justify-between">
            <div [routerLink]="['/products', item.id]">
              <div class="w-full aspect-square bg-[#f5f5f7] rounded-[16px] overflow-hidden relative mb-6">
                <img *ngIf="item.imageUrl || item.images?.[0]"
                     [ngSrc]="item.imageUrl || item.images?.[0] || ''"
                     fill
                     sizes="(max-width: 768px) 100vw, 33vw"
                     class="object-cover group-hover:scale-105 transition-transform duration-700"
                     [alt]="item.name">

                <div *ngIf="!item.imageUrl && !item.images?.[0]" class="w-full h-full flex items-center justify-center text-[#D4AF37] p-8">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-16 h-16"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22a8 8 0 100-16 8 8 0 000 16zm0-16V2m-3 2h6M9 6l3-4 3 4" /></svg>
                </div>

                <!-- Instant Try On Button on Card -->
                <button (click)="openQuickTryOn($event, item)"
                        class="absolute bottom-3 right-3 btn-apple-pill text-[11px] !py-1.5 !px-3 !bg-white/90 !text-[#1d1d1f] hover:!bg-white border border-[#e0e0e0] backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity">
                  ✨ Try On
                </button>
              </div>

              <span class="text-[11px] text-[#7a7a7a] uppercase font-mono tracking-wider block mb-1">{{ item.category }}</span>
              <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] group-hover:text-[#D4AF37] transition-colors mb-2 line-clamp-1">{{ item.name }}</h3>
            </div>

            <div class="flex justify-between items-center pt-4 border-t border-[#f0f0f0]">
              <div class="font-sans font-semibold text-base text-[#1d1d1f]">
                {{ item.price | currencyConvert }}<span *ngIf="totalSuffix(item)" class="text-xs font-normal text-[#7a7a7a] ml-1">{{ totalSuffix(item) }}</span>
                <span *ngIf="unitRate(item) as rate" class="block text-xs font-normal text-[#7a7a7a]">{{ rate | currencyConvert }} {{ unitLabel(item) }}</span>
              </div>
              <button (click)="handleAddToCart($event, item)" class="btn-apple-pill text-xs !py-1.5 !px-4">
                Add to Bag
              </button>
            </div>
          </article>

          <!-- Fallback Cards if API has few products -->
          <article *ngIf="featuredProducts().length < 3" routerLink="/builder" class="store-utility-card cursor-pointer group flex flex-col justify-between">
            <div>
              <div class="w-full aspect-square bg-[#f5f5f7] rounded-[16px] flex items-center justify-center text-[#D4AF37] p-8 mb-6 group-hover:scale-105 transition-transform duration-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-20 h-20"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22a8 8 0 100-16 8 8 0 000 16zm0-16V2m-3 2h6M9 6l3-4 3 4" /></svg>
              </div>
              <span class="text-[11px] text-[#7a7a7a] uppercase font-mono tracking-wider block mb-1">Bespoke Studio</span>
              <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] group-hover:text-[#D4AF37] transition-colors mb-2">Build Your Dream Solitaire</h3>
              <p class="text-xs text-[#7a7a7a]">Handpick natural diamonds and 18K solid gold settings.</p>
            </div>
            <div class="flex justify-between items-center pt-4 border-t border-[#f0f0f0]">
              <span class="text-xs font-semibold text-[#D4AF37]">Custom Atelier</span>
              <span class="btn-apple-pill text-xs !py-1.5 !px-4">Start Studio</span>
            </div>
          </article>

        </div>
      </section>

      <!-- THE BESPOKE 3-STEP JOURNEY -->
      <section class="py-24 bg-[#1c1c1e] text-white">
        <div class="max-w-[1280px] mx-auto px-6 md:px-12">

          <div class="text-center max-w-2xl mx-auto mb-16">
            <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">The Atelier Method</span>
            <h2 class="font-display font-semibold text-3xl sm:text-4xl text-white tracking-tight mb-4">
              How Your Jewelry Is Born.
            </h2>
            <p class="text-sm text-[#a1a1a6]">
              From conflict-free mine to master goldsmith bench — crafted without unnecessary retail markups.
            </p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-8">

            <!-- Step 1 -->
            <div class="bg-[#2c2c2e] p-8 rounded-[20px] border border-white/10 relative">
              <span class="font-mono text-3xl text-[#D4AF37] font-semibold block mb-4">01</span>
              <h3 class="font-display font-semibold text-xl text-white mb-2">18K Precious Setting</h3>
              <p class="text-xs text-[#a1a1a6] leading-relaxed">
                Choose from solid 18K Yellow Gold, Rose Gold, or Platinum 950 alloys with BIS government hallmarking.
              </p>
            </div>

            <!-- Step 2 -->
            <div class="bg-[#2c2c2e] p-8 rounded-[20px] border border-white/10 relative">
              <span class="font-mono text-3xl text-[#D4AF37] font-semibold block mb-4">02</span>
              <h3 class="font-display font-semibold text-xl text-white mb-2">Certified Gemstone</h3>
              <p class="text-xs text-[#a1a1a6] leading-relaxed">
                Hand-select ethical diamonds and natural gemstones graded by GIA, IGI, and GRS gemological laboratories.
              </p>
            </div>

            <!-- Step 3 -->
            <div class="bg-[#2c2c2e] p-8 rounded-[20px] border border-white/10 relative">
              <span class="font-mono text-3xl text-[#D4AF37] font-semibold block mb-4">03</span>
              <h3 class="font-display font-semibold text-xl text-white mb-2">Handset & Polished</h3>
              <p class="text-xs text-[#a1a1a6] leading-relaxed">
                Master goldsmiths hand-set every stone with microscope precision and deliver in insured luxury packaging.
              </p>
            </div>

          </div>

          <div class="mt-12 text-center">
            <a routerLink="/builder" class="btn-apple-pill text-xs !py-3 !px-8">
              Design Your Creation &rarr;
            </a>
          </div>

        </div>
      </section>

      <!-- VIP CONCIERGE & INVITATION -->
      <section class="py-24 bg-[#fafafc] border-t border-[#e0e0e0]">
        <div class="max-w-[700px] mx-auto text-center px-6">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">Private Access</span>
          <h2 class="font-display font-semibold text-3xl text-[#1d1d1f] mb-4">Join The Caratloop Circle.</h2>
          <p class="text-xs text-[#7a7a7a] mb-8 leading-relaxed">
            Receive private invitations to limited collection drops, bespoke gemstone releases, and VIP concierge fittings.
          </p>

          <form (submit)="handleSubscribe($event)" class="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input type="email"
                   [(ngModel)]="emailInput"
                   name="email"
                   placeholder="Enter your email address"
                   aria-label="Email address"
                   required
                   class="flex-1 bg-white border border-[#e0e0e0] rounded-full px-5 py-3 text-xs text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37]">
            <button type="submit" class="btn-apple-pill text-xs !py-3 !px-6 whitespace-nowrap">
              Request Invitation
            </button>
          </form>
        </div>
      </section>

      <!-- Quick Virtual Try-On Modal Triggered from Homepage -->
      <app-virtual-try-on
        [isOpen]="tryOnOpen()"
        [productImageUrl]="tryOnProduct()?.imageUrl || tryOnProduct()?.images?.[0]"
        [productName]="tryOnProduct()?.name || 'Solitaire Masterpiece'"
        [productCategory]="tryOnProduct()?.category || 'Fine Jewelry'"
        (closeEvent)="tryOnOpen.set(false)">
      </app-virtual-try-on>

    </div>
  `,
})
export class HomeComponent implements OnInit {
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private settingService = inject(SettingService);
  private seoService = inject(SeoService);
  private toastService = inject(ToastService);
  private emailService = inject(EmailNotificationService);

  /** Hero, simulator and featured-section copy from the `home.*` settings, defaults applied. */
  home = this.settingService.homeContent;

  featuredProducts = signal<Product[]>([]);
  tryOnOpen = signal(false);
  tryOnProduct = signal<Product | null>(null);

  emailInput = '';

  // Sale-mode display helpers (core/product-display) for the product card price line.
  readonly unitLabel = unitLabel;
  readonly unitRate = unitRate;
  readonly totalSuffix = totalSuffix;

  // Solitaire Simulator State
  metals: SimulatorMetal[] = [
    { id: 'yellow', name: '18K Yellow Gold', colorCode: '#D4AF37', baseModifier: 0 },
    { id: 'rose', name: '18K Rose Gold', colorCode: '#B76E79', baseModifier: 5000 },
    { id: 'platinum', name: 'Platinum 950', colorCode: '#E5E4E2', baseModifier: 15000 },
  ];

  diamondShapes: SimulatorShape[] = [
    { name: 'Round Brilliant', multiplier: 1.0 },
    { name: 'Emerald Cut', multiplier: 1.15 },
    { name: 'Oval Cut', multiplier: 1.08 },
    { name: 'Princess Cut', multiplier: 1.05 },
  ];

  selectedMetalId = signal('yellow');
  selectedDiamondShape = signal('Round Brilliant');

  selectedMetal = computed<SimulatorMetal>(
    () => this.metals.find(m => m.id === this.selectedMetalId()) ?? this.metals[0]
  );

  /** (base from home.simulatorBasePrice + metal modifier) x shape multiplier. */
  estimatedPrice = computed(() => {
    const shape = this.diamondShapes.find(s => s.name === this.selectedDiamondShape());
    const base = this.home().simulatorBasePrice;
    const metalMod = this.selectedMetal().baseModifier;
    const shapeMult = shape ? shape.multiplier : 1.0;
    return Math.round((base + metalMod) * shapeMult);
  });

  ngOnInit() {
    this.seoService.updateTags({
      title: 'Caratloop | Fine Jewelry & Solitaire Atelier',
      description: 'Handcrafted fine jewelry, certified conflict-free solitaires, and 18K solid gold creations. Explore curated collections.',
      url: 'https://www.caratloop.com'
    });

    // Admin-flagged featured products; fall back to the newest arrivals when
    // fewer than three are flagged so the section is never nearly empty.
    this.productService.getProducts(0, 6, { featured: true, sort: 'newest' }).pipe(
      switchMap(res => res.content.length >= 3
        ? of(res)
        : this.productService.getProducts(0, 6, { sort: 'newest' }))
    ).subscribe({
      next: (res) => this.featuredProducts.set(res.content),
      error: (err) => console.error('Error fetching home products', err)
    });
  }

  selectMetal(metal: SimulatorMetal) {
    this.selectedMetalId.set(metal.id);
  }

  selectShape(shape: SimulatorShape) {
    this.selectedDiamondShape.set(shape.name);
  }

  openSpotlightTryOn() {
    this.tryOnProduct.set(this.featuredProducts()[0] ?? null);
    this.tryOnOpen.set(true);
  }

  openQuickTryOn(event: Event, product: Product) {
    event.preventDefault();
    event.stopPropagation();
    this.tryOnProduct.set(product);
    this.tryOnOpen.set(true);
  }

  handleAddToCart(event: Event, product: Product): void {
    event.preventDefault();
    event.stopPropagation();
    const options = { product, price: product.price };
    this.cartService.addToCart(product.id, 1, options).subscribe(() => {
      this.toastService.show(`Added ${product.name} to your bag`, 'success');
    });
  }

  handleSubscribe(event: Event) {
    event.preventDefault();
    const email = this.emailInput.trim();
    if (!email) return;
    this.emailService.subscribeToNotifications(email).subscribe({
      next: () => {
        this.toastService.show('Thank you! You have been added to the Caratloop Circle.', 'success');
        this.emailInput = '';
      },
      error: () => this.toastService.show('Could not subscribe right now. Please try again.', 'error')
    });
  }
}
