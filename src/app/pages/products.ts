import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  category: string;
  rating: number;
  reviews: number;
}

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-white">
      <!-- Header -->
      <div class="bg-diamond-50 border-b border-diamond-200 section-padding">
        <div class="container-luxury">
          <h1 class="text-5xl md:text-6xl font-display font-bold text-diamond-900 mb-4">
            Our Collections
          </h1>
          <p class="text-lg text-gray-600">
            Browse our complete selection of fine jewellery and gemstones
          </p>
        </div>
      </div>

      <!-- Main Content -->
      <div class="container-luxury section-padding">
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <!-- Sidebar Filters -->
          <div class="lg:col-span-1">
            <div class="space-y-6">
              <!-- Category Filter -->
              <div class="card p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Categories</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4" checked>
                    <span class="text-sm text-gray-700">All Products</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">Diamond Rings</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">Gemstone Jewels</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">Necklaces</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">Bracelets</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">Earrings</span>
                  </label>
                </div>
              </div>

              <!-- Price Filter -->
              <div class="card p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Price Range</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">Under $10,000</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">$10,000 - $25,000</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">$25,000 - $50,000</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">$50,000+</span>
                  </label>
                </div>
              </div>

              <!-- Metal Filter -->
              <div class="card p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Metal Type</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">Gold</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">Platinum</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">Silver</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">White Gold</span>
                  </label>
                </div>
              </div>

              <!-- Certification Filter -->
              <div class="card p-6">
                <h3 class="font-semibold text-gray-900 mb-4">Certification</h3>
                <div class="space-y-3">
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">GIA</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">IGI</span>
                  </label>
                  <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" class="w-4 h-4">
                    <span class="text-sm text-gray-700">AGS</span>
                  </label>
                </div>
              </div>

              <!-- Clear Filters -->
              <button class="w-full btn-ghost border border-diamond-300">
                Clear All Filters
              </button>
            </div>
          </div>

          <!-- Products Grid -->
          <div class="lg:col-span-3">
            <!-- Top Bar -->
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 pb-6 border-b border-diamond-200">
              <div>
                <p class="text-gray-600">Showing <span class="font-semibold">48</span> products</p>
              </div>
              <select class="input-field max-w-xs">
                <option>Sort by: Newest</option>
                <option>Price: Low to High</option>
                <option>Price: High to Low</option>
                <option>Most Popular</option>
                <option>Best Rated</option>
              </select>
            </div>

            <!-- Products Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              <div *ngFor="let product of sampleProducts" class="card card-hover group overflow-hidden">
                <div class="relative overflow-hidden h-64 bg-diamond-100">
                  <div class="w-full h-full bg-gradient-to-br from-gold-100 to-gold-50 flex items-center justify-center">
                    <span class="text-4xl">💎</span>
                  </div>
                  <button class="absolute top-4 left-4 w-10 h-10 bg-white/90 hover:bg-gold-500 hover:text-white rounded-lg flex items-center justify-center transition-all duration-300">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                    </svg>
                  </button>
                </div>
                <div class="p-6">
                  <p class="text-xs text-gold-600 font-semibold uppercase tracking-wider mb-1">{{ product.category }}</p>
                  <h3 class="font-semibold text-gray-900 mb-3 line-clamp-2">{{ product.name }}</h3>
                  <div class="flex items-center gap-2 mb-4">
                    <div class="flex gap-1">
                      <span *ngFor="let _ of [1,2,3,4,5]" class="text-gold-500 text-xs">★</span>
                    </div>
                    <span class="text-xs text-gray-600">({{ product.reviews }})</span>
                  </div>
                  <div class="mb-4">
                    <span class="text-2xl font-bold text-diamond-900">${{ (product.price / 1000).toFixed(0) }}k</span>
                  </div>
                  <button class="w-full btn-primary">Add to Cart</button>
                </div>
              </div>
            </div>

            <!-- Pagination -->
            <div class="flex items-center justify-center gap-2">
              <button class="w-10 h-10 border border-diamond-300 rounded-lg hover:bg-gold-50 transition-colors duration-300">‹</button>
              <button class="w-10 h-10 bg-gold-500 text-white rounded-lg">1</button>
              <button class="w-10 h-10 border border-diamond-300 rounded-lg hover:bg-gold-50 transition-colors duration-300">2</button>
              <button class="w-10 h-10 border border-diamond-300 rounded-lg hover:bg-gold-50 transition-colors duration-300">3</button>
              <span class="px-2">...</span>
              <button class="w-10 h-10 border border-diamond-300 rounded-lg hover:bg-gold-50 transition-colors duration-300">10</button>
              <button class="w-10 h-10 border border-diamond-300 rounded-lg hover:bg-gold-50 transition-colors duration-300">›</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ProductsComponent {
  sampleProducts: Product[] = [
    { id: '1', name: 'Diamond Solitaire Ring', price: 45000, category: 'Diamond', rating: 4.8, reviews: 125 },
    { id: '2', name: 'Emerald Statement Necklace', price: 35000, category: 'Gemstone', rating: 4.9, reviews: 89 },
    { id: '3', name: 'Sapphire Drop Earrings', price: 28000, category: 'Gemstone', rating: 4.7, reviews: 156 },
    { id: '4', name: 'Gold Engagement Ring', price: 55000, category: 'Gold', rating: 4.9, reviews: 203 },
    { id: '5', name: 'Ruby & Diamond Bracelet', price: 42000, category: 'Gemstone', rating: 4.8, reviews: 78 },
    { id: '6', name: 'Pearl & Diamond Pendant', price: 32000, category: 'Pearl', rating: 4.6, reviews: 45 },
  ];
}