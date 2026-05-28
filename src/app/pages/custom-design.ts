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
    <div class="min-h-screen bg-neutral-50 py-16 px-4 pt-32">
      <div class="max-w-3xl mx-auto bg-surface p-8 md:p-12 rounded-2xl shadow-xl">
        <h1 class="text-4xl font-serif font-bold text-ink mb-4 text-center">Design Your Own</h1>
        <p class="text-ink text-center mb-8">
          Share your inspiration and ideas with our artisans, and we'll bring your dream jewelry to life.
        </p>

        <form [formGroup]="inquiryForm" (ngSubmit)="submitInquiry()" class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label class="block text-sm font-medium text-ink mb-1">Name *</label>
              <input type="text" formControlName="name" class="w-full p-3 border border-ink rounded-lg focus:ring-primary focus:border-primary" required />
            </div>
            <div>
              <label class="block text-sm font-medium text-ink mb-1">Email *</label>
              <input type="email" formControlName="email" class="w-full p-3 border border-ink rounded-lg focus:ring-primary focus:border-primary" required />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-ink mb-1">Phone *</label>
            <input type="tel" formControlName="phone" class="w-full p-3 border border-ink rounded-lg focus:ring-primary focus:border-primary" required />
          </div>

          <div>
            <label class="block text-sm font-medium text-ink mb-1">Design Concept *</label>
            <textarea formControlName="concept" rows="4" class="w-full p-3 border border-ink rounded-lg focus:ring-primary focus:border-primary" placeholder="Describe the type of jewelry, metal preference, stone shapes, etc." required></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-ink mb-1">Inspiration Photo</label>
            <div class="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-ink border-dashed rounded-lg">
              <div class="space-y-1 text-center">
                <svg class="mx-auto h-12 w-12 text-ink" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
                <div class="flex text-sm text-ink justify-center">
                  <label for="file-upload" class="relative cursor-pointer bg-surface rounded-md font-medium text-ink hover:text-ink focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary">
                    <span>Upload a file</span>
                    <input id="file-upload" type="file" class="sr-only" (change)="onFileSelected($event)" accept="image/*">
                  </label>
                  <p class="pl-1">or drag and drop</p>
                </div>
                <p class="text-xs text-ink">PNG, JPG, GIF up to 10MB</p>
                <p *ngIf="selectedFile()" class="text-sm text-green-600 mt-2 font-medium">Selected: {{ selectedFile()?.name }}</p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            [disabled]="inquiryForm.invalid || submitting()"
            class="w-full bg-primary text-surface font-bold py-4 rounded-lg shadow-lg hover:shadow-xl transition-all uppercase tracking-wider disabled:opacity-50"
          >
            {{ submitting() ? 'Submitting...' : 'Send Inquiry' }}
          </button>
        </form>
      </div>
    </div>
  `
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
