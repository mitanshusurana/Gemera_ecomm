import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { StockService, StockTransfer, apiErrorMessage } from '../../services/stock.service';

/**
 * /stock/transfers/:id: the lines and the three actions. Dispatch deducts
 * from the source; receive lets the receiver record what actually arrived
 * per line; cancel returns in-transit pieces to the source.
 */
@Component({
  selector: 'app-stock-transfer-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './stock-transfer-detail.component.html'
})
export class StockTransferDetailComponent implements OnInit {
  private stockService = inject(StockService);
  private route = inject(ActivatedRoute);
  private toastr = inject(ToastrService);

  transfer: StockTransfer | null = null;
  loading = true;
  error: string | null = null;
  acting = false;

  /** Receive mode: editable received quantities keyed by line id. */
  receiving = false;
  received: Record<string, number> = {};

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) this.load(id);
    });
  }

  load(id: string) {
    this.loading = true;
    this.error = null;
    this.stockService.getTransfer(id).subscribe({
      next: t => {
        this.transfer = t;
        this.loading = false;
      },
      error: err => {
        this.error = apiErrorMessage(err, 'Could not load the transfer.');
        this.loading = false;
      }
    });
  }

  get totalValue(): number {
    return (this.transfer?.lines ?? []).reduce((sum, l) => sum + (Number(l.price) || 0) * (l.quantity || 0), 0);
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

  dispatch() {
    if (!this.transfer || this.acting) return;
    const t = this.transfer;
    if (!confirm(`Dispatch ${t.transferNumber}? ${t.totalQuantity} piece(s) leave ${t.fromStoreName} now.`)) return;
    this.acting = true;
    this.stockService.dispatchTransfer(t.id).subscribe({
      next: updated => {
        this.transfer = updated;
        this.acting = false;
        this.toastr.success(`${updated.transferNumber} is in transit`);
      },
      error: err => {
        this.acting = false;
        this.toastr.error(apiErrorMessage(err, 'Dispatch failed.'));
      }
    });
  }

  startReceive() {
    if (!this.transfer) return;
    this.received = {};
    for (const line of this.transfer.lines) {
      this.received[line.id] = line.quantity;
    }
    this.receiving = true;
  }

  cancelReceive() {
    this.receiving = false;
  }

  get receiveValid(): boolean {
    if (!this.transfer) return false;
    return this.transfer.lines.every(l => {
      const v = Number(this.received[l.id]);
      return Number.isInteger(v) && v >= 0 && v <= l.quantity;
    });
  }

  get shortLines(): number {
    if (!this.transfer) return 0;
    return this.transfer.lines.filter(l => Number(this.received[l.id]) < l.quantity).length;
  }

  confirmReceive() {
    if (!this.transfer || this.acting || !this.receiveValid) return;
    const t = this.transfer;
    const short = this.shortLines;
    const msg = short > 0
      ? `Receive ${t.transferNumber} at ${t.toStoreName} with ${short} short line(s)? Missing pieces are not returned to ${t.fromStoreName}; the audit log records the shortfall.`
      : `Receive ${t.transferNumber} at ${t.toStoreName} in full?`;
    if (!confirm(msg)) return;
    this.acting = true;
    const lines = t.lines.map(l => ({ lineId: l.id, receivedQuantity: Number(this.received[l.id]) }));
    this.stockService.receiveTransfer(t.id, lines).subscribe({
      next: updated => {
        this.transfer = updated;
        this.receiving = false;
        this.acting = false;
        this.toastr.success(`${updated.transferNumber} received at ${updated.toStoreName}`);
      },
      error: err => {
        this.acting = false;
        this.toastr.error(apiErrorMessage(err, 'Receive failed.'));
      }
    });
  }

  cancel() {
    if (!this.transfer || this.acting) return;
    const t = this.transfer;
    const msg = t.status === 'IN_TRANSIT'
      ? `Cancel ${t.transferNumber}? The ${t.totalQuantity} piece(s) go back to ${t.fromStoreName}.`
      : `Cancel draft ${t.transferNumber}?`;
    if (!confirm(msg)) return;
    this.acting = true;
    this.stockService.cancelTransfer(t.id).subscribe({
      next: updated => {
        this.transfer = updated;
        this.acting = false;
        this.toastr.info(`${updated.transferNumber} cancelled`);
      },
      error: err => {
        this.acting = false;
        this.toastr.error(apiErrorMessage(err, 'Cancel failed.'));
      }
    });
  }
}
