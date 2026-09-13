import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductService } from '../services/product.service';

/**
 * Target of the QR code printed on stock labels (`/p/{sku}`). Looks the SKU up
 * and replaces itself in history with the canonical product URL, so the back
 * button never lands on this page. Renders the same on the server and in the
 * browser: the lookup is a plain HttpClient call and the redirect only runs
 * once a product comes back.
 */
@Component({
  selector: 'app-sku-redirect',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-[60vh] bg-white font-sans text-[#1d1d1f] flex items-center justify-center px-6 py-24">
      <div class="max-w-md w-full text-center">

        <!-- Looking up -->
        <div *ngIf="!notFound()" class="animate-fade-in" role="status" aria-live="polite">
          <span class="inline-block w-8 h-8 rounded-full border-2 border-[#D4AF37] border-t-transparent animate-spin mb-6" aria-hidden="true"></span>
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">Label scan</span>
          <p class="font-display font-semibold text-2xl tracking-tight text-[#1d1d1f]">Looking up SKU…</p>
          <p class="font-mono text-xs text-[#7a7a7a] mt-3">{{ sku() }}</p>
        </div>

        <!-- Not found -->
        <div *ngIf="notFound()" class="animate-fade-in">
          <div class="w-16 h-16 mx-auto text-[#D4AF37] mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-full h-full" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22a8 8 0 100-16 8 8 0 000 16zm0-16V2m-3 2h6M9 6l3-4 3 4" /></svg>
          </div>
          <h1 class="font-display font-semibold text-3xl tracking-tight text-[#1d1d1f] mb-3">We couldn&rsquo;t find that piece</h1>
          <p class="text-sm text-[#7a7a7a] mb-2 max-w-sm mx-auto">
            No product matches the SKU on this label. It may have been sold, renamed or withdrawn from the collection.
          </p>
          <p class="font-mono text-xs text-[#7a7a7a] mb-8">SKU {{ sku() }}</p>
          <a routerLink="/products" class="btn-apple-pill">Browse the collection</a>
        </div>

      </div>
    </div>
  `,
})
export class SkuRedirectComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private productService = inject(ProductService);

  sku = signal('');
  notFound = signal(false);

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const sku = (params.get('sku') || '').trim();
      this.sku.set(sku);
      this.notFound.set(false);

      if (!sku) {
        this.notFound.set(true);
        return;
      }

      this.productService.getProductBySku(sku).subscribe({
        next: (product) => {
          if (product?.id) {
            this.router.navigate(['/products', product.id], { replaceUrl: true });
          } else {
            this.notFound.set(true);
          }
        },
        error: () => this.notFound.set(true),
      });
    });
  }
}
