import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy, HostListener, ViewChild, ElementRef, inject } from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { ProductDetail } from "../core/models";
import { CategoryLabelService } from "../services/category-label.service";
import { CurrencyConvertPipe } from "../pipes/currency-convert.pipe";
import { unitLabel, unitRate, totalSuffix, secondaryLine } from "../core/product-display";

@Component({
  selector: "app-quick-view-modal",
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, CurrencyConvertPipe],
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
        #modalContainer
        class="bg-white rounded-[18px] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto font-sans"
        (click)="$event.stopPropagation()"
      >
        <!-- Close Button -->
        <div
          class="flex justify-between items-center p-6 border-b border-[#e0e0e0]"
        >
          <h2 class="text-2xl font-display font-semibold tracking-tight text-[#1d1d1f]">
            Quick View
          </h2>
          <button
            (click)="close.emit()"
            aria-label="Close quick view"
            class="text-[#6e6e73] hover:text-[#1d1d1f] transition-colors active-press"
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
                class="relative bg-[#f5f5f7] rounded-[12px] overflow-hidden aspect-square flex items-center justify-center"
              >
                <!-- Use imageUrl or images array if available, else emoji -->
                <img *ngIf="product?.imageUrl || product?.images?.[0]" [ngSrc]="product?.imageUrl || product?.images?.[0] || ''" fill class="w-full h-full object-cover" [alt]="product?.name">
                <span *ngIf="!product?.imageUrl && !product?.images?.[0]" class="text-6xl relative z-10">{{
                  product ? getProductEmoji(product.category) : "✦"
                }}</span>
              </div>

              <!-- Stock Status -->
              <div class="mt-4 p-4 rounded-[12px]" [ngClass]="getStockClass()">
                <p class="text-sm font-semibold">{{ getStockMessage() }}</p>
              </div>
            </div>

            <!-- Details -->
            <div>
              <!-- Category & Badge -->
              <div class="flex items-start justify-between mb-3">
                <span
                  class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37]"
                >
                  {{ categoryLabels.label(product?.category) || "Product" }}
                </span>
              </div>

              <!-- Name -->
              <h3 class="text-2xl font-display font-semibold tracking-tight text-[#1d1d1f] mb-3">
                {{ product?.name || "Product" }}
              </h3>

              <!-- Rating -->
              <div class="flex items-center gap-2 mb-4">
                <div class="flex gap-0.5">
                  <span *ngFor="let i of [1, 2, 3, 4, 5]" class="text-[#D4AF37]"
                    >★</span
                  >
                </div>
                <span class="text-sm text-[#6e6e73]"
                  >({{ product?.reviewCount || 0 }} reviews)</span
                >
              </div>

              <!-- Price -->
              <div class="mb-6 pb-6 border-b border-[#e0e0e0]">
                <div class="flex items-baseline gap-3">
                  <span class="text-3xl font-semibold text-[#1d1d1f]">
                    {{ (product?.price || 0) | currencyConvert }}
                  </span>
                  <span *ngIf="totalSuffix(product)" class="text-sm text-[#6e6e73]">{{ totalSuffix(product) }}</span>
                  <span
                    *ngIf="product && product.originalPrice"
                    class="text-lg text-[#6e6e73] line-through"
                  >
                    {{ product.originalPrice | currencyConvert }}
                  </span>
                </div>
                <p *ngIf="unitRate(product) as rate" class="text-sm text-[#6e6e73] mt-1">
                  {{ rate | currencyConvert }} {{ unitLabel(product) }}
                </p>
                <p *ngIf="secondaryLine(product)" class="text-sm text-[#6e6e73] mt-1">
                  {{ secondaryLine(product) }}
                </p>
              </div>

              <!-- Description -->
              <p class="text-[#6e6e73] text-sm mb-6">
                {{ product?.description || "No description available" }}
              </p>

              <!-- Specifications -->
              <div *ngIf="product && product.specifications" class="mb-6">
                <h4 class="font-semibold text-[#1d1d1f] mb-3">Key Specs</h4>
                <div class="grid grid-cols-2 gap-2 text-sm">
                  <div *ngIf="product.specifications?.carat">
                    <p class="text-[#6e6e73]">
                      Carat:
                      <span class="font-semibold text-[#1d1d1f]">{{
                        product.specifications.carat
                      }}</span>
                    </p>
                  </div>
                  <div *ngIf="product.specifications?.clarity">
                    <p class="text-[#6e6e73]">
                      Clarity:
                      <span class="font-semibold text-[#1d1d1f]">{{
                        product.specifications.clarity
                      }}</span>
                    </p>
                  </div>
                  <div *ngIf="product.specifications?.color">
                    <p class="text-[#6e6e73]">
                      Color:
                      <span class="font-semibold text-[#1d1d1f]">{{
                        product.specifications.color
                      }}</span>
                    </p>
                  </div>
                  <div *ngIf="product.specifications?.cut">
                    <p class="text-[#6e6e73]">
                      Cut:
                      <span class="font-semibold text-[#1d1d1f]">{{
                        product.specifications.cut
                      }}</span>
                    </p>
                  </div>
                  <div *ngIf="product.metal">
                    <p class="text-[#6e6e73]">
                      Metal:
                      <span class="font-semibold text-[#1d1d1f]">{{
                        product.metal
                      }}</span>
                    </p>
                  </div>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex gap-3">
                <button
                  (click)="onAddToCart()"
                  [disabled]="product?.stock === 0"
                  class="flex-1 btn-apple-pill">
                  {{ product?.stock === 0 ? 'Out of Stock' : 'Add to Cart' }}
                </button>
              </div>

              <!-- View Full Details Link -->
              <button
                (click)="onViewDetails()"
                class="btn-ghost w-full mt-3"
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
    product: any;
  }>();
  @Output() viewDetails = new EventEmitter<string>();

  categoryLabels = inject(CategoryLabelService);

  // Sale-mode display helpers (core/product-display) exposed to the template.
  readonly unitLabel = unitLabel;
  readonly unitRate = unitRate;
  readonly totalSuffix = totalSuffix;
  readonly secondaryLine = secondaryLine;

  onBackdropClick(): void {
    this.close.emit();
  }

  onAddToCart(): void {
    if (this.product) {
      this.addToCart.emit({
        productId: this.product.id,
        quantity: 1,
        product: this.product,
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
    if (!this.product) return "bg-[#f5f5f7] text-[#6e6e73]";
    if (this.product.stock > 10) return "bg-green-50 text-green-600";
    if (this.product.stock > 0) return "bg-amber-50 text-amber-600";
    return "bg-red-50 text-red-600";
  }

  getStockMessage(): string {
    if (!this.product) return "Loading...";
    if (this.product.stock > 10)
      return `✓ In Stock (${this.product.stock} available)`;
    if (this.product.stock > 0)
      return `⚠ Only ${this.product.stock} left in stock`;
    return "✗ Out of Stock";
  }

  @HostListener('document:keydown.escape')
  onKeydownHandler() {
    if (this.isOpen) {
      this.close.emit();
    }
  }

  @ViewChild('modalContainer') modalContainer?: ElementRef;

  @HostListener('document:keydown.tab', ['$event'])
  onTabHandler(event: any) {
    if (!this.isOpen || !this.modalContainer) return;

    const focusableElements = this.modalContainer.nativeElement.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (event.shiftKey) {
      if (document.activeElement === firstElement) {
        lastElement.focus();
        event.preventDefault();
      }
    } else {
      if (document.activeElement === lastElement) {
        firstElement.focus();
        event.preventDefault();
      }
    }
  }
}
