import { Component, OnInit, signal, inject, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { RouterLink, Router } from "@angular/router";
import { Title } from '@angular/platform-browser';
import { WishlistService } from "../services/wishlist.service";
import { CartService } from "../services/cart.service";
import { ProductService } from "../services/product.service";
import { QuickViewModalComponent } from '../components/quick-view-modal';
import { ToastService } from '../services/toast.service';
import { CurrencyService } from '../services/currency.service';
import { Product, ProductDetail } from "../core/models";

@Component({
  selector: "app-wishlist",
  standalone: true,
  imports: [CommonModule, RouterLink, QuickViewModalComponent, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white">
      <!-- Header -->
      <div class="bg-diamond-50 border-b border-diamond-200 section-padding">
        <div class="container-luxury">
          <h1 class="text-5xl md:text-6xl font-display font-bold text-diamond-900 mb-4">
            My Wishlist
          </h1>
          <p class="text-lg text-gray-600">
            {{ wishlistService.count() }} items saved for later
          </p>
        </div>
      </div>

      <!-- Main Content -->
      <div class="container-luxury section-padding">

        <!-- Empty State -->
        <div *ngIf="wishlistService.items().length === 0" class="text-center py-16">
          <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
          </svg>
          <h3 class="text-2xl font-semibold text-gray-900 mb-2">Your wishlist is empty</h3>
          <p class="text-gray-600 mb-6">Save items you love to view them here later.</p>
          <a routerLink="/products" class="btn-primary inline-block">Start Shopping</a>
        </div>

        <!-- Products Grid -->
        <div *ngIf="wishlistService.items().length > 0" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <a *ngFor="let product of wishlistService.items()" [routerLink]="['/products', product.id]" class="card card-hover group overflow-hidden block cursor-pointer w-full">
            <!-- Image Container -->
            <div class="relative overflow-hidden aspect-square bg-diamond-100">
              <img *ngIf="product.imageUrl || product.images?.[0]" [ngSrc]="product.imageUrl || product.images?.[0] || ''" fill class="w-full h-full object-cover" [alt]="product.name">
              <div *ngIf="!product.imageUrl && !product.images?.[0]" class="w-full h-full bg-gradient-to-br from-gold-100 to-gold-50 flex items-center justify-center">
                <span class="text-4xl">{{ getProductEmoji(product.category) }}</span>
              </div>

              <!-- Remove Button -->
              <button (click)="handleRemove($event, product.id)" class="absolute top-4 left-4 w-10 h-10 bg-white/90 hover:bg-rose-500 hover:text-white rounded-lg flex items-center justify-center transition-all duration-300 z-10" title="Remove">
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                </svg>
              </button>

              <button (click)="openQuickView($event, product.id)" class="absolute top-16 left-4 w-10 h-10 bg-white/90 hover:bg-gold-500 hover:text-white rounded-lg flex items-center justify-center transition-all duration-300" title="Quick View">
                <span class="text-lg">👁️</span>
              </button>
            </div>

            <!-- Product Info -->
            <div class="p-6">
              <p class="text-xs text-gold-600 font-semibold uppercase tracking-wider mb-1">
                {{ product.category }}
              </p>
              <h3 class="font-semibold text-gray-900 mb-3 line-clamp-2">
                {{ product.name }}
              </h3>

              <!-- Price -->
              <div class="mb-4">
                <span class="text-2xl font-bold text-diamond-900">
                  {{ formatPrice(product.price) }}
                </span>
              </div>

              <!-- Add to Cart -->
              <button (click)="handleAddToCart($event, product.id)" class="w-full btn-primary">Add to Cart</button>
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
  private currencyService = inject(CurrencyService);
  private titleService = inject(Title);
  private router = inject(Router);

  // Quick View State
  quickViewOpen = signal(false);
  quickViewProduct = signal<ProductDetail | null>(null);

  ngOnInit(): void {
    this.titleService.setTitle('My Wishlist | Gemara');
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

  formatPrice(price: number): string {
    return this.currencyService.format(price);
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
