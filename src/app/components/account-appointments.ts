import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  AppointmentService, Appointment, APPOINTMENT_STATUS_LABEL, APPOINTMENT_TYPE_LABEL,
} from '../services/appointment.service';
import { ToastService } from '../services/toast.service';
import { AppointmentSlotPickerComponent, SlotSelection } from './appointment-slot-picker';

/**
 * "Appointments" block on the account page: the signed-in customer's
 * bookings with cancel and reschedule (the latter opens the slot picker
 * inline; a moved booking goes back to "awaiting confirmation").
 */
@Component({
  selector: 'app-account-appointments',
  standalone: true,
  imports: [CommonModule, RouterLink, AppointmentSlotPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h2 class="font-display font-semibold text-2xl tracking-tight text-[#1d1d1f]">Appointments</h2>
          <p class="text-sm text-[#6e6e73] mt-1">Store visits, try-at-home sessions and video consultations.</p>
        </div>
        <a routerLink="/appointments" class="btn-outline text-sm !py-2.5 !px-5 whitespace-nowrap">Book an appointment</a>
      </div>

      <div *ngIf="loading()" class="space-y-3">
        <div class="skeleton h-16 rounded-[12px]"></div>
      </div>

      <div *ngIf="!loading() && !appointments().length" class="text-sm text-[#6e6e73] py-4">
        No appointments yet. A consultant can lay pieces out for you before you arrive.
      </div>

      <ul *ngIf="!loading() && appointments().length" class="divide-y divide-[#f0f0f0]">
        <li *ngFor="let a of appointments()" class="py-4">
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-semibold text-[#1d1d1f]">
                {{ typeLabel(a.appointmentType) }}
                <span *ngIf="a.storeName" class="text-[#6e6e73] font-normal"> &middot; {{ a.storeName }}</span>
              </p>
              <p class="text-sm text-[#6e6e73]">
                <ng-container *ngIf="a.slotStart; else legacyDate">{{ a.slotStart | date:'EEEE d MMMM, HH:mm' }}</ng-container>
                <ng-template #legacyDate>{{ a.requestedDate | date:'EEEE d MMMM' }}</ng-template>
                <span *ngIf="a.consultant"> &middot; with {{ a.consultant }}</span>
              </p>
              <p *ngIf="a.status === 'CANCELLED' && a.cancellationReason" class="text-xs text-[#7a7a7a] mt-1">{{ a.cancellationReason }}</p>
            </div>
            <div class="flex items-center gap-3 shrink-0">
              <span class="badge" [ngClass]="badgeClass(a.status)">{{ statusLabel(a.status) }}</span>
              <ng-container *ngIf="isOpen(a)">
                <button type="button" (click)="toggleReschedule(a)" class="text-[#D4AF37] hover:underline text-sm font-medium whitespace-nowrap">
                  {{ rescheduling() === a.id ? 'Close' : 'Reschedule' }}
                </button>
                <button type="button" (click)="cancel(a)" [disabled]="busy() === a.id" class="text-[#6e6e73] hover:text-red-600 hover:underline text-sm font-medium whitespace-nowrap">Cancel</button>
              </ng-container>
            </div>
          </div>

          <div *ngIf="rescheduling() === a.id" class="mt-4 rounded-[14px] border border-[#e0e0e0] bg-[#fafafc] p-5">
            <app-appointment-slot-picker [type]="a.appointmentType" [initialStoreId]="a.storeId" (selected)="slot.set($event)" />
            <div class="mt-4 flex gap-3">
              <button type="button" (click)="reschedule(a)" [disabled]="!slot().slotStart || busy() === a.id" class="btn-apple-pill text-sm !py-2.5 !px-5">
                {{ busy() === a.id ? 'Moving…' : 'Move booking' }}
              </button>
              <button type="button" (click)="rescheduling.set(null)" class="btn-ghost text-sm">Keep the current time</button>
            </div>
          </div>
        </li>
      </ul>
    </div>
  `,
})
export class AccountAppointmentsComponent implements OnInit {
  private appointmentService = inject(AppointmentService);
  private toast = inject(ToastService);

  appointments = signal<Appointment[]>([]);
  loading = signal(true);
  busy = signal<string | null>(null);
  rescheduling = signal<string | null>(null);
  slot = signal<SlotSelection>({ slotStart: null, storeId: null, storeName: null });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.appointmentService.mine().subscribe({
      next: (list) => {
        this.appointments.set(list ?? []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  isOpen(a: Appointment): boolean {
    return a.status === 'PENDING' || a.status === 'CONFIRMED';
  }

  toggleReschedule(a: Appointment): void {
    this.slot.set({ slotStart: null, storeId: null, storeName: null });
    this.rescheduling.set(this.rescheduling() === a.id ? null : a.id);
  }

  reschedule(a: Appointment): void {
    const s = this.slot();
    if (!s.slotStart || this.busy()) return;
    this.busy.set(a.id);
    this.appointmentService.reschedule(a.id, s.slotStart, s.storeId).subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.rescheduling.set(null);
        this.appointments.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.toast.show('Booking moved; we will confirm the new slot shortly.', 'success');
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.show(err?.error?.message || 'The booking could not be moved.', 'error');
      },
    });
  }

  cancel(a: Appointment): void {
    if (this.busy()) return;
    this.busy.set(a.id);
    this.appointmentService.cancel(a.id, 'Cancelled from my account').subscribe({
      next: (updated) => {
        this.busy.set(null);
        this.appointments.update(list => list.map(x => x.id === updated.id ? updated : x));
        this.toast.show('Appointment cancelled.', 'info');
      },
      error: (err) => {
        this.busy.set(null);
        this.toast.show(err?.error?.message || 'The appointment could not be cancelled.', 'error');
      },
    });
  }

  badgeClass(status: string): string {
    switch (status) {
      case 'CONFIRMED': return 'bg-[#D4AF37] text-black';
      case 'COMPLETED': return 'bg-[#1d1d1f] text-white';
      case 'CANCELLED':
      case 'NO_SHOW': return 'bg-red-50 text-red-700';
      default: return 'bg-[#fbf8ef] text-[#8a6d1f] border border-[#D4AF37]/40';
    }
  }

  statusLabel(status: string): string {
    return APPOINTMENT_STATUS_LABEL[status] ?? status;
  }

  typeLabel(type: string): string {
    return APPOINTMENT_TYPE_LABEL[type as keyof typeof APPOINTMENT_TYPE_LABEL] ?? type;
  }
}
