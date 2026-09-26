import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RFQ_STATUS_CLASS, RfqService } from '../../services/rfq.service';
import { ProductService } from '../../services/product.service';

type Panel = 'quote' | 'negotiate' | 'reject' | null;

/**
 * RFQ detail (OPERATIONS-CONTRACT §7). Bodies follow RFQController:
 * quote `{ proposedPrice, notes }`, negotiate `{ requestedPrice?, notes }`,
 * reject `{ reason }`, accept / cancel empty. The API accepts any of these
 * from an admin regardless of status; the buttons are gated to the
 * transitions that make sense so a terminal request cannot be re-quoted.
 */
@Component({
  selector: 'app-rfq-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './rfq-detail.component.html'
})
export class RfqDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private rfqService = inject(RfqService);
  private productService = inject(ProductService);
  private toastr = inject(ToastrService);

  readonly statusClass = RFQ_STATUS_CLASS;

  rfq: any = null;
  loading = true;
  busy = false;
  error: string | null = null;

  /** productId -> product (name, sku, image) for the items table. */
  products: Record<string, any> = {};

  panel: Panel = null;
  quoteForm = { proposedPrice: null as number | null, notes: '' };
  negotiateForm = { requestedPrice: null as number | null, notes: '' };
  rejectReason = '';

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) this.load(id);
  }

  load(id: string) {
    this.loading = true;
    this.error = null;
    this.rfqService.get(id).subscribe({
      next: (data) => {
        this.rfq = data;
        this.loading = false;
        this.resolveProducts(data?.items ?? []);
        const latest = this.latestQuote;
        if (latest?.price != null && this.quoteForm.proposedPrice == null) {
          this.quoteForm.proposedPrice = Number(latest.price);
        }
      },
      error: (err) => {
        console.error('Failed to load RFQ', err);
        this.error = err?.status === 404 ? 'This quote request no longer exists.' : 'Could not load the quote request.';
        this.loading = false;
      }
    });
  }

  private resolveProducts(items: any[]) {
    const ids = Array.from(new Set(items.map(i => i?.productId).filter(Boolean))) as string[];
    const missing = ids.filter(id => !this.products[id]);
    if (missing.length === 0) return;
    forkJoin(missing.map(id => this.productService.getProduct(id).pipe(catchError(() => of(null)))))
      .subscribe(results => {
        results.forEach((p, i) => { if (p) this.products[missing[i]] = p; });
      });
  }

  // -------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------

  get status(): string {
    return (this.rfq?.status || '').toUpperCase();
  }

  get isTerminal(): boolean {
    return ['ACCEPTED', 'REJECTED', 'CANCELLED'].includes(this.status);
  }

  /** Quotes newest last as the DTO lists them; the last one is the current offer. */
  get quotes(): any[] {
    return Array.isArray(this.rfq?.quotes) ? this.rfq.quotes : [];
  }

  get latestQuote(): any | null {
    const q = this.quotes;
    return q.length ? q[q.length - 1] : null;
  }

  get canQuote(): boolean {
    return !this.isTerminal;
  }

  get canAccept(): boolean {
    return ['QUOTED', 'NEGOTIATING'].includes(this.status) && this.quotes.length > 0;
  }

  get canNegotiate(): boolean {
    return ['QUOTED', 'PENDING'].includes(this.status);
  }

  get canReject(): boolean {
    return !this.isTerminal;
  }

  get canCancel(): boolean {
    return !this.isTerminal;
  }

  get itemsTotalQty(): number {
    return (this.rfq?.items ?? []).reduce((n: number, i: any) => n + (Number(i?.quantity) || 0), 0);
  }

  get targetTotal(): number | null {
    const items: any[] = this.rfq?.items ?? [];
    if (!items.some(i => i?.targetPrice != null)) return null;
    return items.reduce((n, i) => n + (Number(i?.targetPrice) || 0) * (Number(i?.quantity) || 1), 0);
  }

  productName(item: any): string {
    return this.products[item?.productId]?.name || item?.description || (item?.productId ? 'Product ' + String(item.productId).slice(0, 8) : 'Custom item');
  }

  productSku(item: any): string {
    return this.products[item?.productId]?.sku || '';
  }

  productImage(item: any): string | null {
    return this.products[item?.productId]?.images?.[0] || null;
  }

  toggle(panel: Panel) {
    this.panel = this.panel === panel ? null : panel;
  }

  // -------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------

  submitQuote() {
    if (!this.rfq) return;
    const price = Number(this.quoteForm.proposedPrice);
    if (!Number.isFinite(price) || price <= 0) {
      this.toastr.warning('Enter a proposed price greater than zero.');
      return;
    }
    this.busy = true;
    this.rfqService.quote(this.rfq.id, price, this.quoteForm.notes.trim() || undefined).subscribe({
      next: () => this.done('Quote sent to the customer.', { quote: true }),
      error: (err) => this.fail(err, 'The quote was not sent.')
    });
  }

  submitNegotiate() {
    if (!this.rfq) return;
    const notes = this.negotiateForm.notes.trim();
    if (!notes) {
      this.toastr.warning('Add a note explaining what you are proposing.');
      return;
    }
    this.busy = true;
    this.rfqService.negotiate(this.rfq.id, notes, this.negotiateForm.requestedPrice).subscribe({
      next: () => this.done('Marked as negotiating; your note was recorded.', { negotiate: true }),
      error: (err) => this.fail(err, 'The negotiation note was not saved.')
    });
  }

  submitReject() {
    if (!this.rfq) return;
    const reason = this.rejectReason.trim();
    if (!reason) {
      this.toastr.warning('Give a reason for rejecting this request.');
      return;
    }
    this.busy = true;
    this.rfqService.reject(this.rfq.id, reason).subscribe({
      next: () => this.done('Request rejected.', { reject: true }),
      error: (err) => this.fail(err, 'The request was not rejected.')
    });
  }

  accept() {
    if (!this.rfq || !confirm('Accept the latest quote on behalf of the customer? This closes the request.')) return;
    this.busy = true;
    this.rfqService.accept(this.rfq.id).subscribe({
      next: (res: any) => this.done(res?.orderNumber
        ? `Quote accepted; order ${res.orderNumber} created and awaiting the customer's payment.`
        : 'Quote accepted.'),
      error: (err) => this.fail(err, 'The quote was not accepted.')
    });
  }

  cancel() {
    if (!this.rfq || !confirm('Cancel this quote request? The customer will need to submit a new one.')) return;
    this.busy = true;
    this.rfqService.cancel(this.rfq.id).subscribe({
      next: () => this.done('Request cancelled.'),
      error: (err) => this.fail(err, 'The request was not cancelled.')
    });
  }

  private done(message: string, reset: { quote?: boolean; negotiate?: boolean; reject?: boolean } = {}) {
    this.busy = false;
    this.panel = null;
    if (reset.quote) this.quoteForm = { proposedPrice: null, notes: '' };
    if (reset.negotiate) this.negotiateForm = { requestedPrice: null, notes: '' };
    if (reset.reject) this.rejectReason = '';
    this.toastr.success(message);
    if (this.rfq?.id) this.load(this.rfq.id);
  }

  private fail(err: any, fallback: string) {
    this.busy = false;
    console.error(fallback, err);
    this.toastr.error(err?.error?.message || fallback, 'Action failed');
  }
}
