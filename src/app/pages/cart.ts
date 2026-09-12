import { Component, OnInit, signal, computed, inject, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartService, CART_PRICING } from '../services/cart.service';
import { ToastService } from '../services/toast.service';
import { Cart, CartItem } from '../core/models';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, RouterLink, NgOptimizedImage, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- APPLE DESIGN SYSTEM: SHOPPING BAG (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">
      
      <!-- Top Parchment Header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-10 px-6 text-center">
        <div class="max-w-[980px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-2 block">Checkout Bag</span>
          <h1 class="font-display font-semibold text-3xl sm:text-4xl text-[#1d1d1f] tracking-tight">
            Review Your Shopping Bag.
          </h1>
          <p class="text-xs text-[#7a7a7a] mt-2">Fully insured delivery on all items. <a routerLink="/returns" class="underline">Returns policy</a>.</p>
        </div>
      </section>

      <div class="max-w-[1440px] mx-auto px-4 md:px-12 py-12">
        
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          <!-- Left List: Bag Items -->
          <div class="lg:col-span-8">
            
            <div *ngIf="!isEmpty()" class="space-y-6">
              
              <!-- Item Card -->
              <article *ngFor="let item of cartItems()" class="store-utility-card flex flex-col sm:flex-row gap-6 p-6 items-center sm:items-start">
                
                <!-- Viewport Thumbnail -->
                <div class="w-28 h-28 bg-[#f5f5f7] rounded-[12px] overflow-hidden flex-shrink-0 relative flex items-center justify-center p-2">
                  <img *ngIf="item.product.imageUrl || item.product.images?.[0]" [ngSrc]="item.product.imageUrl || item.product.images?.[0] || ''" fill sizes="112px" class="object-contain" [alt]="item.product.name">
                  <div *ngIf="!item.product.imageUrl && !item.product.images?.[0]" class="w-12 h-12 text-[#D4AF37]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22a8 8 0 100-16 8 8 0 000 16zm0-16V2m-3 2h6M9 6l3-4 3 4" /></svg>
                  </div>
                </div>

                <!-- Content & Controls -->
                <div class="flex-1 w-full">
                  <div class="flex justify-between items-start mb-2">
                    <div>
                      <span class="text-[11px] text-[#7a7a7a] font-mono uppercase tracking-wider block mb-0.5">{{ item.product.category }}</span>
                      <h3 class="font-sans font-semibold text-lg text-[#1d1d1f]">{{ item.product.name }}</h3>
                      <div class="text-xs text-[#7a7a7a] mt-1 space-y-0.5">
                        <p *ngIf="item.selectedMetal">Metal Spec: {{ item.selectedMetal }}</p>
                        <p *ngIf="item.selectedDiamond">Gem Grade: {{ item.selectedDiamond }}</p>
                      </div>
                    </div>
                    
                    <button (click)="removeItem(item.id)" class="w-8 h-8 rounded-full bg-[#f5f5f7] hover:bg-[#e0e0e0] flex items-center justify-center text-xs text-[#1d1d1f] transition-all" title="Remove">
                      ✕
                    </button>
                  </div>

                  <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-6 pt-4 border-t border-[#f0f0f0]">
                    <!-- Quantity Stepper Pill -->
                    <div class="flex items-center gap-3 bg-[#f5f5f7] rounded-full border border-[#e0e0e0] px-3 py-1 text-xs">
                      <button (click)="decreaseQuantity(item.id)" class="w-5 h-5 flex items-center justify-center text-[#1d1d1f] font-bold">
                        −
                      </button>
                      <span class="font-semibold px-2 text-[#1d1d1f]">{{ item.quantity }}</span>
                      <button (click)="increaseQuantity(item.id)" class="w-5 h-5 flex items-center justify-center text-[#1d1d1f] font-bold">
                        +
                      </button>
                    </div>

                    <!-- Line Total Price -->
                    <span class="font-sans font-semibold text-xl text-[#1d1d1f]">
                      {{ (item.price * item.quantity) | currencyConvert }}
                    </span>
                  </div>

                </div>

              </article>

              <!-- Coupon Code Card -->
              <div class="store-utility-card p-6">
                <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-3">Apply Promotional Code</h4>
                <div class="flex gap-3">
                  <input type="text" #couponInput placeholder="Enter coupon code" class="flex-1 bg-[#f5f5f7] border border-[#e0e0e0] rounded-full px-5 py-2 text-xs text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37]">
                  <button (click)="applyCoupon(couponInput.value)" class="btn-apple-pill-secondary text-xs !py-2 !px-5">Apply</button>
                </div>
              </div>

              <!-- Gift Option Strip -->
              <div class="store-utility-card p-6 flex items-center justify-between bg-[#fafafc]">
                <div class="flex items-center gap-3">
                  <div class="w-8 h-8 text-[#D4AF37]">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                  </div>
                  <div>
                    <h4 class="font-semibold text-sm text-[#1d1d1f]">Signature Gift Box & Handwritten Note</h4>
                    <p class="text-xs text-[#7a7a7a]">Includes velvet presentation case and luxury ribbon.</p>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="font-semibold text-xs text-[#D4AF37]">+{{ 5 | currencyConvert }}</span>
                  <input type="checkbox" [checked]="isGiftWrapped()" (change)="toggleGiftWrap($event)" class="w-4 h-4 rounded text-[#D4AF37] focus:ring-[#D4AF37]">
                </div>
              </div>

            </div>

            <!-- Empty Bag State -->
            <div *ngIf="isEmpty()" class="store-utility-card p-16 text-center">
              <div class="w-20 h-20 mx-auto text-[#D4AF37] mb-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
              </div>
              <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-2">Your Shopping Bag is Empty</h2>
              <p class="text-sm text-[#7a7a7a] mb-6">Discover our curated fine jewelry collections and solitaire ring studio.</p>
              <a routerLink="/products" class="btn-apple-pill">
                Explore Collections
              </a>
            </div>

          </div>

          <!-- Right Column: Order Summary Card -->
          <div class="lg:col-span-4">
            <div class="store-utility-card p-8 sticky top-[120px]">
              <h3 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6 pb-4 border-b border-[#e0e0e0]">Summary</h3>

              <div class="space-y-3.5 mb-6 text-xs text-[#7a7a7a]">
                <div class="flex justify-between">
                  <span>Bag Subtotal</span>
                  <span class="font-semibold text-[#1d1d1f]">{{ subtotal() | currencyConvert }}</span>
                </div>
                <div class="flex justify-between">
                  <span>Insured Express Shipping</span>
                  <span class="font-semibold text-[#1d1d1f]">{{ shipping() | currencyConvert }}</span>
                </div>
                <div class="flex justify-between">
                  <span>Estimated Tax</span>
                  <span class="font-semibold text-[#1d1d1f]">{{ tax() | currencyConvert }}</span>
                </div>
                <div *ngIf="isGiftWrapped()" class="flex justify-between text-[#D4AF37]">
                  <span>Gift Box & Packaging</span>
                  <span class="font-semibold">{{ giftWrapFee | currencyConvert }}</span>
                </div>
                <div *ngIf="discount() > 0" class="flex justify-between text-emerald-600">
                  <span>Promotional Savings</span>
                  <span class="font-semibold">-{{ discount() | currencyConvert }}</span>
                </div>
              </div>

              <div class="flex justify-between items-center py-4 border-t border-b border-[#e0e0e0] mb-6">
                <span class="font-semibold text-base text-[#1d1d1f]">Total</span>
                <span class="font-semibold text-2xl text-[#1d1d1f]">{{ total() | currencyConvert }}</span>
              </div>

              <a routerLink="/checkout" class="btn-apple-pill w-full text-center !py-3 text-sm block">
                Proceed to Checkout
              </a>

              <p class="text-[11px] text-[#7a7a7a] text-center mt-4">
                🔒 Encrypted SSL Checkout
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  `
})
export class CartComponent implements OnInit {
  cartService = inject(CartService);
  private toastService = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  cart = signal<Cart | null>(null);
  cartItems = signal<CartItem[]>([]);
  isEmpty = signal(true);
  isGiftWrapped = computed(() => this.cart()?.giftWrap || false);
  readonly giftWrapFee = CART_PRICING.giftWrapFee;

  subtotal = computed(() => this.cart()?.subtotal || 0);
  shipping = computed(() => this.cart()?.shipping || 0);
  tax = computed(() => this.cart()?.tax || 0);
  discount = computed(
    () => this.cart()?.appliedDiscount ?? this.cart()?.discount ?? 0,
  );
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
