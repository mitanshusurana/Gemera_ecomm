import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, Cart } from '../services/api.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-white">
      <!-- Breadcrumb -->
      <div class="bg-diamond-50 border-b border-diamond-200">
        <div class="container-luxury py-4">
          <div class="flex items-center gap-2 text-sm">
            <a routerLink="/" class="text-gold-600 hover:text-gold-700">Home</a>
            <span class="text-gray-500">/</span>
            <span class="text-gray-700">Shopping Cart</span>
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
                <div class="w-full sm:w-32 h-32 bg-diamond-100 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden relative">
                   <img *ngIf="item.product.imageUrl" [src]="item.product.imageUrl" class="w-full h-full object-cover" onerror="this.style.display='none'">
                   <span *ngIf="!item.product.imageUrl" class="text-4xl absolute">💎</span>
                </div>

                <!-- Details -->
                <div class="flex-1">
                  <div class="flex justify-between items-start mb-4">
                    <div>
                      <p class="text-xs text-gold-600 font-semibold uppercase mb-1">{{ item.product.category }}</p>
                      <h3 class="font-semibold text-gray-900 text-lg">{{ item.product.name }}</h3>
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
                    <span class="text-2xl font-bold text-diamond-900">{{ formatPrice(item.price * item.quantity) }}</span>
                  </div>
                </div>
              </div>

              <!-- Coupon Section -->
              <div class="card p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Have a Coupon Code?</h3>
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
                    <h3 class="font-bold text-gray-900">Add Premium Gift Wrapping</h3>
                    <p class="text-sm text-gray-600">Includes handwritten note & signature box</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="font-bold text-gold-700">+$5.00</span>
                  <input type="checkbox" [checked]="isGiftWrapped()" (change)="isGiftWrapped.set(!isGiftWrapped())" class="w-5 h-5 text-gold-600 focus:ring-gold-500 border-gray-300 rounded">
                </div>
              </div>
            </div>

            <!-- Empty Cart -->
            <div *ngIf="isEmpty()" class="card p-12 text-center">
              <div class="text-6xl mb-6">🛍️</div>
              <h2 class="text-2xl font-bold text-gray-900 mb-4">Your Cart is Empty</h2>
              <p class="text-gray-600 mb-6">Discover our collection of fine jewellery and add items to your cart.</p>
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
                  <span class="text-gray-600">Subtotal</span>
                  <span class="font-semibold">{{ formatPrice(subtotal()) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Shipping</span>
                  <span class="font-semibold">{{ formatPrice(shipping()) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Tax</span>
                  <span class="font-semibold">{{ formatPrice(tax()) }}</span>
                </div>
                <div *ngIf="isGiftWrapped()" class="flex justify-between text-gold-700">
                  <span>Gift Wrapping</span>
                  <span class="font-semibold">{{ formatPrice(5) }}</span>
                </div>
                <div *ngIf="discount() > 0" class="flex justify-between text-emerald-600">
                  <span>Discount</span>
                  <span class="font-semibold">-{{ formatPrice(discount()) }}</span>
                </div>
              </div>

              <div class="flex justify-between mb-8 text-xl">
                <span class="font-bold text-gray-900">Total</span>
                <span class="font-bold text-2xl text-gold-600">{{ formatPrice(total()) }}</span>
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
                  <p class="text-sm text-gray-600">Free insured worldwide shipping</p>
                </div>
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">✓</span>
                  <p class="text-sm text-gray-600">30-day money-back guarantee</p>
                </div>
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">🔒</span>
                  <p class="text-sm text-gray-600 font-semibold">Secure SSL encrypted checkout</p>
                </div>
                <!-- Stock Reservation Timer -->
                <div class="mt-4 p-3 bg-red-50 text-red-700 text-sm font-semibold rounded flex items-center justify-center gap-2">
                  <span>⏳</span>
                  <span>Stock reserved for {{ timerString() }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CartComponent implements OnInit, OnDestroy {
  apiService = inject(ApiService);

  cart = signal<Cart | null>(null);
  cartItems = signal<any[]>([]);
  isEmpty = signal(true);
  isGiftWrapped = signal(false);

  subtotal = computed(() => this.cart()?.subtotal || 0);
  shipping = computed(() => this.cart()?.shipping || 0);
  tax = computed(() => this.cart()?.tax || 0);
  discount = computed(() => this.cart()?.appliedDiscount || 0);
  total = computed(() => {
    let t = this.cart()?.total || 0;
    if (this.isGiftWrapped()) {
      t += 5;
    }
    return t;
  });

  // Timer Signal
  timeLeft = signal(600); // 10 minutes in seconds
  timerString = computed(() => {
    const minutes = Math.floor(this.timeLeft() / 60);
    const seconds = this.timeLeft() % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  });

  private timerInterval: any;

  ngOnInit(): void {
    this.startTimer();
    this.apiService.cart().subscribe((cart) => {
        if (cart) {
            this.cart.set(cart);
            this.cartItems.set(cart.items);
            this.isEmpty.set(cart.items.length === 0);
        } else {
            this.isEmpty.set(true);
        }
    });
    this.apiService.getCart().subscribe();
  }

  ngOnDestroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  removeItem(itemId: string): void {
    this.apiService.removeFromCart(itemId).subscribe();
  }

  increaseQuantity(itemId: string): void {
    const item = this.cartItems().find((i) => i.id === itemId);
    if (item) {
      this.apiService.updateCartItem(itemId, item.quantity + 1).subscribe();
    }
  }

  decreaseQuantity(itemId: string): void {
    const item = this.cartItems().find((i) => i.id === itemId);
    if (item && item.quantity > 1) {
      this.apiService.updateCartItem(itemId, item.quantity - 1).subscribe();
    }
  }

  startTimer(): void {
    this.timerInterval = setInterval(() => {
      if (this.timeLeft() > 0) {
        this.timeLeft.set(this.timeLeft() - 1);
      }
    }, 1000);
  }

  applyCoupon(code: string): void {
      this.apiService.applyCoupon(code).subscribe();
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price);
  }
}
