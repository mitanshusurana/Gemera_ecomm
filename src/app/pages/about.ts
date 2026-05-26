import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-surface">
      <div class="bg-diamond-50 py-12 md:py-20">
        <div class="container-luxury text-center">
          <h1 class="text-4xl md:text-6xl font-display font-bold text-diamond-900 mb-6">About Caratloop</h1>
          <p class="text-xl text-ink max-w-2xl mx-auto">Crafting eternal beauty with ethically sourced gemstones and master artisanship.</p>
        </div>
      </div>

      <div class="container-luxury section-padding">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-12 items-center mb-20">
          <div>
            <h2 class="text-3xl font-display font-bold text-diamond-900 mb-6">Our Story</h2>
            <p class="text-ink leading-relaxed mb-4">
              Founded in 1985, Caratloop began with a singular vision: to bring the world's most exquisite gemstones to discerning collectors and jewelry lovers.
              Our journey started in a small workshop where passion for precision and eye for beauty were the only tools we had.
            </p>
            <p class="text-ink leading-relaxed">
              Today, we are a global brand known for integrity, quality, and timeless design. Every piece in our collection tells a story of the earth's history,
              refined by human hands into a symbol of love and legacy.
            </p>
          </div>
          <div class="bg-diamond-100 h-96 rounded-xl flex items-center justify-center">
             <span class="text-6xl">🏰</span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
            <div class="text-center p-8 bg-diamond-50 rounded-xl">
                <div class="text-4xl mb-4">💎</div>
                <h3 class="font-bold text-xl mb-3">Ethically Sourced</h3>
                <p class="text-ink">We guarantee that all our gemstones are conflict-free and sourced with respect for the environment and communities.</p>
            </div>
            <div class="text-center p-8 bg-diamond-50 rounded-xl">
                <div class="text-4xl mb-4">🖐️</div>
                <h3 class="font-bold text-xl mb-3">Handcrafted</h3>
                <p class="text-ink">Each piece is meticulously crafted by master artisans who have dedicated their lives to the art of jewelry making.</p>
            </div>
            <div class="text-center p-8 bg-diamond-50 rounded-xl">
                <div class="text-4xl mb-4">🛡️</div>
                <h3 class="font-bold text-xl mb-3">Lifetime Warranty</h3>
                <p class="text-ink">We stand behind the quality of our jewelry with a comprehensive lifetime warranty on craftsmanship.</p>
            </div>
        </div>
      </div>
    </div>
    <div [innerHTML]="schemaHtml"></div>
  `,
})
export class AboutComponent implements OnInit {
  private seoService = inject(SeoService);
  private sanitizer = inject(DomSanitizer);

  schemaHtml: SafeHtml = '';

  ngOnInit() {
    this.seoService.updateTags({
      title: 'About Us | Caratloop',
      description: 'Learn about Caratloop, our story, ethically sourced gemstones, and master artisanship in fine jewelry.'
    });

    const schema = {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Caratloop",
      "url": "https://www.caratloop.com",
      "logo": "https://www.caratloop.com/logo.svg",
      "description": "Crafting eternal beauty with ethically sourced gemstones and master artisanship.",
      "foundingDate": "1985"
    };

    this.schemaHtml = this.sanitizer.bypassSecurityTrustHtml(
      '<script type="application/ld+json">' + JSON.stringify(schema).replace(/</g, '\\u003c') + '</script>'
    );
  }
}
