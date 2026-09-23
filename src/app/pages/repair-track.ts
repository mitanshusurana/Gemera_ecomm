import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { RepairService } from '../services/repair.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import {
  REPAIR_PROGRESS, RepairStatus, RepairTracking, repairItemLabel, repairServiceLabel, repairStatusLabel,
} from '../core/repair.models';

/**
 * Public repair tracking: job number + phone, timeline of customer-visible
 * events, the estimate with an approve button while ASSESSED, promised date.
 * Route: repairs/track and repairs/track/:jobNumber (from the e-mails).
 */
@Component({
  selector: 'app-repair-track',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">
      <div class="max-w-[760px] mx-auto px-6 py-16">
        <div class="text-center mb-10">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-2 block">Repairs &amp; Services</span>
          <h1 class="font-display font-semibold text-3xl sm:text-4xl tracking-tight">Track a repair job</h1>
          <p class="text-[#6e6e73] mt-3">Enter the job number from your receipt or email and the phone number you gave us.</p>
        </div>

        <form (ngSubmit)="lookup()" class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label for="rt-job" class="block text-sm font-semibold mb-2">Job number</label>
              <input id="rt-job" type="text" name="jobNumber" [(ngModel)]="jobNumber" placeholder="RJ-2026-00001"
                     class="input-field font-mono uppercase" autocomplete="off" spellcheck="false">
            </div>
            <div>
              <label for="rt-phone" class="block text-sm font-semibold mb-2">Phone number <span *ngIf="signedIn()" class="text-[#7a7a7a] font-normal">(optional for your own jobs)</span></label>
              <input id="rt-phone" type="tel" name="phone" [(ngModel)]="phone" placeholder="+91" class="input-field" autocomplete="tel">
            </div>
          </div>
          <button type="submit" [disabled]="loading()" class="btn-apple-pill w-full mt-6">
            {{ loading() ? 'Looking up...' : 'Track job' }}
          </button>
        </form>

        <!-- Result -->
        <div *ngIf="job() as j" class="mt-8 space-y-6 animate-fade-in">

          <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-6 md:p-8">
            <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4 pb-6 border-b border-[#e0e0e0]">
              <div>
                <p class="text-sm text-[#D4AF37] font-semibold font-mono">{{ j.jobNumber }}</p>
                <h2 class="font-display font-semibold text-2xl tracking-tight mt-1">{{ serviceLabel(j.serviceType) }}</h2>
                <p class="text-sm text-[#6e6e73] mt-1">{{ itemLabel(j.itemType) }} &middot; {{ j.itemDescription }}</p>
                <p class="text-xs text-[#7a7a7a] mt-2">Booked {{ j.createdAt | date:'mediumDate' }}<span *ngIf="j.customerFirstName"> for {{ j.customerFirstName }}</span></p>
              </div>
              <div class="md:text-right">
                <span class="badge" [ngClass]="badgeClass(j.status)">{{ statusLabel(j.status) }}</span>
                <p class="text-xs text-[#6e6e73] uppercase tracking-wide mt-3">Promised date</p>
                <p class="font-semibold">{{ j.promisedDate ? (j.promisedDate | date:'mediumDate') : 'After assessment' }}</p>
              </div>
            </div>

            <!-- Progress -->
            <div *ngIf="j.status !== 'CANCELLED'" class="mt-6">
              <div class="flex items-center justify-between gap-1">
                <ng-container *ngFor="let step of progress; let i = index; let last = last">
                  <div class="flex flex-col items-center gap-2 min-w-0 flex-1">
                    <div class="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold ring-4 ring-white"
                         [ngClass]="stepIndex(j.status) >= i ? 'bg-[#D4AF37] text-black' : 'bg-[#f5f5f7] border border-[#e0e0e0] text-[#6e6e73]'">
                      {{ stepIndex(j.status) > i ? '✓' : i + 1 }}
                    </div>
                    <span class="text-[10px] sm:text-[11px] font-medium text-center leading-tight" [ngClass]="{ 'text-[#7a7a7a]': stepIndex(j.status) < i }">{{ statusLabel(step) }}</span>
                  </div>
                  <div *ngIf="!last" class="h-px flex-1 -mt-6 max-w-[40px]" [ngClass]="stepIndex(j.status) > i ? 'bg-[#D4AF37]' : 'bg-[#e0e0e0]'"></div>
                </ng-container>
              </div>
            </div>
          </div>

          <!-- Estimate -->
          <div *ngIf="j.estimateAmount !== null" class="bg-white border rounded-[18px] p-6 md:p-8"
               [ngClass]="j.estimateAwaitingApproval ? 'border-[#D4AF37]' : 'border-[#e0e0e0]'">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p class="text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]">Estimate</p>
                <p class="font-display font-semibold text-3xl tracking-tight mt-1">₹{{ j.estimateAmount | number:'1.0-0' }}</p>
                <p *ngIf="j.estimateNote" class="text-sm text-[#6e6e73] mt-2 whitespace-pre-line">{{ j.estimateNote }}</p>
                <p *ngIf="j.estimateApprovedAt" class="text-xs text-[#7a7a7a] mt-2">Approved {{ j.estimateApprovedAt | date:'medium' }}</p>
              </div>
              <div *ngIf="j.estimateAwaitingApproval" class="sm:text-right">
                <button type="button" (click)="approve()" [disabled]="approving()" class="btn-apple-pill whitespace-nowrap">
                  {{ approving() ? 'Approving...' : 'Approve estimate' }}
                </button>
                <p class="text-xs text-[#7a7a7a] mt-2 max-w-[220px]">Work starts once you approve. Prefer to discuss? <a routerLink="/contact" class="text-[#D4AF37] hover:underline">Contact us</a>.</p>
              </div>
            </div>
          </div>

          <!-- Bill -->
          <div *ngIf="j.finalAmount !== null" class="bg-white border border-[#e0e0e0] rounded-[18px] p-6 md:p-8 grid grid-cols-3 gap-4">
            <div>
              <p class="text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]">Bill</p>
              <p class="font-semibold text-lg mt-1">₹{{ j.finalAmount | number:'1.0-0' }}</p>
            </div>
            <div>
              <p class="text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]">Paid</p>
              <p class="font-semibold text-lg mt-1">₹{{ (j.paidAmount || 0) | number:'1.0-0' }}</p>
            </div>
            <div>
              <p class="text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]">Balance</p>
              <p class="font-semibold text-lg mt-1">₹{{ balance(j) | number:'1.0-0' }}</p>
            </div>
          </div>

          <!-- Timeline -->
          <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-6 md:p-8">
            <h3 class="font-semibold text-[17px] tracking-tight mb-6">History</h3>
            <ol class="relative border-l border-[#e0e0e0] ml-3 space-y-6">
              <li *ngFor="let e of j.events.slice().reverse()" class="ml-6 relative">
                <span class="absolute -left-[31px] top-1 w-3 h-3 rounded-full ring-4 ring-white" [ngClass]="e.status === 'CANCELLED' ? 'bg-red-400' : 'bg-[#D4AF37]'"></span>
                <p class="text-sm font-semibold">{{ statusLabel(e.status) }}</p>
                <p *ngIf="e.note" class="text-sm text-[#6e6e73] mt-0.5 whitespace-pre-line">{{ e.note }}</p>
                <p class="text-xs text-[#7a7a7a] mt-1">{{ e.createdAt | date:'medium' }}</p>
              </li>
              <li *ngIf="!j.events.length" class="ml-6 text-sm text-[#6e6e73]">No updates yet.</li>
            </ol>
          </div>

          <p class="text-center text-xs text-[#7a7a7a]">Need help? <a routerLink="/contact" class="text-[#D4AF37] hover:underline">Contact the store</a> and quote {{ j.jobNumber }}.</p>
        </div>

        <p *ngIf="!job()" class="text-center text-sm text-[#6e6e73] mt-8">
          Don't have a job yet? <a routerLink="/repairs" class="text-[#D4AF37] hover:underline">Request a repair or service</a>.
        </p>
      </div>
    </div>
  `,
})
export class RepairTrackComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private repairService = inject(RepairService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);

  jobNumber = '';
  phone = '';
  loading = signal(false);
  approving = signal(false);
  job = signal<RepairTracking | null>(null);
  signedIn = computed(() => !!this.authService.currentUser());
  readonly progress = REPAIR_PROGRESS;

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      const jn = params.get('jobNumber');
      if (jn) {
        this.jobNumber = jn.toUpperCase();
        // A signed-in owner can be looked up without the phone; guests are asked for it.
        if (this.signedIn()) this.lookup(true);
      }
    });
  }

  lookup(silent = false): void {
    const jn = this.jobNumber.trim().toUpperCase();
    if (!jn) {
      if (!silent) this.toast.show('Please enter the job number', 'error');
      return;
    }
    if (!this.phone.trim() && !this.signedIn()) {
      if (!silent) this.toast.show('Please enter the phone number given at the counter', 'error');
      return;
    }
    this.loading.set(true);
    this.repairService.track(jn, this.phone.trim()).subscribe({
      next: (res) => {
        this.job.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        if (!silent) {
          this.job.set(null);
          this.toast.show('No job matches that number and phone', 'error');
        }
      },
    });
  }

  approve(): void {
    const j = this.job();
    if (!j || this.approving()) return;
    this.approving.set(true);
    this.repairService.approveEstimate(j.jobNumber, this.phone.trim()).subscribe({
      next: (res) => {
        this.job.set(res);
        this.approving.set(false);
        this.toast.show('Estimate approved. We will start work on your piece.', 'success');
      },
      error: (err) => {
        this.approving.set(false);
        this.toast.show(err?.error?.message || 'The estimate could not be approved. Please try again.', 'error');
      },
    });
  }

  stepIndex(status: RepairStatus): number {
    return this.progress.indexOf(status);
  }

  balance(j: RepairTracking): number {
    return Math.max(0, (j.finalAmount || 0) - (j.paidAmount || 0));
  }

  badgeClass(status: RepairStatus): string {
    switch (status) {
      case 'DELIVERED': return 'bg-[#1d1d1f] text-white';
      case 'READY': return 'bg-[#D4AF37] text-black';
      case 'CANCELLED': return 'bg-red-50 text-red-700';
      case 'ASSESSED': return 'bg-[#fbf8ef] text-[#8a6d1f] border border-[#D4AF37]/40';
      default: return 'bg-[#f5f5f7] text-[#1d1d1f]';
    }
  }

  statusLabel = repairStatusLabel;
  serviceLabel = repairServiceLabel;
  itemLabel = repairItemLabel;
}
