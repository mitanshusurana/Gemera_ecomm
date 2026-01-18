import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, from, forkJoin } from 'rxjs';
import { tap, switchMap, map } from 'rxjs/operators';
import { Cart, CartItem } from '../core/models';
import { AuthService } from './auth.service';
import { ApiConfigService } from './api-config.service';

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('cart');
  private cart$ = new BehaviorSubject<Cart | null>(null);
  // Expose signal for modern reactive components
  cartSignal = signal<Cart | null>(null);
  private readonly GUEST_CART_KEY = 'guest_cart';

  constructor() {
    // Sync signal with subject
    this.cart$.subscribe(c => this.cartSignal.set(c));

    this.authService.user().subscribe(user => {
        if (user) {
            this.syncGuestCart().subscribe(() => {
                this.getCart().subscribe();
            });
        } else {
            this.getCart().subscribe();
        }
    });
  }

  getCart(): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      return this.http.get<Cart>(this.baseUrl).pipe(tap(cart => this.cart$.next(cart)));
    } else {
      const guestCart = this.getGuestCart();
      this.cart$.next(guestCart);
      return of(guestCart);
    }
  }

  addToCart(
      productId: string,
      quantity: number = 1,
      options?: { metal?: string, diamond?: string, price?: number, stoneId?: string, stoneName?: string, customization?: string, engraving?: string }
  ): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      return this.http.post<Cart>(`${this.baseUrl}/items`, { productId, quantity, options })
        .pipe(tap(cart => this.cart$.next(cart)));
    } else {
      return of(this.addToGuestCart(productId, quantity, options)).pipe(
        tap(cart => this.cart$.next(cart))
      );
    }
  }

  updateCartOptions(options: { giftWrap: boolean }): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      return this.http.post<Cart>(`${this.baseUrl}/options`, options)
          .pipe(tap(cart => this.cart$.next(cart)));
    } else {
      const cart = this.getGuestCart();
      cart.giftWrap = options.giftWrap;
      this.saveGuestCart(cart);
      this.cart$.next(cart);
      return of(cart);
    }
  }

  updateCartItem(itemId: string, quantity: number): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      return this.http.put<Cart>(`${this.baseUrl}/items/${itemId}`, { quantity })
          .pipe(tap(cart => this.cart$.next(cart)));
    } else {
      const cart = this.getGuestCart();
      const item = cart.items.find(i => i.id === itemId);
      if (item) {
        item.quantity = quantity;
        this.recalculateTotals(cart);
        this.saveGuestCart(cart);
      }
      this.cart$.next(cart);
      return of(cart);
    }
  }

  removeFromCart(itemId: string): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      return this.http.delete<Cart>(`${this.baseUrl}/items/${itemId}`)
          .pipe(tap(cart => this.cart$.next(cart)));
    } else {
      const cart = this.getGuestCart();
      cart.items = cart.items.filter(i => i.id !== itemId);
      this.recalculateTotals(cart);
      this.saveGuestCart(cart);
      this.cart$.next(cart);
      return of(cart);
    }
  }

  applyCoupon(couponCode: string): Observable<Cart> {
    if (this.authService.isAuthenticated()) {
      return this.http.post<Cart>(`${this.baseUrl}/apply-coupon`, { couponCode })
          .pipe(tap(cart => this.cart$.next(cart)));
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
    const stored = localStorage.getItem(this.GUEST_CART_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
    return {
      id: 'guest',
      items: [],
      subtotal: 0,
      tax: 0,
      shipping: 0,
      total: 0,
      appliedDiscount: 0
    };
  }

  private saveGuestCart(cart: Cart): void {
    localStorage.setItem(this.GUEST_CART_KEY, JSON.stringify(cart));
  }

  private addToGuestCart(productId: string, quantity: number, options: any): Cart {
    const cart = this.getGuestCart();
    // Simplified: in real app we'd fetch product details to get price/image
    // For now we trust the options.price or basic mock logic
    // We'll create a mock product object to store in the item
    const price = options?.price || 1000; // Fallback price

    // Check if item exists (simple check)
    const existing = cart.items.find(i => i.productId === productId && JSON.stringify(i.selectedMetal) === JSON.stringify(options?.metal));

    if (existing) {
      existing.quantity += quantity;
    } else {
      cart.items.push({
        id: Math.random().toString(36).substr(2, 9),
        productId,
        quantity,
        price,
        product: {
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
            updatedAt: ''
        }, // Needs full product really, but for now this holds the place
        selectedMetal: options?.metal,
        selectedDiamond: options?.diamond,
        customization: options?.engraving
      });
    }

    this.recalculateTotals(cart);
    this.saveGuestCart(cart);
    return cart;
  }

  private recalculateTotals(cart: Cart) {
    cart.subtotal = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cart.tax = cart.subtotal * 0.1; // Mock 10% tax
    cart.shipping = cart.subtotal > 500 ? 0 : 50;
    cart.total = cart.subtotal + cart.tax + cart.shipping - cart.appliedDiscount;
  }

  private syncGuestCart(): Observable<any> {
    const guestCart = this.getGuestCart();
    if (guestCart.items.length > 0) {
      const observables = guestCart.items.map(item => {
        // Map guest item to API payload
        const options = {
            metal: item.selectedMetal,
            diamond: item.selectedDiamond,
            engraving: item.customization,
            price: item.price
        };
        return this.http.post<Cart>(`${this.baseUrl}/items`, {
            productId: item.productId,
            quantity: item.quantity,
            options
        });
      });

      return forkJoin(observables).pipe(
        tap(() => {
          localStorage.removeItem(this.GUEST_CART_KEY);
        })
      );
    }
    return of(null);
  }
}
