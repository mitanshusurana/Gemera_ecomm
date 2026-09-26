import { Component, ChangeDetectionStrategy, inject, input, output, signal, computed, effect, untracked, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppointmentService, AppointmentSlot, AppointmentType } from '../services/appointment.service';
import { StoreService, Store } from '../services/store.service';

export interface SlotSelection {
  /** Local ISO date-time of the chosen slot, or null while nothing is chosen. */
  slotStart: string | null;
  storeId: string | null;
  storeName: string | null;
}

/**
 * Store picker (store visits only), date picker and the live slot grid from
 * GET /appointments/slots. Emits `selected` whenever the choice changes;
 * a change of date, store or type clears the chosen slot.
 */
@Component({
  selector: 'app-appointment-slot-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-4">
      <div *ngIf="needsStore()">
        <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Store</label>
        <select class="input-field" [ngModel]="storeId()" (ngModelChange)="pickStore($event)" aria-label="Store">
          <option [ngValue]="null" disabled>Choose a store</option>
          <option *ngFor="let s of stores()" [ngValue]="s.id">{{ s.name }}</option>
        </select>
        <p *ngIf="storeAddress()" class="text-xs text-[#7a7a7a] mt-1">{{ storeAddress() }}</p>
        <p *ngIf="!storesLoading() && !stores().length" class="text-xs text-[#7a7a7a] mt-1">No stores are listed yet; choose a video consult or try at home instead.</p>
      </div>

      <div>
        <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Date</label>
        <input type="date" class="input-field" [min]="minDate" [ngModel]="date()" (ngModelChange)="pickDate($event)" aria-label="Date" />
      </div>

      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider">Time</span>
          <span *ngIf="slotsLoading()" class="text-xs text-[#7a7a7a]">Checking availability…</span>
        </div>
        <p *ngIf="needsStore() && !storeId()" class="text-sm text-[#6e6e73]">Choose a store to see its slots.</p>
        <p *ngIf="!slotsLoading() && slotsError()" class="text-sm text-red-600">{{ slotsError() }}</p>
        <div *ngIf="(!needsStore() || storeId()) && !slotsError()" class="grid grid-cols-3 sm:grid-cols-4 gap-2">
          <button *ngFor="let s of slots()" type="button"
                  (click)="pickSlot(s)"
                  [disabled]="!s.available"
                  [attr.aria-pressed]="selectedStart() === s.start"
                  [title]="slotTitle(s)"
                  class="rounded-full border px-3 py-2 text-sm font-medium transition-colors active-press disabled:opacity-40 disabled:cursor-not-allowed"
                  [ngClass]="selectedStart() === s.start
                    ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]'
                    : 'bg-white text-[#1d1d1f] border-[#e0e0e0] hover:border-[#D4AF37]'">
            {{ s.start | date:'HH:mm' }}
            <span *ngIf="s.available && s.remaining === 1" class="block text-[10px] font-normal text-[#7a7a7a]">1 left</span>
          </button>
        </div>
        <p *ngIf="!slotsLoading() && (!needsStore() || storeId()) && slots().length && !hasAvailable()" class="text-sm text-[#6e6e73] mt-2">
          Nothing free on this day; try another date.
        </p>
      </div>
    </div>
  `,
})
export class AppointmentSlotPickerComponent implements OnInit {
  private appointmentService = inject(AppointmentService);
  private storeService = inject(StoreService);

  /** STORE_VISIT shows the store picker; the other types share one calendar. */
  type = input<AppointmentType>('STORE_VISIT');
  /** Preselects a store (rescheduling). */
  initialStoreId = input<string | null>(null);
  selected = output<SlotSelection>();

  stores = signal<Store[]>([]);
  storesLoading = signal(true);
  storeId = signal<string | null>(null);
  date = signal<string>(defaultDate());
  slots = signal<AppointmentSlot[]>([]);
  slotsLoading = signal(false);
  slotsError = signal<string | null>(null);
  selectedStart = signal<string | null>(null);

  readonly minDate = defaultDate(0);
  needsStore = computed(() => this.type() === 'STORE_VISIT');
  hasAvailable = computed(() => this.slots().some(s => s.available));
  storeAddress = computed(() => this.stores().find(s => String(s.id) === this.storeId())?.address ?? null);

  constructor() {
    // Type or preset store changed from outside: reset the choice and reload.
    // Only the two inputs are tracked; everything else runs untracked so a
    // slot click or a store load cannot re-run the effect and clear the pick.
    effect(() => {
      this.type();
      const preset = this.initialStoreId();
      untracked(() => {
        if (preset && !this.storeId()) this.storeId.set(preset);
        this.selectedStart.set(null);
        this.emit();
        this.loadSlots();
      });
    });
  }

  ngOnInit(): void {
    this.storeService.getStores().subscribe({
      next: (res) => {
        this.stores.set(res?.stores ?? []);
        this.storesLoading.set(false);
        if (this.needsStore() && !this.storeId() && this.stores().length === 1) {
          this.pickStore(String(this.stores()[0].id));
        }
      },
      error: () => this.storesLoading.set(false),
    });
  }

  pickStore(id: string | null): void {
    this.storeId.set(id ? String(id) : null);
    this.selectedStart.set(null);
    this.emit();
    this.loadSlots();
  }

  pickDate(value: string): void {
    if (!value) return;
    this.date.set(value);
    this.selectedStart.set(null);
    this.emit();
    this.loadSlots();
  }

  pickSlot(slot: AppointmentSlot): void {
    if (!slot.available) return;
    this.selectedStart.set(slot.start);
    this.emit();
  }

  slotTitle(s: AppointmentSlot): string {
    if (s.available) return `${s.remaining} of ${s.capacity} places free`;
    return s.reason === 'TOO_SOON' ? 'Too soon: appointments need a few hours\' notice' : 'Fully booked';
  }

  private loadSlots(): void {
    if (this.needsStore() && !this.storeId()) {
      this.slots.set([]);
      return;
    }
    this.slotsLoading.set(true);
    this.slotsError.set(null);
    this.appointmentService.slots(this.date(), this.type(), this.needsStore() ? this.storeId() : null).subscribe({
      next: (slots) => {
        this.slots.set(slots ?? []);
        this.slotsLoading.set(false);
      },
      error: (err) => {
        this.slots.set([]);
        this.slotsLoading.set(false);
        this.slotsError.set(err?.error?.message || 'Slots could not be loaded. Please try again.');
      },
    });
  }

  private emit(): void {
    const store = this.stores().find(s => String(s.id) === this.storeId());
    this.selected.emit({
      slotStart: this.selectedStart(),
      storeId: this.needsStore() ? this.storeId() : null,
      storeName: this.needsStore() ? (store?.name ?? null) : null,
    });
  }
}

/** "YYYY-MM-DD" of today plus `daysAhead` (local time). */
function defaultDate(daysAhead = 1): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
