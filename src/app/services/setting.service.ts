import { Injectable, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { toSignal } from '@angular/core/rxjs-interop';
import { environment } from '../../environments/environment';

/** Home-page content derived from the `home.*` settings keys, defaults applied. */
export interface HomeContent {
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  /** Empty string when the admin has not uploaded a hero photo: hide the image block. */
  heroImageUrl: string;
  heroImageAlt: string;
  /** Empty string hides the caption line. */
  heroCaptionLabel: string;
  heroCaptionTitle: string;
  heroPrimaryCtaLabel: string;
  heroPrimaryCtaLink: string;
  heroSecondaryCtaLabel: string;
  heroSecondaryCtaLink: string;
  trustBadges: string[];
  simulatorEnabled: boolean;
  simulatorBasePrice: number;
  featuredEyebrow: string;
  featuredTitle: string;
}

/** Storefront defaults used when a `home.*` key is missing or empty (API contract, section 1). */
export const HOME_DEFAULTS: HomeContent = {
  heroEyebrow: 'Fine Jewelry & Solitaire Atelier',
  heroTitle: 'Jewels Forged for Eternity.',
  heroSubtitle: 'Ethical natural diamonds, 18K solid gold, and handcrafted solitaires by master goldsmiths.',
  heroImageUrl: '',
  heroImageAlt: 'Caratloop fine jewelry',
  heroCaptionLabel: '',
  heroCaptionTitle: '',
  heroPrimaryCtaLabel: 'Explore Collections',
  heroPrimaryCtaLink: '/products',
  heroSecondaryCtaLabel: 'Custom Ring Studio',
  heroSecondaryCtaLink: '/builder',
  trustBadges: ['100% BIS Hallmarked', 'GIA Certified Solitaires', 'Insured Delivery'],
  simulatorEnabled: true,
  simulatorBasePrice: 145000,
  featuredEyebrow: 'Haute Joaillerie',
  featuredTitle: 'Curated Masterworks.',
};

type Settings = { [key: string]: string | undefined };

@Injectable({
  providedIn: 'root'
})
export class SettingService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl + '/settings';

  private settingsSubject = new BehaviorSubject<Settings>({
    companyAddress: environment.companyAddress,
    companyPhone: environment.companyPhone,
    companyEmail: environment.companyEmail,
    whatsappNumber: environment.whatsappNumber,
    companyInstagram: environment.companyInstagram,
    companyFacebook: environment.companyFacebook
  });

  /** All public settings as a flat key/value signal. */
  settings = toSignal(this.settingsSubject, { initialValue: this.settingsSubject.value });

  /** Home-page content with storefront defaults applied to every empty key. */
  homeContent = computed<HomeContent>(() => buildHomeContent(this.settings()));

  constructor() {
    this.loadSettings();
  }

  loadSettings() {
    this.http.get<Settings>(this.apiUrl).pipe(
      catchError(() => {
        console.warn('Failed to load settings from API, using defaults');
        return of({} as Settings);
      })
    ).subscribe(settings => {
      if (Object.keys(settings).length > 0) {
        this.settingsSubject.next({ ...this.settingsSubject.value, ...settings });
      }
    });
  }

  getSettings(): Observable<any> {
    return this.settingsSubject.asObservable();
  }
}

function buildHomeContent(settings: Settings): HomeContent {
  const text = (key: keyof HomeContent): string => {
    const value = settings[`home.${key}`];
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed || (HOME_DEFAULTS[key] as string);
  };

  const rawBadges = (settings['home.trustBadges'] ?? '').split('|').map(b => b.trim()).filter(Boolean);
  const rawEnabled = (settings['home.simulatorEnabled'] ?? '').trim().toLowerCase();
  const rawBase = Number((settings['home.simulatorBasePrice'] ?? '').trim());

  return {
    heroEyebrow: text('heroEyebrow'),
    heroTitle: text('heroTitle'),
    heroSubtitle: text('heroSubtitle'),
    heroImageUrl: text('heroImageUrl'),
    heroImageAlt: text('heroImageAlt'),
    heroCaptionLabel: text('heroCaptionLabel'),
    heroCaptionTitle: text('heroCaptionTitle'),
    heroPrimaryCtaLabel: text('heroPrimaryCtaLabel'),
    heroPrimaryCtaLink: text('heroPrimaryCtaLink'),
    heroSecondaryCtaLabel: text('heroSecondaryCtaLabel'),
    heroSecondaryCtaLink: text('heroSecondaryCtaLink'),
    trustBadges: rawBadges.length > 0 ? rawBadges : HOME_DEFAULTS.trustBadges,
    simulatorEnabled: rawEnabled === '' ? HOME_DEFAULTS.simulatorEnabled : rawEnabled === 'true',
    simulatorBasePrice: Number.isFinite(rawBase) && rawBase > 0 ? rawBase : HOME_DEFAULTS.simulatorBasePrice,
    featuredEyebrow: text('featuredEyebrow'),
    featuredTitle: text('featuredTitle'),
  };
}
