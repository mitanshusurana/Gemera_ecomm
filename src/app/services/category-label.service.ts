import { Injectable, inject, signal } from '@angular/core';
import { Category } from '../core/models';
import { ProductService } from './product.service';

/**
 * Maps category SYSTEM names (slugs such as `findings-(clasps,-hooks)`) to their
 * DISPLAY names ("Findings (Clasps, Hooks)"). Products and the facets endpoint
 * carry the slug; customers must only ever see the display name.
 *
 * Loads the category tree once through ProductService.getCategories() (already
 * shareReplay-cached) and falls back to a prettified slug until it arrives or
 * when a slug is unknown. SSR-safe: no window/document access.
 */
@Injectable({
  providedIn: 'root',
})
export class CategoryLabelService {
  private productService = inject(ProductService);

  /** systemName (lower-cased) -> displayName */
  private labels = signal<Map<string, string>>(new Map());

  constructor() {
    this.productService.getCategories().subscribe({
      next: ({ categories }) => this.labels.set(this.flatten(categories ?? [])),
      error: () => {
        // Leave the map empty; label() keeps returning prettified slugs.
      },
    });
  }

  /** Display name for a category slug/system name; prettified slug when unknown. */
  label(slugOrName: string | undefined | null): string {
    if (!slugOrName) return '';
    const key = slugOrName.trim().toLowerCase();
    return this.labels().get(key) ?? this.prettify(slugOrName);
  }

  private flatten(categories: Category[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const cat of categories) {
      this.add(map, cat.name, cat.displayName);
      for (const sub of cat.subcategories ?? []) {
        this.add(map, sub.name, sub.displayName);
      }
    }
    return map;
  }

  private add(map: Map<string, string>, name: string | undefined, displayName: string | undefined): void {
    if (!name) return;
    map.set(name.trim().toLowerCase(), displayName?.trim() || this.prettify(name));
  }

  /** `semi-precious-lots` -> "Semi Precious Lots"; `findings-(clasps,-hooks)` -> "Findings (Clasps, Hooks)". */
  private prettify(value: string): string {
    return value
      .replace(/[-_]+/g, ' ')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\s+,/g, ',')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/(^|[\s(\/])([a-z])/g, (_m, lead: string, ch: string) => lead + ch.toUpperCase());
  }
}
