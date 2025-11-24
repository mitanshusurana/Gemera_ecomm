import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  category: string;
  rating: number;
  reviews: number;
  badge?: string;
}

interface Category {
  id: string;
  name: string;
  image: string;
  productCount: number;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <!-- Hero Section -->
    <section class="relative h-screen flex items-center justify-center overflow-hidden bg-gradient-luxury">
      <!-- Background Elements -->
      <div class="absolute inset-0 overflow-hidden">
        <div class="absolute top-20 right-20 w-72 h-72 bg-gold-500/10 rounded-full blur-3xl"></div>
        <div class="absolute bottom-20 left-20 w-96 h-96 bg-sapphire-500/10 rounded-full blur-3xl"></div>
      </div>

      <div class="container-luxury relative z-10 text-white text-center">
        <div class="inline-block mb-6 px-4 py-2 bg-gold-500/20 rounded-full border border-gold-400/50 backdrop-blur-sm">
          <span class="text-sm font-semibold text-gold-200">Luxury Jewellery Collection</span>
        </div>
        <h1 class="text-5xl md:text-7xl font-display font-bold mb-6 leading-tight">
          Timeless Elegance Meets Modern Luxury
        </h1>
        <p class="text-xl md:text-2xl text-gray-200 max-w-2xl mx-auto mb-8 leading-relaxed">
          Discover our exquisite collection of finest gemstones and handcrafted jewellery, certified and authenticated for perfection.
        </p>
        <div class="flex flex-col sm:flex-row gap-4 justify-center">
          <a routerLink="/products" class="btn-primary text-lg py-4 px-8">
            Explore Collection
          </a>
          <button class="btn-outline text-lg py-4 px-8">
            Discover More
          </button>
        </div>
      </div>
    </section>

    <!-- Categories Showcase -->
    <section id="categories" class="section-padding bg-white">
      <div class="container-luxury">
        <div class="text-center mb-16">
          <h2 class="text-4xl md:text-5xl font-display font-bold text-diamond-900 mb-4">
            Our Collections
          </h2>
          <p class="text-lg text-gray-600 max-w-2xl mx-auto">
            Explore our finest selections of diamonds, gemstones, and precious metals
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div *ngFor="let category of categories" class="group relative overflow-hidden rounded-xl h-80 cursor-pointer">
            <!-- Category Image -->
            <div class="absolute inset-0 bg-cover bg-center group-hover:scale-110 transition-transform duration-500">
              <div class="w-full h-full bg-gradient-to-br from-gold-100 to-gold-50 flex items-center justify-center">
                <span class="text-6xl">{{ getCategoryEmoji(category.name) }}</span>
              </div>
            </div>

            <!-- Overlay -->
            <div class="absolute inset-0 bg-gradient-to-t from-diamond-900/80 via-transparent to-transparent group-hover:from-diamond-900/90"></div>

            <!-- Content -->
            <div class="absolute inset-0 flex flex-col justify-end p-8 text-white">
              <h3 class="font-display text-3xl font-bold mb-2">{{ category.name }}</h3>
              <p class="text-sm text-gray-200 mb-4">{{ category.productCount }}+ items available</p>
              <div class="inline-flex items-center text-gold-400 group-hover:text-gold-300 transition-colors duration-300">
                <span class="text-sm font-semibold">Explore Collection</span>
                <svg class="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Featured Products -->
    <section class="section-padding bg-diamond-50">
      <div class="container-luxury">
        <div class="flex flex-col md:flex-row md:items-end md:justify-between gap-8 mb-16">
          <div>
            <h2 class="text-4xl md:text-5xl font-display font-bold text-diamond-900 mb-4">
              Featured Jewels
            </h2>
            <p class="text-lg text-gray-600">
              Handpicked selections from our most exclusive collections
            </p>
          </div>
          <a routerLink="/products" class="btn-outline">
            View All Products
          </a>
        </div>

        <!-- Products Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div *ngFor="let product of featuredProducts" class="card card-hover group overflow-hidden">
            <!-- Product Image -->
            <div class="relative overflow-hidden h-72 bg-diamond-100">
              <div class="w-full h-full bg-gradient-to-br from-gold-100 to-gold-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
                <span class="text-5xl">{{ getProductEmoji(product.category) }}</span>
              </div>

              <!-- Badge -->
              <div *ngIf="product.badge" class="absolute top-4 right-4">
                <span class="badge badge-gold">{{ product.badge }}</span>
              </div>

              <!-- Wishlist Button -->
              <button class="absolute top-4 left-4 w-10 h-10 bg-white/90 hover:bg-gold-500 hover:text-white rounded-lg flex items-center justify-center transition-all duration-300 shadow-md">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                </svg>
              </button>
            </div>

            <!-- Product Details -->
            <div class="p-6">
              <div class="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p class="text-xs text-gold-600 font-semibold uppercase tracking-wider mb-1">{{ product.category }}</p>
                  <h3 class="font-semibold text-gray-900 line-clamp-2">{{ product.name }}</h3>
                </div>
              </div>

              <!-- Rating -->
              <div class="flex items-center gap-2 mb-4">
                <div class="flex gap-1">
                  <span *ngFor="let _ of [1,2,3,4,5]" class="text-gold-500 text-xs">★</span>
                </div>
                <span class="text-xs text-gray-600">({{ product.reviews }} reviews)</span>
              </div>

              <!-- Price -->
              <div class="mb-4">
                <div class="flex items-baseline gap-2">
                  <span class="text-2xl font-bold text-diamond-900">{{ formatPrice(product.price) }}</span>
                  <span *ngIf="product.originalPrice" class="text-sm text-gray-500 line-through">{{ formatPrice(product.originalPrice) }}</span>
                </div>
              </div>

              <!-- Add to Cart Button -->
              <button class="w-full btn-primary">
                Add to Cart
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Trust & Certifications -->
    <section class="section-padding bg-white">
      <div class="container-luxury">
        <div class="text-center mb-16">
          <h2 class="text-4xl md:text-5xl font-display font-bold text-diamond-900 mb-4">
            Certified & Trusted
          </h2>
          <p class="text-lg text-gray-600 max-w-2xl mx-auto">
            All our gemstones come with authentic certifications from world-renowned laboratories
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div class="card p-8 text-center hover:shadow-luxury transition-shadow duration-300">
            <div class="w-16 h-16 bg-gold-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-2xl">🔐</span>
            </div>
            <h3 class="font-display text-xl font-bold text-diamond-900 mb-2">GIA Certified</h3>
            <p class="text-sm text-gray-600">Gemological Institute of America - industry's most trusted certification</p>
          </div>

          <div class="card p-8 text-center hover:shadow-luxury transition-shadow duration-300">
            <div class="w-16 h-16 bg-sapphire-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-2xl">✓</span>
            </div>
            <h3 class="font-display text-xl font-bold text-diamond-900 mb-2">100% Authentic</h3>
            <p class="text-sm text-gray-600">Every piece is verified and authenticated before delivery</p>
          </div>

          <div class="card p-8 text-center hover:shadow-luxury transition-shadow duration-300">
            <div class="w-16 h-16 bg-emerald-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-2xl">🛡️</span>
            </div>
            <h3 class="font-display text-xl font-bold text-diamond-900 mb-2">Secure Checkout</h3>
            <p class="text-sm text-gray-600">PCI-DSS compliant payment processing with SSL encryption</p>
          </div>

          <div class="card p-8 text-center hover:shadow-luxury transition-shadow duration-300">
            <div class="w-16 h-16 bg-rose-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-2xl">🚚</span>
            </div>
            <h3 class="font-display text-xl font-bold text-diamond-900 mb-2">Insured Shipping</h3>
            <p class="text-sm text-gray-600">Free insured delivery with tracking on all orders</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Why Choose Us -->
    <section class="section-padding bg-diamond-50">
      <div class="container-luxury">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <!-- Image -->
          <div class="relative h-96 md:h-full min-h-96 rounded-xl overflow-hidden">
            <div class="w-full h-full bg-gradient-to-br from-gold-200 to-gold-100 flex items-center justify-center">
              <span class="text-9xl">💎</span>
            </div>
            <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
          </div>

          <!-- Content -->
          <div>
            <h2 class="text-4xl md:text-5xl font-display font-bold text-diamond-900 mb-6">
              Why Choose Gemara?
            </h2>
            <p class="text-lg text-gray-700 mb-8">
              With over a decade of expertise in fine jewellery, we bring together the world's finest gemstones with impeccable craftsmanship.
            </p>

            <ul class="space-y-4 mb-8">
              <li class="flex items-start gap-4">
                <div class="w-6 h-6 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0 mt-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <div>
                  <h4 class="font-semibold text-gray-900">Ethical Sourcing</h4>
                  <p class="text-sm text-gray-600">All gemstones responsibly sourced and conflict-free</p>
                </div>
              </li>
              <li class="flex items-start gap-4">
                <div class="w-6 h-6 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0 mt-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <div>
                  <h4 class="font-semibold text-gray-900">Expert Craftsmen</h4>
                  <p class="text-sm text-gray-600">Handcrafted by master artisans with decades of experience</p>
                </div>
              </li>
              <li class="flex items-start gap-4">
                <div class="w-6 h-6 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0 mt-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <div>
                  <h4 class="font-semibold text-gray-900">Lifetime Warranty</h4>
                  <p class="text-sm text-gray-600">All pieces backed by our comprehensive lifetime warranty</p>
                </div>
              </li>
              <li class="flex items-start gap-4">
                <div class="w-6 h-6 rounded-full bg-gold-500 text-white flex items-center justify-center flex-shrink-0 mt-1">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <div>
                  <h4 class="font-semibold text-gray-900">Personal Consultation</h4>
                  <p class="text-sm text-gray-600">Expert advice from our certified gemologists available 24/7</p>
                </div>
              </li>
            </ul>

            <a href="#contact" class="btn-primary">
              Schedule a Consultation
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="section-padding bg-gradient-to-r from-gold-500 to-gold-600 text-white overflow-hidden relative">
      <div class="absolute inset-0 opacity-10">
        <div class="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl"></div>
      </div>
      
      <div class="container-luxury relative z-10 text-center">
        <h2 class="text-4xl md:text-5xl font-display font-bold mb-6">
          Ready to Find Your Perfect Piece?
        </h2>
        <p class="text-xl text-gold-100 max-w-2xl mx-auto mb-8">
          Explore our complete collection and discover the elegance that defines luxury
        </p>
        <a routerLink="/products" class="inline-block bg-white text-gold-600 hover:bg-gold-50 font-semibold py-4 px-8 rounded-lg transition-all duration-300 shadow-luxury hover:shadow-luxury-lg">
          Start Shopping Now
        </a>
      </div>
    </section>
  `,
})
export class HomeComponent {
  categories: Category[] = [
    {
      id: '1',
      name: 'Diamond Rings',
      image: 'diamond-rings',
      productCount: 248,
    },
    {
      id: '2',
      name: 'Gemstone Jewels',
      image: 'gemstones',
      productCount: 156,
    },
    {
      id: '3',
      name: 'Precious Metals',
      image: 'precious-metals',
      productCount: 89,
    },
  ];

  featuredProducts: Product[] = [
    {
      id: '1',
      name: 'Diamond Solitaire Ring',
      price: 45000,
      originalPrice: 50000,
      image: 'ring-1',
      category: 'Diamond',
      rating: 4.8,
      reviews: 125,
      badge: 'BESTSELLER',
    },
    {
      id: '2',
      name: 'Emerald Statement Necklace',
      price: 35000,
      image: 'necklace-1',
      category: 'Gemstone',
      rating: 4.9,
      reviews: 89,
      badge: 'NEW',
    },
    {
      id: '3',
      name: 'Sapphire Drop Earrings',
      price: 28000,
      originalPrice: 32000,
      image: 'earrings-1',
      category: 'Gemstone',
      rating: 4.7,
      reviews: 156,
    },
    {
      id: '4',
      name: 'Gold Engagement Ring',
      price: 55000,
      image: 'ring-2',
      category: 'Gold',
      rating: 4.9,
      reviews: 203,
      badge: 'PREMIUM',
    },
    {
      id: '5',
      name: 'Ruby & Diamond Bracelet',
      price: 42000,
      originalPrice: 48000,
      image: 'bracelet-1',
      category: 'Gemstone',
      rating: 4.8,
      reviews: 78,
    },
    {
      id: '6',
      name: 'Pearl & Diamond Pendant',
      price: 32000,
      image: 'pendant-1',
      category: 'Pearl',
      rating: 4.6,
      reviews: 45,
    },
    {
      id: '7',
      name: 'Aquamarine Ring',
      price: 38000,
      originalPrice: 42000,
      image: 'ring-3',
      category: 'Gemstone',
      rating: 4.7,
      reviews: 62,
    },
    {
      id: '8',
      name: 'Diamond Tennis Bracelet',
      price: 65000,
      image: 'bracelet-2',
      category: 'Diamond',
      rating: 4.9,
      reviews: 234,
      badge: 'EXCLUSIVE',
    },
  ];

  getCategoryEmoji(category: string): string {
    const emojiMap: { [key: string]: string } = {
      'Diamond Rings': '💍',
      'Gemstone Jewels': '💎',
      'Precious Metals': '🏆',
    };
    return emojiMap[category] || '✦';
  }

  getProductEmoji(category: string): string {
    const emojiMap: { [key: string]: string } = {
      'Diamond': '💍',
      'Gemstone': '💎',
      'Gold': '🏆',
      'Pearl': '🦪',
    };
    return emojiMap[category] || '✦';
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price);
  }
}
