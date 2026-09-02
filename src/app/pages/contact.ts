import { Component, OnInit } from '@angular/core';
import { SettingService } from '../services/setting.service';
import { CommonModule } from '@angular/common';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- APPLE DESIGN SYSTEM: CONTACT CONCIERGE (DESIGN.md) -->
    <div *ngIf="settings" class="min-h-screen bg-white font-sans text-[#1d1d1f] pt-[96px] pb-24">
      
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

      <main class="max-w-[1200px] mx-auto px-6 py-12">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          <!-- Contact Form Card -->
          <div class="lg:col-span-7 store-utility-card p-8 md:p-12 shadow-sm">
            <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">Send an Inquiry</h2>
            <form class="space-y-5">
              <div>
                <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Full Name</label>
                <input type="text" class="w-full bg-[#f5f5f7] border border-[#e0e0e0] p-3.5 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37]" placeholder="Enter your name">
              </div>
              <div>
                <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Email Address</label>
                <input type="email" class="w-full bg-[#f5f5f7] border border-[#e0e0e0] p-3.5 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37]" placeholder="your@email.com">
              </div>
              <div>
                <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Subject</label>
                <input type="text" class="w-full bg-[#f5f5f7] border border-[#e0e0e0] p-3.5 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37]" placeholder="e.g. Solitaire Appointment or Custom Design">
              </div>
              <div>
                <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Message</label>
                <textarea rows="4" class="w-full bg-[#f5f5f7] border border-[#e0e0e0] p-3.5 rounded-xl text-sm text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37]" placeholder="How may we assist you?"></textarea>
              </div>
              <button type="button" class="btn-apple-pill w-full !py-3.5 text-sm">Send Message to Concierge</button>
            </form>
          </div>

          <!-- Information Sidebar Card -->
          <div class="lg:col-span-5 bg-[#fafafc] border border-[#e0e0e0] rounded-[24px] p-8 md:p-10 space-y-8">
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
                  <p class="mt-0.5">Mon–Fri, 9:00am – 7:00pm EST</p>
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
              <a href="https://wa.me/1234567890" target="_blank" class="btn-apple-pill-secondary w-full text-center !py-3 text-xs flex items-center justify-center gap-2">
                <span>💬</span> Instant WhatsApp Concierge
              </a>
            </div>
          </div>

        </div>
      </main>

    </div>
  `,
})
export class ContactComponent implements OnInit {
  env = environment;
  settings: any = null;

  constructor(private settingService: SettingService) {}

  ngOnInit() {
    this.settingService.getSettings().subscribe({
      next: (data: any) => {
        this.settings = {
          email: data?.companyEmail || this.env.companyEmail,
          phone: data?.companyPhone || this.env.companyPhone,
          address: data?.companyAddress || this.env.companyAddress
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
