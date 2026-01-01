import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BuilderService } from '../services/builder.service';
import { ProductService } from '../services/product.service';
import { CartService } from '../services/cart.service';
import { Product } from '../core/models';
import { CurrencyService } from '../services/currency.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-builder',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50">
      <!-- Builder Header -->
      <div class="bg-white border-b border-diamond-200 sticky top-0 z-40 shadow-sm">
        <div class="container-luxury py-4">
          <div class="flex items-center justify-between">
            <h1 class="text-xl font-display font-bold text-diamond-900">Build Your Ring</h1>
            <div class="text-right">
              <p class="text-xs text-gray-500 uppercase tracking-widest">Est. Total</p>
              <p class="text-xl font-bold text-gold-600">{{ currency.format(builder.totalPrice()) }}</p>
            </div>
          </div>

          <!-- Stepper -->
          <div class="mt-4 flex items-center justify-between max-w-2xl mx-auto relative">
             <div class="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -z-10 -translate-y-1/2"></div>

             <!-- Step 1 -->
             <button (click)="builder.goToStep(1)" class="flex flex-col items-center bg-gray-50 px-2" [disabled]="false">
               <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors"
                    [class.bg-gold-500]="builder.currentStep() >= 1"
                    [class.text-white]="builder.currentStep() >= 1"
                    [class.bg-gray-300]="builder.currentStep() < 1">
                 1
               </div>
               <span class="text-xs font-semibold mt-1" [class.text-gold-600]="builder.currentStep() >= 1">Setting</span>
             </button>

             <!-- Step 2 -->
             <button (click)="builder.goToStep(2)" class="flex flex-col items-center bg-gray-50 px-2" [disabled]="!builder.selectedSetting()">
               <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors"
                    [class.bg-gold-500]="builder.currentStep() >= 2"
                    [class.text-white]="builder.currentStep() >= 2"
                    [class.bg-gray-300]="builder.currentStep() < 2">
                 2
               </div>
               <span class="text-xs font-semibold mt-1" [class.text-gold-600]="builder.currentStep() >= 2">Diamond</span>
             </button>

             <!-- Step 3 -->
             <button (click)="builder.goToStep(3)" class="flex flex-col items-center bg-gray-50 px-2" [disabled]="!builder.selectedSetting() || !builder.selectedStone()">
               <div class="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-colors"
                    [class.bg-gold-500]="builder.currentStep() >= 3"
                    [class.text-white]="builder.currentStep() >= 3"
                    [class.bg-gray-300]="builder.currentStep() < 3">
                 3
               </div>
               <span class="text-xs font-semibold mt-1" [class.text-gold-600]="builder.currentStep() >= 3">Review</span>
             </button>
          </div>
        </div>
      </div>

      <div class="container-luxury py-8">

        <!-- STEP 1: SETTINGS -->
        <div *ngIf="builder.currentStep() === 1" class="animate-fade-in">
          <h2 class="text-2xl font-bold text-center mb-8">Choose Your Setting</h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div *ngFor="let product of settings()"
                 (click)="selectSetting(product)"
                 class="card group cursor-pointer hover:border-gold-500 transition-all border-2"
                 [class.border-gold-500]="builder.selectedSetting()?.id === product.id"
                 [class.border-transparent]="builder.selectedSetting()?.id !== product.id">
              <div class="h-64 bg-diamond-50 flex items-center justify-center mb-4 text-6xl group-hover:scale-105 transition-transform">
                💍
              </div>
              <div class="p-4 pt-0">
                <h3 class="font-bold text-lg mb-1">{{ product.name }}</h3>
                <p class="text-gold-600 font-bold mb-2">{{ currency.format(product.price) }}</p>
                <button class="btn-secondary w-full group-hover:bg-gold-500 group-hover:text-white group-hover:border-gold-500">
                  {{ builder.selectedSetting()?.id === product.id ? 'Selected' : 'Select Setting' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 2: STONES -->
        <div *ngIf="builder.currentStep() === 2" class="animate-fade-in">
          <div class="flex items-center gap-4 mb-8">
             <button (click)="builder.goToStep(1)" class="text-sm text-gray-500 hover:text-gold-600">← Change Setting</button>
             <h2 class="text-2xl font-bold flex-1 text-center">Choose Your Diamond</h2>
             <div class="w-24"></div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <div *ngFor="let product of stones()"
                 (click)="selectStone(product)"
                 class="card group cursor-pointer hover:border-gold-500 transition-all border-2"
                 [class.border-gold-500]="builder.selectedStone()?.id === product.id"
                 [class.border-transparent]="builder.selectedStone()?.id !== product.id">
              <div class="h-64 bg-diamond-50 flex items-center justify-center mb-4 text-6xl group-hover:scale-105 transition-transform">
                💎
              </div>
              <div class="p-4 pt-0">
                <div class="flex justify-between items-start mb-2">
                   <h3 class="font-bold text-lg">{{ product.name }}</h3>
                </div>
                <!-- Specs -->
                <div class="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-4 bg-gray-50 p-2 rounded">
                  <div *ngIf="product.specifications?.carat">
                     <span class="font-semibold">Carat:</span> {{ product.specifications?.carat }}
                  </div>
                   <div *ngIf="product.specifications?.color">
                     <span class="font-semibold">Color:</span> {{ product.specifications?.color }}
                  </div>
                   <div *ngIf="product.specifications?.clarity">
                     <span class="font-semibold">Clarity:</span> {{ product.specifications?.clarity }}
                  </div>
                </div>

                <p class="text-gold-600 font-bold mb-2">{{ currency.format(product.price) }}</p>
                <button class="btn-secondary w-full group-hover:bg-gold-500 group-hover:text-white group-hover:border-gold-500">
                   {{ builder.selectedStone()?.id === product.id ? 'Selected' : 'Select Diamond' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- STEP 3: REVIEW -->
        <div *ngIf="builder.currentStep() === 3" class="animate-fade-in">
          <h2 class="text-2xl font-bold text-center mb-8">Your Custom Creation</h2>

          <div class="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
             <!-- Visual -->
             <div class="md:col-span-2 bg-white rounded-2xl shadow-lg p-8 flex flex-col items-center justify-center relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-luxury opacity-5"></div>
                <div class="relative z-10 flex flex-col items-center">
                    <div class="text-9xl mb-4 relative">
                        <span class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-30 blur-xl">💍</span>
                        💍
                    </div>
                    <p class="font-display font-bold text-2xl text-diamond-900">{{ builder.selectedSetting()?.name }}</p>
                    <p class="text-gray-500 mb-6">set with</p>
                    <p class="font-display font-bold text-xl text-diamond-900">{{ builder.selectedStone()?.name }}</p>
                </div>
             </div>

             <!-- Summary -->
             <div class="space-y-6">
                <div class="card p-6">
                  <h3 class="font-bold text-gray-900 mb-4 pb-2 border-b">Order Summary</h3>

                  <div class="flex justify-between py-2">
                    <div class="flex-1">
                      <p class="font-medium text-sm">{{ builder.selectedSetting()?.name }}</p>
                      <button (click)="builder.goToStep(1)" class="text-xs text-gold-600 underline">Change</button>
                    </div>
                    <p class="font-medium">{{ currency.format(builder.selectedSetting()?.price || 0) }}</p>
                  </div>

                  <div class="flex justify-between py-2 border-t border-dashed border-gray-200">
                    <div class="flex-1">
                      <p class="font-medium text-sm">{{ builder.selectedStone()?.name }}</p>
                      <button (click)="builder.goToStep(2)" class="text-xs text-gold-600 underline">Change</button>
                    </div>
                    <p class="font-medium">{{ currency.format(builder.selectedStone()?.price || 0) }}</p>
                  </div>

                  <div class="flex justify-between py-4 border-t-2 border-gray-900 mt-4">
                    <p class="font-bold text-lg">Total</p>
                    <p class="font-bold text-2xl text-gold-600">{{ currency.format(builder.totalPrice()) }}</p>
                  </div>

                  <button (click)="addToCart()" class="btn-primary w-full py-4 text-lg mt-4 shadow-gold">
                    Add to Cart
                  </button>
                  <p class="text-xs text-center text-gray-500 mt-2">
                    Free shipping & 30-day returns included.
                  </p>
                </div>
             </div>
          </div>
        </div>

      </div>
    </div>
  `
})
export class BuilderComponent implements OnInit {
  builder = inject(BuilderService);
  productService = inject(ProductService);
  cartService = inject(CartService);
  currency = inject(CurrencyService);
  toast = inject(ToastService);
  router = inject(Router);

  settings = signal<Product[]>([]);
  stones = signal<Product[]>([]);

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    // Load Settings
    this.productService.getProducts(0, 100, { category: 'Ring Setting' }).subscribe(res => {
        this.settings.set(res.content);
        // Fallback if empty (mock issues)
        if (res.content.length === 0) {
            // Try fetching all and filtering manually for demo
            this.productService.getProducts(0, 100).subscribe(all => {
                this.settings.set(all.content.filter(p => p.category === 'Ring Setting' || p.name.includes('Setting')));
            });
        }
    });

    // Load Stones
    this.productService.getProducts(0, 100, { category: 'Loose Gemstone' }).subscribe(res => {
        this.stones.set(res.content);
        if (res.content.length === 0) {
             this.productService.getProducts(0, 100).subscribe(all => {
                this.stones.set(all.content.filter(p => p.category === 'Loose Gemstone'));
            });
        }
    });
  }

  selectSetting(p: Product) {
    this.builder.setSetting(p);
  }

  selectStone(p: Product) {
    this.builder.setStone(p);
  }

  addToCart() {
    const setting = this.builder.selectedSetting();
    const stone = this.builder.selectedStone();

    if (setting && stone) {
        // Create a composite product or add both
        // For mock simplification, we add the Setting with the Stone as a variant/option
        // OR add both items.

        // Let's add the Setting with metadata
        this.cartService.addToCart(setting.id, 1, {
            stoneId: stone.id,
            stoneName: stone.name,
            customization: 'Build Your Own Ring'
        } as any).subscribe(() => {
             this.toast.show("Custom Ring added to cart! 💍", "success");
             this.router.navigate(['/cart']);
        });
    }
  }
}
