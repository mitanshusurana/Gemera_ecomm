import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { InquiryService } from '../services/inquiry.service';
import { ToastService } from '../services/toast.service';

@Component({
  selector: 'app-custom-design',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <!-- APPLE DESIGN SYSTEM: BESPOKE DESIGN SERVICE (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">
      
      <!-- Parchment Hero Header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-16 px-6 text-center">
        <div class="max-w-[800px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Atelier Haute Joaillerie</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl text-[#1d1d1f] tracking-tight">
            Design Your One-of-a-Kind Masterpiece.
          </h1>
          <p class="text-base text-[#7a7a7a] mt-4 max-w-xl mx-auto">
            Collaborate directly with our master goldsmiths and gemologists to bring your vision to life.
          </p>
        </div>
      </section>

      <!-- Main Form Section -->
      <div class="max-w-[800px] mx-auto px-6 py-12">
        <div class="bg-white border border-[#e0e0e0] p-8 md:p-12 rounded-[18px]">
          <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-2">Bespoke Inquiry</h2>
          <p class="text-xs text-[#7a7a7a] mb-8">Fill in your preferences below. Our concierge will contact you within 24 hours.</p>

          <form [formGroup]="inquiryForm" (ngSubmit)="submitInquiry()" class="space-y-6">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label for="cd-name" class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Full Name *</label>
                <input id="cd-name" type="text" formControlName="name" class="input-field" required />
              </div>
              <div>
                <label for="cd-email" class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Email Address *</label>
                <input id="cd-email" type="email" formControlName="email" class="input-field" required />
              </div>
            </div>

            <div>
              <label for="cd-phone" class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Phone Number *</label>
              <input id="cd-phone" type="tel" formControlName="phone" class="input-field" required />
            </div>

            <div>
              <label for="cd-concept" class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Design Concept & Specifications *</label>
              <textarea id="cd-concept" formControlName="concept" rows="4" class="input-field" placeholder="Describe your preferred metal (18K Gold, Platinum), gemstone shape, ring size, or occasion." required></textarea>
            </div>

            <div>
              <label class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2">Inspiration Sketch or Reference</label>
              <div class="mt-1 flex justify-center px-6 pt-8 pb-8 border-2 border-[#e0e0e0] border-dashed rounded-[12px] bg-[#fafafc]">
                <div class="space-y-2 text-center">
                  <span class="text-4xl block">🖼️</span>
                  <div class="flex text-xs text-[#1d1d1f] justify-center">
                    <label for="file-upload" class="relative cursor-pointer font-semibold text-[#D4AF37] hover:underline">
                      <span>Upload image file</span>
                      <input id="file-upload" type="file" class="sr-only" (change)="onFileSelected($event)" accept="image/*">
                    </label>
                    <p class="pl-1 text-[#7a7a7a]">or drag and drop</p>
                  </div>
                  <p class="text-[11px] text-[#7a7a7a]">PNG, JPG up to 10MB</p>
                  <p *ngIf="selectedFile()" class="text-xs text-emerald-600 font-semibold mt-2">✓ Attached: {{ selectedFile()?.name }}</p>
                </div>
              </div>
            </div>

            <button
              type="submit"
              [disabled]="inquiryForm.invalid || submitting()"
              class="btn-apple-pill w-full !py-3.5 text-sm disabled:opacity-40"
            >
              {{ submitting() ? 'Submitting Inquiry...' : 'Submit Bespoke Inquiry' }}
            </button>
          </form>
        </div>
      </div>

    </div>
  `,
})
export class CustomDesignComponent {
  private fb = inject(FormBuilder);
  private inquiryService = inject(InquiryService);
  private toastService = inject(ToastService);

  inquiryForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', Validators.required],
    concept: ['', Validators.required]
  });

  selectedFile = signal<File | null>(null);
  submitting = signal(false);

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile.set(file);
    }
  }

  submitInquiry() {
    if (this.inquiryForm.invalid) return;

    this.submitting.set(true);

    const formData = new FormData();
    formData.append('name', this.inquiryForm.get('name')?.value);
    formData.append('email', this.inquiryForm.get('email')?.value);
    formData.append('phone', this.inquiryForm.get('phone')?.value);
    formData.append('concept', this.inquiryForm.get('concept')?.value);

    if (this.selectedFile()) {
      formData.append('file', this.selectedFile() as Blob);
    }

    this.inquiryService.createInquiry(formData).subscribe({
      next: () => {
        this.submitting.set(false);
        this.inquiryForm.reset();
        this.selectedFile.set(null);
        this.toastService.show('Inquiry submitted successfully! Our artisans will contact you soon.', 'success');
      },
      error: () => {
        this.submitting.set(false);
        this.toastService.show('Failed to submit inquiry. Please try again.', 'error');
      }
    });
  }
}
