import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CertificateService } from '../services/certificate.service';
import { ToastService } from '../services/toast.service';
import { CertificateDetail } from '../core/models';

@Component({
  selector: 'app-verify-certificate',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <!-- APPLE DESIGN SYSTEM: CERTIFICATE VERIFIER (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">

      <!-- Top Parchment Header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-16 px-6 text-center">
        <div class="max-w-[800px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Certificate Lookup</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl text-[#1d1d1f] tracking-tight">
            Verify GIA / IGI Certificate.
          </h1>
          <p class="text-base text-[#7a7a7a] mt-4 max-w-xl mx-auto">
            Look up the grading report we hold for your piece. This is our own record; it is not a query against the laboratory&rsquo;s registry.
          </p>
        </div>
      </section>

      <!-- Main Search Section -->
      <div class="max-w-[800px] mx-auto px-6 py-12">
        <div class="store-utility-card p-8 md:p-12">
          <label for="report-number" class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-3">Report / Certificate Identifier</label>
          <div class="flex flex-col sm:flex-row gap-3">
            <input
              id="report-number"
              type="text"
              [(ngModel)]="reportNumber"
              (keyup.enter)="verify()"
              placeholder="e.g. GIA-1234-5678"
              class="input-field flex-1 uppercase"
            >
            <button (click)="verify()" [disabled]="loading()" class="btn-apple-pill text-sm !py-3 !px-6 shrink-0">
              {{ loading() ? 'Verifying...' : 'Verify Certificate' }}
            </button>
          </div>

          <!-- Error Alert -->
          <div *ngIf="error()" class="mt-6 p-4 bg-red-50 text-red-700 rounded-[12px] border border-red-200 text-xs">
            <p class="font-semibold mb-1">❌ Report Identifier Not Found</p>
            <p>We could not locate a matching laboratory record for that report number. Please verify the digits or contact our concierge.</p>
          </div>
        </div>
      </div>

      <!-- Result Modal -->
      <div *ngIf="result()" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
        <div class="bg-white rounded-[18px] shadow-2xl max-w-2xl w-full overflow-hidden animate-fade-in-up">
          <div class="bg-[#1c1c1e] p-6 text-white flex justify-between items-center">
            <div class="flex items-center gap-3">
              <span class="text-4xl text-[#D4AF37]">✓</span>
              <div>
                <h3 class="font-display font-semibold text-2xl text-white">Verified Authentic</h3>
                <p class="text-[#a1a1a6] text-sm">Report #{{ result()?.reportNumber }}</p>
              </div>
            </div>
            <button (click)="result.set(null)" aria-label="Close" class="text-white hover:bg-white/10 rounded-full p-2 active-press">✕</button>
          </div>

          <div class="p-8">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h4 class="font-sans font-semibold text-base text-[#1d1d1f] mb-4 border-b border-[#e0e0e0] pb-2">Report Details</h4>
                <dl class="space-y-3 text-sm">
                  <div class="flex justify-between">
                    <dt class="text-[#6e6e73]">Date Issued</dt>
                    <dd class="font-medium text-[#1d1d1f]">{{ result()?.dateIssued | date:'mediumDate' }}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-[#6e6e73]">Laboratory</dt>
                    <dd class="font-medium text-[#1d1d1f]">{{ result()?.lab }}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-[#6e6e73]">Shape</dt>
                    <dd class="font-medium text-[#1d1d1f]">{{ result()?.shape }}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-[#6e6e73]">Carat Weight</dt>
                    <dd class="font-medium text-[#1d1d1f]">{{ result()?.carat }} ct</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-[#6e6e73]">Color Grade</dt>
                    <dd class="font-medium text-[#1d1d1f]">{{ result()?.color }}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-[#6e6e73]">Clarity Grade</dt>
                    <dd class="font-medium text-[#1d1d1f]">{{ result()?.clarity }}</dd>
                  </div>
                  <div class="flex justify-between">
                    <dt class="text-[#6e6e73]">Cut Grade</dt>
                    <dd class="font-medium text-[#1d1d1f]">{{ result()?.cut }}</dd>
                  </div>
                </dl>
              </div>

              <div class="bg-[#f5f5f7] p-6 rounded-[12px] text-center flex flex-col items-center justify-center border border-dashed border-[#e0e0e0]">
                <div class="w-24 h-24 bg-white border border-[#e0e0e0] rounded-full flex items-center justify-center mb-4 overflow-hidden">
                  <img *ngIf="result()?.imageUrl" [src]="result()?.imageUrl" alt="Certificate" class="w-full h-full object-cover">
                  <span *ngIf="!result()?.imageUrl" class="text-4xl">💎</span>
                </div>
                <p class="font-semibold text-[#1d1d1f] mb-1">Digital Asset</p>
                <p *ngIf="result()?.productName" class="text-xs text-[#1d1d1f] mb-1">{{ result()?.productName }}</p>
                <p class="text-xs text-[#6e6e73] mb-4">Stored in our certificate archive</p>
                <a
                  *ngIf="result()?.productId"
                  [routerLink]="['/products', result()?.productId]"
                  class="btn-apple-pill text-sm !py-2.5 !px-6 mb-2"
                >View product</a>
                <button (click)="downloadPdf()" [disabled]="downloading()" class="btn-ghost text-sm !px-0 hover:underline">
                   <span *ngIf="downloading()" class="animate-spin h-3 w-3 border-2 border-[#D4AF37] border-t-transparent rounded-full"></span>
                   {{ downloading() ? 'Downloading...' : 'Download Original PDF' }}
                </button>
              </div>
            </div>

            <div class="mt-8 pt-6 border-t border-[#e0e0e0] text-center">
              <p class="text-sm text-[#6e6e73]">
                Checked against Caratloop&rsquo;s own record of the certificate
                issued by {{ result()?.lab }}. To confirm the grading itself,
                verify the report number directly with {{ result()?.lab }}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class VerifyCertificateComponent implements OnInit {
  reportNumber = '';
  loading = signal(false);
  downloading = signal(false);
  error = signal(false);
  result = signal<CertificateDetail | null>(null);

  private certificateService = inject(CertificateService);
  private toastService = inject(ToastService);
  private route = inject(ActivatedRoute);

  ngOnInit() {
    // "Verify this certificate" on the product page links here with ?report=.
    this.route.queryParamMap.subscribe((params) => {
      const report = (params.get('report') || '').trim();
      if (report && report !== this.reportNumber) {
        this.reportNumber = report;
        this.verify();
      }
    });
  }

  verify() {
    if (!this.reportNumber.trim()) return;

    this.loading.set(true);
    this.error.set(false);
    this.result.set(null);

    this.certificateService.verifyCertificate(this.reportNumber.trim()).subscribe({
      next: (data) => {
        this.result.set(data);
        this.loading.set(false);
        this.toastService.show('Certificate verified successfully', 'success');
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
        this.toastService.show('Certificate not found', 'error');
      }
    });
  }

  downloadPdf() {
    const reportNum = this.result()?.reportNumber;
    if (!reportNum) return;

    this.downloading.set(true);
    this.certificateService.downloadCertificate(reportNum).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `Certificate-${reportNum}.pdf`;
        link.click();
        window.URL.revokeObjectURL(url);
        this.downloading.set(false);
        this.toastService.show('Download started', 'success');
      },
      error: () => {
        this.downloading.set(false);
        this.toastService.show('Failed to download certificate', 'error');
      }
    });
  }
}
