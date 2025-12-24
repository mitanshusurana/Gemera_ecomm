import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CompareService } from '../services/compare.service';
import { ApiService, Product } from '../services/api.service';

@Component({
  selector: 'app-compare',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-white">
      <div class="bg-diamond-50 border-b border-diamond-200 section-padding">
        <div class="container-luxury">
          <h1 class="text-4xl font-display font-bold text-diamond-900 mb-4">Compare Products</h1>
          <p class="text-gray-600">Compare up to 3 products side-by-side</p>
        </div>
      </div>

      <div class="container-luxury section-padding">
        <div *ngIf="compareService.compareList().length === 0" class="text-center py-12">
           <p class="text-xl text-gray-500 mb-6">No products selected for comparison.</p>
           <a routerLink="/products" class="btn-primary">Browse Products</a>
        </div>

        <div *ngIf="compareService.compareList().length > 0" class="overflow-x-auto relative shadow-lg rounded-lg bg-white">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-50 sticky top-0 z-10 shadow-sm">
                <th class="p-4 border-b-2 border-diamond-200 w-1/4 bg-gray-50 font-bold text-gray-700">Attribute</th>
                <th *ngFor="let product of compareService.compareList()" class="p-4 border-b-2 border-diamond-200 min-w-[250px] bg-gray-50 relative">
                    <div class="flex justify-between items-start">
                        <div class="flex flex-col">
                            <span class="font-bold text-lg text-diamond-900">{{ product.name }}</span>
                            <span *ngIf="isBestValue(product)" class="inline-block px-2 py-0.5 bg-green-100 text-green-700 text-xs font-bold rounded-full w-fit mt-1">
                                Best Value
                            </span>
                        </div>
                        <button (click)="compareService.removeFromCompare(product.id)" class="text-gray-400 hover:text-red-500 transition-colors" title="Remove">✕</button>
                    </div>
                </th>
              </tr>
            </thead>
            <tbody>
               <!-- Image Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('imageUrl')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-gray-600">Product</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <div class="w-32 h-32 bg-diamond-100 flex items-center justify-center overflow-hidden rounded-lg mx-auto">
                           <img *ngIf="product.imageUrl" [src]="product.imageUrl" class="w-full h-full object-cover">
                           <span *ngIf="!product.imageUrl" class="text-4xl">💎</span>
                       </div>
                   </td>
               </tr>

               <!-- Price Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('price')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-gray-600">Price</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <span class="text-xl font-bold text-diamond-900">{{ formatPrice(product.price) }}</span>
                   </td>
               </tr>

               <!-- Category Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('category')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-gray-600">Category</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       {{ product.category }}
                   </td>
               </tr>

               <!-- Metal Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('metal')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-gray-600">Metal</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       {{ product.metal || '-' }}
                   </td>
               </tr>

               <!-- Gemstones -->
                <tr [class.bg-yellow-50]="isAttributeDifferent('gemstones')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-gray-600">Gemstones</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       {{ product.gemstones.join(', ') || '-' }}
                   </td>
               </tr>

               <!-- Rating Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('rating')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-gray-600">Rating</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <div class="flex items-center gap-1">
                           <span class="text-gold-500 font-bold">{{ product.rating }} ★</span>
                           <span class="text-xs text-gray-500">({{ product.reviewCount }})</span>
                       </div>
                   </td>
               </tr>

               <!-- Description Row -->
               <tr>
                   <td class="p-4 border-b border-diamond-100 font-semibold text-gray-600">Description</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100 text-sm text-gray-600 align-top">
                       {{ product.description }}
                   </td>
               </tr>

               <!-- Availability Row -->
               <tr [class.bg-yellow-50]="isAttributeDifferent('stock')">
                   <td class="p-4 border-b border-diamond-100 font-semibold text-gray-600">Availability</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <span [class.text-red-600]="product.stock <= 0" [class.text-green-600]="product.stock > 0" class="font-medium">
                           {{ product.stock > 0 ? 'In Stock' : 'Out of Stock' }}
                       </span>
                   </td>
               </tr>

               <!-- Action Row -->
               <tr class="bg-gray-50">
                   <td class="p-4 border-b border-diamond-100"></td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <button (click)="handleAddToCart(product)" class="btn-primary w-full shadow-md hover:shadow-lg transform hover:-translate-y-0.5 transition-all">Add to Cart</button>
                   </td>
               </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class CompareComponent {
  compareService = inject(CompareService);
  apiService = inject(ApiService);

  handleAddToCart(product: Product): void {
      this.apiService.addToCart(product.id, 1).subscribe(() => {
          alert('Added to cart');
      });
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(price);
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
    return product.price === minPrice && product.rating >= 4.5;
  }
}
