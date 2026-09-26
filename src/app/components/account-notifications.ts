import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationPreferenceService, NotificationPreferences } from '../services/notification-preference.service';
import { ToastService } from '../services/toast.service';

/**
 * "Notifications" block on the account settings tab: which channels the
 * customer wants order, repair, exchange and appointment updates on, and the
 * mobile number WhatsApp and SMS go to. Saved through
 * PUT /users/me/notification-preferences; the phone is stored on the profile.
 */
@Component({
  selector: 'app-account-notifications',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="border border-[#e0e0e0] rounded-[18px] p-6">
      <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] mb-1">Notifications</h3>
      <p class="text-sm text-[#6e6e73] mb-6">How we tell you about orders, repairs, old gold exchanges and appointments. Transactional only, never promotions.</p>

      <div *ngIf="loading()" class="space-y-3">
        <div class="skeleton h-10 rounded-[12px]"></div>
        <div class="skeleton h-10 rounded-[12px]"></div>
      </div>

      <form *ngIf="!loading()" (ngSubmit)="save()" class="space-y-5">
        <div class="space-y-3">
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" [(ngModel)]="form.notifyEmail" name="notifyEmail"
                   class="w-4 h-4 mt-1 rounded border-[#e0e0e0] accent-[#D4AF37]">
            <span class="text-sm text-[#1d1d1f]">
              E-mail
              <span class="block text-xs text-[#6e6e73]">Confirmations, shipping updates, estimates and receipts.</span>
            </span>
          </label>
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" [(ngModel)]="form.notifyWhatsapp" name="notifyWhatsapp"
                   class="w-4 h-4 mt-1 rounded border-[#e0e0e0] accent-[#D4AF37]">
            <span class="text-sm text-[#1d1d1f]">
              WhatsApp
              <span class="block text-xs text-[#6e6e73]">Short updates on the number below.</span>
            </span>
          </label>
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" [(ngModel)]="form.notifySms" name="notifySms"
                   class="w-4 h-4 mt-1 rounded border-[#e0e0e0] accent-[#D4AF37]">
            <span class="text-sm text-[#1d1d1f]">
              SMS
              <span class="block text-xs text-[#6e6e73]">Off by default; useful when WhatsApp is not available.</span>
            </span>
          </label>
        </div>

        <div class="max-w-sm">
          <label for="notifyPhone" class="block text-sm font-medium text-[#1d1d1f] mb-2">Mobile number</label>
          <input id="notifyPhone" type="tel" [(ngModel)]="form.phone" name="phone" autocomplete="tel"
                 placeholder="+91 98765 43210" class="input-field">
          <p class="text-xs text-[#6e6e73] mt-1">Indian numbers can be typed without the country code.</p>
          <p *ngIf="error()" class="text-sm text-red-600 mt-2">{{ error() }}</p>
        </div>

        <button type="submit" class="btn-apple-pill" [disabled]="saving()">
          {{ saving() ? 'Saving…' : 'Save notification settings' }}
        </button>
      </form>
    </div>
  `
})
export class AccountNotificationsComponent implements OnInit {
  private service = inject(NotificationPreferenceService);
  private toast = inject(ToastService);

  loading = signal(true);
  saving = signal(false);
  error = signal<string | null>(null);

  form: NotificationPreferences = { notifyEmail: true, notifyWhatsapp: false, notifySms: false, phone: '' };

  ngOnInit(): void {
    this.service.get().subscribe({
      next: (prefs) => {
        this.form = { ...prefs, phone: prefs.phone ?? '' };
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  save(): void {
    if ((this.form.notifyWhatsapp || this.form.notifySms) && !this.form.phone.trim()) {
      this.error.set('Add a mobile number to receive WhatsApp or SMS messages.');
      return;
    }
    this.error.set(null);
    this.saving.set(true);
    this.service.update(this.form).subscribe({
      next: (prefs) => {
        this.form = { ...prefs, phone: prefs.phone ?? '' };
        this.saving.set(false);
        this.toast.show('Notification settings saved', 'success');
      },
      error: (err) => {
        this.saving.set(false);
        const detail = err?.error?.detail || err?.error?.message;
        this.error.set(typeof detail === 'string' ? detail : 'Could not save notification settings.');
      },
    });
  }
}
