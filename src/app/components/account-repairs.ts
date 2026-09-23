import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { RepairService } from '../services/repair.service';
import { RepairJob, RepairStatus, repairServiceLabel, repairStatusLabel } from '../core/repair.models';

/**
 * "Repairs & services" block on the account page: the signed-in customer's
 * jobs with status, estimate and a link to the tracking page (which needs no
 * phone for the owner).
 */
@Component({
  selector: 'app-account-repairs',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 class="font-display font-semibold text-2xl tracking-tight text-[#1d1d1f]">Repairs &amp; services</h2>
          <p class="text-sm text-[#6e6e73] mt-1">Resizing, polishing and repair jobs booked with us.</p>
        </div>
        <a routerLink="/repairs" class="btn-outline text-sm !py-2.5 !px-5 whitespace-nowrap">Request a service</a>
      </div>

      <div *ngIf="loading()" class="space-y-3">
        <div class="skeleton h-16 rounded-[12px]"></div>
        <div class="skeleton h-16 rounded-[12px]"></div>
      </div>

      <div *ngIf="!loading() && !jobs().length" class="text-sm text-[#6e6e73] py-4">
        No repair or service jobs yet. Pieces bought from Caratloop are cleaned free of charge.
      </div>

      <ul *ngIf="!loading() && jobs().length" class="divide-y divide-[#f0f0f0]">
        <li *ngFor="let j of jobs()" class="py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-[#1d1d1f]">
              <span class="font-mono text-[#D4AF37]">{{ j.jobNumber }}</span>
              <span class="text-[#6e6e73] font-normal"> &middot; {{ serviceLabel(j.serviceType) }}</span>
            </p>
            <p class="text-sm text-[#6e6e73] truncate">{{ j.itemDescription }}</p>
            <p class="text-xs text-[#7a7a7a] mt-1">
              Booked {{ j.createdAt | date:'mediumDate' }}
              <span *ngIf="j.promisedDate"> &middot; promised {{ j.promisedDate | date:'mediumDate' }}</span>
              <span *ngIf="j.estimateAmount !== null"> &middot; estimate ₹{{ j.estimateAmount | number:'1.0-0' }}</span>
            </p>
          </div>
          <div class="flex items-center gap-3 shrink-0">
            <span class="badge" [ngClass]="badgeClass(j.status)">{{ statusLabel(j.status) }}</span>
            <a [routerLink]="['/repairs/track', j.jobNumber]" class="text-[#D4AF37] hover:underline text-sm font-medium whitespace-nowrap">
              {{ j.status === 'ASSESSED' ? 'Review estimate →' : 'Track →' }}
            </a>
          </div>
        </li>
      </ul>
    </div>
  `,
})
export class AccountRepairsComponent implements OnInit {
  private repairService = inject(RepairService);

  jobs = signal<RepairJob[]>([]);
  loading = signal(true);

  ngOnInit(): void {
    this.repairService.mine().subscribe({
      next: (jobs) => {
        this.jobs.set(jobs ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
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
}
