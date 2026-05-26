import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header';
import { FooterComponent } from './components/footer';
import { ToastContainerComponent } from './components/toast-container';
import { ChatWidgetComponent } from './components/chat-widget';
import { WhatsappButtonComponent } from './components/whatsapp-button';
import { routeAnimations } from './app.animations';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, ToastContainerComponent, ChatWidgetComponent, WhatsappButtonComponent],
  animations: [routeAnimations],
  template: `
    <div [innerHTML]="organizationSchema"></div>
    <div class="fixed top-4 left-4 z-[100] md:hidden">
       <!-- Skip Link (Hidden visually, accessible to screen readers) -->
       <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-surface p-4 border border-gold-500 z-[200]">Skip to content</a>
    </div>

    <app-header></app-header>
    <main id="main-content" class="min-h-screen" [@routeAnimations]="o.isActivated ? o.activatedRoute : ''">
      <router-outlet #o="outlet"></router-outlet>
    </main>
    <app-footer></app-footer>
    <app-toast-container></app-toast-container>
    <app-chat-widget></app-chat-widget>
    <app-whatsapp-button></app-whatsapp-button>
  `,
})
export class App {
  organizationSchema: SafeHtml;

  constructor(private sanitizer: DomSanitizer) {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Caratloop",
      "url": "https://www.caratloop.com",
      "logo": "https://www.caratloop.com/assets/logo.png",
      "description": "Backed by a multi-generational gemstone legacy in Jaipur (the world's gemstone hub), Caratloop offers lightweight, premium designer jewelry crafted for the modern professional.",
      "foundingLocation": {
        "@type": "Place",
        "name": "Jaipur, India"
      },
      "sameAs": [
        "https://www.instagram.com/caratloopjewels",
        "https://www.facebook.com/caratloop"
      ]
    };
    this.organizationSchema = this.sanitizer.bypassSecurityTrustHtml(
      '<script type="application/ld+json">' + JSON.stringify(schema).replace(/</g, '\\u003c') + '</script>'
    );
  }
}
