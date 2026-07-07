import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { OrderService } from '../../services/order.service';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './order-detail.component.html',
  styleUrl: './order-detail.component.css'
})
export class OrderDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private orderService = inject(OrderService);

  order: any = null;
  loading = true;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadOrder(id);
    }
  }

  loadOrder(id: string) {
    this.loading = true;
    this.orderService.getOrder(id).subscribe({
      next: (data) => {
        this.order = data;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load order', err);
        this.loading = false;
      }
    });
  }

  statusOptions = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED'];

  onStatusChange(event: any) {
    if (!this.order) return;
    const newStatus = event.target.value;
    this.updateStatus(newStatus);
  }

  updateStatus(status: string) {
    if (!this.order) return;

    this.orderService.updateOrderStatus(this.order.id, status).subscribe({
      next: () => {
        alert('Order status updated successfully');
        this.loadOrder(this.order.id);
      },
      error: (err) => {
        console.error('Failed to update status', err);
        alert('Failed to update status');
      }
    });
  }

  updateTracking(trackingNumber: string) {
    if (!this.order) return;
    this.orderService.updateTrackingNumber(this.order.id, trackingNumber).subscribe({
      next: () => {
        alert('Tracking number updated successfully');
        this.loadOrder(this.order.id);
      },
      error: (err) => {
        console.error('Failed to update tracking', err);
        alert('Failed to update tracking');
      }
    });
  }

  updateNotes(notes: string) {
    if (!this.order) return;
    this.orderService.updateNotes(this.order.id, notes).subscribe({
      next: () => {
        alert('Internal notes updated successfully');
        this.loadOrder(this.order.id);
      },
      error: (err) => {
        console.error('Failed to update notes', err);
        alert('Failed to update notes');
      }
    });
  }
}
