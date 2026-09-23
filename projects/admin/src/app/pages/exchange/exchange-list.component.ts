import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AssayRequest,
  EXCHANGE_PAN_THRESHOLD,
  EXCHANGE_STATUSES,
  ExchangeMetal,
  ExchangeRequest,
  ExchangeService,
  ExchangeStatus,
} from '../../services/exchange.service';

interface PurityOption {
  label: string;
  value: number | 'custom';
}

const GOLD_PURITIES: PurityOption[] = [
  { label: '24K / 999 (0.999)', value: 0.999 },
  { label: '22K / 916 (0.916)', value: 0.916 },
  { label: '20K / 833 (0.833)', value: 0.833 },
  { label: '18K / 750 (0.750)', value: 0.75 },
  { label: '14K / 585 (0.585)', value: 0.585 },
  { label: 'Custom fraction', value: 'custom' },
];

const SILVER_PURITIES: PurityOption[] = [
  { label: 'Fine 999 (0.999)', value: 0.999 },
  { label: 'Sterling 925 (0.925)', value: 0.925 },
  { label: 'Custom fraction', value: 'custom' },
];

/**
 * Old gold exchange desk: filter by status, open a request, then receive,
 * assay (purity, net weight, rate prefilled from the live price, deduction),
 * credit (issues the store-credit gift card and queues the ERP purchase),
 * reject or cancel. The right-hand panel shows KYC, the event timeline and
 * the ERP purchase reference.
 */
@Component({
  selector: 'app-exchange-list',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './exchange-list.component.html'
})
export class ExchangeListComponent implements OnInit {
  private fb = inject(FormBuilder);
  private exchangeService = inject(ExchangeService);

  readonly statuses: (ExchangeStatus | 'ALL')[] = ['ALL', ...EXCHANGE_STATUSES];
  readonly panThreshold = EXCHANGE_PAN_THRESHOLD;

  requests: ExchangeRequest[] = [];
  loading = true;
  error = '';
  statusFilter: ExchangeStatus | 'ALL' = 'ALL';

  currentPage = 0;
  pageSize = 20;
  totalPages = 0;
  totalElements = 0;

  // Detail panel
  selected: ExchangeRequest | null = null;
  detailLoading = false;
  actionError = '';
  acting = false;

  // Receive / reject / cancel inputs
  receiveNote = '';
  rejectOpen = false;
  rejectReason = '';
  cancelOpen = false;
  cancelReason = '';

  // Credit confirm dialog and the code it produced
  creditConfirmOpen = false;
  creditedCode: string | null = null;

  // Assay form
  assayOpen = false;
  rateLoading = false;
  rateIndicative = false;
  assayForm = this.fb.nonNullable.group({
    purityChoice: ['0.916' as string, [Validators.required]],
    customPurity: [0.916, [Validators.min(0.01), Validators.max(1)]],
    netWeight: [0, [Validators.required, Validators.min(0.001)]],
    rate: [0, [Validators.required, Validators.min(0.01)]],
    deductionPct: [2, [Validators.required, Validators.min(0), Validators.max(100)]],
    pan: ['', [Validators.pattern(/^[A-Z]{5}[0-9]{4}[A-Z]$/)]],
    note: ['', [Validators.maxLength(2000)]],
  });

  ngOnInit() {
    this.load();
  }

  // ---- list ----

  load() {
    this.loading = true;
    this.error = '';
    this.exchangeService.list(this.currentPage, this.pageSize, this.statusFilter).subscribe({
      next: (page) => {
        this.requests = page?.content ?? [];
        this.totalPages = page?.totalPages ?? 0;
        this.totalElements = page?.totalElements ?? 0;
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load exchange requests', err);
        this.error = err?.error?.message || 'Failed to load exchange requests.';
        this.loading = false;
      }
    });
  }

  setFilter(status: ExchangeStatus | 'ALL') {
    if (this.statusFilter === status) return;
    this.statusFilter = status;
    this.currentPage = 0;
    this.load();
  }

  nextPage() {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.load();
    }
  }

  prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.load();
    }
  }

  // ---- detail ----

  open(r: ExchangeRequest) {
    this.selected = r;
    this.detailLoading = true;
    this.resetActionState();
    this.exchangeService.get(r.id).subscribe({
      next: (full) => {
        this.selected = full;
        this.detailLoading = false;
        this.prepareAssayForm(full);
        this.assayOpen = full.status === 'RECEIVED';
      },
      error: (err) => {
        this.detailLoading = false;
        this.actionError = err?.error?.message || 'Could not load the request.';
      }
    });
  }

  close() {
    this.selected = null;
    this.resetActionState();
  }

  private resetActionState() {
    this.actionError = '';
    this.receiveNote = '';
    this.rejectOpen = false;
    this.rejectReason = '';
    this.cancelOpen = false;
    this.cancelReason = '';
    this.creditConfirmOpen = false;
    this.creditedCode = null;
    this.assayOpen = false;
  }

  private applyUpdate(updated: ExchangeRequest) {
    this.selected = updated;
    this.requests = this.requests.map(r => (r.id === updated.id ? updated : r));
    this.acting = false;
    this.actionError = '';
  }

  private fail(err: any, fallback: string) {
    console.error(fallback, err);
    this.actionError = err?.error?.message || fallback;
    this.acting = false;
  }

  // ---- actions ----

  receive() {
    if (!this.selected) return;
    this.acting = true;
    this.exchangeService.receive(this.selected.id, this.receiveNote.trim()).subscribe({
      next: (u) => {
        this.applyUpdate(u);
        this.receiveNote = '';
        this.prepareAssayForm(u);
        this.assayOpen = true;
      },
      error: (err) => this.fail(err, 'Could not mark the item as received.')
    });
  }

  submitAssay() {
    if (!this.selected) return;
    if (this.assayForm.invalid) {
      this.assayForm.markAllAsTouched();
      return;
    }
    const v = this.assayForm.getRawValue();
    const purity = this.effectivePurity();
    if (purity === null) {
      this.actionError = 'Enter a purity fraction between 0.01 and 1.';
      return;
    }
    const body: AssayRequest = {
      assayedPurityFraction: purity,
      assayedNetWeightGrams: Number(v.netWeight),
      assayedRatePerGram: Number(v.rate),
      deductionPct: Number(v.deductionPct),
      pan: v.pan.trim().toUpperCase() || undefined,
      note: v.note.trim() || undefined,
    };
    this.acting = true;
    this.exchangeService.assay(this.selected.id, body).subscribe({
      next: (u) => {
        this.applyUpdate(u);
        this.assayOpen = false;
      },
      error: (err) => this.fail(err, 'Could not save the assay.')
    });
  }

  askCredit() {
    this.creditConfirmOpen = true;
    this.actionError = '';
  }

  confirmCredit() {
    if (!this.selected) return;
    this.acting = true;
    this.exchangeService.credit(this.selected.id).subscribe({
      next: (u) => {
        this.applyUpdate(u);
        this.creditConfirmOpen = false;
        this.creditedCode = u.creditGiftCardCode;
      },
      error: (err) => {
        this.creditConfirmOpen = false;
        this.fail(err, 'Could not issue the credit.');
      }
    });
  }

  reject() {
    if (!this.selected || !this.rejectReason.trim()) {
      this.actionError = 'A reason is required to reject.';
      return;
    }
    this.acting = true;
    this.exchangeService.reject(this.selected.id, this.rejectReason.trim()).subscribe({
      next: (u) => {
        this.applyUpdate(u);
        this.rejectOpen = false;
      },
      error: (err) => this.fail(err, 'Could not reject the request.')
    });
  }

  cancel() {
    if (!this.selected) return;
    this.acting = true;
    this.exchangeService.cancel(this.selected.id, this.cancelReason.trim()).subscribe({
      next: (u) => {
        this.applyUpdate(u);
        this.cancelOpen = false;
      },
      error: (err) => this.fail(err, 'Could not cancel the request.')
    });
  }

  erpSync() {
    if (!this.selected) return;
    this.acting = true;
    this.exchangeService.erpSync(this.selected.id).subscribe({
      next: (u) => this.applyUpdate(u),
      error: (err) => this.fail(err, 'ERP sync failed.')
    });
  }

  // ---- assay form helpers ----

  purityOptions(metal: ExchangeMetal | undefined): PurityOption[] {
    return metal === 'SILVER' ? SILVER_PURITIES : GOLD_PURITIES;
  }

  private prepareAssayForm(r: ExchangeRequest) {
    const options = this.purityOptions(r.metal);
    const declared = r.assayedPurityFraction ?? r.declaredPurityFraction;
    const match = options.find(o => o.value !== 'custom' && Math.abs((o.value as number) - declared) < 0.0005);
    this.assayForm.reset({
      purityChoice: match ? String(match.value) : 'custom',
      customPurity: declared,
      netWeight: r.assayedNetWeightGrams ?? r.declaredWeightGrams,
      rate: r.assayedRatePerGram ?? r.quotedRatePerGram,
      deductionPct: r.deductionPct ?? r.quotedDeductionPct ?? 2,
      pan: r.pan ?? '',
      note: '',
    });
    this.refreshRate(r.metal);
  }

  refreshRate(metal: ExchangeMetal) {
    this.rateLoading = true;
    this.exchangeService.liveRate(metal).subscribe({
      next: (q) => {
        this.assayForm.patchValue({ rate: q.ratePerGramFine, deductionPct: q.deductionPct });
        this.rateIndicative = q.indicative;
        this.rateLoading = false;
      },
      error: () => {
        this.rateLoading = false;
      }
    });
  }

  isCustomPurity(): boolean {
    return this.assayForm.controls.purityChoice.value === 'custom';
  }

  effectivePurity(): number | null {
    const choice = this.assayForm.controls.purityChoice.value;
    const p = choice === 'custom' ? Number(this.assayForm.controls.customPurity.value) : Number(choice);
    return Number.isFinite(p) && p > 0 && p <= 1 ? p : null;
  }

  /** rate x purity x net weight x (1 - deduction%), rounded to the rupee, as the API computes it. */
  computedFinalValue(): number {
    const purity = this.effectivePurity() ?? 0;
    const v = this.assayForm.getRawValue();
    const value = Number(v.rate) * purity * Number(v.netWeight) * (1 - Number(v.deductionPct) / 100);
    return Number.isFinite(value) ? Math.round(value) : 0;
  }

  assayPanRequired(): boolean {
    return this.computedFinalValue() >= EXCHANGE_PAN_THRESHOLD && !(this.selected?.pan) && !this.assayForm.controls.pan.value.trim();
  }

  invalid(control: keyof typeof this.assayForm.controls): boolean {
    const c = this.assayForm.controls[control];
    return c.invalid && (c.dirty || c.touched);
  }

  // ---- presentation ----

  statusClass(status: ExchangeStatus | string): string {
    switch (status) {
      case 'REQUESTED': return 'bg-sky-100 text-sky-800';
      case 'RECEIVED': return 'bg-amber-100 text-amber-800';
      case 'ASSAYED': return 'bg-violet-100 text-violet-800';
      case 'CREDITED': return 'bg-emerald-100 text-emerald-800';
      case 'REJECTED': return 'bg-red-100 text-red-800';
      case 'CANCELLED': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  chipClass(status: ExchangeStatus | 'ALL'): string {
    const active = this.statusFilter === status;
    return active
      ? 'bg-primary text-surface border-primary'
      : 'bg-surface text-ink border-ink/20 hover:border-ink/50';
  }

  metalLabel(r: ExchangeRequest): string {
    return `${r.declaredWeightGrams} g ${r.declaredPurity} ${r.metal === 'GOLD' ? 'gold' : 'silver'}`;
  }

  isOpen(r: ExchangeRequest): boolean {
    return r.status !== 'CREDITED' && r.status !== 'REJECTED' && r.status !== 'CANCELLED';
  }

  syncClass(status: string | null): string {
    switch (status) {
      case 'SENT': return 'bg-emerald-100 text-emerald-800';
      case 'FAILED': return 'bg-red-100 text-red-800';
      case 'PENDING': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  }
}
