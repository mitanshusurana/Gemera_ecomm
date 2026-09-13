import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RFQ_STATUSES, RFQ_STATUS_CLASS, RfqService } from '../../services/rfq.service';

@Component({
  selector: 'app-rfq-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './rfq-list.component.html'
})
export class RfqListComponent implements OnInit {
  private rfqService = inject(RfqService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly statuses: ReadonlyArray<string> = RFQ_STATUSES;
  readonly statusClass = RFQ_STATUS_CLASS;

  rfqs: any[] = [];
  loading = true;
  error: string | null = null;
  currentStatus: string | null = null;

  currentPage = 0;
  pageSize = 20;
  totalPages = 0;
  totalElements = 0;

  /** Counts per status computed from the rows currently loaded. */
  counts: Record<string, number> = {};

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      const status = (params.get('status') || '').toUpperCase();
      this.currentStatus = (RFQ_STATUSES as ReadonlyArray<string>).includes(status) ? status : null;
      this.currentPage = Math.max(0, parseInt(params.get('page') || '0', 10) || 0);
      this.load();
    });
  }

  load() {
    this.loading = true;
    this.error = null;
    this.rfqService.list(this.currentStatus, this.currentPage, this.pageSize).subscribe({
      next: (data: any) => {
        const rows = Array.isArray(data) ? data : (data?.content ?? []);
        this.rfqs = rows;
        this.totalPages = data?.totalPages ?? 1;
        this.totalElements = data?.totalElements ?? rows.length;
        this.counts = rows.reduce((acc: Record<string, number>, r: any) => {
          const s = (r?.status || 'PENDING').toUpperCase();
          acc[s] = (acc[s] ?? 0) + 1;
          return acc;
        }, {});
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load RFQs', err);
        this.error = err?.status === 404
          ? 'The RFQ list endpoint is not available on this backend yet.'
          : 'Could not load quote requests.';
        this.rfqs = [];
        this.loading = false;
      }
    });
  }

  setStatus(status: string | null) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status, page: null },
      queryParamsHandling: 'merge'
    });
  }

  countFor(status: string | null): number {
    if (status === null) return this.currentStatus ? this.totalElements : this.rfqs.length;
    return this.counts[status] ?? 0;
  }

  customerOf(rfq: any): string {
    return rfq?.companyName || rfq?.customerName || rfq?.email || '—';
  }

  itemsSummary(rfq: any): string {
    const items: any[] = Array.isArray(rfq?.items) ? rfq.items : [];
    if (items.length === 0) return '—';
    const qty = items.reduce((n, i) => n + (Number(i?.quantity) || 0), 0);
    const first = items[0]?.description || items[0]?.productName || '';
    const more = items.length > 1 ? ` +${items.length - 1} more` : '';
    return `${items.length} item${items.length === 1 ? '' : 's'} (${qty} pcs)${first ? ': ' + first : ''}${more}`;
  }

  createdOf(rfq: any): string | null {
    return rfq?.createdAt || rfq?.created || null;
  }

  private goToPage(page: number) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page > 0 ? page : null },
      queryParamsHandling: 'merge'
    });
  }

  nextPage() {
    if (this.currentPage < this.totalPages - 1) this.goToPage(this.currentPage + 1);
  }

  prevPage() {
    if (this.currentPage > 0) this.goToPage(this.currentPage - 1);
  }
}
