import { Component, OnInit, signal, inject, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { RouterLink, Router } from "@angular/router";
import { Title } from '@angular/platform-browser';
import { WishlistService } from "../services/wishlist.service";
import { CartService } from "../services/cart.service";
import { ProductService } from "../services/product.service";
import { QuickViewModalComponent } from '../components/quick-view-modal';
import { ToastService } from '../services/toast.service';
import { ProductDetail } from "../core/models";
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

@Component({
  selector: "app-wishlist",
  standalone: true,
  imports: [CommonModule, RouterLink, QuickViewModalComponent, NgOptimizedImage, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">
      <!-- Header -->
      <div class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-16">
        <div class="max-w-[1440px] mx-auto px-6 md:px-12">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">Saved for later</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl tracking-tight text-[#1d1d1f] mb-4">
            My Wishlist
          </h1>
          <p class="text-lg text-[#6e6e73]">
            {{ wishlistService.count() }} items saved for later
          </p>
        </div>
      </div>

      <!-- Main Content -->
      <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-16">

        <!-- Empty State -->
        <div *ngIf="wishlistService.items().length === 0" class="text-center py-16">
          <svg class="w-16 h-16 mx-auto text-[#D4AF37] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
          </svg>
          <h3 class="font-display font-semibold text-2xl tracking-tight text-[#1d1d1f] mb-2">Your wishlist is empty</h3>
          <p class="text-[#6e6e73] mb-6">Save items you love to view them here later.</p>
          <a routerLink="/products" class="btn-apple-pill">Start Shopping</a>
        </div>

        <!-- Products Grid -->
        <div *ngIf="wishlistService.items().length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <a *ngFor="let product of wishlistService.items()" [routerLink]="['/products', product.id]" class="store-utility-card group cursor-pointer w-full">
            <!-- Image Container -->
            <div class="relative overflow-hidden aspect-square bg-[#f5f5f7] rounded-[12px] mb-6">
              <img *ngIf="product.imageUrl || product.images?.[0]" [ngSrc]="product.imageUrl || product.images?.[0] || ''" fill class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" [alt]="product.name">
              <div *ngIf="!product.imageUrl && !product.images?.[0]" class="w-full h-full flex items-center justify-center">
                <span class="text-4xl">{{ getProductEmoji(product.category) }}</span>
              </div>

              <!-- Remove Button -->
              <button (click)="handleRemove($event, product.id)" aria-label="Remove from wishlist" class="absolute top-4 left-4 w-10 h-10 bg-white/90 backdrop-blur-md border border-[#e0e0e0] text-[#1d1d1f] hover:text-red-600 hover:border-red-200 rounded-full flex items-center justify-center active-press z-10" title="Remove">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                </svg>
              </button>

              <button (click)="openQuickView($event, product.id)" aria-label="Quick view" class="absolute top-16 left-4 w-10 h-10 bg-white/90 backdrop-blur-md border border-[#e0e0e0] hover:border-[#D4AF37] rounded-full flex items-center justify-center active-press" title="Quick View">
                <span class="text-lg">👁️</span>
              </button>
            </div>

            <!-- Product Info -->
            <div>
              <p class="text-xs text-[#D4AF37] font-semibold uppercase tracking-wider mb-1">
                {{ product.category }}
              </p>
              <h3 class="font-sans font-medium text-base text-[#1d1d1f] mb-3 line-clamp-2 group-hover:text-[#D4AF37] transition-colors">
                {{ product.name }}
              </h3>

              <!-- Price -->
              <div class="mb-4">
                <span class="font-sans font-semibold text-xl text-[#1d1d1f]">
                  {{ product.price | currencyConvert }}
                </span>
              </div>

              <!-- Add to Cart -->
              <button (click)="handleAddToCart($event, product.id)" class="btn-apple-pill w-full text-sm !py-2.5">Add to Cart</button>
            </div>
          </a>
        </div>
      </div>

      <!-- Quick View Modal -->
      <app-quick-view-modal
        [isOpen]="quickViewOpen()"
        [product]="quickViewProduct()"
        (close)="quickViewOpen.set(false)"
        (addToCart)="handleQuickViewAddToCart($event)"
        (viewDetails)="handleViewDetails($event)">
      </app-quick-view-modal>
    </div>
  `,
})
export class WishlistComponent implements OnInit {
  wishlistService = inject(WishlistService);
  private cartService = inject(CartService);
  private productService = inject(ProductService);
  private toastService = inject(ToastService);
  private titleService = inject(Title);
  private router = inject(Router);

  // Quick View State
  quickViewOpen = signal(false);
  quickViewProduct = signal<ProductDetail | null>(null);

  ngOnInit(): void {
    this.titleService.setTitle('My Wishlist | Caratloop');
  }

  handleRemove(event: Event, productId: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.wishlistService.removeFromWishlist(productId);
    this.toastService.show('Removed from wishlist', 'info');
  }

  handleAddToCart(event: Event, productId: string): void {
      event.preventDefault();
      event.stopPropagation();
      this.cartService.addToCart(productId, 1).subscribe(() => {
          this.toastService.show('Added to cart', 'success');
      });
  }

  openQuickView(event: Event, productId: string): void {
    event.preventDefault();
    event.stopPropagation();

    this.productService.getProductById(productId).subscribe(product => {
      this.quickViewProduct.set(product);
      this.quickViewOpen.set(true);
    });
  }

  handleQuickViewAddToCart(event: { productId: string, quantity: number }): void {
    this.cartService.addToCart(event.productId, event.quantity).subscribe(() => {
        this.toastService.show('Added to cart', 'success');
    });
  }

  handleViewDetails(productId: string): void {
    this.router.navigate(['/products', productId]);
  }

  getProductEmoji(category: string): string {
     // Fallback emoji logic
    const emojiMap: { [key: string]: string } = {
      "Engagement Ring": "💍",
      "Loose Gemstone": "💎",
      "Spiritual Idol": "🕉️",
      "Gemstone Ring": "👑",
      "Precious Metal": "🏆",
      "Diamond": "💎",
      "Gemstone": "💎",
    };
    return emojiMap[category] || "✦";
  }
}
