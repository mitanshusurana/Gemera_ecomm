import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../services/auth.service';
import {
  RETURN_CONDITIONS, RETURN_REASON_LABEL, RETURN_RESOLUTION_LABEL, RETURN_STATUSES,
  ReturnRequest, ReturnService, ReturnStatus,
} from '../../services/return.service';

/**
 * Returns desk (RMA): status chips and search, a detail panel with the lines,
 * and the workflow: approve (with an optional restocking fee) or reject,
 * record what came back and in what condition, then resolve (refund through
 * Razorpay, store credit as a gift card, or the replacement order of an
 * exchange). Resolve needs orders.refund; the API enforces it.
 */
@Component({
  selector: 'app-return-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './return-list.component.html'
})
export class ReturnListComponent implements OnInit {
  private returnService = inject(ReturnService);
  private toastr = inject(ToastrService);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);

  readonly statuses: (ReturnStatus | 'ALL')[] = ['ALL', ...RETURN_STATUSES];
  readonly conditions = RETURN_CONDITIONS;
  readonly reasonLabel = RETURN_REASON_LABEL;
  readonly resolutionLabel = RETURN_RESOLUTION_LABEL;

  returns: ReturnRequest[] = [];
  stats: Record<string, number> | null = null;
  loading = true;
  error = '';
  statusFilter: ReturnStatus | 'ALL' = 'ALL';
  query = '';

  currentPage = 0;
  pageSize = 20;
  totalPages = 0;
  totalElements = 0;

  selected: ReturnRequest | null = null;
  detailLoading = false;
  acting = false;

  approveOpen = false;
  restockingFee: number | null = null;
  approveNote = '';
  rejectOpen = false;
  rejectNote = '';
  receiveNote = '';
  receiveLines: Record<string, { received: boolean; condition: string }> = {};
  resolveOpen = false;
  resolveNote = '';

  get canRefund(): boolean {
    return this.auth.can('orders.refund');
  }

  ngOnInit() {
    // The order detail page links here with ?q=<RMA number>.
    this.query = this.route.snapshot.queryParamMap.get('q') || '';
    this.load();
    this.loadStats();
  }

  // ---- list ----

  load() {
    this.loading = true;
    this.error = '';
    this.returnService.list(this.statusFilter, this.query, this.currentPage, this.pageSize).subscribe({
      next: (page) => {
        this.returns = page?.content ?? [];
        this.totalPages = page?.totalPages ?? 0;
        this.totalElements = page?.totalElements ?? 0;
        this.loading = false;
      },
      error: (err) => {
        this.error = err?.error?.message || 'Failed to load return requests.';
        this.loading = false;
      }
    });
  }

  loadStats() {
    this.returnService.stats().subscribe({
      next: (s) => { this.stats = s; },
      error: () => { this.stats = null; }
    });
  }

  countFor(status: ReturnStatus | 'ALL'): number | null {
    if (!this.stats) return null;
    if (status === 'ALL') return Object.values(this.stats).reduce((a, b) => a + (Number(b) || 0), 0);
    const n = this.stats[status];
    return n == null ? null : Number(n);
  }

  setFilter(status: ReturnStatus | 'ALL') {
    if (this.statusFilter === status) return;
    this.statusFilter = status;
    this.currentPage = 0;
    this.load();
  }

  search() {
    this.currentPage = 0;
    this.load();
  }

  nextPage() {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.load();
    }
  }

  prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.load();
    }
  }

  chipClass(status: ReturnStatus | 'ALL'): string {
    return this.statusFilter === status
      ? 'bg-primary text-white border-primary'
      : 'bg-white text-ink border-gray-300 hover:bg-gray-50';
  }

  statusClass(status: string): string {
    switch (status) {
      case 'REQUESTED': return 'bg-yellow-100 text-yellow-800';
      case 'APPROVED': return 'bg-sky-100 text-sky-800';
      case 'RECEIVED': return 'bg-purple-100 text-purple-800';
      case 'REFUNDED':
      case 'EXCHANGED': return 'bg-emerald-100 text-emerald-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-200 text-gray-700';
    }
  }

  // ---- detail ----

  open(r: ReturnRequest) {
    this.selected = r;
    this.resetPanels();
    this.detailLoading = true;
    this.returnService.get(r.id).subscribe({
      next: (full) => {
        this.selected = full;
        this.seedReceiveLines(full);
        this.detailLoading = false;
      },
      error: () => { this.detailLoading = false; }
    });
  }

  close() {
    this.selected = null;
    this.resetPanels();
  }

  private resetPanels() {
    this.approveOpen = false;
    this.rejectOpen = false;
    this.resolveOpen = false;
    this.restockingFee = null;
    this.approveNote = '';
    this.rejectNote = '';
    this.receiveNote = '';
    this.resolveNote = '';
  }

  private seedReceiveLines(r: ReturnRequest) {
    this.receiveLines = {};
    for (const l of r.lines ?? []) {
      this.receiveLines[l.id] = { received: l.received ?? true, condition: l.condition || 'GOOD' };
    }
  }

  linesValue(r: ReturnRequest): number {
    return (r.lines ?? []).reduce((n, l) => n + (Number(l.unitPrice) || 0) * (Number(l.quantity) || 0), 0);
  }

  get canApprove(): boolean { return this.selected?.status === 'REQUESTED'; }
  get canReject(): boolean { return ['REQUESTED', 'APPROVED', 'RECEIVED'].includes(this.selected?.status || ''); }
  get canReceive(): boolean { return ['APPROVED', 'RECEIVED'].includes(this.selected?.status || ''); }
  get canResolve(): boolean { return this.selected?.status === 'RECEIVED'; }

  resolveLabel(r: ReturnRequest): string {
    switch (r.resolution) {
      case 'STORE_CREDIT': return 'Issue store credit';
      case 'EXCHANGE': return 'Issue credit and create replacement order';
      default: return 'Refund through Razorpay';
    }
  }

  // ---- actions ----

  approve() {
    if (!this.selected) return;
    this.acting = true;
    this.returnService.approve(this.selected.id, this.restockingFee, this.approveNote.trim()).subscribe({
      next: (r) => this.done(r, `${r.rmaNumber} approved; the customer has been told how to send it back.`),
      error: (err) => this.fail(err, 'The return was not approved.'),
    });
  }

  reject() {
    if (!this.selected || !this.rejectNote.trim()) return;
    this.acting = true;
    this.returnService.reject(this.selected.id, this.rejectNote.trim()).subscribe({
      next: (r) => this.done(r, `${r.rmaNumber} rejected.`),
      error: (err) => this.fail(err, 'The return was not rejected.'),
    });
  }

  receive() {
    if (!this.selected) return;
    const lines = Object.entries(this.receiveLines).map(([lineId, v]) => ({ lineId, received: v.received, condition: v.condition }));
    this.acting = true;
    this.returnService.receive(this.selected.id, lines, this.receiveNote.trim()).subscribe({
      next: (r) => this.done(r, `${r.rmaNumber}: receipt recorded.`),
      error: (err) => this.fail(err, 'The receipt was not recorded.'),
    });
  }

  resolve() {
    if (!this.selected) return;
    this.acting = true;
    this.returnService.resolve(this.selected.id, this.resolveNote.trim()).subscribe({
      next: (r) => this.done(r, r.status === 'EXCHANGED'
        ? `${r.rmaNumber} exchanged; replacement order ${r.exchangeOrderNumber || ''} created.`
        : `${r.rmaNumber} settled: ${this.resolutionLabel[r.resolution]} of ${r.refundAmount}.`),
      error: (err) => this.fail(err, 'The return was not resolved.'),
    });
  }

  private done(r: ReturnRequest, message: string) {
    this.acting = false;
    this.selected = r;
    this.seedReceiveLines(r);
    this.resetPanels();
    this.toastr.success(message);
    this.load();
    this.loadStats();
  }

  private fail(err: any, fallback: string) {
    this.acting = false;
    this.toastr.error(err?.error?.message || fallback, 'Action failed');
  }
}
