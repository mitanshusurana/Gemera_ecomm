import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { OrderService } from '../../services/order.service';
import { ProductService } from '../../services/product.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html'
})
export class DashboardComponent implements OnInit {
  private orderService = inject(OrderService);
  private productService = inject(ProductService);
  private http = inject(HttpClient);

  recentOrders: any[] = [];
  stats: any = null;
  loading = true;

  /**
   * OPERATIONS-CONTRACT §5: products at or below their reorder point from
   * GET /admin/inventory/low-stock. `null` until loaded or when the endpoint
   * is unavailable, in which case the card shows a dash rather than 0.
   */
  lowStock: any[] | null = null;
  lowStockFailed = false;

  get lowStockCount(): number | null {
    return this.lowStock ? this.lowStock.length : null;
  }

  ngOnInit() {
    this.productService.getLowStock().subscribe({
      next: (data: any) => {
        const rows = Array.isArray(data) ? data : (data?.content ?? data?.items ?? []);
        this.lowStock = Array.isArray(rows) ? rows : [];
      },
      error: (err) => {
        console.warn('Low-stock list unavailable', err?.status);
        this.lowStockFailed = true;
      }
    });

    this.orderService.getOrders().subscribe({
      next: (data) => {
        // Just take the first 3 or 4 for recent orders
        this.recentOrders = data.content ? data.content.slice(0, 4) : [];
      },
      error: (err) => {
        console.error('Failed to load orders', err);
      }
    });

    this.http.get(`${environment.apiUrl}/admin/analytics/kpis`).subscribe({
      next: (data) => {
        this.stats = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load stats', err);
        this.loading = false;
      }
    });
  }

  triggerBackup() {
    if (confirm('Are you sure you want to trigger a database backup?')) {
      this.http.post(`${environment.apiUrl}/admin/backup/trigger`, {}).subscribe({
        next: (res: any) => {
          alert(`Backup successful: ${res.message}`);
        },
        error: (err) => {
          alert(`Backup failed: ${err.error?.message || err.message}`);
        }
      });
    }
  }
}
