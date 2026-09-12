import { Injectable, inject, signal, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, forkJoin } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Cart } from '../core/models';
import { AuthService } from './auth.service';
import { ApiConfigService } from './api-config.service';
import { isPlatformBrowser } from '@angular/common';

export interface CartItemOptions {
  metal?: string;
  diamond?: string;
  size?: string;
  category?: string;
  price?: number;
  stoneId?: string;
  stoneName?: string;
  customization?: string;
  engraving?: string;
  product?: any; // Replace later when Product model is strictly imported
}

/**
 * Cart pricing rules, mirroring the backend's application.yml defaults.
 * Changing one without the other makes the displayed total disagree with the
 * amount charged.
 */
export const CART_PRICING = {
  freeShippingThreshold: 1000,  // app.cart.shipping-threshold
  standardShippingFee: 50,      // app.cart.standard-shipping-fee
  giftWrapFee: 5,               // app.cart.gift-wrap-fee
  gstRate: 0.03,                // 3% on jewellery (HSN 7113)
} as const;

@Injectable({
  providedIn: 'root',
})
export class CartService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiConfig = inject(ApiConfigService);
  private platformId = inject(PLATFORM_ID);
  private baseUrl = this.apiConfig.getEndpoint('cart');
  private cart$ = new BehaviorSubject<Cart | null>(null);
  // Expose signal for modern reactive components
  cartSignal = signal<Cart | null>(null);
  private readonly GUEST_CART_KEY = 'guest_cart';

  constructor() {
    // Sync signal with subject
    this.cart$.subscribe((c) => this.cartSignal.set(c));

    this.authService.user().subscribe((user) => {
      if (user) {
        this.syncGuestCart().subscribe(() => {
          this.getCart().subscribe();
        });
      } else {
        // Do not hit API on load if not authenticated. Instead just load guest cart.
        const guestCart = this.getGuestCart();
        this.cart$.next(guestCart);
      }
    });
  }

  getCart(isRetry = false): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      return this.http.get<Cart>(this.baseUrl).pipe(
        tap((cart) => {
          // Ensure all numeric values are properly typed as numbers
          this.normalizeCart(cart);
          this.cart$.next(cart);
        }),
        catchError((error) => {
          if ((error.status === 401 || error.status === 403) && !isRetry) {
            this.authService.clearSession();
            return this.getCart(true); // Re-run, which will now fall into the else block
          }
          throw error;
        }),
      );
    } else {
      const guestCart = this.getGuestCart();
      this.cart$.next(guestCart);
      return of(guestCart);
    }
  }

  addToCart(
    productId: string,
    quantity: number = 1,
    options?: CartItemOptions,
    isRetry = false
  ): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      // Clean up options before sending to API if needed, or API ignores extra fields
      const { product, ...apiOptions } = options || {};
      return this.http
        .post<Cart>(`${this.baseUrl}/items`, {
          productId,
          quantity,
          options: apiOptions,
        })
        .pipe(
          tap((cart) => {
            this.normalizeCart(cart);
            this.cart$.next(cart);
          }),
          catchError((error) => {
            if ((error.status === 401 || error.status === 403) && !isRetry) {
              this.authService.clearSession();
              return this.addToCart(productId, quantity, options, true); // Re-run, now as guest
            }
            throw error;
          }),
        );
    } else {
      return of(this.addToGuestCart(productId, quantity, options)).pipe(
        tap((cart) => this.cart$.next(cart)),
      );
    }
  }

  updateCartOptions(options: { giftWrap: boolean }, isRetry = false): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      return this.http.post<Cart>(`${this.baseUrl}/options`, options).pipe(
        tap((cart) => this.cart$.next(cart)),
        catchError((error) => {
          if ((error.status === 401 || error.status === 403) && !isRetry) {
            this.authService.clearSession();
            return this.updateCartOptions(options, true); // Re-run as guest
          }
          throw error;
        }),
      );
    } else {
      const cart = this.getGuestCart();
      cart.giftWrap = options.giftWrap;
      this.saveGuestCart(cart);
      this.cart$.next(cart);
      return of(cart);
    }
  }

  updateCartItem(itemId: string, quantity: number, isRetry = false): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      return this.http
        .put<Cart>(`${this.baseUrl}/items/${itemId}`, { quantity })
        .pipe(
          tap((cart) => this.cart$.next(cart)),
          catchError((error) => {
            if ((error.status === 401 || error.status === 403) && !isRetry) {
              this.authService.clearSession();
              return this.updateCartItem(itemId, quantity, true); // Re-run as guest
            }
            throw error;
          }),
        );
    } else {
      const cart = this.getGuestCart();
      const item = cart.items.find((i) => i.id === itemId);
      if (item) {
        item.quantity = quantity;
        this.recalculateTotals(cart);
        this.saveGuestCart(cart);
      }
      this.cart$.next(cart);
      return of(cart);
    }
  }

  removeFromCart(itemId: string, isRetry = false): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      return this.http.delete<Cart>(`${this.baseUrl}/items/${itemId}`).pipe(
        tap((cart) => this.cart$.next(cart)),
        catchError((error) => {
          if ((error.status === 401 || error.status === 403) && !isRetry) {
            this.authService.clearSession();
            return this.removeFromCart(itemId, true); // Re-run as guest
          }
          throw error;
        }),
      );
    } else {
      const cart = this.getGuestCart();
      cart.items = cart.items.filter((i) => i.id !== itemId);
      this.recalculateTotals(cart);
      this.saveGuestCart(cart);
      this.cart$.next(cart);
      return of(cart);
    }
  }

  applyCoupon(couponCode: string, isRetry = false): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      return this.http
        .post<Cart>(`${this.baseUrl}/apply-coupon`, { couponCode })
        .pipe(
          tap((cart) => this.cart$.next(cart)),
          catchError((error) => {
            if ((error.status === 401 || error.status === 403) && !isRetry) {
              this.authService.clearSession();
              return this.applyCoupon(couponCode, true); // Re-run as guest
            }
            throw error;
          }),
        );
    } else {
      // Mock coupon for guest
      return of(this.getGuestCart());
    }
  }

  cart(): Observable<Cart | null> {
    return this.cart$.asObservable();
  }

  // --- Guest Cart Helpers ---

  private getGuestCart(): Cart {
    if (isPlatformBrowser(this.platformId)) {
      const stored = localStorage.getItem(this.GUEST_CART_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    }
    return {
      id: 'guest',
      items: [],
      subtotal: 0,
      tax: 0,
      shipping: 0,
      total: 0,
      appliedDiscount: 0,
    };
  }

  private saveGuestCart(cart: Cart): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(this.GUEST_CART_KEY, JSON.stringify(cart));
    }
  }

  private addToGuestCart(
    productId: string,
    quantity: number,
    options?: CartItemOptions,
  ): Cart {
    const cart = this.getGuestCart();
    // Do not trust client-side price, only use product price or default 0
    const price = options?.product?.price || 0;

    // Check if item exists
    const existing = cart.items.find(
      (i) =>
        i.productId === productId &&
        JSON.stringify(i.selectedMetal) === JSON.stringify(options?.metal),
    );

    if (existing) {
      existing.quantity += quantity;
    } else {
      // Use provided product details or fallback
      const productData = options?.product || {
        id: productId,
        name: 'Product ' + productId,
        price: price,
        imageUrl: '',
        description: '',
        rating: 5,
        reviewCount: 0,
        category: 'Ring',
        subcategory: '',
        gemstones: [],
        metal: '',
        weight: 0,
        stock: 10,
        sku: '',
        certifications: [],
        createdAt: '',
        updatedAt: '',
      };

      cart.items.push({
        id: Math.random().toString(36).substr(2, 9),
        productId,
        quantity,
        price,
        product: productData,
        selectedMetal: options?.metal,
        selectedDiamond: options?.diamond,
        customization: options?.engraving,
      });
    }

    this.recalculateTotals(cart);
    this.saveGuestCart(cart);
    return cart;
  }

  /**
   * Totals for a GUEST cart only. A signed-in cart is priced by the server and
   * those values are displayed as-is.
   *
   * These rules mirror CartService.recalculateCart on the backend. They must
   * stay in step: the customer sees this number and is charged the server's.
   * The threshold used to be 500 here against 1000 there, so a 700-rupee cart
   * showed FREE shipping and was then charged 50.
   *
   * Backend source of truth: app.cart.shipping-threshold /
   * standard-shipping-fee / gift-wrap-fee in application.yml.
   */
  private recalculateTotals(cart: Cart) {
    cart.subtotal = cart.items.reduce((sum, item) => {
      const itemPrice =
        typeof item.price === 'string' ? parseFloat(item.price) : item.price;
      return sum + itemPrice * item.quantity;
    }, 0);

    const discount = cart.appliedDiscount || 0;
    const taxable = Math.max(cart.subtotal - discount, 0);

    // Flat 3%. The server applies per-category rates from global settings, so
    // a mixed cart can differ slightly; the server figure is the one charged.
    cart.tax = this.round2(taxable * CART_PRICING.gstRate);

    cart.shipping =
      cart.subtotal > CART_PRICING.freeShippingThreshold
        ? 0
        : CART_PRICING.standardShippingFee;

    // Gift wrap is charged by the server but was never added here, so the
    // displayed total was short by the fee.
    const giftWrap = cart.giftWrap ? CART_PRICING.giftWrapFee : 0;

    cart.total = this.round2(
      cart.subtotal - discount + cart.tax + cart.shipping + giftWrap,
    );

    // Keep the legacy alias in step; templates read both.
    cart.discount = discount;
  }

  /** Money to paise. Repeated float addition otherwise shows 1234.5600000000001. */
  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private normalizeCart(cart: Cart): void {
    // Ensure all prices are numbers
    if (cart.items) {
      cart.items.forEach((item) => {
        // If item.price is not set, use product.price
        if (!item.price || item.price === 0) {
          item.price = item.product?.price
            ? typeof item.product.price === 'string'
              ? parseFloat(item.product.price)
              : Number(item.product.price)
            : 0;
        } else {
          item.price =
            typeof item.price === 'string'
              ? parseFloat(item.price)
              : Number(item.price) || 0;
        }
        item.quantity =
          typeof item.quantity === 'string'
            ? parseInt(item.quantity, 10)
            : Number(item.quantity) || 0;
      });
    }

    // Ensure cart totals are numbers
    cart.subtotal =
      typeof cart.subtotal === 'string'
        ? parseFloat(cart.subtotal)
        : Number(cart.subtotal) || 0;
    cart.tax =
      typeof cart.tax === 'string'
        ? parseFloat(cart.tax)
        : Number(cart.tax) || 0;
    cart.shipping =
      typeof cart.shipping === 'string'
        ? parseFloat(cart.shipping)
        : Number(cart.shipping) || 0;
    cart.total =
      typeof cart.total === 'string'
        ? parseFloat(cart.total)
        : Number(cart.total) || 0;
    cart.appliedDiscount =
      typeof cart.appliedDiscount === 'string'
        ? parseFloat(cart.appliedDiscount)
        : Number(cart.appliedDiscount) || 0;
  }

  private syncGuestCart(): Observable<any> {
    // Only attempt sync if we are in browser and have a guest cart
    if (isPlatformBrowser(this.platformId)) {
      const guestCart = this.getGuestCart();
      if (guestCart.items.length > 0) {
        const observables = guestCart.items.map((item) => {
          // Map guest item to API payload
          const options = {
            metal: item.selectedMetal,
            diamond: item.selectedDiamond,
            engraving: item.customization,
            price: item.price,
          };
          return this.http.post<Cart>(`${this.baseUrl}/items`, {
            productId: item.productId,
            quantity: item.quantity,
            options,
          });
        });

        return forkJoin(observables).pipe(
          tap(() => {
            if (isPlatformBrowser(this.platformId)) {
              localStorage.removeItem(this.GUEST_CART_KEY);
            }
          }),
        );
      }
    }
    return of(null);
  }
}
