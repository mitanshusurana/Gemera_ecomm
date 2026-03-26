import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-journal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-white">
      <!-- Header -->
      <div class="bg-diamond-50 border-b border-diamond-200 section-padding">
        <div class="container-luxury text-center">
          <p class="text-gold-600 uppercase tracking-widest font-bold text-sm mb-2">The Caratloop Journal</p>
          <h1 class="text-5xl md:text-6xl font-display font-bold text-diamond-900 mb-4">
            Stories & Style
          </h1>
          <p class="text-lg text-gray-600 max-w-2xl mx-auto">
            Expert guides, care tips, and the latest trends from the world of fine jewellery.
          </p>
        </div>
      </div>

      <!-- Featured Article -->
      <div class="container-luxury section-padding">
        <div class="relative rounded-2xl overflow-hidden shadow-xl group cursor-pointer h-[500px]">
          <div class="absolute inset-0 bg-gray-900">
             <!-- Placeholder for Hero Image -->
             <div class="w-full h-full bg-gradient-to-r from-gray-800 to-gray-900 opacity-50"></div>
          </div>
          <div class="absolute bottom-0 left-0 p-8 md:p-12 text-white max-w-3xl">
            <span class="bg-gold-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-4 inline-block">Featured Guide</span>
            <h2 class="text-4xl font-display font-bold mb-4 leading-tight group-hover:text-gold-200 transition-colors">The Ultimate Guide to Buying an Engagement Ring</h2>
            <p class="text-lg text-gray-200 mb-6">Everything you need to know about the 4Cs, metal choices, and finding the perfect style for your partner.</p>
            <span class="text-gold-400 font-bold flex items-center gap-2 group-hover:translate-x-2 transition-transform">Read Article <span>→</span></span>
          </div>
        </div>
      </div>

      <!-- Article Grid -->
      <div class="container-luxury pb-24">
        <div class="mb-16 bg-gray-50 p-8 md:p-12 rounded-2xl border border-gray-100 shadow-sm">
          <div class="flex flex-col md:flex-row gap-8 items-center md:items-start">
            <div class="w-full md:w-1/3">
              <div class="aspect-[3/4] bg-diamond-100 rounded-xl overflow-hidden relative">
                <div class="absolute inset-0 flex items-center justify-center text-8xl">👑</div>
              </div>
            </div>
            <div class="w-full md:w-2/3">
              <h2 class="text-3xl font-display font-bold text-primary-900 mb-4">About the Founders: A Jaipur Legacy</h2>
              <div class="space-y-4 text-gray-700 leading-relaxed text-lg">
                <p>
                  Caratloop is built on a foundation of multi-generational gemstone expertise originating from <strong>Jaipur, India</strong>—the undisputed gemstone capital of the world. For decades, our family has been at the forefront of sourcing, cutting, and trading the finest precious stones, establishing a reputation for uncompromising quality and ethical practices.
                </p>
                <p>
                  Today, we bridge this deep-rooted traditional knowledge with modern transparency. As a team combining certified gemstone expertise with backgrounds in CMA and Software Engineering, we ensure that every piece of Caratloop jewelry is not only a masterpiece of traditional craftsmanship but also a paragon of modern reliability and value.
                </p>
                <div class="pt-4 border-t border-gray-200">
                  <h3 class="font-bold text-primary-900 mb-2">Why Choose Caratloop?</h3>
                  <ul class="list-disc pl-5 space-y-2 text-base">
                    <li><strong>Direct from Source:</strong> Eliminating middlemen by sourcing directly from Jaipur's finest artisans.</li>
                    <li><strong>Certified Authenticity:</strong> Every gemstone undergoes rigorous lab testing and certification.</li>
                    <li><strong>Modern Transparency:</strong> Clear, upfront pricing with comprehensive breakdown of costs.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <!-- Article 1 -->
          <article class="card card-hover group cursor-pointer">
            <div class="h-64 bg-diamond-100 relative overflow-hidden">
               <div class="w-full h-full flex items-center justify-center text-6xl">💎</div>
            </div>
            <div class="p-6">
              <p class="text-xs text-gold-600 font-bold uppercase mb-2">Gemstone Care</p>
              <h3 class="text-xl font-bold text-gray-900 mb-3 group-hover:text-gold-600 transition-colors">How to Care for Your Emeralds</h3>
              <p class="text-gray-600 text-sm mb-4 line-clamp-2">Emeralds are precious but require special care. Learn the do's and don'ts of cleaning and storing.</p>
              <span class="text-sm font-semibold underline">Read More</span>
            </div>
          </article>

          <!-- Article 2 -->
          <article class="card card-hover group cursor-pointer">
            <div class="h-64 bg-diamond-100 relative overflow-hidden">
               <div class="w-full h-full flex items-center justify-center text-6xl">🏆</div>
            </div>
            <div class="p-6">
              <p class="text-xs text-gold-600 font-bold uppercase mb-2">Style Edit</p>
              <h3 class="text-xl font-bold text-gray-900 mb-3 group-hover:text-gold-600 transition-colors">Top 5 Trends for 2025</h3>
              <p class="text-gray-600 text-sm mb-4 line-clamp-2">From vintage revivals to colorful stones, discover what's trending in the world of high jewelry.</p>
              <span class="text-sm font-semibold underline">Read More</span>
            </div>
          </article>

          <!-- Article 3 -->
          <article class="card card-hover group cursor-pointer">
            <div class="h-64 bg-diamond-100 relative overflow-hidden">
               <div class="w-full h-full flex items-center justify-center text-6xl">💍</div>
            </div>
            <div class="p-6">
              <p class="text-xs text-gold-600 font-bold uppercase mb-2">Education</p>
              <h3 class="text-xl font-bold text-gray-900 mb-3 group-hover:text-gold-600 transition-colors">Platinum vs. White Gold</h3>
              <p class="text-gray-600 text-sm mb-4 line-clamp-2">Understanding the differences in durability, cost, and maintenance to make the right choice.</p>
              <span class="text-sm font-semibold underline">Read More</span>
            </div>
          </article>
        </div>
      </div>
    </div>
  `
})
export class JournalComponent {}
