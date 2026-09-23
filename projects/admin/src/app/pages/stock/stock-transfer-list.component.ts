import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StockService, StockTransfer, apiErrorMessage } from '../../services/stock.service';

/** /stock/transfers: every transfer newest first, filtered by status. */
@Component({
  selector: 'app-stock-transfer-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './stock-transfer-list.component.html'
})
export class StockTransferListComponent implements OnInit {
  private stockService = inject(StockService);

  transfers: StockTransfer[] = [];
  status = '';
  page = 0;
  readonly pageSize = 20;
  totalPages = 0;
  totalElements = 0;
  loading = false;
  error: string | null = null;

  readonly statuses = ['', 'DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED'];

  ngOnInit() {
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
    this.stockService.listTransfers(this.status, this.page, this.pageSize).subscribe({
      next: data => {
        this.transfers = data?.content ?? [];
        this.totalPages = data?.totalPages ?? 0;
        this.totalElements = data?.totalElements ?? this.transfers.length;
        this.loading = false;
      },
      error: err => {
        this.transfers = [];
        this.error = apiErrorMessage(err, 'Could not load transfers.');
        this.loading = false;
      }
    });
  }

  statusClass(status: string): string {
    switch (status) {
      case 'DRAFT': return 'bg-slate-100 text-slate-700';
      case 'IN_TRANSIT': return 'bg-amber-100 text-amber-800';
      case 'RECEIVED': return 'bg-emerald-100 text-emerald-800';
      case 'CANCELLED': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  statusLabel(status: string): string {
    return status === 'IN_TRANSIT' ? 'In transit' : status.charAt(0) + status.slice(1).toLowerCase();
  }
}
