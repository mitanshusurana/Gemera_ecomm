import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import {
  Appointment, AppointmentService, AppointmentSlot, AppointmentStatus, AppointmentType,
  APPOINTMENT_NEXT, APPOINTMENT_STATUSES, APPOINTMENT_TYPE_LABEL,
} from '../../services/appointment.service';
import { Store, StoreService } from '../../services/store.service';

interface DayColumn {
  key: string;
  title: string;
  subtitle: string;
  appointments: Appointment[];
}

/**
 * Appointments desk: a day view with one column per store (plus one for
 * try-at-home and video calls), status actions along the API's transitions,
 * consultant assignment and rescheduling onto another slot.
 */
@Component({
  selector: 'app-appointment-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="px-4 sm:px-6 lg:px-8 pb-12">
      <div class="sm:flex sm:items-center py-6">
        <div class="sm:flex-auto">
          <h1 class="text-xl font-semibold text-ink">Appointments</h1>
          <p class="mt-2 text-sm text-ink/70">Store visits, try-at-home sessions and video consultations. Confirm new requests, assign a consultant, and mark visits completed or missed.</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="flex flex-wrap items-end gap-4 mb-6">
        <label class="block text-sm">
          <span class="font-medium text-ink">Day</span>
          <div class="mt-1 flex items-center gap-1">
            <button type="button" (click)="shiftDay(-1)" class="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm hover:bg-gray-50" title="Previous day">
              <span class="material-symbols-outlined text-[18px] align-middle">chevron_left</span>
            </button>
            <input type="date" [ngModel]="date()" (ngModelChange)="setDate($event)" class="block w-44 py-2 px-3 border border-ink/30 bg-white rounded-md shadow-sm sm:text-sm" />
            <button type="button" (click)="shiftDay(1)" class="rounded-md border border-gray-300 bg-white px-2 py-2 text-sm hover:bg-gray-50" title="Next day">
              <span class="material-symbols-outlined text-[18px] align-middle">chevron_right</span>
            </button>
            <button type="button" (click)="setDate(today)" class="ml-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50">Today</button>
          </div>
        </label>
        <label class="block text-sm">
          <span class="font-medium text-ink">Store</span>
          <select [ngModel]="storeFilter()" (ngModelChange)="storeFilter.set($event); load()" class="mt-1 block w-56 py-2 px-3 border border-ink/30 bg-white rounded-md shadow-sm sm:text-sm">
            <option value="">All stores</option>
            <option *ngFor="let s of stores()" [value]="s.id">{{ s.name }}</option>
          </select>
        </label>
        <div class="flex flex-wrap gap-2">
          <button *ngFor="let s of statusChips" type="button" (click)="statusFilter.set(s); load()"
                  class="px-3 py-1.5 rounded-full border text-xs font-semibold uppercase tracking-wide transition-colors"
                  [ngClass]="statusFilter() === s ? 'bg-primary text-white border-primary' : 'bg-white text-ink border-gray-300 hover:bg-gray-50'">
            {{ s === 'ALL' ? 'All' : s.toLowerCase().replace('_', ' ') }}
          </button>
        </div>
        <span *ngIf="loading()" class="text-sm text-ink/60">Loading…</span>
      </div>

      <div *ngIf="error()" class="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{{ error() }}</div>

      <!-- Day view: one column per store -->
      <div class="grid grid-cols-1 gap-4" [ngClass]="columns().length > 1 ? 'xl:grid-cols-2 2xl:grid-cols-3' : ''">
        <div *ngFor="let col of columns()" class="bg-surface shadow sm:rounded-lg overflow-hidden">
          <div class="px-4 py-3 border-b border-ink/10 flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold text-ink">{{ col.title }}</h2>
              <p class="text-xs text-ink/60">{{ col.subtitle }}</p>
            </div>
            <span class="text-xs text-ink/60">{{ col.appointments.length }} booking{{ col.appointments.length === 1 ? '' : 's' }}</span>
          </div>
          <ul class="divide-y divide-gray-200">
            <li *ngFor="let a of col.appointments" class="px-4 py-3" [ngClass]="{'bg-primary/5': selected()?.id === a.id}">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="text-sm font-semibold text-ink">
                    {{ (a.slotStart || a.requestedDate) | date:'HH:mm' }}<span *ngIf="a.slotEnd">–{{ a.slotEnd | date:'HH:mm' }}</span>
                    <span class="ml-2 font-normal text-ink/70">{{ typeLabel(a.appointmentType) }}</span>
                  </p>
                  <p class="text-sm text-ink truncate">{{ a.name }} <span class="text-ink/60">· {{ a.phone || a.email }}</span></p>
                  <p class="text-xs text-ink/60" *ngIf="a.consultant">With {{ a.consultant }}</p>
                  <p class="text-xs text-ink/60 truncate" *ngIf="a.notes" [title]="a.notes">{{ a.notes }}</p>
                </div>
                <div class="flex flex-col items-end gap-2 shrink-0">
                  <span class="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide" [ngClass]="statusClass(a.status)">{{ a.status.replace('_', ' ') }}</span>
                  <button type="button" (click)="open(a)" class="text-primary hover:underline text-xs font-semibold">{{ selected()?.id === a.id ? 'Close' : 'Open' }}</button>
                </div>
              </div>

              <!-- Inline detail and actions -->
              <div *ngIf="selected()?.id === a.id" class="mt-3 rounded-md border border-ink/10 bg-white p-3 space-y-3">
                <dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <dt class="text-ink/60">E-mail</dt><dd class="text-ink">{{ a.email || '—' }}</dd>
                  <dt class="text-ink/60">Phone</dt><dd class="text-ink">{{ a.phone || '—' }}</dd>
                  <dt class="text-ink/60">Store</dt><dd class="text-ink">{{ a.storeName || placeLabel(a) }}</dd>
                  <dt class="text-ink/60">Booked</dt><dd class="text-ink">{{ a.createdAt | date:'medium' }}</dd>
                  <dt class="text-ink/60" *ngIf="a.productId">Product</dt><dd class="text-ink font-mono" *ngIf="a.productId">{{ a.productId | slice:0:8 }}</dd>
                  <dt class="text-ink/60" *ngIf="a.cancellationReason">Cancelled</dt><dd class="text-ink" *ngIf="a.cancellationReason">{{ a.cancellationReason }}</dd>
                </dl>

                <div class="flex flex-wrap gap-2" *ngIf="nextStatuses(a).length">
                  <button *ngFor="let s of nextStatuses(a)" type="button" (click)="transition(a, s)" [disabled]="busy()"
                          class="rounded-md px-3 py-1.5 text-xs font-medium border disabled:opacity-50"
                          [ngClass]="s === 'CANCELLED' ? 'border-red-300 text-red-700 bg-white hover:bg-red-50' : (s === 'CONFIRMED' ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700' : 'border-gray-300 text-gray-800 bg-white hover:bg-gray-50')">
                    {{ actionLabel(s) }}
                  </button>
                </div>

                <div *ngIf="cancelOpen()" class="rounded-md border border-red-200 bg-red-50 p-3">
                  <label class="block text-xs font-medium text-ink">Reason (sent to the customer)</label>
                  <input type="text" [(ngModel)]="cancelReason" name="cancelReason" class="mt-1 block w-full py-1.5 px-2 border border-red-200 bg-white rounded-md text-sm" placeholder="e.g. The consultant is unavailable; please rebook." />
                  <div class="mt-2 flex gap-2">
                    <button type="button" (click)="confirmCancel(a)" [disabled]="busy()" class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">Cancel appointment</button>
                    <button type="button" (click)="cancelOpen.set(false)" class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs">Keep</button>
                  </div>
                </div>

                <div class="flex flex-wrap items-end gap-2" *ngIf="!isTerminal(a)">
                  <label class="block text-xs flex-1 min-w-[12rem]">
                    <span class="font-medium text-ink">Consultant</span>
                    <input type="text" [(ngModel)]="consultant" name="consultant" class="mt-1 block w-full py-1.5 px-2 border border-ink/30 bg-white rounded-md text-sm" placeholder="Staff member" />
                  </label>
                  <button type="button" (click)="assign(a)" [disabled]="busy()" class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50">Assign</button>
                  <button type="button" (click)="toggleReschedule(a)" class="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium hover:bg-gray-50">{{ rescheduleOpen() ? 'Close' : 'Reschedule' }}</button>
                </div>

                <div *ngIf="rescheduleOpen()" class="rounded-md border border-ink/10 bg-gray-50 p-3 space-y-2">
                  <div class="flex flex-wrap items-end gap-2">
                    <label class="block text-xs">
                      <span class="font-medium text-ink">Date</span>
                      <input type="date" [ngModel]="rescheduleDate()" (ngModelChange)="rescheduleDate.set($event); loadSlots(a)" class="mt-1 block py-1.5 px-2 border border-ink/30 bg-white rounded-md text-sm" />
                    </label>
                    <label class="block text-xs" *ngIf="a.appointmentType === 'STORE_VISIT'">
                      <span class="font-medium text-ink">Store</span>
                      <select [ngModel]="rescheduleStore()" (ngModelChange)="rescheduleStore.set($event); loadSlots(a)" class="mt-1 block py-1.5 px-2 border border-ink/30 bg-white rounded-md text-sm">
                        <option *ngFor="let s of stores()" [value]="s.id">{{ s.name }}</option>
                      </select>
                    </label>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    <button *ngFor="let s of slots()" type="button" (click)="rescheduleSlot.set(s.start)" [disabled]="!s.available && s.start !== a.slotStart"
                            class="rounded-full border px-2.5 py-1 text-xs disabled:opacity-40"
                            [ngClass]="rescheduleSlot() === s.start ? 'bg-primary text-white border-primary' : 'bg-white border-gray-300'"
                            [title]="s.available ? s.remaining + ' free' : (s.reason === 'TOO_SOON' ? 'Inside lead time' : 'Full')">
                      {{ s.start | date:'HH:mm' }}
                    </button>
                    <span *ngIf="!slots().length" class="text-xs text-ink/60">No slots for this day.</span>
                  </div>
                  <button type="button" (click)="reschedule(a)" [disabled]="busy() || !rescheduleSlot()" class="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">Move booking</button>
                </div>
              </div>
            </li>
            <li *ngIf="!col.appointments.length" class="px-4 py-6 text-center text-sm text-ink/60">Nothing booked.</li>
          </ul>
        </div>
      </div>
    </div>
  `
})
export class AppointmentListComponent implements OnInit {
  private appointmentService = inject(AppointmentService);
  private storeService = inject(StoreService);
  private toastr = inject(ToastrService);

  readonly today = localDate(new Date());
  readonly statusChips: (AppointmentStatus | 'ALL')[] = ['ALL', ...APPOINTMENT_STATUSES];

  date = signal<string>(this.today);
  storeFilter = signal<string>('');
  statusFilter = signal<AppointmentStatus | 'ALL'>('ALL');
  stores = signal<Store[]>([]);
  appointments = signal<Appointment[]>([]);
  loading = signal(false);
  error = signal('');
  busy = signal(false);

  selected = signal<Appointment | null>(null);
  consultant = '';
  cancelOpen = signal(false);
  cancelReason = '';
  rescheduleOpen = signal(false);
  rescheduleDate = signal<string>(this.today);
  rescheduleStore = signal<string | null>(null);
  rescheduleSlot = signal<string | null>(null);
  slots = signal<AppointmentSlot[]>([]);

  /** One column per store with bookings (or the selected store), plus one for at-home and video calls. */
  columns = computed<DayColumn[]>(() => {
    const list = this.appointments();
    const byStore = new Map<string, Appointment[]>();
    const noStore: Appointment[] = [];
    for (const a of list) {
      if (a.appointmentType === 'STORE_VISIT' && a.storeId) {
        const key = String(a.storeId);
        if (!byStore.has(key)) byStore.set(key, []);
        byStore.get(key)!.push(a);
      } else {
        noStore.push(a);
      }
    }
    const cols: DayColumn[] = [];
    const storeIds = this.storeFilter() ? [this.storeFilter()] : this.stores().map(s => String(s.id));
    for (const id of storeIds) {
      const store = this.stores().find(s => String(s.id) === id);
      const items = byStore.get(id) ?? [];
      if (!store && !items.length) continue;
      cols.push({ key: id, title: store?.name ?? 'Store', subtitle: store?.address ?? '', appointments: items });
      byStore.delete(id);
    }
    // Stores that were deleted but still have bookings.
    for (const [id, items] of byStore) {
      cols.push({ key: id, title: 'Store ' + id.slice(0, 8), subtitle: 'no longer listed', appointments: items });
    }
    if (!this.storeFilter() || noStore.length) {
      cols.push({ key: 'none', title: 'At home and video', subtitle: 'Try-at-home visits and video consultations', appointments: noStore });
    }
    return cols;
  });

  ngOnInit() {
    this.storeService.getStores().subscribe({
      next: (stores) => this.stores.set(stores ?? []),
      error: () => { /* columns fall back to bookings only */ },
    });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.appointmentService.list(this.date(), this.storeFilter() || null, this.statusFilter()).subscribe({
      next: (list) => {
        this.appointments.set(list ?? []);
        this.loading.set(false);
        const sel = this.selected();
        if (sel) this.selected.set(this.appointments().find(a => a.id === sel.id) ?? null);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load appointments.');
        this.loading.set(false);
      }
    });
  }

  setDate(value: string) {
    if (!value) return;
    this.date.set(value);
    this.selected.set(null);
    this.load();
  }

  shiftDay(delta: number) {
    const d = new Date(this.date() + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    this.setDate(localDate(d));
  }

  open(a: Appointment) {
    if (this.selected()?.id === a.id) {
      this.selected.set(null);
      return;
    }
    this.selected.set(a);
    this.consultant = a.consultant || '';
    this.cancelOpen.set(false);
    this.cancelReason = '';
    this.rescheduleOpen.set(false);
    this.rescheduleSlot.set(null);
  }

  typeLabel(t: AppointmentType): string {
    return APPOINTMENT_TYPE_LABEL[t] ?? t;
  }

  placeLabel(a: Appointment): string {
    return a.appointmentType === 'VIDEO_CONSULT' ? 'Video call' : a.appointmentType === 'TRY_AT_HOME' ? 'Customer address' : '—';
  }

  statusClass(status: AppointmentStatus): string {
    switch (status) {
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'CONFIRMED': return 'bg-emerald-100 text-emerald-800';
      case 'COMPLETED': return 'bg-gray-200 text-gray-800';
      case 'NO_SHOW': return 'bg-orange-100 text-orange-800';
      default: return 'bg-red-100 text-red-800';
    }
  }

  nextStatuses(a: Appointment): AppointmentStatus[] {
    return APPOINTMENT_NEXT[a.status] ?? [];
  }

  isTerminal(a: Appointment): boolean {
    return this.nextStatuses(a).length === 0;
  }

  actionLabel(s: AppointmentStatus): string {
    switch (s) {
      case 'CONFIRMED': return 'Confirm';
      case 'COMPLETED': return 'Mark completed';
      case 'NO_SHOW': return 'No-show';
      case 'CANCELLED': return 'Cancel';
      default: return s;
    }
  }

  transition(a: Appointment, status: AppointmentStatus) {
    if (status === 'CANCELLED') {
      this.cancelOpen.set(true);
      return;
    }
    this.busy.set(true);
    this.appointmentService.updateStatus(a.id, status).subscribe({
      next: (updated) => this.done(updated, `${updated.name}: ${status.toLowerCase().replace('_', ' ')}.`),
      error: (err) => this.fail(err, 'The status was not changed.'),
    });
  }

  confirmCancel(a: Appointment) {
    this.busy.set(true);
    this.appointmentService.updateStatus(a.id, 'CANCELLED', this.cancelReason.trim()).subscribe({
      next: (updated) => {
        this.cancelOpen.set(false);
        this.cancelReason = '';
        this.done(updated, 'Appointment cancelled; the customer has been told.');
      },
      error: (err) => this.fail(err, 'The appointment was not cancelled.'),
    });
  }

  assign(a: Appointment) {
    this.busy.set(true);
    this.appointmentService.assign(a.id, this.consultant.trim()).subscribe({
      next: (updated) => this.done(updated, updated.consultant ? `Assigned to ${updated.consultant}.` : 'Consultant cleared.'),
      error: (err) => this.fail(err, 'The consultant was not saved.'),
    });
  }

  toggleReschedule(a: Appointment) {
    const open = !this.rescheduleOpen();
    this.rescheduleOpen.set(open);
    if (open) {
      this.rescheduleDate.set((a.slotStart || a.requestedDate || this.date()).slice(0, 10));
      this.rescheduleStore.set(a.storeId ? String(a.storeId) : (this.stores()[0] ? String(this.stores()[0].id) : null));
      this.rescheduleSlot.set(null);
      this.loadSlots(a);
    }
  }

  loadSlots(a: Appointment) {
    const storeId = a.appointmentType === 'STORE_VISIT' ? this.rescheduleStore() : null;
    this.appointmentService.slots(this.rescheduleDate(), a.appointmentType, storeId).subscribe({
      next: (slots) => this.slots.set(slots ?? []),
      error: () => this.slots.set([]),
    });
  }

  reschedule(a: Appointment) {
    const slot = this.rescheduleSlot();
    if (!slot) return;
    this.busy.set(true);
    const storeId = a.appointmentType === 'STORE_VISIT' ? this.rescheduleStore() : null;
    this.appointmentService.reschedule(a.id, slot, storeId).subscribe({
      next: (updated) => {
        this.rescheduleOpen.set(false);
        this.done(updated, 'Booking moved.');
      },
      error: (err) => this.fail(err, 'The booking was not moved.'),
    });
  }

  private done(updated: Appointment, message: string) {
    this.busy.set(false);
    this.toastr.success(message);
    this.selected.set(updated);
    this.load();
  }

  private fail(err: any, fallback: string) {
    this.busy.set(false);
    this.toastr.error(err?.error?.message || fallback, 'Action failed');
  }
}

function localDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
