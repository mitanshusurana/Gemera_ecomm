import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingService } from '../../services/setting.service';
import { ProductService } from '../../services/product.service';
import { AuthService } from '../../services/auth.service';

/**
 * Home-page keys from the API contract (section 1). Every one of these is a
 * string in the flat settings map; empty string means "use the storefront
 * default". They are listed once here so the form, the load and the save all
 * agree on the key set.
 */
const HOME_TEXT_KEYS = [
  'home.heroEyebrow',
  'home.heroTitle',
  'home.heroSubtitle',
  'home.heroImageUrl',
  'home.heroImageAlt',
  'home.heroCaptionLabel',
  'home.heroCaptionTitle',
  'home.heroPrimaryCtaLabel',
  'home.heroPrimaryCtaLink',
  'home.heroSecondaryCtaLabel',
  'home.heroSecondaryCtaLink',
  'home.featuredEyebrow',
  'home.featuredTitle',
] as const;

const HOME_PREFIX = 'home.';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './settings.component.html'
})
export class SettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private settingService = inject(SettingService);
  private productService = inject(ProductService);
  private authService = inject(AuthService);

  /** Shown in place of the old hardcoded profile card. */
  readonly adminEmail = this.authService.currentUserEmail();

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

  /**
   * Home-page card. Kept as a separate group because the keys contain dots,
   * which reactive forms cannot use as control names; toHomeMap() converts
   * back to the flat home.* keys on save.
   */
  homeForm = this.fb.group({
    heroEyebrow: [''],
    heroTitle: [''],
    heroSubtitle: [''],
    heroImageUrl: [''],
    heroImageAlt: [''],
    heroCaptionLabel: [''],
    heroCaptionTitle: [''],
    heroPrimaryCtaLabel: [''],
    heroPrimaryCtaLink: [''],
    heroSecondaryCtaLabel: [''],
    heroSecondaryCtaLink: [''],
    trustBadge1: [''],
    trustBadge2: [''],
    trustBadge3: [''],
    simulatorEnabled: [true],
    // Number input; null means "not set" and is saved as an empty string.
    simulatorBasePrice: [null as number | null, [Validators.min(0)]],
    featuredEyebrow: [''],
    featuredTitle: [''],
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
  errorMessage = '';

  uploadingHero = false;
  heroUploadError = '';

  get heroImageUrl(): string {
    return this.homeForm.get('heroImageUrl')?.value || '';
  }

  ngOnInit() {
    this.settingService.getSettings().subscribe({
      next: (settings) => {
        if (settings) {
          this.settingsForm.patchValue(settings);
          this.patchHome(settings);
        }
      },
      error: (err) => console.error('Error loading settings', err)
    });
  }

  private patchHome(settings: Record<string, string>) {
    const patch: Record<string, unknown> = {};
    for (const key of HOME_TEXT_KEYS) {
      patch[key.slice(HOME_PREFIX.length)] = settings[key] ?? '';
    }

    const badges = (settings['home.trustBadges'] ?? '').split('|').map(b => b.trim());
    patch['trustBadge1'] = badges[0] ?? '';
    patch['trustBadge2'] = badges[1] ?? '';
    patch['trustBadge3'] = badges[2] ?? '';

    // Default is "true" when unset, matching the storefront default.
    const enabled = settings['home.simulatorEnabled'];
    patch['simulatorEnabled'] = enabled === undefined || enabled === '' ? true : enabled === 'true';

    const price = parseFloat(settings['home.simulatorBasePrice'] ?? '');
    patch['simulatorBasePrice'] = Number.isFinite(price) ? price : null;

    this.homeForm.patchValue(patch);
  }

  /** Flat home.* map for the PUT body. Empty strings are intentional. */
  private toHomeMap(): Record<string, string> {
    const v = this.homeForm.getRawValue() as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const key of HOME_TEXT_KEYS) {
      const raw = v[key.slice(HOME_PREFIX.length)];
      out[key] = raw === null || raw === undefined ? '' : String(raw).trim();
    }

    out['home.trustBadges'] = [v['trustBadge1'], v['trustBadge2'], v['trustBadge3']]
      .map(b => (typeof b === 'string' ? b.trim() : ''))
      .filter(b => b.length > 0)
      .join('|');

    out['home.simulatorEnabled'] = v['simulatorEnabled'] ? 'true' : 'false';

    const price = v['simulatorBasePrice'];
    out['home.simulatorBasePrice'] =
      typeof price === 'number' && Number.isFinite(price) ? String(price) : '';

    return out;
  }

  onHeroFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.uploadingHero = true;
    this.heroUploadError = '';
    this.productService.uploadImage(file).subscribe({
      next: (res: { url?: string }) => {
        if (res?.url) {
          this.homeForm.patchValue({ heroImageUrl: res.url });
          this.homeForm.markAsDirty();
        } else {
          this.heroUploadError = 'Upload succeeded but no URL was returned.';
        }
        this.uploadingHero = false;
        input.value = '';
      },
      error: (err) => {
        console.error('Hero image upload failed', err);
        this.heroUploadError = 'Failed to upload the hero image.';
        this.uploadingHero = false;
        input.value = '';
      }
    });
  }

  clearHeroImage() {
    this.homeForm.patchValue({ heroImageUrl: '' });
    this.homeForm.markAsDirty();
  }

  onSubmit() {
    if (this.settingsForm.invalid || this.homeForm.invalid || this.uploadingHero) {
      this.settingsForm.markAllAsTouched();
      this.homeForm.markAllAsTouched();
      return;
    }

    this.saving = true;
    this.successMessage = '';
    this.errorMessage = '';

    const payload = {
      ...this.settingsForm.value,
      ...this.toHomeMap(),
    };

    this.settingService.updateSettings(payload).subscribe({
      next: () => {
        this.saving = false;
        this.successMessage = 'Settings saved successfully!';
        setTimeout(() => this.successMessage = '', 3000);
      },
      error: (err) => {
        console.error('Failed to save settings', err);
        this.errorMessage = 'Failed to save settings.';
        this.saving = false;
      }
    });
  }
}
