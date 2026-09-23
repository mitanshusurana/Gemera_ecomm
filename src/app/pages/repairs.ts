import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RepairService } from '../services/repair.service';
import { SettingService } from '../services/setting.service';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';
import {
  REPAIR_ITEM_TYPES, REPAIR_SERVICES, RepairItemType, RepairJob, RepairServiceInfo, RepairServiceType,
  repairServiceLabel,
} from '../core/repair.models';

/**
 * Repairs and services: the catalogue with "from" prices (global settings
 * repairPrice*), the request form, and the confirmation with the job number.
 */
@Component({
  selector: 'app-repairs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">

      <!-- Hero -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0]">
        <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-16 md:py-20 text-center">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Repairs &amp; Services</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl tracking-tight text-[#1d1d1f]">Loved pieces, restored.</h1>
          <p class="text-[#6e6e73] text-lg mt-4 max-w-2xl mx-auto">
            Resizing, polishing, stone resetting and more by the goldsmiths who make our jewellery.
            Every job is assessed first; nothing is done until you approve the estimate.
          </p>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <a href="#repair-request" (click)="scrollToForm($event)" class="btn-apple-pill">Request a service</a>
            <a routerLink="/repairs/track" class="btn-outline">Track a job</a>
          </div>
        </div>
      </section>

      <!-- Catalogue -->
      <section class="max-w-[1440px] mx-auto px-6 md:px-12 py-16">
        <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
          <div>
            <h2 class="font-display font-semibold text-3xl tracking-tight">What we can do</h2>
            <p class="text-[#6e6e73] mt-2">Guide prices for standard work in 18K gold. Your estimate is confirmed after assessment.</p>
          </div>
          <p class="text-xs text-[#7a7a7a]">Pieces bought from Caratloop are cleaned free of charge.</p>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <article *ngFor="let s of services" class="store-utility-card">
            <div>
              <div class="flex items-start justify-between gap-3">
                <h3 class="font-semibold text-[17px] tracking-tight">{{ s.label }}</h3>
                <span class="badge bg-[#f5f5f7] text-[#1d1d1f] whitespace-nowrap">{{ s.turnaround }}</span>
              </div>
              <p class="text-sm text-[#6e6e73] mt-2 leading-relaxed">{{ s.summary }}</p>
              <p class="text-xs text-[#7a7a7a] mt-3 leading-relaxed">{{ s.detail }}</p>
            </div>
            <div class="mt-6 flex items-center justify-between gap-3">
              <div>
                <p class="text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]">{{ fromPrice(s) ? 'From' : 'Pricing' }}</p>
                <p class="font-semibold text-[15px]" [ngClass]="{ 'text-[#6e6e73]': !fromPrice(s) }">
                  {{ fromPrice(s) ? ('₹' + (fromPrice(s) | number:'1.0-0')) : 'Quote on assessment' }}
                </p>
              </div>
              <button type="button" (click)="choose(s.value)" class="btn-outline !py-2 !px-4 text-sm">Request</button>
            </div>
          </article>
        </div>
      </section>

      <!-- Request form / confirmation -->
      <section id="repair-request" class="bg-[#f5f5f7] border-t border-[#e0e0e0]">
        <div class="max-w-[820px] mx-auto px-6 md:px-12 py-16">

          <!-- Confirmation -->
          <div *ngIf="created() as job; else formBlock" class="bg-white border border-[#e0e0e0] rounded-[18px] p-8 md:p-10 animate-fade-in">
            <div class="w-14 h-14 rounded-full bg-[#D4AF37] text-black flex items-center justify-center text-2xl font-semibold mb-6">✓</div>
            <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] block mb-2">Request received</span>
            <h2 class="font-display font-semibold text-3xl tracking-tight">Your job number is <span class="font-mono">{{ job.jobNumber }}</span></h2>
            <p class="text-[#6e6e73] mt-3">
              We have emailed a confirmation to <span class="text-[#1d1d1f] font-medium">{{ job.email }}</span>.
              Keep the job number; you will need it and your phone number to track the job.
            </p>

            <div class="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div class="bg-[#f5f5f7] rounded-[12px] p-4">
                <p class="text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]">Service</p>
                <p class="font-medium mt-1">{{ serviceLabel(job.serviceType) }}</p>
              </div>
              <div class="bg-[#f5f5f7] rounded-[12px] p-4">
                <p class="text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]">Item</p>
                <p class="font-medium mt-1 truncate">{{ job.itemDescription }}</p>
              </div>
              <div class="bg-[#f5f5f7] rounded-[12px] p-4">
                <p class="text-[11px] uppercase tracking-[0.12em] text-[#7a7a7a]">Status</p>
                <p class="font-medium mt-1">Requested</p>
              </div>
            </div>

            <h3 class="font-semibold text-[17px] mt-10 mb-4">What happens next</h3>
            <ol class="space-y-3 text-sm text-[#1d1d1f]">
              <li class="flex gap-3"><span class="w-6 h-6 rounded-full bg-[#1d1d1f] text-white text-xs flex items-center justify-center shrink-0">1</span><span>Bring the piece to any Caratloop store, or send it insured, quoting <span class="font-mono">{{ job.jobNumber }}</span>. <a routerLink="/stores" class="text-[#D4AF37] hover:underline">Find a store</a>.</span></li>
              <li class="flex gap-3"><span class="w-6 h-6 rounded-full bg-[#1d1d1f] text-white text-xs flex items-center justify-center shrink-0">2</span><span>Our goldsmith assesses it and we email you an estimate with a promised date.</span></li>
              <li class="flex gap-3"><span class="w-6 h-6 rounded-full bg-[#1d1d1f] text-white text-xs flex items-center justify-center shrink-0">3</span><span>Approve the estimate online; work starts only after that.</span></li>
              <li class="flex gap-3"><span class="w-6 h-6 rounded-full bg-[#1d1d1f] text-white text-xs flex items-center justify-center shrink-0">4</span><span>We let you know when it is ready for collection.</span></li>
            </ol>

            <div class="flex flex-col sm:flex-row gap-3 mt-10">
              <a [routerLink]="['/repairs/track', job.jobNumber]" class="btn-apple-pill">Track this job</a>
              <button type="button" (click)="reset()" class="btn-outline">Request another service</button>
            </div>
          </div>

          <!-- Form -->
          <ng-template #formBlock>
            <div class="text-center mb-10">
              <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-2 block">Request a service</span>
              <h2 class="font-display font-semibold text-3xl tracking-tight">Tell us about your piece</h2>
              <p class="text-[#6e6e73] mt-3">No payment now. We assess the piece first and send you an estimate to approve.</p>
            </div>

            <form (ngSubmit)="submit()" #f="ngForm" class="bg-white border border-[#e0e0e0] rounded-[18px] p-8 md:p-10 space-y-8">

              <!-- The piece -->
              <div class="space-y-5">
                <h3 class="font-semibold text-[17px] tracking-tight">The piece</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label for="rp-item-type" class="block text-sm font-medium mb-2">Item type</label>
                    <select id="rp-item-type" name="itemType" [(ngModel)]="form.itemType" required class="input-field">
                      <option *ngFor="let t of itemTypes" [value]="t.value">{{ t.label }}</option>
                    </select>
                  </div>
                  <div>
                    <label for="rp-service-type" class="block text-sm font-medium mb-2">Service</label>
                    <select id="rp-service-type" name="serviceType" [(ngModel)]="form.serviceType" required class="input-field">
                      <option *ngFor="let s of services" [value]="s.value">{{ s.label }}</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label for="rp-item-desc" class="block text-sm font-medium mb-2">Describe the piece</label>
                  <input id="rp-item-desc" type="text" name="itemDescription" [(ngModel)]="form.itemDescription" required maxlength="1000"
                         placeholder="e.g. 18K yellow gold solitaire ring, 0.5 ct" class="input-field">
                </div>

                <div *ngIf="form.serviceType === 'RESIZE'" class="grid grid-cols-2 gap-5 animate-fade-in">
                  <div>
                    <label for="rp-ring-size" class="block text-sm font-medium mb-2">Current size</label>
                    <input id="rp-ring-size" type="text" name="ringSize" [(ngModel)]="form.ringSize" maxlength="16" placeholder="e.g. 12 or US 6" class="input-field">
                  </div>
                  <div>
                    <label for="rp-target-size" class="block text-sm font-medium mb-2">Size wanted</label>
                    <input id="rp-target-size" type="text" name="targetSize" [(ngModel)]="form.targetSize" maxlength="16" placeholder="e.g. 14 or US 7" class="input-field">
                  </div>
                </div>

                <div>
                  <label for="rp-problem" class="block text-sm font-medium mb-2">What needs doing <span class="text-[#7a7a7a] font-normal">(optional)</span></label>
                  <textarea id="rp-problem" name="problemDescription" [(ngModel)]="form.problemDescription" rows="3" maxlength="4000"
                            placeholder="Loose centre stone, clasp does not close, scratches on the band..." class="input-field resize-none"></textarea>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label for="rp-declared" class="block text-sm font-medium mb-2">Declared value (₹) <span class="text-[#7a7a7a] font-normal">(optional)</span></label>
                    <input id="rp-declared" type="number" name="declaredValue" [(ngModel)]="form.declaredValue" min="0" step="1" placeholder="For insurance while with us" class="input-field">
                  </div>
                  <div>
                    <label class="block text-sm font-medium mb-2">Photos <span class="text-[#7a7a7a] font-normal">(optional, up to 5)</span></label>
                    <label class="input-field flex items-center justify-between cursor-pointer" [class.opacity-60]="uploading()">
                      <span class="text-[#7a7a7a] text-sm">{{ uploading() ? 'Uploading...' : (photos().length ? photos().length + ' added' : 'Add photos of the piece') }}</span>
                      <span class="text-[#D4AF37] text-sm font-medium">Browse</span>
                      <input type="file" accept="image/jpeg,image/png,image/webp" multiple class="hidden" (change)="onPhotos($event)" [disabled]="uploading() || photos().length >= 5">
                    </label>
                  </div>
                </div>
                <div *ngIf="photos().length" class="flex flex-wrap gap-3">
                  <div *ngFor="let url of photos(); let i = index" class="relative w-20 h-20 rounded-[12px] overflow-hidden border border-[#e0e0e0] bg-[#f5f5f7]">
                    <img [src]="url" alt="Photo {{ i + 1 }}" class="w-full h-full object-cover">
                    <button type="button" (click)="removePhoto(i)" aria-label="Remove photo"
                            class="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 border border-[#e0e0e0] text-xs active-press">✕</button>
                  </div>
                </div>
              </div>

              <!-- Contact -->
              <div class="space-y-5 border-t border-[#f0f0f0] pt-8">
                <div class="flex items-center justify-between gap-3">
                  <h3 class="font-semibold text-[17px] tracking-tight">Your details</h3>
                  <p *ngIf="signedIn()" class="text-xs text-[#7a7a7a]">From your account. Edit if we should reach you elsewhere.</p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label for="rp-name" class="block text-sm font-medium mb-2">Name</label>
                    <input id="rp-name" type="text" name="customerName" [(ngModel)]="form.customerName" required maxlength="120" class="input-field" autocomplete="name">
                  </div>
                  <div>
                    <label for="rp-phone" class="block text-sm font-medium mb-2">Phone</label>
                    <input id="rp-phone" type="tel" name="phone" [(ngModel)]="form.phone" required maxlength="32" placeholder="+91" class="input-field" autocomplete="tel">
                  </div>
                  <div>
                    <label for="rp-email" class="block text-sm font-medium mb-2">Email</label>
                    <input id="rp-email" type="email" name="email" [(ngModel)]="form.email" required maxlength="160" class="input-field" autocomplete="email">
                  </div>
                </div>
                <p class="text-xs text-[#7a7a7a]">Your phone number is the key to tracking this job, so please use one you will have at the counter.</p>
              </div>

              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
                <p class="text-xs text-[#7a7a7a] max-w-md">
                  Guide price for {{ serviceLabel(form.serviceType) }}:
                  <span class="text-[#1d1d1f] font-medium">{{ selectedFromPrice() ? ('from ₹' + (selectedFromPrice() | number:'1.0-0')) : 'quote on assessment' }}</span>.
                  The final estimate is confirmed after we see the piece.
                </p>
                <button type="submit" [disabled]="submitting() || uploading() || !f.form.valid" class="btn-apple-pill whitespace-nowrap">
                  {{ submitting() ? 'Sending...' : 'Send request' }}
                </button>
              </div>
            </form>
          </ng-template>
        </div>
      </section>
    </div>
  `,
})
export class RepairsComponent implements OnInit {
  private repairService = inject(RepairService);
  private settingService = inject(SettingService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private platformId = inject(PLATFORM_ID);

  readonly services: RepairServiceInfo[] = REPAIR_SERVICES;
  readonly itemTypes = REPAIR_ITEM_TYPES;

  form: {
    itemType: RepairItemType;
    serviceType: RepairServiceType;
    itemDescription: string;
    problemDescription: string;
    ringSize: string;
    targetSize: string;
    declaredValue: number | null;
    customerName: string;
    phone: string;
    email: string;
  } = this.emptyForm();

  photos = signal<string[]>([]);
  uploading = signal(false);
  submitting = signal(false);
  created = signal<RepairJob | null>(null);
  signedIn = computed(() => !!this.authService.currentUser());

  /** "from" price for the selected service (a method: the form is plain state, not a signal). */
  selectedFromPrice(): number | null {
    const info = this.services.find(s => s.value === this.form.serviceType);
    return info ? this.fromPrice(info) : null;
  }

  ngOnInit(): void {
    const user = this.authService.currentUser();
    if (user) {
      this.form.customerName = [user.firstName, user.lastName].filter(Boolean).join(' ');
      this.form.phone = user.phone || '';
      this.form.email = user.email || '';
    }
  }

  /** Rupee "from" price from global settings (repairPrice*); null when absent or not a number. */
  fromPrice(s: RepairServiceInfo): number | null {
    const raw = (this.settingService.settings()[s.settingKey] ?? '').toString().replace(/[^0-9.]/g, '');
    const n = Number(raw);
    return raw && Number.isFinite(n) && n > 0 ? n : null;
  }

  serviceLabel(type: RepairServiceType | string): string {
    return repairServiceLabel(type);
  }

  choose(service: RepairServiceType): void {
    this.form.serviceType = service;
    if (service === 'RESIZE') this.form.itemType = 'RING';
    this.scrollToForm();
  }

  scrollToForm(event?: Event): void {
    event?.preventDefault();
    if (!isPlatformBrowser(this.platformId)) return;
    document.getElementById('repair-request')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onPhotos(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []).slice(0, 5 - this.photos().length);
    input.value = '';
    if (!files.length) return;
    this.uploading.set(true);
    let remaining = files.length;
    for (const file of files) {
      if (file.size > 8 * 1024 * 1024) {
        this.toast.show(`${file.name} is larger than 8 MB`, 'error');
        if (--remaining === 0) this.uploading.set(false);
        continue;
      }
      this.repairService.uploadPhoto(file).subscribe({
        next: (res) => {
          if (res?.url && this.photos().length < 5) this.photos.update(p => [...p, res.url]);
          if (--remaining === 0) this.uploading.set(false);
        },
        error: (err) => {
          this.toast.show(err?.error?.message || 'Photo upload failed; you can still send the request', 'error');
          if (--remaining === 0) this.uploading.set(false);
        },
      });
    }
  }

  removePhoto(index: number): void {
    this.photos.update(p => p.filter((_, i) => i !== index));
  }

  submit(): void {
    if (this.submitting()) return;
    this.submitting.set(true);
    const f = this.form;
    this.repairService.createRequest({
      customerName: f.customerName.trim(),
      phone: f.phone.trim(),
      email: f.email.trim(),
      itemType: f.itemType,
      serviceType: f.serviceType,
      itemDescription: f.itemDescription.trim(),
      problemDescription: f.problemDescription.trim() || undefined,
      declaredValue: f.declaredValue ?? null,
      photoUrls: this.photos(),
      ringSize: f.serviceType === 'RESIZE' ? f.ringSize.trim() || undefined : undefined,
      targetSize: f.serviceType === 'RESIZE' ? f.targetSize.trim() || undefined : undefined,
    }).subscribe({
      next: (job) => {
        this.submitting.set(false);
        this.created.set(job);
        this.toast.show(`Request ${job.jobNumber} received`, 'success');
        this.scrollToForm();
      },
      error: (err) => {
        this.submitting.set(false);
        this.toast.show(err?.error?.message || err?.error?.detail || 'We could not send your request. Please try again.', 'error');
      },
    });
  }

  reset(): void {
    const keep = { customerName: this.form.customerName, phone: this.form.phone, email: this.form.email };
    this.form = { ...this.emptyForm(), ...keep };
    this.photos.set([]);
    this.created.set(null);
  }

  private emptyForm() {
    return {
      itemType: 'RING' as RepairItemType,
      serviceType: 'RESIZE' as RepairServiceType,
      itemDescription: '',
      problemDescription: '',
      ringSize: '',
      targetSize: '',
      declaredValue: null as number | null,
      customerName: '',
      phone: '',
      email: '',
    };
  }
}
