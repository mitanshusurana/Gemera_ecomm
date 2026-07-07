import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { OrderService } from '../../services/order.service';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.css'
})
export class OrderListComponent implements OnInit {
  private orderService = inject(OrderService);

  orders: any[] = [];
  loading = true;
  currentStatus = 'ALL';
  statusOptions = ['ALL', 'PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED'];
  
  currentPage = 0;
  pageSize = 12;
  totalPages = 0;
  totalElements = 0;

  ngOnInit() {
    this.loadOrders();
  }

  onFilterChange(event: any) {
    this.currentStatus = event.target.value;
    this.currentPage = 0;
    this.loadOrders();
  }

  loadOrders() {
    this.loading = true;
    this.orderService.getOrders(this.currentPage, this.pageSize, this.currentStatus).subscribe({
      next: (data: any) => {
        this.orders = data.content;
        this.totalPages = data.totalPages;
        this.totalElements = data.totalElements;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Failed to load orders', err);
        this.loading = false;
      }
    });
  }

  nextPage() {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.loadOrders();
    }
  }

  prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadOrders();
    }
  }
}
