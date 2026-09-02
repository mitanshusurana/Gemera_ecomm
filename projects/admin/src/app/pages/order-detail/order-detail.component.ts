import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
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
  // ngx-toastr is provided in app.config and used elsewhere; this screen
  // was the only one still firing blocking window.alert() on every outcome.
  private toastr = inject(ToastrService);

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

  /**
   * Permitted transitions.
   *
   * There was no state machine: any status could jump to any other, so a
   * single mis-click on the select could move DELIVERED back to
   * PENDING_PAYMENT, or CANCELLED to PAID. The dropdown fired the PUT
   * immediately with no confirmation and nothing recorded who did it.
   */
  private static readonly TRANSITIONS: Record<string, string[]> = {
    PENDING_PAYMENT: ['PAID', 'CANCELLED'],
    PAID: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
    PROCESSING: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED'],
    DELIVERED: ['RETURNED'],
    RETURNED: ['REFUNDED'],
    // Terminal.
    CANCELLED: [],
    REFUNDED: [],
  };

  /** Statuses reachable from where the order is now. */
  allowedNextStatuses(): string[] {
    const current = (this.order?.status || '').toUpperCase();
    return OrderDetailComponent.TRANSITIONS[current] ?? [];
  }

  isTerminal(): boolean {
    return this.allowedNextStatuses().length === 0;
  }

  onStatusChange(event: any) {
    if (!this.order) return;

    const select = event.target as HTMLSelectElement;
    const newStatus = (select.value || '').toUpperCase();
    const current = (this.order.status || '').toUpperCase();

    if (!newStatus || newStatus === current) return;

    if (!this.allowedNextStatuses().includes(newStatus)) {
      this.toastr.error(
        `An order cannot move from ${current} to ${newStatus}.`,
        'Not a permitted transition',
      );
      select.value = current;
      return;
    }

    // Confirm before the change: this is irreversible for the customer and
    // there is no undo.
    const ok = confirm(
      `Change this order from ${current} to ${newStatus}?

` +
        'The customer may be notified and this cannot be undone here.',
    );
    if (!ok) {
      select.value = current;
      return;
    }

    this.updateStatus(newStatus);
  }

  updateStatus(status: string) {
    if (!this.order) return;

    const previous = this.order.status;

    this.orderService.updateOrderStatus(this.order.id, status).subscribe({
      next: () => {
        this.toastr.success(`Order moved to ${status}.`, 'Status updated');
        this.loadOrder(this.order.id);
      },
      error: (err) => {
        console.error('Failed to update status', err);
        this.toastr.error(
          'The status was not changed. Please try again.',
          'Update failed',
        );
        if (this.order) this.order.status = previous;
      }
    });
  }

  updateTracking(trackingNumber: string) {
    if (!this.order) return;
    this.orderService.updateTrackingNumber(this.order.id, trackingNumber).subscribe({
      next: () => {
        this.toastr.success('Tracking number updated.');
        this.loadOrder(this.order.id);
      },
      error: (err) => {
        console.error('Failed to update tracking', err);
        this.toastr.error('Tracking number was not saved. Please try again.');
      }
    });
  }

  updateNotes(notes: string) {
    if (!this.order) return;
    this.orderService.updateNotes(this.order.id, notes).subscribe({
      next: () => {
        this.toastr.success('Notes saved.');
        this.loadOrder(this.order.id);
      },
      error: (err) => {
        console.error('Failed to update notes', err);
        this.toastr.error('Notes were not saved. Please try again.');
      }
    });
  }
}
