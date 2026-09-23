import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { StoreService, Store } from '../../services/store.service';
import { StockService, StockTake, apiErrorMessage } from '../../services/stock.service';

/** /stock/takes: past and open counts, plus the "open a new take" form. */
@Component({
  selector: 'app-stock-take-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './stock-take-list.component.html'
})
export class StockTakeListComponent implements OnInit {
  private stockService = inject(StockService);
  private storeService = inject(StoreService);
  private router = inject(Router);
  private toastr = inject(ToastrService);

  stores: Store[] = [];
  takes: StockTake[] = [];
  status = '';
  page = 0;
  readonly pageSize = 20;
  totalPages = 0;
  totalElements = 0;
  loading = false;
  error: string | null = null;

  formOpen = false;
  newStoreId = '';
  newNote = '';
  opening = false;
  formError: string | null = null;

  ngOnInit() {
    this.storeService.getStores().subscribe({
      next: stores => this.stores = stores ?? [],
      error: () => this.stores = []
    });
    this.load();
  }

  onStatusChange() {
    this.page = 0;
    this.load();
  }

  goToPage(page: number) {
    if (page < 0 || (this.totalPages > 0 && page >= this.totalPages)) return;
    this.page = page;
    this.load();
  }

  load() {
    this.loading = true;
    this.error = null;
    this.stockService.listTakes(this.status, this.page, this.pageSize).subscribe({
      next: data => {
        this.takes = data?.content ?? [];
        this.totalPages = data?.totalPages ?? 0;
        this.totalElements = data?.totalElements ?? this.takes.length;
        this.loading = false;
      },
      error: err => {
        this.takes = [];
        this.error = apiErrorMessage(err, 'Could not load stock takes.');
        this.loading = false;
      }
    });
  }

  openForm() {
    this.formOpen = true;
    this.formError = null;
  }

  closeForm() {
    this.formOpen = false;
  }

  locationName(storeId: string): string {
    if (!storeId) return 'Warehouse';
    return this.stores.find(s => s.id === storeId)?.name ?? 'Store';
  }

  openTake() {
    if (this.opening) return;
    this.opening = true;
    this.formError = null;
    this.stockService.openTake(this.newStoreId || null, this.newNote.trim() || undefined).subscribe({
      next: take => {
        this.opening = false;
        this.toastr.success(`${take.takeNumber} opened with ${take.lineCount} line(s)`);
        this.router.navigate(['/stock/takes', take.id]);
      },
      error: err => {
        this.opening = false;
        this.formError = apiErrorMessage(err, 'Could not open the stock take.');
      }
    });
  }

  statusClass(status: string): string {
    switch (status) {
      case 'OPEN': return 'bg-amber-100 text-amber-800';
      case 'CLOSED': return 'bg-emerald-100 text-emerald-800';
      case 'CANCELLED': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  statusLabel(status: string): string {
    return status.charAt(0) + status.slice(1).toLowerCase();
  }
}
