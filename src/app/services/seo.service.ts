import { Injectable, inject, RendererFactory2 } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private meta = inject(Meta);
  private title = inject(Title);
  private document = inject(DOCUMENT);
  private rendererFactory = inject(RendererFactory2);
  private renderer = this.rendererFactory.createRenderer(null, null);

  updateTags(config: { title: string, description: string, image?: string, url?: string }) {
    this.title.setTitle(config.title);

    // Standard Meta
    this.meta.updateTag({ name: 'description', content: config.description });

    // Open Graph
    this.meta.updateTag({ property: 'og:title', content: config.title });
    this.meta.updateTag({ property: 'og:description', content: config.description });
    if (config.image) {
        this.meta.updateTag({ property: 'og:image', content: config.image });
    }
    if (config.url) {
        this.meta.updateTag({ property: 'og:url', content: config.url });
        this.setCanonicalURL(config.url);
    }
    this.meta.updateTag({ property: 'og:type', content: 'website' });

    // Twitter
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: config.title });
    this.meta.updateTag({ name: 'twitter:description', content: config.description });
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

  setJsonLd(schema: any) {
    const head = this.document.getElementsByTagName('head')[0];
    let element: HTMLScriptElement | null = this.document.querySelector(`script[type='application/ld+json']`);
    if (!element) {
      element = this.renderer.createElement('script');
      this.renderer.setAttribute(element, 'type', 'application/ld+json');
      this.renderer.appendChild(head, element);
    }
    this.renderer.setProperty(element, 'text', JSON.stringify(schema));
  }
}
