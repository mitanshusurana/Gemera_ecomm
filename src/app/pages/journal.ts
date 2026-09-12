import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-journal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- APPLE DESIGN SYSTEM: JOURNAL (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">
      <!-- Header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-20 px-6 text-center">
        <div class="max-w-[980px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">The Caratloop Journal</span>
          <h1 class="font-display font-semibold text-4xl sm:text-5xl md:text-6xl text-[#1d1d1f] tracking-tight mb-4">
            Stories & Style
          </h1>
          <p class="text-lg text-[#7a7a7a] max-w-2xl mx-auto">
            Expert guides, care tips, and the latest trends from the world of fine jewellery.
          </p>
        </div>
      </section>

      <!-- Featured Article -->
      <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-16">
        <div class="relative rounded-[18px] overflow-hidden group cursor-pointer h-[500px] bg-[#1c1c1e] text-white">
          <div class="absolute inset-0 bg-[#1c1c1e]">
             <!-- Placeholder for Hero Image -->
          </div>
          <div class="absolute bottom-0 left-0 p-8 md:p-12 max-w-3xl">
            <span class="bg-[#D4AF37] text-black text-[11px] font-semibold px-3 py-1 rounded-full uppercase tracking-wider mb-4 inline-block">Featured Guide</span>
            <h2 class="font-display font-semibold text-3xl md:text-4xl text-white tracking-tight mb-4 leading-tight group-hover:text-[#D4AF37] transition-colors">The Ultimate Guide to Buying an Engagement Ring</h2>
            <p class="text-lg text-[#a1a1a6] mb-6">Everything you need to know about the 4Cs, metal choices, and finding the perfect style for your partner.</p>
            <span class="text-[#D4AF37] font-semibold flex items-center gap-2 group-hover:translate-x-2 transition-transform">Read Article <span>→</span></span>
          </div>
        </div>
      </div>

      <!-- Article Grid -->
      <div class="max-w-[1440px] mx-auto px-6 md:px-12 pb-24">
        <div class="mb-16 bg-white p-8 md:p-12 rounded-[18px] border border-[#e0e0e0]">
          <div class="flex flex-col md:flex-row gap-8 items-center md:items-start">
            <div class="w-full md:w-1/3">
              <div class="aspect-[3/4] bg-[#f5f5f7] border border-[#e0e0e0] rounded-[12px] overflow-hidden relative">
                <div class="absolute inset-0 flex items-center justify-center text-8xl">👑</div>
              </div>
            </div>
            <div class="w-full md:w-2/3">
              <h2 class="font-display font-semibold text-3xl text-[#1d1d1f] tracking-tight mb-4">About the Founders: A Jaipur Legacy</h2>
              <div class="space-y-4 text-[#6e6e73] leading-relaxed text-base">
                <p>
                  Caratloop is built on a foundation of multi-generational gemstone expertise originating from <strong class="text-[#1d1d1f]">Jaipur, India</strong>—the undisputed gemstone capital of the world. For decades, our family has been at the forefront of sourcing, cutting, and trading the finest precious stones, establishing a reputation for uncompromising quality and ethical practices.
                </p>
                <p>
                  Today, we bridge this deep-rooted traditional knowledge with modern transparency. As a team combining certified gemstone expertise with backgrounds in CMA and Software Engineering, we ensure that every piece of Caratloop jewelry is not only a masterpiece of traditional craftsmanship but also a paragon of modern reliability and value.
                </p>
                <div class="pt-4 border-t border-[#e0e0e0]">
                  <h3 class="font-sans font-semibold text-[#1d1d1f] mb-2">Why Choose Caratloop?</h3>
                  <ul class="list-disc pl-5 space-y-2 text-sm">
                    <li><strong class="text-[#1d1d1f]">Direct from Source:</strong> Eliminating middlemen by sourcing directly from Jaipur's finest artisans.</li>
                    <li><strong class="text-[#1d1d1f]">Certified Authenticity:</strong> Every gemstone undergoes rigorous lab testing and certification.</li>
                    <li><strong class="text-[#1d1d1f]">Modern Transparency:</strong> Clear, upfront pricing with comprehensive breakdown of costs.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <!-- Article 1 -->
          <article class="card card-hover group cursor-pointer !p-0 overflow-hidden">
            <div class="h-64 bg-[#f5f5f7] border-b border-[#e0e0e0] relative overflow-hidden">
               <div class="w-full h-full flex items-center justify-center text-6xl">💎</div>
            </div>
            <div class="p-6">
              <p class="text-xs uppercase tracking-[0.15em] font-semibold text-[#D4AF37] mb-2">Gemstone Care</p>
              <h3 class="font-sans font-semibold text-xl text-[#1d1d1f] mb-3 group-hover:text-[#D4AF37] transition-colors">How to Care for Your Emeralds</h3>
              <p class="text-[#6e6e73] text-sm mb-4 line-clamp-2">Emeralds are precious but require special care. Learn the do's and don'ts of cleaning and storing.</p>
              <span class="text-sm font-semibold text-[#D4AF37] group-hover:underline">Read More</span>
            </div>
          </article>

          <!-- Article 2 -->
          <article class="card card-hover group cursor-pointer !p-0 overflow-hidden">
            <div class="h-64 bg-[#f5f5f7] border-b border-[#e0e0e0] relative overflow-hidden">
               <div class="w-full h-full flex items-center justify-center text-6xl">🏆</div>
            </div>
            <div class="p-6">
              <p class="text-xs uppercase tracking-[0.15em] font-semibold text-[#D4AF37] mb-2">Style Edit</p>
              <h3 class="font-sans font-semibold text-xl text-[#1d1d1f] mb-3 group-hover:text-[#D4AF37] transition-colors">Top 5 Trends for 2025</h3>
              <p class="text-[#6e6e73] text-sm mb-4 line-clamp-2">From vintage revivals to colorful stones, discover what's trending in the world of high jewelry.</p>
              <span class="text-sm font-semibold text-[#D4AF37] group-hover:underline">Read More</span>
            </div>
          </article>

          <!-- Article 3 -->
          <article class="card card-hover group cursor-pointer !p-0 overflow-hidden">
            <div class="h-64 bg-[#f5f5f7] border-b border-[#e0e0e0] relative overflow-hidden">
               <div class="w-full h-full flex items-center justify-center text-6xl">💍</div>
            </div>
            <div class="p-6">
              <p class="text-xs uppercase tracking-[0.15em] font-semibold text-[#D4AF37] mb-2">Education</p>
              <h3 class="font-sans font-semibold text-xl text-[#1d1d1f] mb-3 group-hover:text-[#D4AF37] transition-colors">Platinum vs. White Gold</h3>
              <p class="text-[#6e6e73] text-sm mb-4 line-clamp-2">Understanding the differences in durability, cost, and maintenance to make the right choice.</p>
              <span class="text-sm font-semibold text-[#D4AF37] group-hover:underline">Read More</span>
            </div>
          </article>
        </div>
      </div>
    </div>
  `
})
export class JournalComponent {}
