import { Component, OnInit, signal, computed, inject, ChangeDetectionStrategy, DestroyRef, PLATFORM_ID } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, NgOptimizedImage, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartService } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { Cart, CartItem } from '../core/models';
import { CurrencyService } from '../services/currency.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, RouterLink, NgOptimizedImage, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-surface">
      <!-- Breadcrumb -->
      <div class="bg-diamond-50 border-b border-diamond-200">
        <div class="container-luxury py-4">
          <div class="flex items-center gap-2 text-sm">
            <a routerLink="/" class="text-gold-600 hover:text-gold-700">Home</a>
            <span class="text-ink">/</span>
            <span class="text-ink">Shopping Cart</span>
          </div>
        </div>
      </div>

      <div class="container-luxury section-padding">
        <h1 class="text-5xl md:text-6xl font-display font-bold text-diamond-900 mb-12">
          Shopping Cart
        </h1>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Cart Items -->
          <div class="lg:col-span-2">
            <div *ngIf="!isEmpty()" class="space-y-6">
              <div *ngFor="let item of cartItems()" class="card p-6 flex flex-col sm:flex-row gap-6">
                <!-- Image -->
                <div class="w-24 h-24 sm:w-32 sm:h-32 mx-auto sm:mx-0 bg-diamond-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                   <img *ngIf="item.product.imageUrl || item.product.images?.[0]" [ngSrc]="item.product.imageUrl || item.product.images?.[0] || ''" fill sizes="(max-width: 640px) 96px, 128px" class="absolute inset-0 object-cover">
                   <span *ngIf="!item.product.imageUrl && !item.product.images?.[0]" class="text-3xl">💎</span>
                </div>

                <!-- Details -->
                <div class="flex-1">
                  <div class="flex justify-between items-start mb-4">
                    <div>
                      <p class="text-xs text-gold-600 font-semibold uppercase mb-1">{{ item.product.category }}</p>
                      <h3 class="font-semibold text-ink text-lg">{{ item.product.name }}</h3>
                      <div class="text-sm text-ink mt-1 space-y-1">
                        <p *ngIf="item.selectedMetal">Metal: {{ item.selectedMetal }}</p>
                        <p *ngIf="item.selectedDiamond">Diamond: {{ item.selectedDiamond }}</p>
                      </div>
                    </div>
                    <button (click)="removeItem(item.id)" class="text-red-500 hover:text-red-700 transition-colors">
                      <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/>
                      </svg>
                    </button>
                  </div>

                  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div class="flex items-center gap-4">
                      <button (click)="decreaseQuantity(item.id)" class="w-8 h-8 border border-diamond-300 rounded hover:border-gold-500 flex items-center justify-center">
                        −
                      </button>
                      <span class="font-semibold w-8 text-center">{{ item.quantity }}</span>
                      <button (click)="increaseQuantity(item.id)" class="w-8 h-8 border border-diamond-300 rounded hover:border-gold-500 flex items-center justify-center">
                        +
                      </button>
                    </div>
                    <span class="text-2xl font-bold text-diamond-900">{{ (item.price * item.quantity) | currencyConvert }}</span>
                  </div>
                </div>
              </div>

              <!-- Coupon Section -->
              <div class="card p-6">
                <h3 class="font-semibold text-ink mb-4">Have a Coupon Code?</h3>
                <div class="flex gap-2">
                  <input type="text" #couponInput placeholder="Enter coupon code" class="input-field flex-1">
                  <button (click)="applyCoupon(couponInput.value)" class="btn-outline">Apply</button>
                </div>
              </div>

              <!-- Gift Wrapping (New) -->
              <div class="card p-6 flex items-center justify-between bg-gold-50 border border-gold-200">
                <div class="flex items-center gap-3">
                  <span class="text-2xl">🎁</span>
                  <div>
                    <h3 class="font-bold text-ink">Add Premium Gift Wrapping</h3>
                    <p class="text-sm text-ink">Includes handwritten note & signature box</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-bold text-gold-700">+{{ 5 | currencyConvert }}</span>
                  <input type="checkbox" [checked]="isGiftWrapped()" (change)="toggleGiftWrap($event)" class="w-5 h-5 text-gold-600 focus:ring-gold-500 border-ink rounded">
                </div>
              </div>
            </div>

            <!-- Empty Cart -->
            <div *ngIf="isEmpty()" class="card p-12 text-center">
              <div class="text-6xl mb-6">🛍️</div>
              <h2 class="text-2xl font-bold text-ink mb-4">Your Cart is Empty</h2>
              <p class="text-ink mb-6">Discover our collection of fine jewellery and add items to your cart.</p>
              <a routerLink="/products" class="btn-primary">
                Continue Shopping
              </a>
            </div>
          </div>

          <!-- Order Summary -->
          <div class="lg:col-span-1">
            <div class="card p-8 sticky top-24">
              <h3 class="font-display text-2xl font-bold text-diamond-900 mb-6">Order Summary</h3>

              <div class="space-y-4 mb-6 pb-6 border-b border-diamond-200">
                <div class="flex justify-between">
                  <span class="text-ink">Subtotal</span>
                  <span class="font-semibold">{{ subtotal() | currencyConvert }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-ink">Shipping</span>
                  <span class="font-semibold">{{ shipping() | currencyConvert }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-ink">Tax</span>
                  <span class="font-semibold">{{ tax() | currencyConvert }}</span>
                </div>
                <div *ngIf="isGiftWrapped()" class="flex justify-between text-gold-700">
                  <span>Gift Wrapping</span>
                  <span class="font-semibold">{{ 5 | currencyConvert }}</span>
                </div>
                <div *ngIf="discount() > 0" class="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span class="font-semibold">-{{ discount() | currencyConvert }}</span>
                </div>
              </div>

              <div class="flex justify-between mb-8 text-xl">
                <span class="font-bold text-ink">Total</span>
                <span class="font-bold text-2xl text-gold-600">{{ total() | currencyConvert }}</span>
              </div>

              <!-- High Value Optimization -->
              <div *ngIf="total() > 50000" class="mb-4 p-4 bg-primary rounded-lg border border-primary">
                <p class="text-sm text-ink font-semibold mb-2">Need help checking out?</p>
                <a href="https://wa.me/1234567890" target="_blank" class="w-full bg-[#25D366] text-surface font-bold py-2 rounded-lg hover:bg-[#128C7E] transition-colors uppercase tracking-wider text-xs flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-whatsapp" viewBox="0 0 16 16">
                    <path d="M13.601 2.326A7.85 7.85 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.9 7.9 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.9 7.9 0 0 0 13.6 2.326zM7.994 14.521a6.6 6.6 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.56 6.56 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592m3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.73.73 0 0 0-.529.247c-.182.198-.691.677-.691 1.654s.71 1.916.81 2.049c.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232"/>
                  </svg>
                  Call us on WhatsApp
                </a>
              </div>

              <a routerLink="/checkout" class="w-full btn-primary block text-center mb-4">
                Proceed to Checkout
              </a>

              <a routerLink="/products" class="w-full btn-ghost border border-diamond-300 block text-center">
                Continue Shopping
              </a>

              <div class="mt-8 pt-8 border-t border-diamond-200 space-y-3">
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">✓</span>
                  <p class="text-sm text-ink">Free insured worldwide shipping</p>
                </div>
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">✓</span>
                  <p class="text-sm text-ink">30-day money-back guarantee</p>
                </div>
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">🔒</span>
                  <p class="text-sm text-ink font-semibold">Secure SSL encrypted checkout</p>
                </div>
                <!-- Trust Badges -->
                <div class="mt-6 grid grid-cols-2 gap-3">
                  <div class="flex items-center gap-2.5 p-3 bg-diamond-50 border border-diamond-200 rounded-lg">
                    <span class="text-lg">🛡️</span>
                    <span class="text-xs font-semibold text-diamond-800">Fully Insured Shipping</span>
                  </div>
                  <div class="flex items-center gap-2.5 p-3 bg-diamond-50 border border-diamond-200 rounded-lg">
                    <span class="text-lg">💎</span>
                    <span class="text-xs font-semibold text-diamond-800">Lifetime Exchange Policy</span>
                  </div>
                  <div class="flex items-center gap-2.5 p-3 bg-diamond-50 border border-diamond-200 rounded-lg">
                    <span class="text-lg">🔒</span>
                    <span class="text-xs font-semibold text-diamond-800">Secure Checkout</span>
                  </div>
                  <div class="flex items-center gap-2.5 p-3 bg-diamond-50 border border-diamond-200 rounded-lg">
                    <span class="text-lg">✅</span>
                    <span class="text-xs font-semibold text-diamond-800">Certificate of Authenticity</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CartComponent implements OnInit {
  cartService = inject(CartService);
  private currencyService = inject(CurrencyService);
  private toastService = inject(ToastService);
  private platformId = inject(PLATFORM_ID);
  private destroyRef = inject(DestroyRef);

  cart = signal<Cart | null>(null);
  cartItems = signal<CartItem[]>([]);
  isEmpty = signal(true);
  isGiftWrapped = computed(() => this.cart()?.giftWrap || false);

  subtotal = computed(() => this.cart()?.subtotal || 0);
  shipping = computed(() => this.cart()?.shipping || 0);
  tax = computed(() => this.cart()?.tax || 0);
  discount = computed(() => this.cart()?.discount || 0);
  total = computed(() => this.cart()?.total || 0);



  ngOnInit(): void {
    this.cartService.cart()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cart) => {
        if (cart) {
            this.cart.set(cart);
            this.cartItems.set(cart.items);
            this.isEmpty.set(cart.items.length === 0);
        } else {
            this.isEmpty.set(true);
        }
    });
    this.cartService.getCart().subscribe();
  }

  removeItem(itemId: string): void {
    this.cartService.removeFromCart(itemId).subscribe();
  }

  increaseQuantity(itemId: string): void {
    const item = this.cartItems().find((i) => i.id === itemId);
    if (item) {
      this.cartService.updateCartItem(itemId, item.quantity + 1).subscribe();
    }
  }

  decreaseQuantity(itemId: string): void {
    const item = this.cartItems().find((i) => i.id === itemId);
    if (item && item.quantity > 1) {
      this.cartService.updateCartItem(itemId, item.quantity - 1).subscribe();
    }
  }

  toggleGiftWrap(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.cartService.updateCartOptions({ giftWrap: checked }).subscribe();
  }

  applyCoupon(code: string): void {
      if (!code) {
          this.toastService.show('Please enter a coupon code.', 'error');
          return;
      }
      this.cartService.applyCoupon(code).subscribe({
          next: () => this.toastService.show('Coupon applied successfully.', 'success'),
          error: (err) => {
              if (err.status === 401 || err.status === 403) {
                  this.toastService.show('Please log in to use coupons.', 'error');
              } else {
                  this.toastService.show('Invalid or expired coupon code.', 'error');
              }
          }
      });
  }
}
