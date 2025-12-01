import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  category: string;
  rating: number;
  reviews: number;
  badge?: string;
  description: string;
  image: string;
}

interface Collection {
  id: string;
  name: string;
  title: string;
  description: string;
  productCount: number;
  icon: string;
  color: string;
  accentColor: string;
}

@Component({
  selector: "app-home",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <!-- Premium Hero Section -->
    <section class="relative w-full overflow-hidden">
      <!-- Background Image with Overlay -->
      <div
        class="absolute inset-0 bg-gradient-to-r from-diamond-900 via-diamond-800 to-gold-900/30"
      ></div>
      <div class="absolute inset-0 opacity-20">
        <svg
          class="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
          viewBox="0 0 1200 600"
        >
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="white"
                stroke-width="0.5"
                opacity="0.1"
              />
            </pattern>
          </defs>
          <rect width="1200" height="600" fill="url(#grid)" />
        </svg>
      </div>

      <div
        class="relative z-10 h-screen flex flex-col items-center justify-center text-center px-4"
      >
        <!-- Trust Badge -->
        <div
          class="inline-flex items-center gap-2 mb-6 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full border border-gold-400/30"
        >
          <span class="text-sm text-gold-300 font-semibold"
            >🏆 Trusted by Collectors & Connoisseurs</span
          >
        </div>

        <!-- Main Headline -->
        <h1
          class="text-6xl md:text-8xl font-display font-bold text-white mb-6 leading-tight"
        >
          <span
            class="text-transparent bg-clip-text bg-gradient-to-r from-gold-300 to-gold-500"
            >Curated</span
          ><br />
          Heritage Gemstones
        </h1>

        <!-- Subheading -->
        <p
          class="text-xl md:text-2xl text-gold-100 max-w-3xl mx-auto mb-8 leading-relaxed"
        >
          Museum-quality loose stones, hand-carved idols, and heirloom jewelry
          collections. Every piece certified and authenticated by international
          standards.
        </p>

        <!-- CTA Buttons -->
        <div class="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <a
            routerLink="/products"
            class="group relative px-8 py-4 bg-gold-500 hover:bg-gold-600 text-white font-bold rounded-lg transition-all duration-300 shadow-luxury hover:shadow-luxury-lg hover:-translate-y-1"
          >
            <span class="flex items-center justify-center">
              Explore Collections
              <svg
                class="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                ></path>
              </svg>
            </span>
          </a>
          <button
            class="px-8 py-4 border-2 border-gold-400 text-gold-300 hover:bg-gold-400/10 font-bold rounded-lg transition-all duration-300"
          >
            View Certifications
          </button>
        </div>

        <!-- Scroll Indicator -->
        <div
          class="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce"
        >
          <svg
            class="w-6 h-6 text-gold-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            ></path>
          </svg>
        </div>
      </div>
    </section>

    <!-- Trust & Heritage Section -->
    <section class="section-padding bg-white border-b border-diamond-200">
      <div class="container-luxury">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div class="text-center">
            <div class="text-4xl mb-3">🔐</div>
            <h3 class="font-bold text-gray-900 mb-2">Certified Authentic</h3>
            <p class="text-gray-600 text-sm">
              GIA, IGI & AGS certified gemstones with complete documentation
            </p>
          </div>
          <div class="text-center">
            <div class="text-4xl mb-3">👨‍🎨</div>
            <h3 class="font-bold text-gray-900 mb-2">Master Artisans</h3>
            <p class="text-gray-600 text-sm">
              Multi-generational craftspeople creating museum-quality pieces
            </p>
          </div>
          <div class="text-center">
            <div class="text-4xl mb-3">🌍</div>
            <h3 class="font-bold text-gray-900 mb-2">Ethical Sourcing</h3>
            <p class="text-gray-600 text-sm">
              Conflict-free stones with transparent supply chain tracking
            </p>
          </div>
          <div class="text-center">
            <div class="text-4xl mb-3">♻️</div>
            <h3 class="font-bold text-gray-900 mb-2">Lifetime Warranty</h3>
            <p class="text-gray-600 text-sm">
              Comprehensive care, cleaning & restoration services included
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- Collection Categories - Premium Grid -->
    <section class="section-padding bg-diamond-50">
      <div class="container-luxury">
        <div class="text-center mb-16">
          <h2
            class="text-5xl md:text-6xl font-display font-bold text-diamond-900 mb-4"
          >
            Curated Collections
          </h2>
          <p class="text-xl text-gray-600 max-w-3xl mx-auto">
            From precious diamonds to hand-carved spiritual idols, each
            collection tells a story of heritage and craftsmanship
          </p>
        </div>

        <!-- 6-Item Grid Layout -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <a
            *ngFor="let collection of collections"
            routerLink="/products"
            [queryParams]="{ category: collection.name }"
            class="group relative overflow-hidden rounded-2xl h-96 cursor-pointer card-hover block"
          >
            <!-- Background Gradient -->
            <div
              class="absolute inset-0"
              [ngClass]="'bg-gradient-to-br ' + collection.color"
            ></div>

            <!-- Icon & Content -->
            <div
              class="absolute inset-0 flex flex-col justify-end p-8 text-white"
            >
              <!-- Icon -->
              <div
                class="text-6xl mb-4 transform group-hover:scale-110 transition-transform duration-300"
              >
                {{ collection.icon }}
              </div>

              <!-- Text -->
              <h3 class="font-display text-3xl font-bold mb-2">
                {{ collection.name }}
              </h3>
              <p class="text-gray-100 text-sm mb-4">
                {{ collection.description }}
              </p>
              <p class="text-gold-200 text-xs font-semibold mb-4">
                {{ collection.productCount }}+ items
              </p>

              <!-- CTA -->
              <div
                class="inline-flex items-center text-gold-300 group-hover:text-gold-200 transition-colors"
              >
                <span class="text-sm font-semibold">Explore</span>
                <svg
                  class="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  ></path>
                </svg>
              </div>
            </div>

            <!-- Overlay -->
            <div
              class="absolute inset-0 bg-black/40 group-hover:bg-black/30 transition-all duration-300"
            ></div>
          </a>
        </div>
      </div>
    </section>

    <!-- Featured Collections Carousel -->
    <section class="section-padding bg-white">
      <div class="container-luxury">
        <h2 class="text-5xl font-display font-bold text-diamond-900 mb-4">
          Gallery Highlights
        </h2>
        <p class="text-xl text-gray-600 mb-12 max-w-2xl">
          Discover exceptional pieces handpicked by our expert curators
        </p>

        <!-- Featured Items Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <a
            *ngFor="let product of featuredProducts"
            [routerLink]="['/products', product.id]"
            class="card group overflow-hidden hover:shadow-luxury-lg transition-all duration-300 block cursor-pointer"
          >
            <!-- Image Container -->
            <div
              class="relative overflow-hidden h-72 bg-gradient-to-br from-gold-100 to-diamond-100"
            >
              <div
                class="w-full h-full flex items-center justify-center text-5xl"
              >
                {{ getProductEmoji(product.category) }}
              </div>

              <!-- Badge -->
              <div *ngIf="product.badge" class="absolute top-4 right-4">
                <span
                  class="inline-block px-3 py-1 bg-gold-500 text-white text-xs font-bold rounded-full"
                >
                  {{ product.badge }}
                </span>
              </div>

              <!-- Wishlist -->
              <button
                class="absolute top-4 left-4 w-10 h-10 bg-white/90 hover:bg-gold-500 hover:text-white rounded-lg flex items-center justify-center transition-all shadow-md"
              >
                <svg
                  class="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  ></path>
                </svg>
              </button>
            </div>

            <!-- Product Info -->
            <div class="p-6">
              <!-- Category & Name -->
              <p
                class="text-xs text-gold-600 font-bold uppercase tracking-widest mb-2"
              >
                {{ product.category }}
              </p>
              <h3 class="font-semibold text-gray-900 text-lg mb-3 line-clamp-2">
                {{ product.name }}
              </h3>
              <p class="text-sm text-gray-600 mb-3">
                {{ product.description }}
              </p>

              <!-- Rating -->
              <div class="flex items-center gap-2 mb-4">
                <div class="flex gap-0.5">
                  <span
                    *ngFor="let i of [1, 2, 3, 4, 5]"
                    class="text-gold-500 text-xs"
                    >★</span
                  >
                </div>
                <span class="text-xs text-gray-500"
                  >({{ product.reviews }})</span
                >
              </div>

              <!-- Price -->
              <div class="mb-4">
                <span class="text-2xl font-bold text-diamond-900">{{
                  formatPrice(product.price)
                }}</span>
                <span
                  *ngIf="product.originalPrice"
                  class="text-sm text-gray-500 line-through ml-2"
                  >{{ formatPrice(product.originalPrice) }}</span
                >
              </div>

              <!-- Add to Cart -->
              <button (click)="$event.preventDefault(); $event.stopPropagation()" class="w-full btn-primary">Add to Cart</button>
            </div>
          </a>
        </div>

        <!-- View All CTA -->
        <div class="text-center">
          <a
            routerLink="/products"
            class="inline-block px-8 py-4 border-2 border-gold-500 text-gold-600 hover:bg-gold-50 font-bold rounded-lg transition-all"
          >
            View Complete Collections
          </a>
        </div>
      </div>
    </section>

    <!-- About/Story Section -->
    <section
      class="section-padding bg-gradient-to-r from-diamond-900 to-diamond-800 text-white"
    >
      <div class="container-luxury">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <!-- Left: Image/Visual -->
          <div
            class="relative h-96 rounded-2xl overflow-hidden shadow-luxury-lg"
          >
            <div
              class="w-full h-full bg-gradient-to-br from-gold-300 to-gold-600 flex items-center justify-center"
            >
              <span class="text-9xl">💎</span>
            </div>
          </div>

          <!-- Right: Story -->
          <div>
            <div
              class="inline-block mb-4 px-4 py-2 bg-gold-500/20 rounded-full border border-gold-400/50"
            >
              <span class="text-sm font-semibold text-gold-300"
                >Our Legacy</span
              >
            </div>

            <h2 class="text-4xl md:text-5xl font-display font-bold mb-6">
              Heritage Meets Modern Excellence
            </h2>

            <p class="text-lg text-gray-200 mb-4 leading-relaxed">
              With over 25 years of expertise, Gemara stands as a trusted
              custodian of precious gemstones and spiritual artifacts. Our
              journey began in the heartland of gem cutting, where we learned
              from master craftspeople.
            </p>

            <p class="text-lg text-gray-200 mb-8 leading-relaxed">
              Today, we blend traditional artisanal techniques with
              international authentication standards. Every piece in our
              collection is personally curated and certified, ensuring
              museum-quality standards.
            </p>

            <ul class="space-y-3 mb-8">
              <li class="flex items-start gap-3">
                <span class="text-gold-400 font-bold">✓</span>
                <span
                  >Partnerships with international gemological institutes</span
                >
              </li>
              <li class="flex items-start gap-3">
                <span class="text-gold-400 font-bold">✓</span>
                <span
                  >Direct relationships with ethical mines and artisans</span
                >
              </li>
              <li class="flex items-start gap-3">
                <span class="text-gold-400 font-bold">✓</span>
                <span>Transparent pricing with no hidden markups</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="text-gold-400 font-bold">✓</span>
                <span>Lifetime care and restoration services</span>
              </li>
            </ul>

            <a
              href="#contact"
              class="inline-block px-8 py-4 bg-gold-500 hover:bg-gold-600 text-white font-bold rounded-lg transition-all hover:shadow-luxury"
            >
              Learn More About Us
            </a>
          </div>
        </div>
      </div>
    </section>

    <!-- Certifications Showcase -->
    <section class="section-padding bg-white border-y border-diamond-200">
      <div class="container-luxury">
        <h2
          class="text-4xl md:text-5xl font-display font-bold text-center text-diamond-900 mb-16"
        >
          Verified & Authenticated
        </h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <!-- GIA -->
          <div class="card p-8 text-center hover:shadow-luxury transition-all">
            <div class="text-6xl mb-4">🏆</div>
            <h3 class="font-bold text-gray-900 text-xl mb-3">GIA Certified</h3>
            <p class="text-gray-600">
              Gemological Institute of America certification - the industry's
              gold standard for diamond and gemstone grading
            </p>
            <p class="text-xs text-gray-500 mt-4">
              Est. 1931 • Over 100,000 gems certified annually
            </p>
          </div>

          <!-- IGI -->
          <div class="card p-8 text-center hover:shadow-luxury transition-all">
            <div class="text-6xl mb-4">✓</div>
            <h3 class="font-bold text-gray-900 text-xl mb-3">IGI Certified</h3>
            <p class="text-gray-600">
              International Gemological Institute verification for complete
              documentation and authenticity assurance
            </p>
            <p class="text-xs text-gray-500 mt-4">
              Est. 1975 • Trusted globally for lab reports
            </p>
          </div>

          <!-- Authentication -->
          <div class="card p-8 text-center hover:shadow-luxury transition-all">
            <div class="text-6xl mb-4">🔍</div>
            <h3 class="font-bold text-gray-900 text-xl mb-3">
              Expert Authentication
            </h3>
            <p class="text-gray-600">
              Our in-house gemologists perform comprehensive testing using
              advanced spectroscopy and UV analysis
            </p>
            <p class="text-xs text-gray-500 mt-4">
              100% satisfaction guarantee • 30-day returns
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section
      class="section-padding bg-gradient-to-r from-gold-500 to-gold-600 text-white"
    >
      <div class="container-luxury text-center">
        <h2 class="text-4xl md:text-5xl font-display font-bold mb-6">
          Discover Your Perfect Piece
        </h2>
        <p class="text-xl text-gold-100 max-w-2xl mx-auto mb-8">
          Browse our handpicked collection of loose stones, carved idols, and
          heritage jewelry
        </p>
        <a
          routerLink="/products"
          class="inline-block px-10 py-4 bg-white text-gold-600 hover:bg-gold-50 font-bold rounded-lg transition-all shadow-luxury hover:shadow-luxury-lg"
        >
          Start Exploring
        </a>
      </div>
    </section>
  `,
})
export class HomeComponent {
  collections: Collection[] = [
    {
      id: "1",
      name: "Engagement Rings",
      title: "Diamond Rings",
      description: "Certified solitaires and bespoke designs",
      productCount: 248,
      icon: "💍",
      color: "from-rose-100 to-rose-200",
      accentColor: "text-rose-700",
    },
    {
      id: "2",
      name: "Loose Gemstones",
      title: "Loose Stones",
      description: "Museum-quality unset precious & semi-precious gems",
      productCount: 312,
      icon: "💎",
      color: "from-sapphire-100 to-sapphire-200",
      accentColor: "text-sapphire-700",
    },
    {
      id: "3",
      name: "Spiritual Idols",
      title: "Carved Figures",
      description: "Hand-carved spiritual and devotional sculptures",
      productCount: 156,
      icon: "🕉️",
      color: "from-emerald-100 to-emerald-200",
      accentColor: "text-emerald-700",
    },
    {
      id: "4",
      name: "Gemstone Jewelry",
      title: "Colored Gemstones",
      description: "Emerald, sapphire, ruby & precious stone pieces",
      productCount: 189,
      icon: "👑",
      color: "from-purple-100 to-purple-200",
      accentColor: "text-purple-700",
    },
    {
      id: "5",
      name: "Precious Metals",
      title: "Gold & Platinum",
      description: "24K gold, platinum & silver collections",
      productCount: 94,
      icon: "🏆",
      color: "from-yellow-100 to-yellow-200",
      accentColor: "text-yellow-700",
    },
    {
      id: "6",
      name: "Bespoke Custom",
      title: "Made to Order",
      description: "Personalized designs with master craftspeople",
      productCount: 0,
      icon: "✨",
      color: "from-pink-100 to-pink-200",
      accentColor: "text-pink-700",
    },
  ];

  featuredProducts: Product[] = [
    {
      id: "1",
      name: "1.5 Carat Diamond Solitaire",
      price: 45000,
      originalPrice: 50000,
      category: "Engagement Ring",
      rating: 4.9,
      reviews: 245,
      badge: "BESTSELLER",
      description: "VS1 clarity, G color, excellent cut - GIA certified",
      image: "diamond-ring",
    },
    {
      id: "2",
      name: "Colombian Emerald Loose Stone",
      price: 32000,
      category: "Loose Gemstone",
      rating: 4.8,
      reviews: 156,
      badge: "RARE",
      description: "Museum-grade, 5.2 carats, vivid green",
      image: "emerald",
    },
    {
      id: "3",
      name: "Hand-Carved Ganesha Idol",
      price: 18000,
      category: "Spiritual Idol",
      rating: 5.0,
      reviews: 89,
      badge: "NEW",
      description: "Crystal quartz, artisan-carved, 6 inches",
      image: "ganesha",
    },
    {
      id: "4",
      name: "Kashmir Sapphire - Loose",
      price: 28000,
      originalPrice: 35000,
      category: "Loose Gemstone",
      rating: 4.9,
      reviews: 203,
      description: "3.8 carats, deep blue, IGI certified",
      image: "sapphire",
    },
    {
      id: "5",
      name: "Padparadsha Sapphire Ring",
      price: 42000,
      category: "Gemstone Ring",
      rating: 4.7,
      reviews: 78,
      description: "Pink-orange Ceylon sapphire, 18K gold",
      image: "padparadsha",
    },
    {
      id: "6",
      name: "Lord Shiva Crystal Idol",
      price: 12000,
      category: "Spiritual Idol",
      rating: 4.8,
      reviews: 124,
      description: "Clear quartz, hand-polished, meditation quality",
      image: "shiva",
    },
    {
      id: "7",
      name: "Ruby Burma Loose Stone",
      price: 55000,
      category: "Loose Gemstone",
      rating: 5.0,
      reviews: 92,
      badge: "EXCLUSIVE",
      description: "Pigeon blood red, 2.1 carats, unheated",
      image: "ruby",
    },
    {
      id: "8",
      name: "Pure 24K Gold Bangle",
      price: 38000,
      category: "Precious Metal",
      rating: 4.6,
      reviews: 167,
      description: "10 grams, hallmarked, traditional design",
      image: "bangle",
    },
  ];

  getProductEmoji(category: string): string {
    const emojiMap: { [key: string]: string } = {
      "Engagement Ring": "💍",
      "Loose Gemstone": "💎",
      "Spiritual Idol": "🕉️",
      "Gemstone Ring": "👑",
      "Precious Metal": "🏆",
    };
    return emojiMap[category] || "✦";
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
    }).format(price);
  }
}
