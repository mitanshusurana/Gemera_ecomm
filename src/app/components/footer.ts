import { Component, inject, ChangeDetectionStrategy, ChangeDetectorRef, OnInit } from "@angular/core";
import { SettingService } from '../services/setting.service';
import { CommonModule, NgOptimizedImage } from "@angular/common";
import { RouterLink } from "@angular/router";
import { FormsModule, ReactiveFormsModule, FormControl, Validators } from "@angular/forms";

import { EmailNotificationService } from "../services/email-notification.service";
import { ToastService } from "../services/toast.service";
import { environment } from "../../environments/environment";

@Component({
  selector: "app-footer",
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, ReactiveFormsModule, NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- APPLE DESIGN SYSTEM: PARCHMENT FOOTER (DESIGN.md) -->
    <footer *ngIf="settings" class="bg-[#f5f5f7] text-[#333333] w-full border-t border-[#e0e0e0] font-sans">
      
      <!-- Newsletter Strip -->
      <div class="bg-[#fafafc] border-b border-[#e0e0e0] py-10 px-6 md:px-12">
        <div class="max-w-[1440px] mx-auto flex flex-col lg:flex-row items-center justify-between gap-6">
          <div>
            <h3 class="font-display font-semibold text-2xl text-[#1d1d1f] tracking-tight">Join the Caratloop Club</h3>
            <p class="text-sm text-[#7a7a7a] mt-1">Be first to receive new collection debuts and private gemstone allocations.</p>
          </div>
          <div class="flex flex-col sm:flex-row w-full lg:w-auto gap-3 max-w-md">
            <input
              type="email"
              [formControl]="emailControl"
              (keyup.enter)="subscribe()"
              placeholder="Enter your email address"
              class="w-full bg-white border border-[#e0e0e0] rounded-full px-5 py-2.5 text-sm text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37] transition-all"
            >
            <button
              (click)="subscribe()"
              [disabled]="isSubscribing"
              class="btn-apple-pill !py-2.5 !px-6 text-sm whitespace-nowrap"
            >
              {{ isSubscribing ? 'Subscribing...' : 'Subscribe' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Multi-Column Links Section (Apple 2.41 line-height link stacks) -->
      <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-16">
        <div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-8 text-[14px]">
          
          <!-- Column 1: Brand -->
          <div class="col-span-2 md:col-span-4 lg:col-span-1">
            <img ngSrc="/logo-with-name.png" alt="Caratloop" class="h-8 w-auto object-contain mb-4" width="65" height="32" />
            <p class="text-xs text-[#7a7a7a] leading-relaxed max-w-xs">
              Reverent craftsmanship meets modern luxury. Certified ethical diamonds and 18K solid gold.
            </p>
          </div>

          <!-- Column 2: Collections -->
          <div>
            <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-4">Collections</h4>
            <ul class="space-y-1 text-sm text-[#333333] leading-[2.2]">
              <li><a routerLink="/products" [queryParams]="{category: 'rings'}" class="hover:text-[#D4AF37] transition-colors">Fine Rings</a></li>
              <li><a routerLink="/products" [queryParams]="{category: 'necklaces'}" class="hover:text-[#D4AF37] transition-colors">Necklaces</a></li>
              <li><a routerLink="/products" [queryParams]="{category: 'earrings'}" class="hover:text-[#D4AF37] transition-colors">Earrings</a></li>
              <li><a routerLink="/products" [queryParams]="{category: 'bracelets'}" class="hover:text-[#D4AF37] transition-colors">Bracelets</a></li>
              <li><a routerLink="/products" [queryParams]="{category: 'diamonds'}" class="hover:text-[#D4AF37] transition-colors">Certified Diamonds</a></li>
            </ul>
          </div>

          <!-- Column 3: Custom Services -->
          <div>
            <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-4">Custom Services</h4>
            <ul class="space-y-1 text-sm text-[#333333] leading-[2.2]">
              <li><a routerLink="/builder" class="text-[#D4AF37] font-medium hover:underline">Custom Ring Studio</a></li>
              <li><a routerLink="/rfq" class="hover:text-[#D4AF37] transition-colors">Request Quote</a></li>
              <li><a routerLink="/treasure" class="hover:text-[#D4AF37] transition-colors">Treasure Investment Plan</a></li>
              <li><a routerLink="/custom-design" class="hover:text-[#D4AF37] transition-colors">Bespoke Design Service</a></li>
            </ul>
          </div>

          <!-- Column 4: Customer Care -->
          <div>
            <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-4">Customer Care</h4>
            <ul class="space-y-1 text-sm text-[#333333] leading-[2.2]">
              <li><a routerLink="/contact" class="hover:text-[#D4AF37] transition-colors">Contact Concierge</a></li>
              <li><a routerLink="/returns" class="hover:text-[#D4AF37] transition-colors">Shipping &amp; Returns</a></li>
              <li><a routerLink="/track-order" class="hover:text-[#D4AF37] transition-colors">Track Your Order</a></li>
              <li><a routerLink="/verify-certificate" class="hover:text-[#D4AF37] transition-colors">Verify Gem Certificate</a></li>
            </ul>
          </div>

          <!-- Column 5: Contact & Location -->
          <div>
            <h4 class="font-semibold text-xs text-[#1d1d1f] uppercase tracking-wider mb-4">Caratloop House</h4>
            <div class="text-xs text-[#7a7a7a] space-y-3">
              <p [innerHTML]="settings.address"></p>
              <p><a [href]="'tel:' + settings.phone" class="hover:text-[#1d1d1f]">{{ settings.phone }}</a></p>
              <p><a [href]="'mailto:' + settings.email" class="hover:text-[#1d1d1f]">{{ settings.email }}</a></p>
            </div>
          </div>

        </div>

        <!-- Apple Micro Fine Print & Copyright Row -->
        <div class="border-t border-[#e0e0e0] mt-12 pt-6 flex flex-col md:flex-row items-center justify-between text-xs text-[#7a7a7a] gap-4">
          <div>Copyright &copy; 2026 Caratloop. All rights reserved.</div>
          <div class="flex space-x-6">
            <a routerLink="/privacy" class="hover:text-[#1d1d1f] transition-colors">Privacy Policy</a>
            <a routerLink="/terms" class="hover:text-[#1d1d1f] transition-colors">Terms of Use</a>
            <a routerLink="/contact" class="hover:text-[#1d1d1f] transition-colors">Legal</a>
          </div>
        </div>

      </div>
    </footer>
  `,
})
export class FooterComponent implements OnInit {
  env = environment;
  settings: any = null;
  emailControl = new FormControl('', [Validators.required, Validators.email]);
  isSubscribing = false;

  private emailService = inject(EmailNotificationService);
  private toastService = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);
  private settingService = inject(SettingService);

  ngOnInit() {
    this.settingService.getSettings().subscribe({
      next: (data: any) => {
        this.settings = {
          email: data?.companyEmail || this.env.companyEmail,
          phone: data?.companyPhone || this.env.companyPhone,
          address: data?.companyAddress || this.env.companyAddress,
          facebookUrl: this.formatUrl(data?.companyFacebook || this.env.companyFacebook),
          instagramUrl: this.formatUrl(data?.companyInstagram || this.env.companyInstagram),
          whatsappNumber: data?.whatsappNumber || this.env.whatsappNumber
        };
        this.cdr.markForCheck();
      },
      error: () => {
        // Fallback to env
        this.settings = {
          email: this.env.companyEmail,
          phone: this.env.companyPhone,
          address: this.env.companyAddress,
          facebookUrl: this.formatUrl(this.env.companyFacebook),
          instagramUrl: this.formatUrl(this.env.companyInstagram),
          whatsappNumber: this.env.whatsappNumber
        };
        this.cdr.markForCheck();
      }
    });
  }

  private formatUrl(url: string | undefined): string {
    if (!url) return '#';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    return `https://${url}`;
  }

  subscribe() {
    if (this.emailControl.invalid) {
        this.emailControl.markAsTouched();
        this.toastService.show('Please enter a valid email address', 'error');
        return;
    }

    this.isSubscribing = true;
    this.emailService.subscribeToNotifications(this.emailControl.value!).subscribe({
        next: () => {
            this.toastService.show('Successfully subscribed to newsletter!', 'success');
            this.emailControl.reset();
            this.isSubscribing = false;
            this.cdr.markForCheck();
        },
        error: () => {
            this.toastService.show('Failed to subscribe. Please try again.', 'error');
            this.isSubscribing = false;
            this.cdr.markForCheck();
        }
    });
  }
}
