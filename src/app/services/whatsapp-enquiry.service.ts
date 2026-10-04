import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { SettingService } from './setting.service';

/**
 * What the shopper is looking at when they tap a WhatsApp button. The product
 * page sets a `product` context while it is open; the order confirmation sets
 * an `order` one; everything else falls back to the current page.
 */
export interface WhatsappContext {
  kind: 'product' | 'order' | 'page';
  /** Product name, or a page title for the generic case. */
  title?: string;
  sku?: string;
  /** Already formatted in the shopper's currency. */
  price?: string;
  /** Absolute URL of the thing being asked about. */
  url?: string;
  orderNumber?: string;
}

interface Arrival {
  source?: string;
  medium?: string;
  campaign?: string;
  referrer?: string;
  landing?: string;
}

const ARRIVAL_KEY = 'caratloop.arrival';

/**
 * Builds the wa.me links used by every WhatsApp button on the storefront.
 *
 * Every link used to open the chat with "Hello! I would like to inquire about
 * your products." (or no text at all), so the shop could not tell which piece
 * the customer meant or where they had come from. The message now names the
 * product with its SKU, price and link (or the order number, or the page), and
 * ends with a short tag such as "via website · Instagram" derived from the
 * first page of the visit: `utm_source` when a campaign link was used, else the
 * referring site. The tag is remembered for the browser session only.
 */
@Injectable({ providedIn: 'root' })
export class WhatsappEnquiryService {
  private settingService = inject(SettingService);
  private router = inject(Router);
  private platformId = inject(PLATFORM_ID);

  /** Set by pages that know what the shopper is looking at; null means "generic page". */
  readonly pageContext = signal<WhatsappContext | null>(null);

  /** Current router URL as a signal so OnPush buttons re-render on navigation. */
  private readonly routeUrl = signal<string>('/');

  /** Business number, digits only, from admin settings with the build-time fallback. */
  readonly number = computed(() => {
    const raw = this.settingService.settings()['whatsappNumber'] || environment.whatsappNumber || '';
    return String(raw).replace(/\D/g, '');
  });

  constructor() {
    this.routeUrl.set(this.router.url || '/');
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => this.routeUrl.set(e.urlAfterRedirects || e.url));
  }

  /**
   * Record where this visit came from, once per browser session. Called from
   * the app shell on startup; a no-op during SSR and when already recorded.
   */
  rememberArrival(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      if (sessionStorage.getItem(ARRIVAL_KEY)) return;
      const params = new URLSearchParams(window.location.search);
      const arrival: Arrival = {
        source: params.get('utm_source') || undefined,
        medium: params.get('utm_medium') || undefined,
        campaign: params.get('utm_campaign') || undefined,
        referrer: document.referrer || undefined,
        landing: window.location.pathname,
      };
      sessionStorage.setItem(ARRIVAL_KEY, JSON.stringify(arrival));
    } catch {
      /* storage unavailable (private mode, blocked): the tag is simply omitted */
    }
  }

  /** "Instagram", "Google", a utm_source value, or null when the visit was direct. */
  arrivalLabel(): string | null {
    if (!isPlatformBrowser(this.platformId)) return null;
    let arrival: Arrival | null = null;
    try {
      const raw = sessionStorage.getItem(ARRIVAL_KEY);
      arrival = raw ? (JSON.parse(raw) as Arrival) : null;
    } catch {
      return null;
    }
    if (!arrival) return null;
    if (arrival.source) {
      const s = arrival.source.trim();
      return arrival.campaign ? `${s} · ${arrival.campaign.trim()}` : s;
    }
    if (arrival.referrer) {
      try {
        const host = new URL(arrival.referrer).hostname.replace(/^www\./, '').toLowerCase();
        if (!host || host === window.location.hostname.replace(/^www\./, '').toLowerCase()) return null;
        if (host.includes('instagram')) return 'Instagram';
        if (host.includes('facebook') || host === 'fb.com' || host.includes('l.facebook')) return 'Facebook';
        if (host.includes('google')) return 'Google';
        if (host.includes('youtube')) return 'YouTube';
        if (host.includes('whatsapp')) return 'WhatsApp';
        if (host.includes('pinterest')) return 'Pinterest';
        if (host.includes('bing')) return 'Bing';
        return host;
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Absolute URL of the current page; the canonical origin during SSR. */
  currentUrl(): string {
    const path = this.routeUrl() || '/';
    if (isPlatformBrowser(this.platformId) && typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}${path}`;
    }
    return `https://www.caratloop.com${path}`;
  }

  /** The chat opener for a context, or for the current page when none is given. */
  message(ctx?: WhatsappContext | null): string {
    const c = ctx ?? this.pageContext() ?? { kind: 'page' as const, url: this.currentUrl() };
    const lines: string[] = [];
    if (c.kind === 'product') {
      lines.push("Hi Caratloop! I'd like to enquire about this piece:");
      const sku = c.sku ? ` (SKU ${c.sku})` : '';
      const price = c.price ? ` – ${c.price}` : '';
      lines.push(`${c.title || 'Product'}${sku}${price}`);
      if (c.url) lines.push(c.url);
    } else if (c.kind === 'order') {
      lines.push(`Hi Caratloop! I have a question about my order ${c.orderNumber || ''}`.trim() + '.');
      if (c.url) lines.push(c.url);
    } else {
      lines.push("Hi Caratloop! I'd like to enquire about your products.");
      const url = c.url || this.currentUrl();
      if (url) lines.push(`Page: ${url}`);
    }
    const from = this.arrivalLabel();
    lines.push(from ? `— via website · ${from}` : '— via website');
    return lines.join('\n');
  }

  /** wa.me link to the business number carrying the contextual message. */
  link(ctx?: WhatsappContext | null): string {
    const num = this.number();
    const text = encodeURIComponent(this.message(ctx));
    return num ? `https://wa.me/${num}?text=${text}` : `https://wa.me/?text=${text}`;
  }

  /** Reactive link for the floating button: follows the page context and the route. */
  readonly currentLink = computed(() => {
    this.routeUrl();
    return this.link(this.pageContext());
  });
}
