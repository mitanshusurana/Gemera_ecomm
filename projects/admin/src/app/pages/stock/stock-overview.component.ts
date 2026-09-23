import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StoreService, Store } from '../../services/store.service';
import { StockService, StockSummary, StockRow, LocationSummary, apiErrorMessage } from '../../services/stock.service';

/**
 * /stock: one location at a time (Warehouse = Product.stock, or a store
 * counter), the summary cards for every location, and the product rows with
 * their quantities. Transfers and stock takes live under /stock/transfers and
 * /stock/takes.
 */
@Component({
  selector: 'app-stock-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './stock-overview.component.html'
})
export class StockOverviewComponent implements OnInit {
  private stockService = inject(StockService);
  private storeService = inject(StoreService);

  stores: Store[] = [];
  summary: StockSummary | null = null;
  summaryError: string | null = null;

  /** '' = warehouse; otherwise a store id. */
  selectedStoreId = '';
  search = '';
  rows: StockRow[] = [];
  page = 0;
  readonly pageSize = 50;
  totalPages = 0;
  totalElements = 0;
  loading = false;
  rowsError: string | null = null;
  private searchTimer: any;

  ngOnInit() {
    this.storeService.getStores().subscribe({
      next: stores => this.stores = stores ?? [],
      error: () => this.stores = []
    });
    this.loadSummary();
    this.loadRows();
  }

  get selectedLocationName(): string {
    if (!this.selectedStoreId) return 'Warehouse';
    return this.stores.find(s => s.id === this.selectedStoreId)?.name ?? 'Store';
  }

  get selectedSummary(): LocationSummary | null {
    if (!this.summary) return null;
    return this.summary.locations.find(l => (l.storeId ?? '') === this.selectedStoreId) ?? null;
  }

  loadSummary() {
    this.summaryError = null;
    this.stockService.getSummary().subscribe({
      next: s => this.summary = s,
      error: err => this.summaryError = apiErrorMessage(err, 'Could not load the stock summary.')
    });
  }

  selectLocation(storeId: string | null) {
    this.selectedStoreId = storeId ?? '';
    this.page = 0;
    this.loadRows();
  }

  onLocationChange() {
    this.page = 0;
    this.loadRows();
  }

  onSearchInput() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page = 0;
      this.loadRows();
    }, 300);
  }

  clearSearch() {
    this.search = '';
    this.page = 0;
    this.loadRows();
  }

  goToPage(page: number) {
    if (page < 0 || (this.totalPages > 0 && page >= this.totalPages)) return;
    this.page = page;
    this.loadRows();
  }

  loadRows() {
    this.loading = true;
    this.rowsError = null;
    this.stockService.getRows(this.selectedStoreId || null, this.search.trim(), this.page, this.pageSize).subscribe({
      next: data => {
        this.rows = data?.content ?? [];
        this.totalPages = data?.totalPages ?? 0;
        this.totalElements = data?.totalElements ?? this.rows.length;
        this.loading = false;
      },
      error: err => {
        this.rows = [];
        this.totalPages = 0;
        this.totalElements = 0;
        this.rowsError = apiErrorMessage(err, 'Could not load the stock at this location.');
        this.loading = false;
      }
    });
  }

  quantityClass(q: number | null): string {
    if (q == null || q <= 0) return 'text-red-600';
    if (q < 5) return 'text-amber-600';
    return 'text-emerald-600';
  }
}
