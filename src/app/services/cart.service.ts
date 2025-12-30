import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Cart } from '../core/models';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private baseUrl = '/api/v1/cart';
  private cart$ = new BehaviorSubject<Cart | null>(null);

  constructor() {
    // Optionally auto-fetch cart on auth change
    this.authService.user().subscribe(user => {
        if (user) {
            this.getCart().subscribe();
        } else {
            // For now, allow guest carts or reset? MockBackend is persistent per session instance.
            // If strict, we reset.
            this.cart$.next(null);
            // In mock mode, we might want guest cart. MockBackend maintains one cart instance.
            // Let's try to fetch it anyway.
            this.getCart().subscribe();
        }
    });
  }

  getCart(): Observable<Cart> {
    return this.http.get<Cart>(this.baseUrl).pipe(tap(cart => this.cart$.next(cart)));
  }

  addToCart(
      productId: string,
      quantity: number = 1,
      options?: { metal?: string, diamond?: string, price?: number, stoneId?: string, stoneName?: string, customization?: string }
  ): Observable<Cart> {
    return this.http.post<Cart>(`${this.baseUrl}/items`, { productId, quantity, options })
      .pipe(tap(cart => this.cart$.next(cart)));
  }

  updateCartOptions(options: { giftWrap: boolean }): Observable<Cart> {
    return this.http.post<Cart>(`${this.baseUrl}/options`, options)
        .pipe(tap(cart => this.cart$.next(cart)));
  }

  updateCartItem(itemId: string, quantity: number): Observable<Cart> {
    return this.http.put<Cart>(`${this.baseUrl}/items/${itemId}`, { quantity })
        .pipe(tap(cart => this.cart$.next(cart)));
  }

  removeFromCart(itemId: string): Observable<Cart> {
    return this.http.delete<Cart>(`${this.baseUrl}/items/${itemId}`)
        .pipe(tap(cart => this.cart$.next(cart)));
  }

  applyCoupon(couponCode: string): Observable<Cart> {
    return this.http.post<Cart>(`${this.baseUrl}/apply-coupon`, { couponCode })
        .pipe(tap(cart => this.cart$.next(cart)));
  }

  cart(): Observable<Cart | null> {
    return this.cart$.asObservable();
  }
}
