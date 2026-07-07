import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { OrderService } from '../../services/order.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private orderService = inject(OrderService);
  private http = inject(HttpClient);

  recentOrders: any[] = [];
  stats: any = null;
  loading = true;

  ngOnInit() {
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
