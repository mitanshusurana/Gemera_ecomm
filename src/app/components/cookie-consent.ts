import {
  Component,
  OnInit,
  PLATFORM_ID,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';

export type ConsentState = 'accepted' | 'rejected' | null;

const STORAGE_KEY = 'caratloop_cookie_consent';

/**
 * Cookie / tracking consent.
 *
 * There was none anywhere on the site, while the visitor's IP was sent to
 * ipapi.co on first paint for currency detection, and Google Fonts loaded
 * before any interaction. Under the DPDP Act 2023 consent must be obtained
 * before processing, and it must be as easy to refuse as to give -- so
 * "Decline" is a peer of "Accept" here, not a hidden link.
 *
 * Nothing non-essential should run until `hasConsent()` is true. CurrencyService
 * checks this before its geo lookup.
 */
@Component({
  selector: 'app-cookie-consent',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div
      *ngIf="visible()"
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-describedby="cookie-consent-body"
      class="fixed bottom-0 left-0 right-0 z-[60] border-t border-[#e0e0e0] bg-white/95 backdrop-blur-md"
    >
      <div
        class="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="min-w-0">
          <p
            id="cookie-consent-title"
            class="text-sm font-semibold text-[#1d1d1f]"
          >
            Your privacy
          </p>
          <p id="cookie-consent-body" class="mt-1 text-xs text-[#7a7a7a]">
            We use essential cookies to keep the site working. With your
            consent we also detect your region to show prices in your currency,
            which shares your IP address with a third-party service. You can
            decline and everything essential still works.
            <a routerLink="/privacy" class="underline">Privacy notice</a>.
          </p>
        </div>

        <div class="flex shrink-0 gap-3">
          <button
            type="button"
            (click)="decide('rejected')"
            class="rounded-full border border-[#e0e0e0] px-5 py-2 text-xs font-semibold text-[#1d1d1f] hover:bg-[#f5f5f7]"
          >
            Decline
          </button>
          <button
            type="button"
            (click)="decide('accepted')"
            class="rounded-full bg-[#1d1d1f] px-5 py-2 text-xs font-semibold text-white hover:bg-black"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  `,
})
export class CookieConsentComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  visible = signal(false);

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.visible.set(readConsent() === null);
  }

  decide(state: Exclude<ConsentState, null>): void {
    try {
      localStorage.setItem(STORAGE_KEY, state);
    } catch {
      /* storage unavailable; the banner simply reappears next visit */
    }
    this.visible.set(false);
  }
}

/** Current choice, or null if the visitor has not decided yet. */
export function readConsent(): ConsentState {
  if (typeof localStorage === 'undefined') return null;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'accepted' || v === 'rejected' ? v : null;
  } catch {
    return null;
  }
}

/** True only on an explicit opt-in. Absence of a choice is not consent. */
export function hasConsent(): boolean {
  return readConsent() === 'accepted';
}
