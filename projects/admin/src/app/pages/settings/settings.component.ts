import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SettingService } from '../../services/setting.service';
import { ProductService } from '../../services/product.service';
import { AuthService } from '../../services/auth.service';
import { DEFAULT_GST_STATE_CODE, GST_STATE_CODES, GSTIN_PATTERN, PAN_PATTERN } from '../../core/gst-state-codes';

/** Default series prefix for web invoices: WEB/2026-27/000001. */
const DEFAULT_INVOICE_SERIES_PREFIX = 'WEB';

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

  /** Only settings.write may save; everyone with settings.read may look. */
  get canWrite(): boolean {
    return this.authService.can('settings.write');
  }

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
    taxRateDefault: ['0.03', [Validators.required, Validators.min(0), Validators.max(1)]],
    // Tax invoice (GST contract). The legal name, GSTIN and PAN print on every
    // invoice; the state code decides CGST+SGST vs IGST and must match the
    // GSTIN's first two digits; the prefix starts the invoice series.
    companyLegalName: [''],
    companyGstin: ['', [Validators.pattern(GSTIN_PATTERN)]],
    companyPan: ['', [Validators.pattern(PAN_PATTERN)]],
    companyStateCode: [DEFAULT_GST_STATE_CODE, [Validators.required, Validators.pattern(/^\d{2}$/)]],
    invoiceSeriesPrefix: [DEFAULT_INVOICE_SERIES_PREFIX, [Validators.required, Validators.pattern(/^[A-Z0-9-]{1,10}$/)]],
    // Repairs & services: whole-rupee "from" prices shown on the storefront
    // /repairs catalogue. Empty means "Quote on assessment".
    repairPriceResize: ['', [Validators.pattern(/^\d{0,9}$/)]],
    repairPricePolish: ['', [Validators.pattern(/^\d{0,9}$/)]],
    repairPriceStoneReset: ['', [Validators.pattern(/^\d{0,9}$/)]],
    repairPriceRhodium: ['', [Validators.pattern(/^\d{0,9}$/)]],
    repairPriceChainRepair: ['', [Validators.pattern(/^\d{0,9}$/)]],
    repairPriceEngraving: ['', [Validators.pattern(/^\d{0,9}$/)]],
    repairPriceCleaning: ['', [Validators.pattern(/^\d{0,9}$/)]],
    repairPriceOther: ['', [Validators.pattern(/^\d{0,9}$/)]],
    // Old gold exchange quotes on /exchange: deduction off the fine-metal value
    // and the silver rate (silver has no live feed).
    oldGoldDeductionPct: ['2', [Validators.min(0), Validators.max(50)]],
    silverRatePerGram: ['', [Validators.pattern(/^\d{0,7}(\.\d{0,2})?$/)]],
  });

  /** Storefront service catalogue order; label shown next to each "from" price field. */
  readonly repairPriceFields: Array<{ control: string; label: string }> = [
    { control: 'repairPriceResize', label: 'Resizing' },
    { control: 'repairPricePolish', label: 'Polishing' },
    { control: 'repairPriceStoneReset', label: 'Stone resetting' },
    { control: 'repairPriceRhodium', label: 'Rhodium plating' },
    { control: 'repairPriceChainRepair', label: 'Chain repair' },
    { control: 'repairPriceEngraving', label: 'Engraving' },
    { control: 'repairPriceCleaning', label: 'Professional cleaning' },
    { control: 'repairPriceOther', label: 'Something else' },
  ];

  readonly gstStateCodes = GST_STATE_CODES;

  fieldInvalid(control: string): boolean {
    const c = this.settingsForm.get(control);
    return !!c && c.invalid && (c.dirty || c.touched);
  }

  /** The GSTIN's first two digits are its state; flag a mismatch with the chosen state code. */
  gstinStateMismatch(): boolean {
    const gstin = String(this.settingsForm.get('companyGstin')?.value ?? '');
    const state = String(this.settingsForm.get('companyStateCode')?.value ?? '');
    return gstin.length === 15 && !!state && gstin.slice(0, 2) !== state;
  }

  /** Identifiers are stored the way they print: upper case, no spaces. */
  normaliseTaxField(control: 'companyGstin' | 'companyPan' | 'invoiceSeriesPrefix') {
    const c = this.settingsForm.get(control);
    if (!c) return;
    const next = String(c.value ?? '').toUpperCase().replace(/\s+/g, '');
    if (next !== c.value) c.setValue(next);
  }

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
          // Keys the API has not stored yet come back missing or empty; keep the defaults.
          if (!String(this.settingsForm.get('companyStateCode')?.value ?? '').trim()) {
            this.settingsForm.patchValue({ companyStateCode: DEFAULT_GST_STATE_CODE });
          }
          if (!String(this.settingsForm.get('invoiceSeriesPrefix')?.value ?? '').trim()) {
            this.settingsForm.patchValue({ invoiceSeriesPrefix: DEFAULT_INVOICE_SERIES_PREFIX });
          }
          this.normaliseTaxField('companyGstin');
          this.normaliseTaxField('companyPan');
          this.normaliseTaxField('invoiceSeriesPrefix');
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
    this.normaliseTaxField('companyGstin');
    this.normaliseTaxField('companyPan');
    this.normaliseTaxField('invoiceSeriesPrefix');
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
