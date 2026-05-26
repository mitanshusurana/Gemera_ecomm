import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface ComparisonProduct {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  category: string;
  rating: number;
  reviews: number;
  stock: number;
  specifications?: {
    carat?: number;
    clarity?: string;
    color?: string;
    cut?: string;
    metal?: string;
    weight?: number;
  };
  features: string[];
}

@Component({
  selector: 'app-product-comparison',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-diamond-50 to-white">
      <!-- Header -->
      <div class="bg-surface border-b border-diamond-200 sticky top-0 z-40">
        <div class="container-luxury py-6">
          <div class="flex items-center justify-between">
            <h1 class="text-3xl font-display font-bold text-diamond-900">
              Compare Products
            </h1>
            <button
              (click)="closeComparison.emit()"
              class="text-ink hover:text-ink transition-colors"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                ></path>
              </svg>
            </button>
          </div>
          <p class="text-ink mt-2">Compare up to 3 products to make an informed decision</p>
        </div>
      </div>

      <!-- Comparison Table -->
      <div class="container-luxury section-padding">
        <!-- Empty State -->
        <div *ngIf="selectedProducts().length === 0" class="text-center py-16">
          <svg class="w-16 h-16 mx-auto text-ink mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            ></path>
          </svg>
          <h3 class="text-2xl font-semibold text-ink mb-2">No products selected</h3>
          <p class="text-ink mb-6">Add products from the products page to start comparing</p>
          <button (click)="closeComparison.emit()" class="btn-primary">
            Continue Shopping
          </button>
        </div>

        <!-- Comparison Grid -->
        <div *ngIf="selectedProducts().length > 0" class="overflow-x-auto">
          <table class="w-full border-collapse">
            <!-- Product Cards Row -->
            <thead>
              <tr class="border-b-2 border-diamond-300">
                <th class="text-left p-4 bg-diamond-50 font-semibold text-diamond-900 w-40">
                  Specifications
                </th>
                <th
                  *ngFor="let product of selectedProducts()"
                  class="p-4 min-w-72 border-l border-diamond-200"
                >
                  <div class="card p-6 bg-surface">
                    <!-- Product Image -->
                    <div class="w-full h-48 bg-gradient-to-br from-gold-100 to-diamond-100 rounded-lg flex items-center justify-center mb-4">
                      <span class="text-5xl">{{ getProductEmoji(product.category) }}</span>
                    </div>

                    <!-- Product Info -->
                    <p class="text-xs text-gold-600 font-bold uppercase tracking-wider mb-2">
                      {{ product.category }}
                    </p>
                    <h3 class="font-semibold text-ink mb-2 line-clamp-2">
                      {{ product.name }}
                    </h3>

                    <!-- Price -->
                    <div class="mb-3">
                      <p class="text-2xl font-bold text-diamond-900">
                        {{ formatPrice(product.price) }}
                      </p>
                      <p *ngIf="product.originalPrice" class="text-sm text-ink line-through">
                        {{ formatPrice(product.originalPrice) }}
                      </p>
                    </div>

                    <!-- Rating -->
                    <div class="flex items-center gap-1 mb-4">
                      <div class="flex gap-0.5">
                        <span *ngFor="let i of [1,2,3,4,5]" class="text-gold-500">★</span>
                      </div>
                      <span class="text-xs text-ink">({{ product.reviews }})</span>
                    </div>

                    <!-- Stock Status -->
                    <div
                      [class.bg-green-100]="product.stock > 10"
                      [class.text-green-800]="product.stock > 10"
                      [class.bg-yellow-100]="product.stock > 0 && product.stock <= 10"
                      [class.text-yellow-800]="product.stock > 0 && product.stock <= 10"
                      [class.bg-red-100]="product.stock === 0"
                      [class.text-red-800]="product.stock === 0"
                      class="px-3 py-2 rounded text-xs font-semibold mb-4"
                    >
                      <span *ngIf="product.stock > 10">✓ In Stock ({{ product.stock }} available)</span>
                      <span *ngIf="product.stock > 0 && product.stock <= 10">⚠ Only {{ product.stock }} left</span>
                      <span *ngIf="product.stock === 0">✗ Out of Stock</span>
                    </div>

                    <!-- Remove Button -->
                    <button
                      (click)="onRemoveProduct(product.id)"
                      class="w-full px-4 py-2 border-2 border-red-300 text-red-600 hover:bg-red-50 font-semibold rounded-lg transition-all"
                    >
                      Remove
                    </button>
                  </div>
                </th>
              </tr>
            </thead>

            <!-- Specifications Rows -->
            <tbody>
              <!-- Price Row -->
              <tr class="border-b border-diamond-200">
                <td class="p-4 bg-diamond-50 font-semibold text-ink">Price</td>
                <td *ngFor="let product of selectedProducts()" class="p-4 border-l border-diamond-200 text-center">
                  <p class="text-lg font-bold text-diamond-900">{{ formatPrice(product.price) }}</p>
                </td>
              </tr>

              <!-- Carat Weight Row -->
              <tr class="border-b border-diamond-200" *ngIf="hasSpec('carat')">
                <td class="p-4 bg-diamond-50 font-semibold text-ink">Carat Weight</td>
                <td
                  *ngFor="let product of selectedProducts()"
                  class="p-4 border-l border-diamond-200 text-center"
                >
                  <p *ngIf="product.specifications && product.specifications.carat" class="text-ink font-semibold">
                    {{ product.specifications.carat }} ct
                  </p>
                  <p *ngIf="!product.specifications || !product.specifications.carat" class="text-ink">N/A</p>
                </td>
              </tr>

              <!-- Clarity Row -->
              <tr class="border-b border-diamond-200" *ngIf="hasSpec('clarity')">
                <td class="p-4 bg-diamond-50 font-semibold text-ink">Clarity</td>
                <td
                  *ngFor="let product of selectedProducts()"
                  class="p-4 border-l border-diamond-200 text-center"
                >
                  <p *ngIf="product.specifications && product.specifications.clarity" class="text-ink font-semibold">
                    {{ product.specifications.clarity }}
                  </p>
                  <p *ngIf="!product.specifications || !product.specifications.clarity" class="text-ink">N/A</p>
                </td>
              </tr>

              <!-- Color Row -->
              <tr class="border-b border-diamond-200" *ngIf="hasSpec('color')">
                <td class="p-4 bg-diamond-50 font-semibold text-ink">Color</td>
                <td
                  *ngFor="let product of selectedProducts()"
                  class="p-4 border-l border-diamond-200 text-center"
                >
                  <p *ngIf="product.specifications && product.specifications.color" class="text-ink font-semibold">
                    {{ product.specifications.color }}
                  </p>
                  <p *ngIf="!product.specifications || !product.specifications.color" class="text-ink">N/A</p>
                </td>
              </tr>

              <!-- Cut Row -->
              <tr class="border-b border-diamond-200" *ngIf="hasSpec('cut')">
                <td class="p-4 bg-diamond-50 font-semibold text-ink">Cut</td>
                <td
                  *ngFor="let product of selectedProducts()"
                  class="p-4 border-l border-diamond-200 text-center"
                >
                  <p *ngIf="product.specifications && product.specifications.cut" class="text-ink font-semibold">
                    {{ product.specifications.cut }}
                  </p>
                  <p *ngIf="!product.specifications || !product.specifications.cut" class="text-ink">N/A</p>
                </td>
              </tr>

              <!-- Metal Row -->
              <tr class="border-b border-diamond-200" *ngIf="hasSpec('metal')">
                <td class="p-4 bg-diamond-50 font-semibold text-ink">Metal</td>
                <td
                  *ngFor="let product of selectedProducts()"
                  class="p-4 border-l border-diamond-200 text-center"
                >
                  <p *ngIf="product.specifications && product.specifications.metal" class="text-ink font-semibold">
                    {{ product.specifications.metal }}
                  </p>
                  <p *ngIf="!product.specifications || !product.specifications.metal" class="text-ink">N/A</p>
                </td>
              </tr>

              <!-- Weight Row -->
              <tr class="border-b border-diamond-200" *ngIf="hasSpec('weight')">
                <td class="p-4 bg-diamond-50 font-semibold text-ink">Weight</td>
                <td
                  *ngFor="let product of selectedProducts()"
                  class="p-4 border-l border-diamond-200 text-center"
                >
                  <p *ngIf="product.specifications && product.specifications.weight" class="text-ink font-semibold">
                    {{ product.specifications.weight }}g
                  </p>
                  <p *ngIf="!product.specifications || !product.specifications.weight" class="text-ink">N/A</p>
                </td>
              </tr>

              <!-- Rating Row -->
              <tr class="border-b border-diamond-200">
                <td class="p-4 bg-diamond-50 font-semibold text-ink">Rating</td>
                <td
                  *ngFor="let product of selectedProducts()"
                  class="p-4 border-l border-diamond-200 text-center"
                >
                  <div class="flex items-center justify-center gap-2">
                    <div class="flex gap-0.5">
                      <span *ngFor="let i of [1,2,3,4,5]" class="text-gold-500">★</span>
                    </div>
                    <span class="text-sm text-ink">{{ product.rating || 'N/A' }}</span>
                  </div>
                </td>
              </tr>

              <!-- Features Row -->
              <tr class="border-b border-diamond-200" *ngIf="hasFeatures()">
                <td class="p-4 bg-diamond-50 font-semibold text-ink">Features</td>
                <td
                  *ngFor="let product of selectedProducts()"
                  class="p-4 border-l border-diamond-200"
                >
                  <ul class="space-y-2">
                    <li *ngFor="let feature of product.features" class="flex items-start gap-2">
                      <span class="text-gold-600 font-bold">✓</span>
                      <span class="text-ink">{{ feature }}</span>
                    </li>
                  </ul>
                </td>
              </tr>

              <!-- Add to Cart Row -->
              <tr>
                <td class="p-4 bg-diamond-50"></td>
                <td *ngFor="let product of selectedProducts()" class="p-4 border-l border-diamond-200">
                  <button class="w-full btn-primary">Add to Cart</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `,
})
export class ProductComparisonComponent {
  @Input() selectedProducts = signal<ComparisonProduct[]>([]);
  @Output() closeComparison = new EventEmitter<void>();

  onRemoveProduct(productId: string): void {
    const current = this.selectedProducts();
    this.selectedProducts.set(current.filter(p => p.id !== productId));
  }

  hasSpec(spec: string): boolean {
    return this.selectedProducts().some(p => {
      const value = (p.specifications as any)?.[spec];
      return value !== undefined && value !== null;
    });
  }

  hasFeatures(): boolean {
    return this.selectedProducts().some(p => p.features && p.features.length > 0);
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(price);
  }

  getProductEmoji(category: string): string {
    const emojiMap: { [key: string]: string } = {
      'Diamond': '💎',
      'Gemstone': '💎',
      'Gold': '🏆',
      'Platinum': '✨',
      'Pearl': '⭐',
    };
    return emojiMap[category] || '✦';
  }
}
