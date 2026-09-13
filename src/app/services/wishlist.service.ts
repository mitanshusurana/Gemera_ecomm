import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Cart, Product } from '../core/models';
import { CartService } from './cart.service';
import { AuthService } from './auth.service';
import { ApiConfigService } from './api-config.service';

/**
 * Wishlist for a signed-in user. Every endpoint returns the full CartDTO, whose
 * `wishlist` array is the source of truth for `items`.
 *
 * Callers must check `AuthService.isAuthenticated()` first: for guests they show
 * the toast "Sign in to save items" and navigate to /login with `returnUrl`.
 */
@Injectable({
  providedIn: 'root'
})
export class WishlistService {
  private http = inject(HttpClient);
  private cartService = inject(CartService);
  private authService = inject(AuthService);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('users/wishlist');

  /**
   * Wishlist from the most recent wishlist mutation. `null` until the first one,
   * in which case `items` falls back to the wishlist embedded in the cart that
   * CartService loads on sign-in. Reset on every auth change so a signed-out
   * (guest) session never shows the previous user's saved items.
   */
  private latest = signal<Product[] | null>(null);

  items = computed<Product[]>(() => this.latest() ?? this.cartService.cartSignal()?.wishlist ?? []);
  count = computed(() => this.items().length);

  constructor() {
    this.authService.user().subscribe(() => this.latest.set(null));
  }

  has(productId: string): boolean {
    return this.items().some(p => p.id === productId);
  }

  /** GET users/wishlist; refreshes `items`. */
  load(): Observable<Cart> {
    return this.http.get<Cart>(this.baseUrl).pipe(tap(cart => this.apply(cart)));
  }

  add(productId: string): Observable<Cart> {
    return this.http.post<Cart>(this.baseUrl, { productId }).pipe(tap(cart => this.apply(cart)));
  }

  remove(productId: string): Observable<Cart> {
    return this.http.delete<Cart>(`${this.baseUrl}/${productId}`).pipe(tap(cart => this.apply(cart)));
  }

  toggle(productId: string): Observable<Cart> {
    return this.has(productId) ? this.remove(productId) : this.add(productId);
  }

  private apply(cart: Cart): void {
    this.latest.set(cart?.wishlist ?? []);
  }
}
