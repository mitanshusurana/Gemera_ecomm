import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { SeoService } from '../services/seo.service';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- APPLE DESIGN SYSTEM: ABOUT ATELIER (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pt-[96px] pb-24">
      
      <!-- Top Parchment Hero -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-20 px-6 text-center">
        <div class="max-w-[980px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Heritage & Craft</span>
          <h1 class="font-display font-semibold text-4xl sm:text-5xl md:text-6xl text-[#1d1d1f] tracking-tight">
            Crafting Legacy in Fine Jewelry.
          </h1>
          <p class="text-lg text-[#7a7a7a] mt-4 max-w-2xl mx-auto font-sans">
            Dedicated to master craftsmanship, certified natural gems, and timeless design since 1985.
          </p>
        </div>
      </section>

      <main class="max-w-[1440px] mx-auto px-6 md:px-12 py-16 space-y-16">
        
        <!-- Story Grid -->
        <section class="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <span class="text-xs text-[#D4AF37] uppercase tracking-[0.15em] font-semibold block mb-2">Our Origins</span>
            <h2 class="font-display font-semibold text-3xl md:text-4xl text-[#1d1d1f] mb-6">The House of Gemera</h2>
            <p class="text-sm text-[#7a7a7a] leading-relaxed mb-4">
              Founded in 1985, Gemera was established with a singular directive: to acquire the world's most exceptional conflict-free gemstones and transform them into heirloom solitaires.
            </p>
            <p class="text-sm text-[#7a7a7a] leading-relaxed">
              Every ring, pendant, and bracelet is crafted in solid 18K Gold or Platinum and accompanied by independent GIA laboratory certifications.
            </p>
          </div>

          <div class="bg-[#f5f5f7] rounded-[24px] border border-[#e0e0e0] p-16 flex flex-col items-center justify-center text-center product-surface-shadow">
            <div class="w-20 h-20 text-[#D4AF37] mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M8 14v4M12 14v4M16 14v4" /></svg>
            </div>
            <span class="text-xs text-[#7a7a7a] uppercase font-mono tracking-widest">Geneva & Mumbai Atelier</span>
          </div>
        </section>

        <!-- Dark Atelier Craftsman Tile -->
        <section class="bg-[#1c1c1e] text-white rounded-[24px] p-10 md:p-16 relative overflow-hidden">
          <div class="max-w-[800px]">
            <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Artisanal Standards</span>
            <h2 class="font-display font-semibold text-3xl sm:text-4xl text-white mb-4">Uncompromising Precision.</h2>
            <p class="text-sm text-[#a1a1a6] leading-relaxed mb-8">
              From hand-selecting rare solitaire diamonds to micro-setting every accent stone under magnification, our master goldsmiths execute every detail to microscopic perfection.
            </p>
            <a routerLink="/builder" class="btn-apple-pill">
              Experience Configurator Studio
            </a>
          </div>
        </section>

        <!-- 3 Core Pillars -->
        <section class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <article class="store-utility-card text-center p-8">
            <div class="w-12 h-12 mx-auto text-[#D4AF37] mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M6 3h12l4 6-10 12L2 9l4-6zM2 9h20M12 21L7.5 9 12 3l4.5 6L12 21z" /></svg>
            </div>
            <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] mb-2">GIA / IGI Certified</h3>
            <p class="text-xs text-[#7a7a7a] leading-relaxed">Individually hallmarked and accompanied by world-recognized gemological reports.</p>
          </article>

          <article class="store-utility-card text-center p-8">
            <div class="w-12 h-12 mx-auto text-[#D4AF37] mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M12 22a8 8 0 100-16 8 8 0 000 16zm0-16V2m-3 2h6M9 6l3-4 3 4" /></svg>
            </div>
            <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] mb-2">Master Hand-Crafted</h3>
            <p class="text-xs text-[#7a7a7a] leading-relaxed">Meticulously forged in solid 18K gold and platinum by generational artisans.</p>
          </article>

          <article class="store-utility-card text-center p-8">
            <div class="w-12 h-12 mx-auto text-[#D4AF37] mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="w-full h-full"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
            </div>
            <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] mb-2">Lifetime Authenticity</h3>
            <p class="text-xs text-[#7a7a7a] leading-relaxed">Backed by our lifetime guarantee on metal purity, diamond grading, and setting structure.</p>
          </article>
        </section>

      </main>
    </div>
  `,
})
export class AboutComponent implements OnInit {
  private seoService = inject(SeoService);
  private sanitizer = inject(DomSanitizer);

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

    this.seoService.setJsonLd(schema);
  }
}
