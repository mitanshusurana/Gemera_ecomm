import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { AdminOrder, ErpSyncStatus, OrderService, saveBlobAs } from '../../services/order.service';

/** A status-change button on the order detail page (OPERATIONS-CONTRACT §3). */
interface OrderAction {
  status: string;
  label: string;
  /** Tailwind classes for the button; destructive ones are red. */
  tone: 'primary' | 'neutral' | 'danger';
  /** 'ship' opens the tracking form, 'cancel' the reason form; others confirm and PUT /status. */
  flow: 'status' | 'ship' | 'cancel';
}

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './order-detail.component.html'
})
export class OrderDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private orderService = inject(OrderService);
  private toastr = inject(ToastrService);

  order: AdminOrder | null = null;
  loading = true;
  busy = false;

  /** Tax invoice PDF fetch in flight. */
  downloadingInvoice = false;
  /** POST /erp-sync in flight. */
  syncingErp = false;

  /** Which inline form is open, if any. */
  panel: 'ship' | 'cancel' | null = null;

  ship = { trackingNumber: '', shippingMethod: '', estimatedDelivery: '' };
  cancelReason = '';

  /**
   * Fallback when the DTO has no `nextStatuses` (older backend). Mirrors
   * OrderService.ALLOWED_TRANSITIONS; the server enforces it regardless.
   */
  private static readonly TRANSITIONS: Record<string, string[]> = {
    PENDING_PAYMENT: ['PAID', 'CANCELLED'],
    PAID: ['PROCESSING', 'CANCELLED', 'REFUNDED'],
    PROCESSING: ['SHIPPED', 'CANCELLED'],
    SHIPPED: ['DELIVERED'],
    DELIVERED: ['RETURNED', 'COMPLETED'],
    RETURNED: ['REFUNDED'],
    COMPLETED: ['RETURNED'],
    CANCELLED: [],
    REFUNDED: [],
  };

  private static readonly ACTION_META: Record<string, Omit<OrderAction, 'status'>> = {
    PAID: { label: 'Mark paid', tone: 'primary', flow: 'status' },
    PROCESSING: { label: 'Start processing', tone: 'primary', flow: 'status' },
    SHIPPED: { label: 'Mark shipped', tone: 'primary', flow: 'ship' },
    DELIVERED: { label: 'Mark delivered', tone: 'primary', flow: 'status' },
    COMPLETED: { label: 'Complete order', tone: 'neutral', flow: 'status' },
    RETURNED: { label: 'Mark returned', tone: 'neutral', flow: 'status' },
    REFUNDED: { label: 'Refund', tone: 'danger', flow: 'status' },
    CANCELLED: { label: 'Cancel order', tone: 'danger', flow: 'cancel' },
  };

  /** Rough order of the lifecycle, for the timeline. */
  readonly lifecycle = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'COMPLETED'];

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
        this.ship.trackingNumber = data?.trackingNumber || '';
        this.ship.shippingMethod = data?.shippingMethod || '';
        this.ship.estimatedDelivery = data?.estimatedDelivery || '';
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load order', err);
        this.loading = false;
      }
    });
  }

  /** Re-fetch the order after a mutation; callbacks cannot rely on `order` narrowing. */
  private reload() {
    const id = this.order?.id;
    if (id) this.loadOrder(id);
  }

  // -------------------------------------------------------------------
  // Derived display
  // -------------------------------------------------------------------

  get customerName(): string {
    const o = this.order;
    if (!o) return '';
    const fromAddress = `${o.shippingAddress?.firstName ?? ''} ${o.shippingAddress?.lastName ?? ''}`.trim();
    return o.customerName || fromAddress || '—';
  }

  get customerEmail(): string {
    return this.order?.customerEmail || this.order?.email || this.order?.user?.email || '';
  }

  get giftCardAmount(): number {
    const n = Number(this.order?.giftCardAmount ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  /** Whole INR refunded through Razorpay, when any. */
  get refundedAmount(): number {
    const n = Number(this.order?.refundedAmount ?? 0);
    return Number.isFinite(n) ? n : 0;
  }

  get hasRefund(): boolean {
    return !!this.order?.razorpayRefundId || this.refundedAmount > 0;
  }

  /** Upper-cased ERP status, or null for "never queued". */
  get erpStatus(): ErpSyncStatus | null {
    const raw = this.order?.erpSyncStatus;
    if (!raw) return null;
    const s = String(raw).toUpperCase();
    return s === 'PENDING' || s === 'SENT' || s === 'FAILED' ? s : null;
  }

  erpChipClass(): string {
    switch (this.erpStatus) {
      case 'PENDING': return 'bg-amber-100 text-amber-800';
      case 'SENT': return 'bg-emerald-100 text-emerald-800';
      case 'FAILED': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  erpChipLabel(): string {
    return this.erpStatus ?? 'Not queued';
  }

  /** Statuses reachable from where the order is now: the DTO's list, else the static map. */
  allowedNextStatuses(): string[] {
    const fromDto = this.order?.nextStatuses;
    if (Array.isArray(fromDto)) return fromDto.map((s: string) => String(s).toUpperCase());
    const current = (this.order?.status || '').toUpperCase();
    return OrderDetailComponent.TRANSITIONS[current] ?? [];
  }

  actions(): OrderAction[] {
    return this.allowedNextStatuses().map(status => {
      const meta = OrderDetailComponent.ACTION_META[status] ?? { label: `Move to ${status}`, tone: 'neutral' as const, flow: 'status' as const };
      return { status, ...meta };
    });
  }

  isTerminal(): boolean {
    return this.allowedNextStatuses().length === 0;
  }

  /** Timeline steps with a done/current/upcoming state; terminal states are appended. */
  timeline(): Array<{ status: string; state: 'done' | 'current' | 'upcoming' }> {
    const current = (this.order?.status || '').toUpperCase();
    const idx = this.lifecycle.indexOf(current);
    if (idx === -1) {
      // CANCELLED / REFUNDED / RETURNED: show the main path as done up to PAID-ish then the terminal step.
      return [...this.lifecycle.slice(0, 2).map(s => ({ status: s, state: 'done' as const })), { status: current, state: 'current' as const }];
    }
    return this.lifecycle.map((s, i) => ({ status: s, state: i < idx ? 'done' : i === idx ? 'current' : 'upcoming' }));
  }

  buttonClass(tone: OrderAction['tone']): string {
    const base = 'inline-flex items-center rounded-md px-3 py-2 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ';
    switch (tone) {
      case 'primary': return base + 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500';
      case 'danger': return base + 'border border-red-300 bg-white text-red-700 hover:bg-red-50 focus:ring-red-500';
      default: return base + 'border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 focus:ring-emerald-500';
    }
  }

  // -------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------

  run(action: OrderAction) {
    if (!this.order || this.busy) return;
    if (action.flow === 'ship') { this.panel = this.panel === 'ship' ? null : 'ship'; return; }
    if (action.flow === 'cancel') { this.panel = this.panel === 'cancel' ? null : 'cancel'; return; }

    const current = (this.order.status || '').toUpperCase();
    const ok = confirm(`Change this order from ${current} to ${action.status}?\n\nThe customer will be notified and this cannot be undone here.`);
    if (!ok) return;
    this.updateStatus(action.status);
  }

  submitShip() {
    if (!this.order) return;
    const trackingNumber = this.ship.trackingNumber.trim();
    if (!trackingNumber) {
      this.toastr.warning('Add a tracking number before marking the order shipped.');
      return;
    }
    this.busy = true;
    this.orderService.shipOrder(this.order.id, {
      trackingNumber,
      shippingMethod: this.ship.shippingMethod.trim() || undefined,
      estimatedDelivery: this.ship.estimatedDelivery || undefined,
    }).subscribe({
      next: () => {
        this.busy = false;
        this.panel = null;
        this.toastr.success('Order marked shipped; the customer has been emailed the tracking number.');
        this.reload();
      },
      error: (err) => {
        this.busy = false;
        console.error('Failed to ship order', err);
        this.toastr.error(err?.error?.message || 'The order was not marked shipped. Please try again.', 'Update failed');
      }
    });
  }

  submitCancel() {
    if (!this.order) return;
    const reason = this.cancelReason.trim();
    if (!reason) {
      this.toastr.warning('Give the customer a reason for the cancellation.');
      return;
    }
    this.updateStatus('CANCELLED', reason);
  }

  updateStatus(status: string, reason?: string) {
    if (!this.order) return;
    this.busy = true;
    this.orderService.updateOrderStatus(this.order.id, status, reason).subscribe({
      next: () => {
        this.busy = false;
        this.panel = null;
        this.cancelReason = '';
        this.toastr.success(`Order moved to ${status}.`, 'Status updated');
        this.reload();
      },
      error: (err) => {
        this.busy = false;
        console.error('Failed to update status', err);
        this.toastr.error(err?.error?.message || 'The status was not changed. Please try again.', 'Update failed');
      }
    });
  }

  updateTracking(trackingNumber: string) {
    if (!this.order) return;
    this.orderService.updateTrackingNumber(this.order.id, trackingNumber).subscribe({
      next: () => {
        this.toastr.success('Tracking number updated.');
        this.reload();
      },
      error: (err) => {
        console.error('Failed to update tracking', err);
        this.toastr.error('Tracking number was not saved. Please try again.');
      }
    });
  }

  // -------------------------------------------------------------------
  // Tax invoice and ERP (GST contract)
  // -------------------------------------------------------------------

  downloadInvoice() {
    if (!this.order?.invoiceNumber || this.downloadingInvoice) return;
    const { id, invoiceNumber } = this.order;
    this.downloadingInvoice = true;
    this.orderService.downloadInvoice(id).subscribe({
      next: (blob) => {
        this.downloadingInvoice = false;
        saveBlobAs(blob, `${invoiceNumber}.pdf`);
      },
      error: (err) => {
        this.downloadingInvoice = false;
        console.error('Failed to download invoice', err);
        this.toastr.error(
          err?.status === 404 ? 'No invoice has been issued for this order yet.' : 'The invoice could not be downloaded. Please try again.',
          'Download failed'
        );
      }
    });
  }

  syncToErp() {
    if (!this.order || this.syncingErp) return;
    this.syncingErp = true;
    this.orderService.syncToErp(this.order.id).subscribe({
      next: (updated) => {
        this.syncingErp = false;
        this.order = updated ?? this.order;
        const status = String(updated?.erpSyncStatus ?? '').toUpperCase();
        if (status === 'FAILED') {
          this.toastr.error(updated?.erpLastError || 'The ERP rejected the order.', 'ERP sync failed');
        } else {
          this.toastr.success(status === 'SENT' ? 'Order posted to the ERP.' : 'ERP sync queued.');
        }
        this.reload();
      },
      error: (err) => {
        this.syncingErp = false;
        console.error('Failed to sync order to ERP', err);
        this.toastr.error(err?.error?.message || 'The order was not sent to the ERP. Please try again.', 'ERP sync failed');
      }
    });
  }

  updateNotes(notes: string) {
    if (!this.order) return;
    this.orderService.updateNotes(this.order.id, notes).subscribe({
      next: () => {
        this.toastr.success('Notes saved.');
        this.reload();
      },
      error: (err) => {
        console.error('Failed to update notes', err);
        this.toastr.error('Notes were not saved. Please try again.');
      }
    });
  }
}
