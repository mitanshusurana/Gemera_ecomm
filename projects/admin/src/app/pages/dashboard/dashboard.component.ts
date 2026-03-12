import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OrderService } from '../../services/order.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  private orderService = inject(OrderService);

  recentOrders: any[] = [];
  loading = true;

  ngOnInit() {
    this.orderService.getOrders().subscribe({
      next: (data) => {
        // Just take the first 3 or 4 for recent orders
        this.recentOrders = data.content ? data.content.slice(0, 4) : [];
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load orders', err);
        this.loading = false;
      }
    });
  }
}
