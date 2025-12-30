import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../services/api.service';
import { FadeInDirective } from '../directives/fade-in.directive';

@Component({
  selector: 'app-verify-certificate',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FadeInDirective],
  template: `
    <div class="min-h-screen bg-white">
      <!-- Header -->
      <div class="bg-diamond-50 border-b border-diamond-200">
        <div class="container-luxury py-12 text-center">
          <h1 class="text-4xl md:text-5xl font-display font-bold text-diamond-900 mb-4">
            Verify Your Report
          </h1>
          <p class="text-gray-600 max-w-2xl mx-auto">
            Enter your report number to verify the authenticity of your gemstone or jewellery.
            We verify reports from GIA, IGI, and our internal Gemara Authenticity Certificates.
          </p>
        </div>
      </div>

      <!-- Search Section -->
      <div class="container-luxury section-padding">
        <div class="max-w-xl mx-auto">
          <div class="card p-8 shadow-lg">
            <label class="block text-sm font-bold text-gray-700 mb-2">Report / Certificate Number</label>
            <div class="flex gap-2 mb-4">
              <input
                type="text"
                [(ngModel)]="reportNumber"
                (keyup.enter)="verify()"
                placeholder="e.g. GIA-1234-5678 or SKU"
                class="input-field flex-1 uppercase"
              >
              <button (click)="verify()" [disabled]="loading()" class="btn-primary px-6">
                {{ loading() ? 'Checking...' : 'Verify' }}
              </button>
            </div>
            <p class="text-xs text-gray-500">
              Try entering a Product SKU (e.g., "DS-001") or "GIA123" for a demo.
            </p>

            <!-- Error Message -->
            <div *ngIf="error()" class="mt-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 animate-fade-in-up">
              <p class="font-bold">❌ Report Not Found</p>
              <p class="text-sm">We couldn't find a report with that number. Please check and try again or contact customer care.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Result Modal (Inline for demo) -->
      <div *ngIf="result()" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden animate-fade-in-up">
          <div class="bg-gold-500 p-6 text-white flex justify-between items-center">
            <div class="flex items-center gap-3">
              <span class="text-4xl">✓</span>
              <div>
                <h3 class="text-2xl font-bold font-display">Verified Authentic</h3>
                <p class="text-gold-100 text-sm">Report #{{ result()?.id }}</p>
              </div>
            </div>
            <button (click)="result.set(null)" class="text-white hover:bg-white/20 rounded-full p-2 transition">✕</button>
          </div>

          <div class="p-8">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h4 class="font-bold text-gray-900 mb-4 border-b pb-2">Report Details</h4>
                <dl class="space-y-3 text-sm">
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Date Issued</dt>
                    <dd class="font-medium">Jan 12, 2024</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Laboratory</dt>
                    <dd class="font-medium">{{ result()?.lab }}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Shape</dt>
                    <dd class="font-medium">Round Brilliant</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Carat Weight</dt>
                    <dd class="font-medium">{{ result()?.carat }} ct</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Color Grade</dt>
                    <dd class="font-medium">{{ result()?.color }}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-gray-500">Clarity Grade</dt>
                    <dd class="font-medium">{{ result()?.clarity }}</dd>
                  </div>
                </dl>
              </div>

              <div class="bg-gray-50 p-6 rounded-lg text-center flex flex-col items-center justify-center border border-dashed border-gray-300">
                <div class="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                  <span class="text-4xl">💎</span>
                </div>
                <p class="font-bold text-gray-900 mb-1">Digital Asset</p>
                <p class="text-xs text-gray-500 mb-4">Secured on Blockchain</p>
                <a href="#" class="text-gold-600 underline text-sm hover:text-gold-700">View Original PDF</a>
              </div>
            </div>

            <div class="mt-8 pt-6 border-t border-gray-100 text-center">
              <p class="text-sm text-gray-500">
                This verification is provided by Gemara Fine Jewels in partnership with {{ result()?.lab }}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class VerifyCertificateComponent {
  reportNumber = '';
  loading = signal(false);
  error = signal(false);
  result = signal<{id: string, lab: string, carat: number, color: string, clarity: string} | null>(null);

  private apiService = inject(ApiService);

  verify() {
    if (!this.reportNumber.trim()) return;

    this.loading.set(true);
    this.error.set(false);
    this.result.set(null);

    // Mock Verification Logic
    setTimeout(() => {
      this.loading.set(false);
      const input = this.reportNumber.trim().toUpperCase();

      // Simple mock check
      if (input === 'GIA123' || input.startsWith('DS-')) {
        this.result.set({
          id: input,
          lab: input.includes('GIA') ? 'GIA' : 'Gemara Lab',
          carat: 1.5,
          color: 'F',
          clarity: 'VS1'
        });
      } else {
        this.error.set(true);
      }
    }, 1500);
  }
}
