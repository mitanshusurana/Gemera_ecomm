import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingService } from '../services/setting.service';
import { InquiryService } from '../services/inquiry.service';
import { CommonModule } from '@angular/common';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <!-- APPLE DESIGN SYSTEM: CONTACT CONCIERGE (DESIGN.md) -->
    <div *ngIf="settings" class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">
      
      <!-- Top Parchment Header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-16 px-6 text-center">
        <div class="max-w-[800px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Client Concierge</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl text-[#1d1d1f] tracking-tight">
            Connect with Our Advisors.
          </h1>
          <p class="text-base text-[#7a7a7a] mt-4 max-w-xl mx-auto">
            Whether inquiring about a bespoke creation, private showroom appointment, or GIA certificate, our team is at your service.
          </p>
        </div>
      </section>

      <div class="max-w-[1200px] mx-auto px-6 py-12">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          <!-- Contact Form Card -->
          <div class="lg:col-span-7 store-utility-card p-8 md:p-12">
            <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">Send an Inquiry</h2>
            <form class="space-y-5" [formGroup]="form" (ngSubmit)="submit()">
              <div>
                <label for="contact-name" class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Full Name</label>
                <input id="contact-name" formControlName="name" type="text" autocomplete="name" class="input-field" placeholder="Enter your name">
                <p *ngIf="invalid('name')" class="text-xs text-red-600 mt-1">Please tell us your name.</p>
              </div>
              <div>
                <label for="contact-email" class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Email Address</label>
                <input id="contact-email" formControlName="email" type="email" autocomplete="email" class="input-field" placeholder="your@email.com">
                <p *ngIf="invalid('email')" class="text-xs text-red-600 mt-1">Please enter an email address we can reply to.</p>
              </div>
              <div>
                <label for="contact-subject" class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Subject</label>
                <input id="contact-subject" formControlName="subject" type="text" class="input-field" placeholder="e.g. Solitaire Appointment or Custom Design">
              </div>
              <div>
                <label for="contact-message" class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Message</label>
                <textarea id="contact-message" formControlName="message" rows="4" class="input-field" placeholder="How may we assist you?"></textarea>
                <p *ngIf="invalid('message')" class="text-xs text-red-600 mt-1">Please tell us how we can help.</p>
              </div>
              <button type="submit" [disabled]="sending()" class="btn-apple-pill w-full !py-3.5 text-sm disabled:opacity-60">
                {{ sending() ? 'Sending…' : 'Send Message to Concierge' }}
              </button>
              <p *ngIf="sent()" class="text-sm text-emerald-700">
                Thank you — your enquiry has reached us and we will reply by email.
              </p>
              <p *ngIf="failed()" class="text-sm text-red-600">
                We could not send that. Please try again, or email us directly at
                {{ settings?.email }}.
              </p>
            </form>
          </div>

          <!-- Information Sidebar Card -->
          <div class="lg:col-span-5 bg-[#fafafc] border border-[#e0e0e0] rounded-[18px] p-8 md:p-10 space-y-8">
            <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] border-b border-[#e0e0e0] pb-4">Atelier Contact</h2>
            
            <div class="space-y-6 text-xs text-[#7a7a7a]">
              <div class="flex items-start gap-4">
                <div class="w-8 h-8 rounded-full bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <div>
                  <h3 class="font-semibold text-sm text-[#1d1d1f] mb-1">Flagship Showroom</h3>
                  <p class="leading-relaxed" [innerHTML]="settings.address"></p>
                </div>
              </div>

              <div class="flex items-start gap-4">
                <div class="w-8 h-8 rounded-full bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                </div>
                <div>
                  <h3 class="font-semibold text-sm text-[#1d1d1f] mb-1">Telephone Concierge</h3>
                  <p class="font-semibold text-[#1d1d1f]">{{ settings.phone }}</p>
                  <p class="mt-0.5">Mon–Sat, 10:00am – 7:00pm IST</p>
                </div>
              </div>

              <div class="flex items-start gap-4">
                <div class="w-8 h-8 rounded-full bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                </div>
                <div>
                  <h3 class="font-semibold text-sm text-[#1d1d1f] mb-1">Electronic Mail</h3>
                  <p class="font-semibold text-[#1d1d1f]">{{ settings.email }}</p>
                </div>
              </div>
            </div>

            <div class="pt-6 border-t border-[#e0e0e0]">
              <a *ngIf="whatsappLink()" [href]="whatsappLink()" target="_blank" rel="noopener noreferrer" class="btn-apple-pill-secondary w-full text-center !py-3 text-xs flex items-center justify-center gap-2">
                <span>💬</span> Instant WhatsApp Concierge
              </a>
            </div>
          </div>

        </div>
      </div>

    </div>
  `,
})
export class ContactComponent implements OnInit {
  env = environment;
  settings: any = null;

  private fb = inject(FormBuilder);
  private inquiryService = inject(InquiryService);

  sending = signal(false);
  sent = signal(false);
  failed = signal(false);

  /**
   * The form previously had no bindings at all and a type="button" submit with
   * no handler, so every enquiry a customer typed was silently discarded.
   */
  form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    email: ['', [Validators.required, Validators.email]],
    subject: ['', [Validators.maxLength(200)]],
    message: ['', [Validators.required, Validators.maxLength(4000)]],
  });

  /**
   * WhatsApp link from configuration. It was hardcoded to the placeholder
   * 1234567890, so the concierge button went to a stranger.
   */
  whatsappLink(): string | null {
    const raw = this.settings?.whatsapp || this.env.whatsappNumber || '';
    const digits = String(raw).replace(/[^0-9]/g, '');
    return digits ? `https://wa.me/${digits}` : null;
  }

  invalid(control: string): boolean {
    const c = this.form.get(control);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  submit(): void {
    this.sent.set(false);
    this.failed.set(false);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    // The inquiries endpoint is multipart (it also accepts attachments).
    const payload = new FormData();
    payload.append('name', v.name ?? '');
    payload.append('email', v.email ?? '');
    payload.append('subject', v.subject || 'Website enquiry');
    payload.append('message', v.message ?? '');

    this.sending.set(true);
    this.inquiryService.createInquiry(payload).subscribe({
      next: () => {
        this.sending.set(false);
        this.sent.set(true);
        this.form.reset();
      },
      error: () => {
        this.sending.set(false);
        this.failed.set(true);
      },
    });
  }

  constructor(private settingService: SettingService) {}

  ngOnInit() {
    this.settingService.getSettings().subscribe({
      next: (data: any) => {
        this.settings = {
          email: data?.companyEmail || this.env.companyEmail,
          phone: data?.companyPhone || this.env.companyPhone,
          address: data?.companyAddress || this.env.companyAddress,
          whatsapp: data?.whatsappNumber || this.env.whatsappNumber
        };
      },
      error: () => {
        // Fallback to env
        this.settings = {
          email: this.env.companyEmail,
          phone: this.env.companyPhone,
          address: this.env.companyAddress
        };
      }
    });
  }
}
