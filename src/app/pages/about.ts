import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-white">
      <!-- Hero Section -->
      <div class="bg-gradient-to-r from-gold-500 to-gold-600 text-white section-padding">
        <div class="container-luxury text-center">
          <h1 class="text-5xl md:text-6xl font-display font-bold mb-4">About Gemara</h1>
          <p class="text-xl text-gold-100 max-w-2xl mx-auto">
            Discover the story behind your finest treasures
          </p>
        </div>
      </div>

      <!-- Brand Story -->
      <section class="container-luxury section-padding">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 class="text-4xl font-display font-bold text-diamond-900 mb-6">Our Heritage</h2>
            <p class="text-gray-700 mb-4 leading-relaxed">
              For over 50 years, Gemara has been the trusted destination for fine gemstones and jewelry. What started as a small family business has grown into an internationally recognized name synonymous with quality, authenticity, and luxury.
            </p>
            <p class="text-gray-700 mb-4 leading-relaxed">
              Every piece in our collection tells a story of craftsmanship, dedication, and passion. We work directly with master artisans and certified gemologists to bring you the finest selections from around the world.
            </p>
            <p class="text-gray-700 leading-relaxed">
              Our commitment to excellence extends beyond our products to every interaction with our customers, ensuring that your experience with Gemara is truly extraordinary.
            </p>
          </div>
          <div class="bg-gradient-to-br from-gold-100 to-diamond-100 rounded-xl h-96 flex items-center justify-center shadow-luxury">
            <span class="text-8xl">✦</span>
          </div>
        </div>
      </section>

      <!-- Values Section -->
      <section class="bg-diamond-50 section-padding">
        <div class="container-luxury">
          <h2 class="text-4xl font-display font-bold text-diamond-900 mb-12 text-center">Our Values</h2>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <!-- Authenticity -->
            <div class="card p-6 text-center hover:shadow-lg transition-all duration-300">
              <div class="text-5xl mb-4">🔍</div>
              <h3 class="font-semibold text-gray-900 mb-3">Authenticity</h3>
              <p class="text-gray-600">Every gemstone and piece is rigorously certified and authenticated by international standards.</p>
            </div>

            <!-- Quality -->
            <div class="card p-6 text-center hover:shadow-lg transition-all duration-300">
              <div class="text-5xl mb-4">💎</div>
              <h3 class="font-semibold text-gray-900 mb-3">Quality</h3>
              <p class="text-gray-600">We maintain the highest standards in selection, craftsmanship, and finishing.</p>
            </div>

            <!-- Ethical Sourcing -->
            <div class="card p-6 text-center hover:shadow-lg transition-all duration-300">
              <div class="text-5xl mb-4">🌍</div>
              <h3 class="font-semibold text-gray-900 mb-3">Ethical Sourcing</h3>
              <p class="text-gray-600">We commit to responsible sourcing that respects both people and the environment.</p>
            </div>

            <!-- Customer Focus -->
            <div class="card p-6 text-center hover:shadow-lg transition-all duration-300">
              <div class="text-5xl mb-4">👥</div>
              <h3 class="font-semibold text-gray-900 mb-3">Customer First</h3>
              <p class="text-gray-600">Your satisfaction and experience are at the heart of everything we do.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- Team Section -->
      <section class="container-luxury section-padding">
        <h2 class="text-4xl font-display font-bold text-diamond-900 mb-12 text-center">Meet Our Team</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <!-- Team Member 1 -->
          <div class="text-center">
            <div class="w-48 h-48 mx-auto bg-gradient-to-br from-gold-100 to-diamond-100 rounded-full flex items-center justify-center mb-4 shadow-lg">
              <span class="text-6xl">👔</span>
            </div>
            <h3 class="font-semibold text-gray-900 mb-2">Rajesh Kumar</h3>
            <p class="text-gold-600 font-semibold mb-2">Founder & CEO</p>
            <p class="text-gray-600 text-sm">50+ years of experience in gemstone expertise and luxury retail.</p>
          </div>

          <!-- Team Member 2 -->
          <div class="text-center">
            <div class="w-48 h-48 mx-auto bg-gradient-to-br from-gold-100 to-diamond-100 rounded-full flex items-center justify-center mb-4 shadow-lg">
              <span class="text-6xl">💼</span>
            </div>
            <h3 class="font-semibold text-gray-900 mb-2">Priya Sharma</h3>
            <p class="text-gold-600 font-semibold mb-2">Head Gemologist</p>
            <p class="text-gray-600 text-sm">Certified GIA expert with 25+ years of authentication experience.</p>
          </div>

          <!-- Team Member 3 -->
          <div class="text-center">
            <div class="w-48 h-48 mx-auto bg-gradient-to-br from-gold-100 to-diamond-100 rounded-full flex items-center justify-center mb-4 shadow-lg">
              <span class="text-6xl">✨</span>
            </div>
            <h3 class="font-semibold text-gray-900 mb-2">Arjun Patel</h3>
            <p class="text-gold-600 font-semibold mb-2">Master Craftsman</p>
            <p class="text-gray-600 text-sm">Award-winning designer creating bespoke jewelry masterpieces.</p>
          </div>

          <!-- Team Member 4 -->
          <div class="text-center">
            <div class="w-48 h-48 mx-auto bg-gradient-to-br from-gold-100 to-diamond-100 rounded-full flex items-center justify-center mb-4 shadow-lg">
              <span class="text-6xl">🎯</span>
            </div>
            <h3 class="font-semibold text-gray-900 mb-2">Anjali Desai</h3>
            <p class="text-gold-600 font-semibold mb-2">Customer Experience</p>
            <p class="text-gray-600 text-sm">Dedicated to ensuring every customer journey is exceptional.</p>
          </div>
        </div>
      </section>

      <!-- Why Choose Us -->
      <section class="bg-diamond-50 section-padding">
        <div class="container-luxury">
          <h2 class="text-4xl font-display font-bold text-diamond-900 mb-12 text-center">Why Choose Gemara</h2>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div class="flex gap-4">
              <span class="text-3xl flex-shrink-0">🏆</span>
              <div>
                <h3 class="font-semibold text-gray-900 mb-2">Certified & Authenticated</h3>
                <p class="text-gray-600">All gemstones come with certificates from leading international certification bodies.</p>
              </div>
            </div>

            <div class="flex gap-4">
              <span class="text-3xl flex-shrink-0">🌟</span>
              <div>
                <h3 class="font-semibold text-gray-900 mb-2">Lifetime Warranty</h3>
                <p class="text-gray-600">We stand behind our products with comprehensive lifetime warranties and free maintenance.</p>
              </div>
            </div>

            <div class="flex gap-4">
              <span class="text-3xl flex-shrink-0">🚚</span>
              <div>
                <h3 class="font-semibold text-gray-900 mb-2">Insured Shipping</h3>
                <p class="text-gray-600">Free insured worldwide shipping on all orders over $10,000.</p>
              </div>
            </div>

            <div class="flex gap-4">
              <span class="text-3xl flex-shrink-0">💰</span>
              <div>
                <h3 class="font-semibold text-gray-900 mb-2">30-Day Guarantee</h3>
                <p class="text-gray-600">Not satisfied? Return within 30 days for a full refund, no questions asked.</p>
              </div>
            </div>

            <div class="flex gap-4">
              <span class="text-3xl flex-shrink-0">🎁</span>
              <div>
                <h3 class="font-semibold text-gray-900 mb-2">Custom Services</h3>
                <p class="text-gray-600">Work with our designers to create your perfect custom piece.</p>
              </div>
            </div>

            <div class="flex gap-4">
              <span class="text-3xl flex-shrink-0">💬</span>
              <div>
                <h3 class="font-semibold text-gray-900 mb-2">Expert Support</h3>
                <p class="text-gray-600">Available 24/7 for consultations, questions, and personalized recommendations.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="container-luxury section-padding text-center">
        <h2 class="text-4xl font-display font-bold text-diamond-900 mb-6">Ready to Find Your Perfect Piece?</h2>
        <p class="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Browse our curated collections and discover the beauty and elegance of Gemara.
        </p>
        <a routerLink="/products" class="btn-primary inline-block px-8 py-4 text-lg">
          Explore Collections
        </a>
      </section>
    </div>
  `,
})
export class AboutComponent {}
