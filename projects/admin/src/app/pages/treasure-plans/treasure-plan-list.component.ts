import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { TreasureAccount, TreasureService } from '../../services/treasure.service';

type StatusFilter = 'ALL' | 'ACTIVE' | 'MATURED' | 'REDEEMED' | 'CLOSED';

/**
 * Treasure plan accounts: who is saving, how far along, the grams each plan
 * has accrued and what it is worth today (gold rate protection), and the
 * order a matured plan was redeemed on. Redemption happens at the storefront
 * checkout; staff record in-store cash installments, skip a month or close.
 */
@Component({
  selector: 'app-treasure-plan-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './treasure-plan-list.component.html'
})
export class TreasurePlanListComponent implements OnInit {
  private treasureService = inject(TreasureService);

  readonly statuses: StatusFilter[] = ['ALL', 'ACTIVE', 'MATURED', 'REDEEMED', 'CLOSED'];

  accounts: TreasureAccount[] = [];
  loading = true;
  error = '';
  statusFilter: StatusFilter = 'ALL';
  search = '';

  selected: TreasureAccount | null = null;
  paymentNote = '';
  acting = false;
  actionError = '';
  confirmClose = false;

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading = true;
    this.error = '';
    this.treasureService.list().subscribe({
      next: (list) => {
        this.accounts = Array.isArray(list) ? list : [];
        if (this.selected) {
          this.selected = this.accounts.find(a => a.id === this.selected!.id) ?? null;
        }
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load treasure plans', err);
        this.error = 'Failed to load treasure plans.';
        this.loading = false;
      }
    });
  }

  get filtered(): TreasureAccount[] {
    const q = this.search.trim().toLowerCase();
    return this.accounts.filter(a =>
      (this.statusFilter === 'ALL' || a.status === this.statusFilter) &&
      (!q || (a.customerName || '').toLowerCase().includes(q) || (a.customerEmail || '').toLowerCase().includes(q)
        || (a.planName || '').toLowerCase().includes(q) || (a.redeemedOrderNumber || '').toLowerCase().includes(q)));
  }

  count(status: StatusFilter): number {
    return status === 'ALL' ? this.accounts.length : this.accounts.filter(a => a.status === status).length;
  }

  /** Rupees collected across every plan (balances before bonus are not stored separately; this is installments x paid). */
  get collected(): number {
    return this.accounts.reduce((sum, a) => sum + (a.installmentAmount || 0) * (a.installmentsPaid || 0), 0);
  }

  get gramsAccrued(): number {
    return this.accounts.reduce((sum, a) => sum + (a.goldGramsAccrued || 0), 0);
  }

  get dueThisWeek(): number {
    const now = Date.now();
    const week = now + 7 * 24 * 3600 * 1000;
    return this.accounts.filter(a => a.status === 'ACTIVE' && a.nextDueDate && Date.parse(a.nextDueDate) <= week).length;
  }

  get todayRate(): TreasureAccount | undefined {
    return this.accounts.find(a => a.ratePerGram != null);
  }

  setFilter(s: StatusFilter) {
    this.statusFilter = s;
  }

  chipClass(s: StatusFilter): string {
    return this.statusFilter === s
      ? 'bg-primary text-surface border-primary'
      : 'bg-surface text-ink border-ink/30 hover:border-primary';
  }

  statusClass(status: string): string {
    switch (status) {
      case 'ACTIVE': return 'bg-amber-100 text-amber-800';
      case 'MATURED': return 'bg-emerald-100 text-emerald-800';
      case 'REDEEMED': return 'bg-indigo-100 text-indigo-800';
      case 'CLOSED': return 'bg-gray-200 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  progress(a: TreasureAccount): number {
    if (!a.totalInstallments) return 0;
    return Math.min(100, Math.round((a.installmentsPaid / a.totalInstallments) * 100));
  }

  isOverdue(a: TreasureAccount): boolean {
    return a.status === 'ACTIVE' && !!a.nextDueDate && Date.parse(a.nextDueDate) < Date.now();
  }

  open(a: TreasureAccount) {
    this.selected = a;
    this.paymentNote = '';
    this.actionError = '';
    this.confirmClose = false;
  }

  close() {
    this.selected = null;
    this.confirmClose = false;
  }

  canPay(a: TreasureAccount | null): boolean {
    return !!a && a.status === 'ACTIVE' && a.installmentsPaid < a.totalInstallments;
  }

  recordPayment() {
    if (!this.selected || this.acting) return;
    this.acting = true;
    this.actionError = '';
    this.treasureService.recordPayment(this.selected.id, this.paymentNote.trim() || undefined).subscribe({
      next: (acct) => this.applyResult(acct),
      error: (err) => this.fail(err, 'Could not record the payment.')
    });
  }

  skipMonth() {
    if (!this.selected || this.acting) return;
    this.acting = true;
    this.actionError = '';
    this.treasureService.skipMonth(this.selected.id).subscribe({
      next: (acct) => this.applyResult(acct),
      error: (err) => this.fail(err, 'Could not skip the month.')
    });
  }

  closePlan() {
    if (!this.selected || this.acting) return;
    if (!this.confirmClose) {
      this.confirmClose = true;
      return;
    }
    this.acting = true;
    this.actionError = '';
    this.treasureService.closePlan(this.selected.id).subscribe({
      next: (acct) => this.applyResult(acct),
      error: (err) => this.fail(err, 'Could not close the plan.')
    });
  }

  private applyResult(acct: TreasureAccount) {
    this.acting = false;
    this.confirmClose = false;
    this.paymentNote = '';
    const i = this.accounts.findIndex(a => a.id === acct.id);
    if (i >= 0) {
      // The admin list is enriched with customer and rate figures the single-account response also carries.
      this.accounts[i] = { ...this.accounts[i], ...acct };
      this.selected = this.accounts[i];
    } else {
      this.selected = acct;
      this.load();
    }
  }

  private fail(err: unknown, fallback: string) {
    this.acting = false;
    this.confirmClose = false;
    const message = err instanceof HttpErrorResponse && err.error?.message ? err.error.message : fallback;
    this.actionError = message;
  }

  trackById(_i: number, a: TreasureAccount): string {
    return a.id;
  }
}
