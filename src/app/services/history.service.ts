import { Injectable, signal } from '@angular/core';
import { Product } from '../core/models';

@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  recentlyViewed = signal<Product[]>([]);
  private readonly STORAGE_KEY = 'gemara_history';

  constructor() {
    this.loadHistory();
  }

  add(product: Product) {
    const current = this.recentlyViewed();
    // Remove if exists (to move to top)
    const filtered = current.filter(p => p.id !== product.id);
    // Add to front, limit to 4
    const updated = [product, ...filtered].slice(0, 4);

    this.recentlyViewed.set(updated);
    this.saveHistory(updated);
  }

  private saveHistory(history: Product[]) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      console.error('Failed to save history', e);
    }
  }

  private loadHistory() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.recentlyViewed.set(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load history', e);
    }
  }
}
