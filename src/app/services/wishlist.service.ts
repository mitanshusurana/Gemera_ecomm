import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Product, Cart } from '../core/models';
import { CartService } from './cart.service';
import { ApiConfigService } from './api-config.service';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class WishlistService {
  private http = inject(HttpClient);
  private cartService = inject(CartService);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('cart'); // Assuming wishlist operations are under cart based on response structure

  // Derive wishlist from CartService
  items = computed(() => this.cartService.cartSignal()?.wishlist || []);
  count = computed(() => this.items().length);

  addToWishlist(product: Product) {
    // Optimistic update or wait for API? Let's try API.
    // Assuming endpoint POST /cart/wishlist
    this.http.post<Cart>(`${this.baseUrl}/wishlist`, { productId: product.id })
      .subscribe(cart => {
        // CartService should update its state
        // We need a way to update CartService state from here, or CartService should handle it.
        // Better: CartService should expose a method to update state or we trigger a reload.
        // Or simpler: We just call CartService.getCart().subscribe() to refresh.
        this.cartService.getCart().subscribe();
      });
  }

  removeFromWishlist(productId: string) {
    this.http.delete<Cart>(`${this.baseUrl}/wishlist/${productId}`)
      .subscribe(() => {
        this.cartService.getCart().subscribe();
      });
  }
}
