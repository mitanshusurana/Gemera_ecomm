import { Injectable, signal, inject } from '@angular/core';
import { Product } from '../core/models';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root'
})
export class CompareService {
  private toastService = inject(ToastService);
  compareList = signal<Product[]>([]);

  addToCompare(product: Product) {
    const current = this.compareList();
    if (current.find(p => p.id === product.id)) {
        this.toastService.show('Product already in comparison list', 'info');
        return;
    }

    if (current.length >= 3) {
      this.toastService.show('You can only compare up to 3 products', 'error');
      return;
    }

    this.compareList.update(list => [...list, product]);
    this.toastService.show('Added to compare', 'success');
  }

  removeFromCompare(productId: string) {
    this.compareList.update(list => list.filter(p => p.id !== productId));
    this.toastService.show('Removed from comparison', 'info');
  }

  clearCompare() {
      this.compareList.set([]);
  }

  isInCompare(productId: string): boolean {
      return !!this.compareList().find(p => p.id === productId);
  }
}
