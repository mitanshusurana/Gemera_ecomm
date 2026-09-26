import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../services/auth.service';
import { saveBlobAs } from '../../services/order.service';
import {
  EstimateRequest, PaymentRequest, REPAIR_SERVICE_LABELS, REPAIR_STATUS_LABELS, REPAIR_STATUSES,
  RepairJob, RepairPaymentMode, RepairService, RepairStatus,
} from '../../services/repair.service';

/**
 * Repair and service jobs: status chips with counts, search, table, and a
 * detail panel with the timeline, status actions (only the transitions the
 * machine allows), estimate, assignment, payment, notes and the job card PDF.
 */
@Component({
  selector: 'app-repair-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './repair-list.component.html',
})
export class RepairListComponent implements OnInit {
  private repairService = inject(RepairService);
  private toastr = inject(ToastrService);
  private auth = inject(AuthService);

  /** The invoice download needs invoices.read, as on orders. */
  canReadInvoices(): boolean {
    return this.auth.can('invoices.read');
  }

  readonly statuses = REPAIR_STATUSES;
  readonly statusLabels = REPAIR_STATUS_LABELS;
  readonly serviceLabels = REPAIR_SERVICE_LABELS;
  readonly paymentModes: RepairPaymentMode[] = ['CASH', 'UPI', 'CARD', 'RAZORPAY', 'OTHER'];

  jobs: RepairJob[] = [];
  counts: Record<string, number> | null = null;
  total = 0;
  page = 0;
  readonly size = 50;
  loading = true;
  error = '';

  currentStatus: RepairStatus | 'ALL' = 'ALL';
  search = '';
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  // Detail panel
  selected: RepairJob | null = null;
  detailLoading = false;
  saving = false;
  printing = false;
  downloadingInvoice = false;

  // Status action form
  statusForm: { status: RepairStatus | ''; note: string; visibleToCustomer: boolean; promisedDate: string } =
    { status: '', note: '', visibleToCustomer: true, promisedDate: '' };
  estimateForm: { estimateAmount: number | null; estimateNote: string; promisedDate: string } =
    { estimateAmount: null, estimateNote: '', promisedDate: '' };
  assignForm = { assignedTo: '' };
  paymentForm: { finalAmount: number | null; paidAmount: number | null; paymentMode: RepairPaymentMode | ''; paymentReference: string } =
    { finalAmount: null, paidAmount: null, paymentMode: '', paymentReference: '' };
  notesForm = { internalNotes: '' };

  ngOnInit(): void {
    this.load();
    this.loadStats();
  }

  // -------------------------------------------------------------------
  // List
  // -------------------------------------------------------------------

  load(): void {
    this.loading = true;
    this.error = '';
    this.repairService.list(this.currentStatus, this.search, this.page, this.size).subscribe({
      next: (res) => {
        this.jobs = res.content ?? [];
        this.total = res.totalElements ?? this.jobs.length;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load repair jobs', err);
        this.error = 'Failed to load repair jobs.';
        this.loading = false;
      },
    });
  }

  loadStats(): void {
    this.repairService.stats().subscribe({
      next: (counts) => (this.counts = counts),
      error: () => (this.counts = null),
    });
  }

  setStatus(status: RepairStatus | 'ALL'): void {
    if (this.currentStatus === status) return;
    this.currentStatus = status;
    this.page = 0;
    this.load();
  }

  onSearchChange(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.page = 0;
      this.load();
    }, 300);
  }

  countFor(status: RepairStatus | 'ALL'): number | null {
    if (!this.counts) return null;
    if (status === 'ALL') return Object.values(this.counts).reduce((a, b) => a + (Number(b) || 0), 0);
    return Number(this.counts[status] ?? 0);
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.size));
  }

  prevPage(): void {
    if (this.page > 0) { this.page--; this.load(); }
  }

  nextPage(): void {
    if (this.page < this.totalPages - 1) { this.page++; this.load(); }
  }

  // -------------------------------------------------------------------
  // Detail panel
  // -------------------------------------------------------------------

  open(job: RepairJob): void {
    this.selected = job;
    this.fillForms(job);
    this.detailLoading = true;
    this.repairService.get(job.id).subscribe({
      next: (full) => {
        this.apply(full);
        this.detailLoading = false;
      },
      error: () => (this.detailLoading = false),
    });
  }

  close(): void {
    this.selected = null;
  }

  /** Replaces the selected job and its row in the table with the server's version. */
  private apply(job: RepairJob): void {
    this.selected = job;
    this.fillForms(job);
    const i = this.jobs.findIndex(j => j.id === job.id);
    if (i >= 0) this.jobs[i] = job;
    this.loadStats();
  }

  private fillForms(job: RepairJob): void {
    this.statusForm = { status: '', note: '', visibleToCustomer: true, promisedDate: job.promisedDate ?? '' };
    this.estimateForm = {
      estimateAmount: job.estimateAmount,
      estimateNote: job.estimateNote ?? '',
      promisedDate: job.promisedDate ?? '',
    };
    this.assignForm = { assignedTo: job.assignedTo ?? '' };
    this.paymentForm = {
      finalAmount: job.finalAmount ?? job.estimateAmount,
      paidAmount: job.paidAmount,
      paymentMode: job.paymentMode ?? '',
      paymentReference: job.paymentReference ?? '',
    };
    this.notesForm = { internalNotes: job.internalNotes ?? '' };
  }

  /** Transition buttons: the machine's allowed next statuses, in display order. */
  get nextStatuses(): RepairStatus[] {
    const allowed = this.selected?.allowedTransitions ?? [];
    return this.statuses.filter(s => allowed.includes(s));
  }

  pickStatus(status: RepairStatus): void {
    this.statusForm.status = this.statusForm.status === status ? '' : status;
    if (!this.statusForm.note) this.statusForm.note = '';
  }

  submitStatus(): void {
    if (!this.selected || !this.statusForm.status || this.saving) return;
    this.saving = true;
    this.repairService.updateStatus(this.selected.id, {
      status: this.statusForm.status,
      note: this.statusForm.note.trim() || undefined,
      visibleToCustomer: this.statusForm.visibleToCustomer,
      promisedDate: this.statusForm.promisedDate || null,
    }).subscribe({
      next: (job) => {
        this.saving = false;
        this.apply(job);
        this.toastr.success(`${job.jobNumber} is now ${this.statusLabels[job.status]}.`);
      },
      error: (err) => this.fail(err, 'Status was not updated.'),
    });
  }

  submitEstimate(): void {
    if (!this.selected || this.saving) return;
    const amount = Number(this.estimateForm.estimateAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      this.toastr.error('Enter the estimate amount.');
      return;
    }
    this.saving = true;
    const body: EstimateRequest = {
      estimateAmount: amount,
      estimateNote: this.estimateForm.estimateNote.trim() || undefined,
      promisedDate: this.estimateForm.promisedDate || null,
    };
    this.repairService.setEstimate(this.selected.id, body).subscribe({
      next: (job) => {
        this.saving = false;
        this.apply(job);
        this.toastr.success('Estimate saved and the customer has been emailed for approval.');
      },
      error: (err) => this.fail(err, 'Estimate was not saved.'),
    });
  }

  submitAssign(): void {
    if (!this.selected || this.saving) return;
    this.saving = true;
    this.repairService.assign(this.selected.id, this.assignForm.assignedTo.trim()).subscribe({
      next: (job) => {
        this.saving = false;
        this.apply(job);
        this.toastr.success(job.assignedTo ? `Assigned to ${job.assignedTo}.` : 'Assignment cleared.');
      },
      error: (err) => this.fail(err, 'Assignment was not saved.'),
    });
  }

  submitPayment(): void {
    if (!this.selected || this.saving) return;
    this.saving = true;
    const body: PaymentRequest = {
      finalAmount: this.numOrNull(this.paymentForm.finalAmount),
      paidAmount: this.numOrNull(this.paymentForm.paidAmount),
      paymentMode: this.paymentForm.paymentMode || null,
      paymentReference: this.paymentForm.paymentReference.trim() || undefined,
    };
    this.repairService.recordPayment(this.selected.id, body).subscribe({
      next: (job) => {
        this.saving = false;
        this.apply(job);
        this.toastr.success('Payment recorded.');
      },
      error: (err) => this.fail(err, 'Payment was not saved.'),
    });
  }

  submitNotes(): void {
    if (!this.selected || this.saving) return;
    this.saving = true;
    this.repairService.updateNotes(this.selected.id, this.notesForm.internalNotes).subscribe({
      next: (job) => {
        this.saving = false;
        this.apply(job);
        this.toastr.success('Notes saved.');
      },
      error: (err) => this.fail(err, 'Notes were not saved.'),
    });
  }

  printJobCard(): void {
    if (!this.selected || this.printing) return;
    const { id, jobNumber } = this.selected;
    this.printing = true;
    this.repairService.jobCard(id).subscribe({
      next: (blob) => {
        this.printing = false;
        saveBlobAs(blob, `${jobNumber}-job-card.pdf`);
      },
      error: (err) => {
        this.printing = false;
        console.error('Failed to download job card', err);
        this.toastr.error('The job card could not be generated. Please try again.');
      },
    });
  }

  downloadInvoice(): void {
    if (!this.selected || this.downloadingInvoice) return;
    const { id, jobNumber, invoiceNumber } = this.selected;
    this.downloadingInvoice = true;
    this.repairService.invoice(id).subscribe({
      next: (blob) => {
        this.downloadingInvoice = false;
        saveBlobAs(blob, `${invoiceNumber || `${jobNumber}-invoice`}.pdf`);
        if (!invoiceNumber) this.open(this.selected!);
      },
      error: (err) => {
        this.downloadingInvoice = false;
        console.error('Failed to download invoice', err);
        const e = err as { status?: number };
        this.toastr.error(e?.status === 404
          ? 'The tax invoice is issued once the job is delivered or fully paid.'
          : 'The invoice could not be generated. Please try again.');
      },
    });
  }

  /** Invoice may already exist, or can be issued now (delivered, or fully paid). */
  invoiceAvailable(job: RepairJob): boolean {
    if (job.invoiceNumber) return true;
    if (job.status === 'CANCELLED') return false;
    const billable = job.finalAmount ?? job.estimateAmount;
    if (billable == null || Number(billable) <= 0) return false;
    return job.status === 'DELIVERED' || Number(job.paidAmount || 0) >= Number(billable);
  }

  // -------------------------------------------------------------------
  // Display helpers
  // -------------------------------------------------------------------

  serviceLabel(type: string): string {
    return this.serviceLabels[type] ?? type;
  }

  itemLabel(type: string): string {
    return type ? type.charAt(0) + type.slice(1).toLowerCase() : '';
  }

  statusClass(status: RepairStatus): string {
    switch (status) {
      case 'REQUESTED': return 'bg-slate-100 text-slate-800';
      case 'RECEIVED': return 'bg-blue-100 text-blue-800';
      case 'ASSESSED': return 'bg-amber-100 text-amber-800';
      case 'APPROVED': return 'bg-indigo-100 text-indigo-800';
      case 'IN_PROGRESS': return 'bg-purple-100 text-purple-800';
      case 'READY': return 'bg-emerald-100 text-emerald-800';
      case 'DELIVERED': return 'bg-gray-800 text-white';
      case 'CANCELLED': return 'bg-red-100 text-red-800';
    }
  }

  balance(job: RepairJob): number | null {
    if (job.finalAmount == null) return null;
    return Math.max(0, Number(job.finalAmount) - Number(job.paidAmount || 0));
  }

  isOverdue(job: RepairJob): boolean {
    if (!job.promisedDate || ['DELIVERED', 'CANCELLED', 'READY'].includes(job.status)) return false;
    return new Date(job.promisedDate + 'T23:59:59') < new Date();
  }

  private numOrNull(v: number | null): number | null {
    if (v === null || v === undefined || (v as unknown) === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private fail(err: unknown, fallback: string): void {
    this.saving = false;
    const e = err as { error?: { message?: string; detail?: string } };
    console.error(fallback, err);
    this.toastr.error(e?.error?.message || e?.error?.detail || fallback);
  }
}
