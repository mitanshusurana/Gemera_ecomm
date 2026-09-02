import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingService } from '../../services/setting.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settingService = inject(SettingService);

  settingsForm = this.fb.group({
    companyAddress: ['', Validators.required],
    companyPhone: ['', Validators.required],
    companyEmail: ['', [Validators.required, Validators.email]],
    whatsappNumber: ['', Validators.required],
    companyInstagram: [''],
    companyFacebook: [''],
    usdRate: ['0.012', Validators.required],
    eurRate: ['0.011', Validators.required],
    gbpRate: ['0.009', Validators.required],
    // Rates are stored as decimal fractions (0.03 = 3%). The only rule was
    // `required` on a type="text" input, so an operator reading the label as a
    // percentage and typing 3 set a 300% tax rate across the whole catalogue,
    // with no confirmation and no audit entry. Bounded to 0..1 -- a rate above
    // 100% is never valid.
    taxRateJewelry: ['0.03', [Validators.required, Validators.min(0), Validators.max(1)]],
    taxRateGemstones: ['0.0025', [Validators.required, Validators.min(0), Validators.max(1)]],
    taxRateDefault: ['0.03', [Validators.required, Validators.min(0), Validators.max(1)]]
  });

  /** A rate as a readable percentage, so the operator can sanity-check it. */
  ratePercent(control: string): string {
    const raw = this.settingsForm.get(control)?.value;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return '';
    return `${(n * 100).toFixed(2)}%`;
  }

  rateInvalid(control: string): boolean {
    const c = this.settingsForm.get(control);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  saving = false;
  successMessage = '';

  ngOnInit() {
    this.settingService.getSettings().subscribe({
      next: (settings) => {
        if (settings) {
          this.settingsForm.patchValue(settings);
        }
      },
      error: (err) => console.error('Error loading settings', err)
    });
  }

  onSubmit() {
    if (this.settingsForm.invalid) return;

    this.saving = true;
    this.successMessage = '';

    this.settingService.updateSettings(this.settingsForm.value).subscribe({
      next: () => {
        this.saving = false;
        this.successMessage = 'Settings saved successfully!';
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err) => {
        console.error('Failed to save settings', err);
        this.saving = false;
      }
    });
  }
}