import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CompareService } from '../services/compare.service';

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

        <div *ngIf="compareService.compareList().length > 0" class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr>
                <th class="p-4 border-b-2 border-diamond-200 w-1/4">Attribute</th>
                <th *ngFor="let product of compareService.compareList()" class="p-4 border-b-2 border-diamond-200 min-w-[250px]">
                    <div class="flex justify-between items-start">
                        <span class="font-bold text-lg text-diamond-900">{{ product.name }}</span>
                        <button (click)="compareService.removeFromCompare(product.id)" class="text-red-500 hover:text-red-700">✕</button>
                    </div>
                </th>
              </tr>
            </thead>
            <tbody>
               <tr>
                   <td class="p-4 border-b border-diamond-100 font-semibold">Image</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <div class="w-24 h-24 bg-diamond-100 flex items-center justify-center overflow-hidden rounded">
                           <img *ngIf="product.imageUrl" [src]="product.imageUrl" class="w-full h-full object-cover">
                           <span *ngIf="!product.imageUrl">💎</span>
                       </div>
                   </td>
               </tr>
               <tr>
                   <td class="p-4 border-b border-diamond-100 font-semibold">Price</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       {{ formatPrice(product.price) }}
                   </td>
               </tr>
               <tr>
                   <td class="p-4 border-b border-diamond-100 font-semibold">Category</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       {{ product.category }}
                   </td>
               </tr>
               <tr>
                   <td class="p-4 border-b border-diamond-100 font-semibold">Rating</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       {{ product.rating }} ★ ({{ product.reviewCount }})
                   </td>
               </tr>
               <tr>
                   <td class="p-4 border-b border-diamond-100 font-semibold">Description</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100 text-sm text-gray-600">
                       {{ product.description }}
                   </td>
               </tr>
               <tr>
                   <td class="p-4 border-b border-diamond-100 font-semibold">Availability</td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <span [class.text-red-600]="product.stock <= 0" [class.text-green-600]="product.stock > 0">
                           {{ product.stock > 0 ? 'In Stock' : 'Out of Stock' }}
                       </span>
                   </td>
               </tr>
               <tr>
                   <td class="p-4 border-b border-diamond-100"></td>
                   <td *ngFor="let product of compareService.compareList()" class="p-4 border-b border-diamond-100">
                       <!-- Add to Cart (Mock) -->
                       <button class="btn-primary w-full">Add to Cart</button>
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

  formatPrice(price: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(price);
  }
}
