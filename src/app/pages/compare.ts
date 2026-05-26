import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { CompareService } from '../services/compare.service';
import { CartService } from '../services/cart.service';
import { Product } from '../core/models';
import { ToastService } from '../services/toast.service';
import { CurrencyService } from '../services/currency.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

@Component({
  selector: 'app-compare',
  standalone: true,
  imports: [CommonModule, RouterLink, NgOptimizedImage, CurrencyConvertPipe],
  template: `
    <div class="min-h-screen bg-surface">
      <div class="bg-diamond-50 border-b border-diamond-200 section-padding">
        <div class="container-luxury">
          <h1 class="text-4xl font-display font-bold text-diamond-900 mb-4">Compare Products</h1>
          <p class="text-ink">Compare up to 3 products side-by-side</p>
        </div>
      </div>

      <div class="container-luxury section-padding">
        <div *ngIf="compareService.compareList().length === 0" class="text-center py-12">
           <p class="text-xl text-ink mb-6">No products selected for comparison.</p>
           <a routerLink="/products" class="btn-primary">Browse Products</a>
        </div>

        <div *ngIf="compareService.compareList().length > 0" class="relative shadow-lg rounded-lg bg-surface">
          <!-- Mobile Scroll Hint -->
          <div class="md:hidden text-xs text-center py-2 text-ink bg-surface italic border-b border-ink">
            Scroll horizontally to see more products &rarr;
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr class="bg-surface sticky top-0 z-10 shadow-sm">
                  <th class="p-4 border-b-2 border-diamond-200 w-1/4 bg-surface font-bold text-ink sticky left-0 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Attribute</th>
                  <th *ngFor="let product of compareService.compareList()" class="p-4 border-b-2 border-diamond-200 min-w-[200px] md:min-w-[250px] bg-surface relative">
                    <div class="flex justify-between items-start">
                        <div class="flex flex-col">
                            <span class="font-bold text-lg text-diamond-900">{{ product.name }}</span>
                            <span *ngIf="isBestValue(product)" class="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full w-fit mt-1">
                                Best Value
                            </span>
                        </div>
                        <button (click)="compareService.removeFromCompare(product.id)" class="text-ink hover:text-red-500 transition-colors" title="Remove">✕</button>
                    </div>
                </th>
              </tr>
            </thead>
            <tbody>
               <!-- Image Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('imageUrl')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-ink sticky left-0 bg-surface z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" [class.bg-yellow-50]="isAttributeDifferent('imageUrl')">Product</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <div class="w-24 h-24 md:w-32 md:h-32 bg-diamond-100 flex items-center justify-center overflow-hidden rounded-lg mx-auto relative">
                           <img *ngIf="product.imageUrl || product.images?.[0]" [ngSrc]="product.imageUrl || product.images?.[0] || ''" fill class="w-full h-full object-cover">
                           <span *ngIf="!product.imageUrl && !product.images?.[0]" class="text-4xl">💎</span>
                       </div>
                   </td>
               </tr>

               <!-- Price Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('price')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-ink sticky left-0 bg-surface z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" [class.bg-yellow-50]="isAttributeDifferent('price')">Price</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <span class="text-lg md:text-xl font-bold text-diamond-900">{{ product.price | currencyConvert }}</span>
                   </td>
               </tr>

               <!-- Category Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('category')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-ink sticky left-0 bg-surface z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" [class.bg-yellow-50]="isAttributeDifferent('category')">Category</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       {{ product.category }}
                   </td>
               </tr>

               <!-- Metal Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('metal')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-ink sticky left-0 bg-surface z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" [class.bg-yellow-50]="isAttributeDifferent('metal')">Metal</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       {{ product.metal || '-' }}
                   </td>
               </tr>

               <!-- Gemstones -->
                <tr [class.bg-yellow-50]="isAttributeDifferent('gemstones')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-ink sticky left-0 bg-surface z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" [class.bg-yellow-50]="isAttributeDifferent('gemstones')">Gemstones</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       {{ product.gemstones?.join(', ') || '-' }}
                   </td>
               </tr>

               <!-- Rating Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('rating')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-ink sticky left-0 bg-surface z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" [class.bg-yellow-50]="isAttributeDifferent('rating')">Rating</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <div class="flex items-center gap-1">
                           <span class="text-gold-500 font-bold">{{ product.rating || 'N/A' }} ★</span>
                           <span class="text-xs text-ink">({{ product.reviewCount || 0 }})</span>
                       </div>
                   </td>
               </tr>

               <!-- Description Row -->
               <tr>
                   <td class="p-4 border-b border-diamond-100 font-semibold text-ink sticky left-0 bg-surface z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Description</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100 text-sm text-ink align-top">
                       {{ product.description }}
                   </td>
               </tr>

               <!-- Availability Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('stock')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-ink sticky left-0 bg-surface z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]" [class.bg-yellow-50]="isAttributeDifferent('stock')">Availability</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <span [class.text-red-600]="product.stock <= 0" [class.text-green-600]="product.stock > 0" class="font-medium">
                           {{ product.stock > 0 ? 'In Stock' : 'Out of Stock' }}
                       </span>
                   </td>
               </tr>

               <!-- Action Row -->
               <tr class="bg-surface">
                   <td class="p-4 border-b border-diamond-100 sticky left-0 bg-surface z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]"></td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <button (click)="handleAddToCart(product)" class="btn-primary w-full shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all">Add to Cart</button>
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
  private currencyService = inject(CurrencyService);

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
