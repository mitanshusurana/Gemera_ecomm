import { Component, Input, Output, EventEmitter, inject, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ProductDetail } from "../core/models";
import { CurrencyService } from "../services/currency.service";

@Component({
  selector: "app-quick-view-modal",
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      *ngIf="isOpen"
      class="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm transition-opacity duration-200"
      (click)="onBackdropClick()"
    ></div>

    <div
      *ngIf="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-200"
    >
      <div
        class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        (click)="$event.stopPropagation()"
      >
        <!-- Close Button -->
        <div
          class="flex justify-between items-center p-6 border-b border-diamond-200"
        >
          <h2 class="text-2xl font-display font-bold text-diamond-900">
            Quick View
          </h2>
          <button
            (click)="close.emit()"
            class="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg
              class="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        </div>

        <!-- Product Content -->
        <div class="p-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <!-- Image -->
            <div>
              <div
                class="bg-gradient-to-br from-gold-100 to-diamond-100 rounded-xl overflow-hidden h-80 flex items-center justify-center"
              >
                <!-- Use imageUrl if available, else emoji -->
                <img *ngIf="product?.imageUrl" [src]="product?.imageUrl" class="w-full h-full object-cover" [alt]="product?.name" onerror="this.style.display='none'">
                <span *ngIf="!product?.imageUrl" class="text-6xl">{{
                  product ? getProductEmoji(product.category) : "✦"
                }}</span>
              </div>

              <!-- Stock Status -->
              <div class="mt-4 p-4 rounded-lg" [ngClass]="getStockClass()">
                <p class="text-sm font-semibold">{{ getStockMessage() }}</p>
              </div>
            </div>

            <!-- Details -->
            <div>
              <!-- Category & Badge -->
              <div class="flex items-start justify-between mb-3">
                <span
                  class="text-xs text-gold-600 font-bold uppercase tracking-widest"
                >
                  {{ product?.category || "Product" }}
                </span>
              </div>

              <!-- Name -->
              <h3 class="text-2xl font-semibold text-gray-900 mb-3">
                {{ product?.name || "Product" }}
              </h3>

              <!-- Rating -->
              <div class="flex items-center gap-2 mb-4">
                <div class="flex gap-0.5">
                  <span *ngFor="let i of [1, 2, 3, 4, 5]" class="text-gold-500"
                    >★</span
                  >
                </div>
                <span class="text-sm text-gray-600"
                  >({{ product?.reviewCount || 0 }} reviews)</span
                >
              </div>

              <!-- Price -->
              <div class="mb-6 pb-6 border-b border-diamond-200">
                <div class="flex items-baseline gap-3">
                  <span class="text-3xl font-bold text-diamond-900">
                    {{ formatPrice(product?.price || 0) }}
                  </span>
                  <span
                    *ngIf="product && product.originalPrice"
                    class="text-lg text-gray-500 line-through"
                  >
                    {{ formatPrice(product.originalPrice) }}
                  </span>
                </div>
              </div>

              <!-- Description -->
              <p class="text-gray-700 text-sm mb-6">
                {{ product?.description || "No description available" }}
              </p>

              <!-- Specifications -->
              <div *ngIf="product && product.specifications" class="mb-6">
                <h4 class="font-semibold text-gray-900 mb-3">Key Specs</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                  <div *ngIf="product.specifications.carat">
                    <p class="text-gray-600">
                      Carat:
                      <span class="font-semibold">{{
                        product.specifications.carat
                      }}</span>
                    </p>
                  </div>
                  <div *ngIf="product.specifications.clarity">
                    <p class="text-gray-600">
                      Clarity:
                      <span class="font-semibold">{{
                        product.specifications.clarity
                      }}</span>
                    </p>
                  </div>
                  <div *ngIf="product.specifications.color">
                    <p class="text-gray-600">
                      Color:
                      <span class="font-semibold">{{
                        product.specifications.color
                      }}</span>
                    </p>
                  </div>
                  <div *ngIf="product.specifications.cut">
                    <p class="text-gray-600">
                      Cut:
                      <span class="font-semibold">{{
                        product.specifications.cut
                      }}</span>
                    </p>
                  </div>
                  <div *ngIf="product.metal">
                    <p class="text-gray-600">
                      Metal:
                      <span class="font-semibold">{{
                        product.metal
                      }}</span>
                    </p>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex gap-3">
                <button (click)="onAddToCart()" class="flex-1 btn-primary py-3">
                  Add to Cart
                </button>
              </div>

              <!-- View Full Details Link -->
              <button
                (click)="onViewDetails()"
                class="w-full mt-3 px-4 py-2 text-gold-600 hover:text-gold-700 font-semibold transition-colors"
              >
                View Full Details →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class QuickViewModalComponent {
  @Input() isOpen = false;
  @Input() product: ProductDetail | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() addToCart = new EventEmitter<{
    productId: string;
    quantity: number;
  }>();
  @Output() viewDetails = new EventEmitter<string>();

  private currencyService = inject(CurrencyService);

  onBackdropClick(): void {
    this.close.emit();
  }

  onAddToCart(): void {
    if (this.product) {
      this.addToCart.emit({
        productId: this.product.id,
        quantity: 1,
      });
      this.close.emit();
    }
  }

  onViewDetails(): void {
    if (this.product) {
      this.viewDetails.emit(this.product.id);
      this.close.emit();
    }
  }

  getProductEmoji(category?: string): string {
    const emojiMap: { [key: string]: string } = {
      "Engagement Ring": "💍",
      "Loose Gemstone": "💎",
      "Spiritual Idol": "🕉️",
      "Gemstone Ring": "👑",
      "Precious Metal": "🏆",
    };
    return emojiMap[category || ""] || "✦";
  }

  getStockClass(): string {
    if (!this.product) return "bg-gray-100";
    if (this.product.stock > 10) return "bg-green-100 text-green-800";
    if (this.product.stock > 0) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  }

  getStockMessage(): string {
    if (!this.product) return "Loading...";
    if (this.product.stock > 10)
      return `✓ In Stock (${this.product.stock} available)`;
    if (this.product.stock > 0)
      return `⚠ Only ${this.product.stock} left in stock`;
    return "✗ Out of Stock";
  }

  formatPrice(price: number): string {
    return this.currencyService.format(price);
  }
}
