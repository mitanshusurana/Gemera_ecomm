import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { CompareService } from '../services/compare.service';
import { CartService } from '../services/cart.service';
import { Product } from '../core/models';
import { ToastService } from '../services/toast.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

@Component({
  selector: 'app-compare',
  standalone: true,
  imports: [CommonModule, RouterLink, NgOptimizedImage, CurrencyConvertPipe],
  template: `
    <!-- APPLE DESIGN SYSTEM: COMPARE (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">
      <!-- Parchment Header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-16 px-6 md:px-12">
        <div class="max-w-[1440px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Side by Side</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl text-[#1d1d1f] tracking-tight mb-3">Compare Products</h1>
          <p class="text-base text-[#7a7a7a]">Compare up to 3 products side-by-side</p>
        </div>
      </section>

      <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-12">
        <div *ngIf="compareService.compareList().length === 0" class="text-center py-16">
           <p class="text-xl text-[#6e6e73] mb-6">No products selected for comparison.</p>
           <a routerLink="/products" class="btn-apple-pill">Browse Products</a>
        </div>

        <div *ngIf="compareService.compareList().length > 0" class="relative bg-white border border-[#e0e0e0] rounded-[18px] overflow-hidden">
          <!-- Mobile Scroll Hint -->
          <div class="md:hidden text-xs text-center py-2 text-[#6e6e73] bg-[#f5f5f7] border-b border-[#e0e0e0]">
            Scroll horizontally to see more products &rarr;
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr class="bg-[#f5f5f7] sticky top-0 z-10">
                  <th class="p-4 border-b border-[#e0e0e0] border-r w-1/4 bg-[#f5f5f7] text-xs uppercase tracking-wider font-semibold text-[#6e6e73] sticky left-0 z-20">Attribute</th>
                  <th *ngFor="let product of compareService.compareList()" class="p-4 border-b border-[#e0e0e0] min-w-[200px] md:min-w-[250px] bg-[#f5f5f7] relative">
                    <div class="flex justify-between items-start gap-2">
                        <div class="flex flex-col">
                            <span class="font-display font-semibold text-lg text-[#1d1d1f]">{{ product.name }}</span>
                            <span *ngIf="isBestValue(product)" class="inline-block px-2.5 py-0.5 bg-green-50 text-green-700 text-[11px] font-semibold rounded-full w-fit mt-1">
                                Best Value
                            </span>
                        </div>
                        <button (click)="compareService.removeFromCompare(product.id)" class="text-[#6e6e73] hover:text-red-600 active-press rounded-full p-1" title="Remove" aria-label="Remove from comparison">✕</button>
                    </div>
                </th>
              </tr>
            </thead>
            <tbody>
               <!-- Image Row -->
               <tr [class.bg-amber-50]="isAttributeDifferent('imageUrl')">
                   <td class="p-4 border-b border-[#f0f0f0] border-r border-r-[#e0e0e0] text-sm font-semibold text-[#1d1d1f] sticky left-0 bg-white z-10" [class.!bg-amber-50]="isAttributeDifferent('imageUrl')">Product</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-[#f0f0f0]">
                       <div class="w-24 h-24 md:w-32 md:h-32 bg-[#f5f5f7] border border-[#e0e0e0] flex items-center justify-center overflow-hidden rounded-[12px] mx-auto relative">
                           <img *ngIf="product.imageUrl || product.images?.[0]" [ngSrc]="product.imageUrl || product.images?.[0] || ''" fill class="w-full h-full object-cover">
                           <span *ngIf="!product.imageUrl && !product.images?.[0]" class="text-4xl">💎</span>
                       </div>
                   </td>
               </tr>

               <!-- Price Row -->
               <tr [class.bg-amber-50]="isAttributeDifferent('price')">
                   <td class="p-4 border-b border-[#f0f0f0] border-r border-r-[#e0e0e0] text-sm font-semibold text-[#1d1d1f] sticky left-0 bg-white z-10" [class.!bg-amber-50]="isAttributeDifferent('price')">Price</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-[#f0f0f0]">
                       <span class="text-lg md:text-xl font-semibold text-[#1d1d1f]">{{ product.price | currencyConvert }}</span>
                   </td>
               </tr>

               <!-- Category Row -->
               <tr [class.bg-amber-50]="isAttributeDifferent('category')">
                   <td class="p-4 border-b border-[#f0f0f0] border-r border-r-[#e0e0e0] text-sm font-semibold text-[#1d1d1f] sticky left-0 bg-white z-10" [class.!bg-amber-50]="isAttributeDifferent('category')">Category</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-[#f0f0f0] text-sm text-[#1d1d1f]">
                       {{ product.category }}
                   </td>
               </tr>

               <!-- Metal Row -->
               <tr [class.bg-amber-50]="isAttributeDifferent('metal')">
                   <td class="p-4 border-b border-[#f0f0f0] border-r border-r-[#e0e0e0] text-sm font-semibold text-[#1d1d1f] sticky left-0 bg-white z-10" [class.!bg-amber-50]="isAttributeDifferent('metal')">Metal</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-[#f0f0f0] text-sm text-[#1d1d1f]">
                       {{ product.metal || '-' }}
                   </td>
               </tr>

               <!-- Gemstones -->
                <tr [class.bg-amber-50]="isAttributeDifferent('gemstones')">
                   <td class="p-4 border-b border-[#f0f0f0] border-r border-r-[#e0e0e0] text-sm font-semibold text-[#1d1d1f] sticky left-0 bg-white z-10" [class.!bg-amber-50]="isAttributeDifferent('gemstones')">Gemstones</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-[#f0f0f0] text-sm text-[#1d1d1f]">
                       {{ product.gemstones?.join(', ') || '-' }}
                   </td>
               </tr>

               <!-- Rating Row -->
               <tr [class.bg-amber-50]="isAttributeDifferent('rating')">
                   <td class="p-4 border-b border-[#f0f0f0] border-r border-r-[#e0e0e0] text-sm font-semibold text-[#1d1d1f] sticky left-0 bg-white z-10" [class.!bg-amber-50]="isAttributeDifferent('rating')">Rating</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-[#f0f0f0]">
                       <div class="flex items-center gap-1">
                           <span class="text-[#D4AF37] font-semibold">{{ product.rating || 'N/A' }} ★</span>
                           <span class="text-xs text-[#6e6e73]">({{ product.reviewCount || 0 }})</span>
                       </div>
                   </td>
               </tr>

               <!-- Description Row -->
               <tr>
                   <td class="p-4 border-b border-[#f0f0f0] border-r border-r-[#e0e0e0] text-sm font-semibold text-[#1d1d1f] sticky left-0 bg-white z-10">Description</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-[#f0f0f0] text-sm text-[#6e6e73] align-top">
                       {{ product.description }}
                   </td>
               </tr>

               <!-- Availability Row -->
               <tr [class.bg-amber-50]="isAttributeDifferent('stock')">
                   <td class="p-4 border-b border-[#f0f0f0] border-r border-r-[#e0e0e0] text-sm font-semibold text-[#1d1d1f] sticky left-0 bg-white z-10" [class.!bg-amber-50]="isAttributeDifferent('stock')">Availability</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-[#f0f0f0]">
                       <span [class.text-red-600]="product.stock <= 0" [class.text-green-600]="product.stock > 0" class="text-sm font-medium">
                           {{ product.stock > 0 ? 'In Stock' : 'Out of Stock' }}
                       </span>
                   </td>
               </tr>

               <!-- Action Row -->
               <tr class="bg-white">
                   <td class="p-4 border-r border-r-[#e0e0e0] sticky left-0 bg-white z-10"></td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4">
                       <button (click)="handleAddToCart(product)" class="btn-apple-pill w-full text-sm !py-2.5">Add to Cart</button>
                   </td>
               </tr>
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  `
})
export class CompareComponent implements OnInit {
  compareService = inject(CompareService);
  cartService = inject(CartService);
  toastService = inject(ToastService);
  titleService = inject(Title);

  ngOnInit(): void {
    this.titleService.setTitle('Compare Products | Caratloop Fine Jewels');
  }

  handleAddToCart(product: Product): void {
      this.cartService.addToCart(product.id, 1).subscribe(() => {
          this.toastService.show('Added to cart', 'success');
      });
  }

  isAttributeDifferent(attr: keyof Product): boolean {
    const list = this.compareService.compareList();
    if (list.length < 2) return false;

    const firstVal = list[0][attr];
    // Simple equality check. For arrays/objects might need deep check but sufficient for strings/numbers.
    return list.some(p => p[attr]?.toString() !== firstVal?.toString());
  }

  isBestValue(product: Product): boolean {
    // Logic: Lowest Price AND Rating >= 4.5
    const list = this.compareService.compareList();
    if (list.length < 2) return false;

    const minPrice = Math.min(...list.map(p => p.price));
    return product.price === minPrice && (product.rating || 0) >= 4.5;
  }
}
