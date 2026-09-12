import { Injectable, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Cart } from '../core/models';
import { CartService } from './cart.service';
import { ApiConfigService } from './api-config.service';

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

  removeFromWishlist(productId: string) {
    this.http.delete<Cart>(`${this.baseUrl}/wishlist/${productId}`)
      .subscribe(() => {
        this.cartService.getCart().subscribe();
      });
  }
}
