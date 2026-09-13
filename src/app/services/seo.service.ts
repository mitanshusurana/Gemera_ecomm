import { Injectable, inject, RendererFactory2 } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { SettingService } from './setting.service';

/** Used when the `site.baseUrl` setting is absent (the storefront's historical hardcoded origin). */
export const DEFAULT_SITE_ORIGIN = 'https://www.caratloop.com';

/** Meta tags that only make sense on a product page; removed on every navigation. */
const PRODUCT_META_PROPERTIES = ['product:price:amount', 'product:price:currency'];

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private meta = inject(Meta);
  private title = inject(Title);
  private document = inject(DOCUMENT);
  private rendererFactory = inject(RendererFactory2);
  private renderer = this.rendererFactory.createRenderer(null, null);
  private settingService = inject(SettingService);
  private router = inject(Router);

  constructor() {
    // Page-scoped structured data used to persist onto every page visited
    // afterwards because nothing removed it. Clear it as a navigation starts,
    // before the next page's component runs and sets its own.
    // Query-only changes (?category=, ?page=) keep the same component, which
    // does not re-run ngOnInit, so only a change of path clears.
    this.router.events
      .pipe(filter((e): e is NavigationStart => e instanceof NavigationStart))
      .subscribe((e) => {
        if (pathOf(e.url) !== pathOf(this.router.url)) this.clearPageScopedTags();
      });
  }

  /**
   * Canonical site origin without a trailing slash: the `site.baseUrl` setting
   * when the admin has set one, else the default. Absolute URLs in structured
   * data and Open Graph tags are built from it.
   */
  siteOrigin(): string {
    const raw = this.settingService.settings()['site.baseUrl'];
    const trimmed = typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
    return /^https?:\/\/[^\s/]+$/i.test(trimmed) ? trimmed : DEFAULT_SITE_ORIGIN;
  }

  /** `/products/1` or `assets/x.jpg` -> `https://origin/...`; already-absolute URLs are returned untouched. */
  absoluteUrl(pathOrUrl: string | undefined | null): string {
    const value = (pathOrUrl ?? '').trim();
    if (!value) return '';
    if (/^(https?:)?\/\//i.test(value) || /^data:/i.test(value)) return value;
    return `${this.siteOrigin()}/${value.replace(/^\/+/, '')}`;
  }

  updateTags(config: { title: string, description: string, image?: string, url?: string, type?: string }) {
    this.title.setTitle(config.title);

    // Standard Meta
    this.meta.updateTag({ name: 'description', content: config.description });

    // Open Graph
    this.meta.updateTag({ property: 'og:title', content: config.title });
    this.meta.updateTag({ property: 'og:description', content: config.description });
    if (config.image) {
        this.meta.updateTag({ property: 'og:image', content: this.absoluteUrl(config.image) });
    }
    if (config.url) {
        this.meta.updateTag({ property: 'og:url', content: config.url });
        this.setCanonicalURL(config.url);
    }
    this.meta.updateTag({ property: 'og:type', content: config.type || 'website' });

    // Twitter
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: config.title });
    this.meta.updateTag({ name: 'twitter:description', content: config.description });
  }

  /** Open Graph product price tags (`og:type` product is set through updateTags' `type`). */
  setProductMeta(price: number | undefined | null, currency = 'INR') {
    if (price === undefined || price === null || !Number.isFinite(Number(price))) {
      this.removeProductMeta();
      return;
    }
    this.meta.updateTag({ property: 'product:price:amount', content: String(price) });
    this.meta.updateTag({ property: 'product:price:currency', content: currency });
  }

  removeProductMeta() {
    for (const property of PRODUCT_META_PROPERTIES) {
      this.meta.removeTag(`property='${property}'`);
    }
  }

  setCanonicalURL(url: string) {
    const head = this.document.getElementsByTagName('head')[0];
    let element: HTMLLinkElement | null = this.document.querySelector(`link[rel='canonical']`);
    if (!element) {
      element = this.renderer.createElement('link');
      this.renderer.setAttribute(element, 'rel', 'canonical');
      this.renderer.appendChild(head, element);
    }
    this.renderer.setAttribute(element, 'href', url);
  }

  /**
   * Writes one JSON-LD block per `key` (`data-seo="<key>"`). The default key
   * keeps existing callers on a single "page" block; product pages add a
   * second "breadcrumb" block, the listing an "itemlist" block.
   */
  setJsonLd(schema: any, key = 'page') {
    const head = this.document.getElementsByTagName('head')[0];
    // Scope to <head> and to our own tag. The unscoped selector matched the
    // Organization schema that app.ts injects into the body, so product
    // schema overwrote it.
    let element: HTMLScriptElement | null = head.querySelector(
      `script[type='application/ld+json'][data-seo='${key}']`,
    );
    if (!element) {
      element = this.renderer.createElement('script');
      this.renderer.setAttribute(element, 'type', 'application/ld+json');
      this.renderer.setAttribute(element, 'data-seo', key);
      this.renderer.appendChild(head, element);
    }
    // `</script>` inside a string value would end the block early.
    this.renderer.setProperty(element, 'text', JSON.stringify(schema).replace(/</g, '\\u003c'));
  }

  removeJsonLd(key: string) {
    const head = this.document.getElementsByTagName('head')[0];
    const element = head.querySelector(`script[type='application/ld+json'][data-seo='${key}']`);
    if (element) this.renderer.removeChild(head, element);
  }

  private clearPageScopedTags() {
    const head = this.document.getElementsByTagName('head')[0];
    if (!head) return;
    head.querySelectorAll(`script[type='application/ld+json'][data-seo]`).forEach((el) => {
      this.renderer.removeChild(head, el);
    });
    this.removeProductMeta();
  }
}

/** `/products/12?x=1#y` -> `/products/12`. */
function pathOf(url: string): string {
  return (url || '').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
}
