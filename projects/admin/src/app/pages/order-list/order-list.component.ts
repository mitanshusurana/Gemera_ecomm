import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OrderService } from '../../services/order.service';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './order-list.component.html'
})
export class OrderListComponent implements OnInit {
  private orderService = inject(OrderService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  orders: any[] = [];
  loading = true;
  currentStatus = 'ALL';
  statusOptions = ['ALL', 'PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'RETURNED', 'CANCELLED', 'REFUNDED'];

  /** From GET /orders/stats; null when the endpoint is unavailable (counts hidden). */
  stats: Record<string, number> | null = null;

  currentPage = 0;
  pageSize = 12;
  totalPages = 0;
  totalElements = 0;

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      const status = (params.get('status') || 'ALL').toUpperCase();
      this.currentStatus = this.statusOptions.includes(status) ? status : 'ALL';
      this.currentPage = Math.max(0, parseInt(params.get('page') || '0', 10) || 0);
      this.loadOrders();
    });
    this.loadStats();
  }

  loadStats() {
    this.orderService.getStats().subscribe({
      next: (data) => { this.stats = data && typeof data === 'object' ? data : null; },
      error: () => { this.stats = null; }
    });
  }

  countFor(status: string): number | null {
    if (!this.stats) return null;
    if (status === 'ALL') return Object.values(this.stats).reduce((a, b) => a + (Number(b) || 0), 0);
    const n = this.stats[status];
    return n == null ? null : Number(n);
  }

  setStatus(status: string) {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { status: status === 'ALL' ? null : status, page: null },
      queryParamsHandling: 'merge'
    });
  }

  loadOrders() {
    this.loading = true;
    this.orderService.getOrders(this.currentPage, this.pageSize, this.currentStatus).subscribe({
      next: (data: any) => {
        this.orders = data?.content ?? [];
        this.totalPages = data?.totalPages ?? 0;
        this.totalElements = data?.totalElements ?? this.orders.length;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Failed to load orders', err);
        this.loading = false;
      }
    });
  }

  customerOf(order: any): string {
    const fromAddress = `${order?.shippingAddress?.firstName ?? ''} ${order?.shippingAddress?.lastName ?? ''}`.trim();
    return order?.customerName || fromAddress || order?.customerEmail || '—';
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
