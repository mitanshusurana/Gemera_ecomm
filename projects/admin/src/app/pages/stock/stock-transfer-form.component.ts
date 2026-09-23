import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { StoreService, Store } from '../../services/store.service';
import { ProductService } from '../../services/product.service';
import { StockService, ProductStockLocations, apiErrorMessage } from '../../services/stock.service';
import { extractSku } from '../../core/labels';

interface DraftLine {
  productId: string;
  sku: string;
  name: string;
  price: number | null;
  image: string | null;
  quantity: number;
  /** Pieces at the chosen source, once known. */
  available: number | null;
}

/**
 * /stock/transfers/new: pick a source and destination (Warehouse or a store),
 * add products by searching name / SKU or scanning a label into the search
 * box, set quantities, and save a DRAFT. Dispatching happens on the detail
 * page so the numbers can be checked first.
 */
@Component({
  selector: 'app-stock-transfer-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './stock-transfer-form.component.html'
})
export class StockTransferFormComponent implements OnInit {
  private stockService = inject(StockService);
  private storeService = inject(StoreService);
  private productService = inject(ProductService);
  private router = inject(Router);
  private toastr = inject(ToastrService);

  stores: Store[] = [];
  /** '' = warehouse. */
  fromStoreId = '';
  toStoreId = '';
  note = '';
  lines: DraftLine[] = [];

  search = '';
  results: any[] = [];
  searching = false;
  private searchTimer: any;

  saving = false;
  error: string | null = null;

  ngOnInit() {
    this.storeService.getStores().subscribe({
      next: stores => {
        this.stores = stores ?? [];
        // Default destination: the first store, so a warehouse -> store transfer is one click away.
        if (!this.toStoreId && this.stores.length > 0 && this.stores[0].id) {
          this.toStoreId = this.stores[0].id;
        }
      },
      error: () => this.stores = []
    });
  }

  locationName(storeId: string): string {
    if (!storeId) return 'Warehouse';
    return this.stores.find(s => s.id === storeId)?.name ?? 'Store';
  }

  get sameLocation(): boolean {
    return this.fromStoreId === this.toStoreId;
  }

  get totalPieces(): number {
    return this.lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }

  get canSave(): boolean {
    return !this.saving && !this.sameLocation && this.lines.length > 0
      && this.lines.every(l => Number.isInteger(Number(l.quantity)) && Number(l.quantity) >= 1);
  }

  onSourceChange() {
    for (const line of this.lines) {
      line.available = null;
      this.refreshAvailability(line);
    }
  }

  // ----- Product search -----

  onSearchInput() {
    clearTimeout(this.searchTimer);
    const q = this.search.trim();
    if (q.length < 2) {
      this.results = [];
      return;
    }
    this.searchTimer = setTimeout(() => this.runSearch(q), 250);
  }

  /** Enter in the search box: a scanned label resolves straight to a line. */
  onSearchEnter() {
    clearTimeout(this.searchTimer);
    const sku = extractSku(this.search);
    if (!sku) return;
    this.productService.getProductBySku(sku).subscribe({
      next: product => {
        if (product?.id) {
          this.addProduct(product);
          this.search = '';
          this.results = [];
        } else {
          this.runSearch(sku);
        }
      },
      error: () => this.runSearch(sku)
    });
  }

  private runSearch(q: string) {
    this.searching = true;
    this.productService.getProducts(q, { page: 0, size: 8 }).subscribe({
      next: data => {
        const rows = Array.isArray(data) ? data : (data?.content ?? []);
        this.results = rows;
        this.searching = false;
      },
      error: () => {
        this.results = [];
        this.searching = false;
      }
    });
  }

  addProduct(product: any) {
    if (!product?.id) return;
    const existing = this.lines.find(l => l.productId === product.id);
    if (existing) {
      existing.quantity = (Number(existing.quantity) || 0) + 1;
      return;
    }
    const line: DraftLine = {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price ?? null,
      image: product.images?.[0] ?? null,
      quantity: 1,
      available: null
    };
    this.lines.push(line);
    this.refreshAvailability(line);
  }

  removeLine(index: number) {
    this.lines.splice(index, 1);
  }

  private refreshAvailability(line: DraftLine) {
    this.stockService.getProductStock(line.productId).subscribe({
      next: (loc: ProductStockLocations) => {
        if (!this.fromStoreId) {
          line.available = loc.warehouseQuantity ?? 0;
        } else {
          line.available = loc.stores.find(s => s.storeId === this.fromStoreId)?.quantity ?? 0;
        }
      },
      error: () => line.available = null
    });
  }

  isShort(line: DraftLine): boolean {
    return line.available != null && Number(line.quantity) > line.available;
  }

  // ----- Save -----

  save(dispatchAfter = false) {
    if (!this.canSave) return;
    this.saving = true;
    this.error = null;
    this.stockService.createTransfer({
      fromStoreId: this.fromStoreId || null,
      toStoreId: this.toStoreId || null,
      note: this.note.trim() || undefined,
      lines: this.lines.map(l => ({ productId: l.productId, quantity: Number(l.quantity) }))
    }).subscribe({
      next: transfer => {
        if (dispatchAfter) {
          this.stockService.dispatchTransfer(transfer.id).subscribe({
            next: () => {
              this.toastr.success(`${transfer.transferNumber} dispatched`);
              this.router.navigate(['/stock/transfers', transfer.id]);
            },
            error: err => {
              this.toastr.warning(apiErrorMessage(err, 'Saved as draft; dispatch failed.'));
              this.router.navigate(['/stock/transfers', transfer.id]);
            }
          });
        } else {
          this.toastr.success(`${transfer.transferNumber} saved as draft`);
          this.router.navigate(['/stock/transfers', transfer.id]);
        }
      },
      error: err => {
        this.error = apiErrorMessage(err, 'Could not save the transfer.');
        this.saving = false;
      }
    });
  }
}
