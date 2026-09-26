import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { AppointmentService, AppointmentType, APPOINTMENT_TYPE_LABEL, Appointment } from '../services/appointment.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import { SeoService } from '../services/seo.service';
import { AppointmentSlotPickerComponent, SlotSelection } from '../components/appointment-slot-picker';

/**
 * Book a consultation: type (store visit, try at home, video), store and
 * live slot grid, then contact details. Signed-in customers get their name
 * and e-mail prefilled and manage the booking from the account page.
 */
@Component({
  selector: 'app-appointments',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AppointmentSlotPickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-16 px-6">
        <div class="max-w-[1080px] mx-auto">
          <nav aria-label="Breadcrumb" class="flex items-center gap-2 text-xs text-[#6e6e73] mb-6">
            <a routerLink="/" class="text-[#D4AF37] hover:underline">Home</a>
            <span>/</span>
            <span class="text-[#1d1d1f]">Book an appointment</span>
          </nav>
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Private consultations</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl tracking-tight">Book an appointment</h1>
          <p class="text-base text-[#7a7a7a] mt-4 max-w-xl">
            An hour with a consultant, at the store, at your home or over a video call. Pieces are laid out for you before you arrive.
          </p>
        </div>
      </section>

      <div class="max-w-[1080px] mx-auto px-6 py-12">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div class="lg:col-span-2">

            <!-- Done -->
            <div *ngIf="booked()" class="bg-white border border-[#e0e0e0] rounded-[18px] p-10 text-center">
              <div class="w-20 h-20 rounded-full bg-[#fbf8ef] text-[#8a6d1f] flex items-center justify-center text-4xl mx-auto mb-6">✓</div>
              <h2 class="font-display font-semibold text-3xl tracking-tight mb-3">Request received</h2>
              <p class="text-[#6e6e73] mb-2">
                Your {{ typeLabel(booked()!.appointmentType) }} on <strong class="text-[#1d1d1f]">{{ booked()!.slotStart | date:'EEEE d MMMM, HH:mm' }}</strong>
                <span *ngIf="booked()!.storeName"> at {{ booked()!.storeName }}</span> is with our team; we confirm every booking by e-mail or WhatsApp.
              </p>
              <p class="text-sm text-[#6e6e73] mb-8">Need to change it? Manage your bookings from your account, or reply to the confirmation.</p>
              <div class="flex flex-col sm:flex-row gap-3 justify-center">
                <a *ngIf="signedIn()" routerLink="/account" [queryParams]="{ tab: 'orders' }" class="btn-apple-pill">My appointments</a>
                <a routerLink="/products" class="btn-apple-pill-secondary">Browse the collection</a>
                <button type="button" (click)="reset()" class="btn-outline">Book another</button>
              </div>
            </div>

            <form *ngIf="!booked()" (ngSubmit)="submit()" class="bg-white border border-[#e0e0e0] rounded-[18px] p-8 md:p-10 space-y-8">
              <!-- Type -->
              <div>
                <h2 class="font-display font-semibold text-2xl mb-4">How would you like to meet?</h2>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button *ngFor="let t of types" type="button" (click)="type.set(t)"
                          class="rounded-[14px] border p-4 text-left transition-colors active-press"
                          [ngClass]="type() === t ? 'border-[#1d1d1f] bg-[#f5f5f7]' : 'border-[#e0e0e0] hover:border-[#D4AF37]'">
                    <span class="block text-sm font-semibold">{{ typeLabel(t) }}</span>
                    <span class="block text-xs text-[#6e6e73] mt-1">{{ typeHint(t) }}</span>
                  </button>
                </div>
              </div>

              <!-- Slot -->
              <div class="border-t border-[#f0f0f0] pt-8">
                <h2 class="font-display font-semibold text-2xl mb-4">When?</h2>
                <app-appointment-slot-picker [type]="type()" (selected)="slot.set($event)" />
              </div>

              <!-- Contact -->
              <div class="border-t border-[#f0f0f0] pt-8">
                <h2 class="font-display font-semibold text-2xl mb-4">Your details</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label for="apt-name" class="block text-xs font-semibold uppercase tracking-wider mb-2">Name</label>
                    <input id="apt-name" type="text" [(ngModel)]="form.name" name="name" required class="input-field" placeholder="Your name" />
                  </div>
                  <div>
                    <label for="apt-phone" class="block text-xs font-semibold uppercase tracking-wider mb-2">Phone</label>
                    <input id="apt-phone" type="tel" [(ngModel)]="form.phone" name="phone" required class="input-field" placeholder="10-digit mobile" />
                  </div>
                  <div class="md:col-span-2">
                    <label for="apt-email" class="block text-xs font-semibold uppercase tracking-wider mb-2">E-mail</label>
                    <input id="apt-email" type="email" [(ngModel)]="form.email" name="email" class="input-field" placeholder="you@example.com" />
                  </div>
                  <div class="md:col-span-2">
                    <label for="apt-notes" class="block text-xs font-semibold uppercase tracking-wider mb-2">What would you like to see? <span class="normal-case font-normal text-[#7a7a7a]">(optional)</span></label>
                    <textarea id="apt-notes" [(ngModel)]="form.notes" name="notes" rows="3" class="input-field" placeholder="Engagement rings under 2 lakh, a pair of jhumkas, a stone for a pendant…"></textarea>
                  </div>
                </div>
              </div>

              <p *ngIf="error()" class="text-sm text-red-600">{{ error() }}</p>

              <div class="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between border-t border-[#f0f0f0] pt-6">
                <p class="text-xs text-[#7a7a7a]">
                  <ng-container *ngIf="slot().slotStart; else pickOne">
                    {{ typeLabel(type()) }} · {{ slot().slotStart | date:'EEE d MMM, HH:mm' }}<span *ngIf="slot().storeName"> · {{ slot().storeName }}</span>
                  </ng-container>
                  <ng-template #pickOne>Choose a time slot to continue.</ng-template>
                </p>
                <button type="submit" [disabled]="!canSubmit() || submitting()" class="btn-apple-pill whitespace-nowrap">
                  {{ submitting() ? 'Booking…' : 'Request appointment' }}
                </button>
              </div>
            </form>
          </div>

          <aside class="space-y-6">
            <div class="bg-[#fafafc] border border-[#e0e0e0] rounded-[18px] p-8">
              <h3 class="font-sans font-semibold text-lg mb-4">What to expect</h3>
              <ul class="space-y-3 text-sm text-[#6e6e73]">
                <li class="flex gap-3"><span class="text-[#D4AF37] font-semibold">✓</span> A dedicated consultant for the hour</li>
                <li class="flex gap-3"><span class="text-[#D4AF37] font-semibold">✓</span> Pieces from your wishlist laid out in advance</li>
                <li class="flex gap-3"><span class="text-[#D4AF37] font-semibold">✓</span> Try-at-home visits come with an insured courier</li>
                <li class="flex gap-3"><span class="text-[#D4AF37] font-semibold">✓</span> A reminder the day before</li>
              </ul>
            </div>
            <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
              <h3 class="font-sans font-semibold text-lg mb-4">Our stores</h3>
              <p class="text-sm text-[#6e6e73] mb-4">Addresses, opening hours and directions.</p>
              <a routerLink="/stores" class="btn-outline text-sm !py-2.5 !px-5">Find a store</a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  `,
})
export class AppointmentsComponent implements OnInit {
  private appointmentService = inject(AppointmentService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private seo = inject(SeoService);
  private route = inject(ActivatedRoute);

  readonly types: AppointmentType[] = ['STORE_VISIT', 'TRY_AT_HOME', 'VIDEO_CONSULT'];
  type = signal<AppointmentType>('STORE_VISIT');
  slot = signal<SlotSelection>({ slotStart: null, storeId: null, storeName: null });
  form = { name: '', phone: '', email: '', notes: '' };
  submitting = signal(false);
  error = signal<string | null>(null);
  booked = signal<Appointment | null>(null);
  signedIn = computed(() => !!this.authService.currentUser());

  canSubmit = computed(() => !!this.slot().slotStart && (this.type() !== 'STORE_VISIT' || !!this.slot().storeId));

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Book an appointment | Caratloop',
      description: 'Book a store visit, a try-at-home session or a video consultation with a Caratloop jewellery consultant.',
    });
    const t = (this.route.snapshot.queryParamMap.get('type') || '').toUpperCase() as AppointmentType;
    if (this.types.includes(t)) this.type.set(t);
    const user = this.authService.currentUser();
    if (user) {
      this.form.name = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      this.form.email = user.email || '';
      this.form.phone = user.phone || '';
    }
  }

  typeLabel(t: AppointmentType | string): string {
    return APPOINTMENT_TYPE_LABEL[t as AppointmentType] ?? String(t);
  }

  typeHint(t: AppointmentType): string {
    switch (t) {
      case 'STORE_VISIT': return 'A private viewing at the store of your choice.';
      case 'TRY_AT_HOME': return 'A consultant brings a selection to your address.';
      default: return 'A guided look at pieces over WhatsApp video.';
    }
  }

  submit(): void {
    if (!this.canSubmit() || this.submitting()) return;
    if (!this.form.name.trim()) {
      this.error.set('Please tell us your name.');
      return;
    }
    if (!this.form.phone.trim() && !this.form.email.trim()) {
      this.error.set('A phone number or e-mail address is needed to confirm the booking.');
      return;
    }
    this.error.set(null);
    this.submitting.set(true);
    this.appointmentService.createAppointment({
      name: this.form.name.trim(),
      email: this.form.email.trim() || undefined,
      phone: this.form.phone.trim() || undefined,
      appointmentType: this.type(),
      slotStart: this.slot().slotStart!,
      storeId: this.slot().storeId,
      notes: this.form.notes.trim() || undefined,
    }).subscribe({
      next: (a) => {
        this.submitting.set(false);
        this.booked.set(a);
        this.toast.show('Appointment requested. We will confirm it shortly.', 'success');
      },
      error: (err) => {
        this.submitting.set(false);
        this.error.set(err?.error?.message || 'The booking could not be made. Please try again.');
      },
    });
  }

  reset(): void {
    this.booked.set(null);
    this.slot.set({ slotStart: null, storeId: null, storeName: null });
    this.form.notes = '';
  }
}
