import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CustomerService, LoyaltySummary, LoyaltyTransaction } from '../../services/customer.service';
import { AuthService } from '../../services/auth.service';

/** Row of GET /admin/users (UserDTO with CRM extras). */
interface CustomerRow {
  id: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: string;
  loyaltyPoints?: number | null;
  referralCode?: string | null;
  totalSpend?: number | null;
  tier?: string | null;
}

type TierFilter = 'ALL' | 'SILVER' | 'GOLD' | 'PLATINUM';

@Component({
  selector: 'app-customer-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './customer-list.component.html'
})
export class CustomerListComponent implements OnInit {
  private customerService = inject(CustomerService);
  private authService = inject(AuthService);

  customers: CustomerRow[] = [];
  loading = true;
  currentPage = 0;
  pageSize = 10;
  totalPages = 0;
  totalElements = 0;
  search = '';
  tierFilter: TierFilter = 'ALL';
  readonly tiers: TierFilter[] = ['ALL', 'SILVER', 'GOLD', 'PLATINUM'];

  // Loyalty drawer
  selected: CustomerRow | null = null;
  loyalty: LoyaltySummary | null = null;
  loyaltyLoading = false;
  loyaltyError = '';
  adjustPoints: number | null = null;
  adjustNote = '';
  adjusting = false;
  adjustError = '';
  adjustDone = '';

  /** Adjusting the ledger needs customers.write; looking needs customers.read only. */
  get canAdjust(): boolean {
    return this.authService.can('customers.write');
  }

  ngOnInit() {
    this.loadCustomers();
  }

  loadCustomers() {
    this.loading = true;
    this.customerService.getCustomers(this.currentPage, this.pageSize).subscribe({
      next: (data: any) => {
        this.customers = data?.content ?? [];
        this.totalPages = data?.totalPages ?? 0;
        this.totalElements = data?.totalElements ?? 0;
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Failed to load customers', err);
        this.loading = false;
      }
    });
  }

  /** Client-side narrowing of the current page: name, e-mail, phone, code and tier. */
  get visible(): CustomerRow[] {
    const q = this.search.trim().toLowerCase();
    return this.customers.filter(c =>
      (this.tierFilter === 'ALL' || (c.tier || 'SILVER').toUpperCase() === this.tierFilter) &&
      (!q || [c.firstName, c.lastName, c.email, c.phone, c.referralCode].some(v => (v || '').toLowerCase().includes(q))));
  }

  nextPage() {
    if (this.currentPage < this.totalPages - 1) {
      this.currentPage++;
      this.loadCustomers();
    }
  }

  prevPage() {
    if (this.currentPage > 0) {
      this.currentPage--;
      this.loadCustomers();
    }
  }

  initial(c: CustomerRow): string {
    return (c.firstName || c.email || 'U').charAt(0).toUpperCase();
  }

  tierLabel(tier: string | null | undefined): string {
    const t = (tier || 'SILVER').toUpperCase();
    return t.charAt(0) + t.slice(1).toLowerCase();
  }

  tierClass(tier: string | null | undefined): string {
    switch ((tier || 'SILVER').toUpperCase()) {
      case 'PLATINUM': return 'bg-indigo-100 text-indigo-800';
      case 'GOLD': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-200 text-gray-700';
    }
  }

  chipClass(t: TierFilter): string {
    return this.tierFilter === t
      ? 'bg-primary text-surface border-primary'
      : 'bg-surface text-ink border-ink/30 hover:border-primary';
  }

  whatsappLink(c: CustomerRow): string | null {
    const digits = (c.phone || '').replace(/\D/g, '');
    return digits.length >= 10 ? `https://wa.me/${digits.length === 10 ? '91' + digits : digits}` : null;
  }

  // ---- loyalty drawer ------------------------------------------------------

  open(c: CustomerRow) {
    this.selected = c;
    this.loyalty = null;
    this.loyaltyError = '';
    this.adjustPoints = null;
    this.adjustNote = '';
    this.adjustError = '';
    this.adjustDone = '';
    this.loadLoyalty();
  }

  close() {
    this.selected = null;
    this.loyalty = null;
  }

  private loadLoyalty() {
    if (!this.selected) return;
    this.loyaltyLoading = true;
    this.customerService.loyalty(this.selected.id).subscribe({
      next: (summary) => {
        this.loyalty = summary;
        this.loyaltyLoading = false;
        // Keep the row in step with the ledger.
        const row = this.customers.find(c => c.id === this.selected?.id);
        if (row) {
          row.loyaltyPoints = summary.balance;
          row.tier = summary.tier;
          row.referralCode = summary.referralCode;
        }
      },
      error: (err) => {
        this.loyaltyLoading = false;
        this.loyaltyError = err instanceof HttpErrorResponse && err.error?.message ? err.error.message : 'Could not load the loyalty ledger.';
      }
    });
  }

  tierProgress(r: LoyaltySummary): number {
    if (!r.nextTierAt) return 100;
    const span = r.nextTierAt - r.tierFloor;
    if (span <= 0) return 100;
    return Math.max(0, Math.min(100, Math.round(((r.lifetimeEarned - r.tierFloor) / span) * 100)));
  }

  typeLabel(type: LoyaltyTransaction['type']): string {
    switch (type) {
      case 'EARN': return 'Earned';
      case 'REDEEM': return 'Redeemed';
      case 'EXPIRE': return 'Expired';
      case 'REFERRAL': return 'Referral';
      case 'ADJUST': return 'Adjustment';
      default: return type;
    }
  }

  typeClass(type: LoyaltyTransaction['type']): string {
    switch (type) {
      case 'EARN': return 'bg-emerald-100 text-emerald-800';
      case 'REFERRAL': return 'bg-sky-100 text-sky-800';
      case 'REDEEM': return 'bg-amber-100 text-amber-800';
      case 'EXPIRE': return 'bg-gray-200 text-gray-700';
      default: return 'bg-indigo-100 text-indigo-800';
    }
  }

  submitAdjust() {
    if (!this.selected || this.adjusting) return;
    const points = Math.trunc(Number(this.adjustPoints));
    if (!Number.isFinite(points) || points === 0) {
      this.adjustError = 'Enter a non-zero number of points (negative to remove).';
      return;
    }
    if (!this.adjustNote.trim()) {
      this.adjustError = 'A note explaining the adjustment is required.';
      return;
    }
    this.adjusting = true;
    this.adjustError = '';
    this.adjustDone = '';
    this.customerService.adjustLoyalty(this.selected.id, points, this.adjustNote.trim()).subscribe({
      next: (t) => {
        this.adjusting = false;
        this.adjustDone = `${t.points > 0 ? '+' : ''}${t.points} points recorded; balance is now ${t.balanceAfter}.`;
        this.adjustPoints = null;
        this.adjustNote = '';
        this.loadLoyalty();
      },
      error: (err) => {
        this.adjusting = false;
        this.adjustError = err instanceof HttpErrorResponse && err.error?.message ? err.error.message : 'The adjustment was not saved.';
      }
    });
  }

  trackById(_i: number, c: CustomerRow): string {
    return c.id;
  }
}
