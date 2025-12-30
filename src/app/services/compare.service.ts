import { Injectable, signal } from '@angular/core';
import { Product } from '../core/models';

@Injectable({
  providedIn: 'root'
})
export class CompareService {
  compareList = signal<Product[]>([]);

  addToCompare(product: Product) {
    const current = this.compareList();
    if (current.find(p => p.id === product.id)) {
        alert('Product already in comparison list');
        return;
    }

    if (current.length >= 3) {
      alert('You can only compare up to 3 products');
      return;
    }

    this.compareList.update(list => [...list, product]);
    alert('Added to compare');
  }

  removeFromCompare(productId: string) {
    this.compareList.update(list => list.filter(p => p.id !== productId));
  }

  clearCompare() {
      this.compareList.set([]);
  }

  isInCompare(productId: string): boolean {
      return !!this.compareList().find(p => p.id === productId);
  }
}
