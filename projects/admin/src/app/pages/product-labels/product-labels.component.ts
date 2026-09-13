import { Component, inject, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { QRCodeComponent } from 'angularx-qrcode';
import { environment } from '../../../environments/environment';
import { ProductService } from '../../services/product.service';
import { itemTypeBadge, keyWeight, labelPrice, productQrUrl } from '../../core/labels';

export type LabelSize = '50x30' | '38x25';

interface LabelCard {
  id: string;
  sku: string;
  name: string;
  badge: string;
  price: string;
  weight: string;
  qr: string;
}

/**
 * Print view for product labels (OPERATIONS-CONTRACT §1).
 *
 * Ids come from `?ids=a,b,c`; products already in the print queue are used
 * as-is, anything else is fetched. Encapsulation is off so the `@media print`
 * rules can hide the admin shell (header / sidebar / bottom bar), which live
 * outside this component; they are scoped by `body.labels-print-mode`, which
 * is only present while this page is on screen.
 */
@Component({
  selector: 'app-product-labels',
  standalone: true,
  imports: [CommonModule, RouterLink, QRCodeComponent],
  templateUrl: './product-labels.component.html',
  styleUrl: './product-labels.component.css',
  encapsulation: ViewEncapsulation.None
})
export class ProductLabelsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  private document = inject(DOCUMENT);

  private static readonly SIZE_KEY = 'caratloop.labelSize';

  labels: LabelCard[] = [];
  missing: string[] = [];
  loading = true;
  size: LabelSize = '50x30';

  /** QR raster size in px; the CSS scales it into the mm box. */
  get qrPx(): number {
    return this.size === '50x30' ? 180 : 140;
  }

  get perPage(): number {
    return this.size === '50x30' ? 36 : 55;
  }

  ngOnInit() {
    this.document.body.classList.add('labels-print-mode');
    try {
      const saved = localStorage.getItem(ProductLabelsComponent.SIZE_KEY);
      if (saved === '50x30' || saved === '38x25') this.size = saved;
    } catch { /* storage unavailable */ }

    this.route.queryParamMap.subscribe(params => {
      const raw = params.get('ids') ?? '';
      const ids = raw.split(',').map(s => s.trim()).filter(Boolean);
      const queued = this.productService.getPrintQueue().map(p => p.id);
      this.load(ids.length ? ids : queued);
    });
  }

  ngOnDestroy() {
    this.document.body.classList.remove('labels-print-mode');
  }

  setSize(size: LabelSize) {
    this.size = size;
    try { localStorage.setItem(ProductLabelsComponent.SIZE_KEY, size); } catch { /* ignore */ }
  }

  print() {
    window.print();
  }

  private load(ids: string[]) {
    if (ids.length === 0) {
      this.labels = [];
      this.loading = false;
      return;
    }
    this.loading = true;
    const requests = ids.map(id => {
      const queued = this.productService.getQueuedProduct(id);
      if (queued) return of(queued);
      return this.productService.getProduct(id).pipe(
        catchError(() => of(null)),
        map(p => p ?? { id, __missing: true })
      );
    });
    forkJoin(requests).subscribe(products => {
      this.missing = products.filter(p => p.__missing).map(p => p.id);
      this.labels = products.filter(p => !p.__missing).map(p => this.toCard(p));
      this.loading = false;
    });
  }

  private toCard(p: any): LabelCard {
    const sku = (p.sku || '').toString();
    return {
      id: p.id,
      sku: sku || 'NO SKU',
      name: p.name || '',
      badge: itemTypeBadge(p),
      price: labelPrice(p),
      weight: keyWeight(p),
      qr: sku ? productQrUrl(environment.storefrontUrl, sku) : `${environment.storefrontUrl}/products/${p.id}`
    };
  }
}
