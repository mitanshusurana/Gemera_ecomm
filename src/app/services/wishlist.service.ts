import { Injectable, signal } from '@angular/core';
import { Product } from '../core/models';

@Injectable({
  providedIn: 'root'
})
export class WishlistService {
  private items = signal<Product[]>([]);

  count = signal(0);

  constructor() {
    // Mock initial count
    this.count.set(2);
  }

  addToWishlist(product: Product) {
    this.items.update(items => [...items, product]);
    this.count.update(c => c + 1);
  }

  removeFromWishlist(productId: string) {
    this.items.update(items => items.filter(p => p.id !== productId));
    this.count.update(c => Math.max(0, c - 1));
  }
}
