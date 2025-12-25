import { Component, signal, inject, OnInit, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CompareService } from '../services/compare.service';
import { ApiService, Product } from '../services/api.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, FormsModule],
  template: `
    <header class="sticky top-0 z-50 bg-white border-b border-diamond-200 backdrop-blur-md bg-white/95" (click)="onOutsideClick($event)">
      <div class="container-luxury">
        <div class="flex items-center justify-between h-20">
          <!-- Logo -->
          <a routerLink="/" class="flex items-center gap-2 group">
            <div class="w-10 h-10 bg-gradient-to-br from-gold-500 to-gold-600 rounded-lg flex items-center justify-center shadow-lg">
              <span class="text-white font-bold text-lg">✦</span>
            </div>
            <div class="hidden sm:flex flex-col">
              <span class="text-lg font-bold text-diamond-900 font-display">Gemara</span>
              <span class="text-xs text-gold-600 leading-none">Fine Jewels</span>
            </div>
          </a>

          <!-- Navigation -->
          <nav class="hidden md:flex items-center gap-8">
            <a routerLink="/" routerLinkActive="text-gold-600" [routerLinkActiveOptions]="{ exact: true }"
               class="text-sm font-medium text-diamond-700 hover:text-gold-600 transition-colors duration-300">
              Home
            </a>
            <a routerLink="/products" routerLinkActive="text-gold-600"
               class="text-sm font-medium text-diamond-700 hover:text-gold-600 transition-colors duration-300">
              Collections
            </a>
            <a routerLink="/about" routerLinkActive="text-gold-600"
               class="text-sm font-medium text-diamond-700 hover:text-gold-600 transition-colors duration-300">
              About
            </a>
            <a routerLink="/contact" routerLinkActive="text-gold-600"
               class="text-sm font-medium text-diamond-700 hover:text-gold-600 transition-colors duration-300">
              Contact
            </a>
          </nav>

          <!-- Actions -->
          <div class="flex items-center gap-4">
            <!-- Smart Search -->
            <div class="relative hidden sm:block">
              <div class="flex items-center bg-gray-50 rounded-full border border-transparent focus-within:border-gold-500 focus-within:bg-white transition-all duration-300"
                   [class.w-64]="isSearchOpen()" [class.w-10]="!isSearchOpen()" [class.px-3]="isSearchOpen()">
                <button (click)="toggleSearch()" class="w-10 h-10 flex items-center justify-center text-diamond-700 flex-shrink-0" aria-label="Toggle Search">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                </button>
                <input *ngIf="isSearchOpen()"
                       type="text"
                       [(ngModel)]="searchTerm"
                       (ngModelChange)="onSearch()"
                       (keydown.enter)="submitSearch()"
                       (keydown.escape)="closeSearch()"
                       placeholder="Search products..."
                       class="bg-transparent border-none outline-none text-sm w-full h-10 text-gray-700 placeholder-gray-400"
                       aria-label="Search">
                <button *ngIf="isSearchOpen() && searchTerm()" (click)="clearSearch()" class="text-gray-400 hover:text-gray-600 ml-1" aria-label="Clear Search">✕</button>
              </div>

              <!-- Search Results Dropdown -->
              <div *ngIf="isSearchOpen() && (searchResults().length > 0 || searchTerm().length > 2)"
                   class="absolute top-12 right-0 w-80 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-fade-in-up">
                <div *ngIf="searchResults().length > 0" class="max-h-96 overflow-y-auto">
                  <a *ngFor="let product of searchResults()"
                     [routerLink]="['/products', product.id]"
                     (click)="closeSearch()"
                     class="flex items-center gap-3 p-3 hover:bg-gold-50 transition-colors border-b border-gray-50 last:border-0 group">
                    <div class="w-12 h-12 bg-gray-100 rounded overflow-hidden flex items-center justify-center flex-shrink-0">
                       <img *ngIf="product.imageUrl" [src]="product.imageUrl" class="w-full h-full object-cover">
                       <span *ngIf="!product.imageUrl" class="text-xl">💎</span>
                    </div>
                    <div>
                      <h4 class="text-sm font-semibold text-gray-900 group-hover:text-gold-700 line-clamp-1">{{ product.name }}</h4>
                      <p class="text-xs text-gold-600">{{ formatPrice(product.price) }}</p>
                    </div>
                  </a>
                  <button (click)="submitSearch()" class="w-full text-center py-2 text-xs font-bold text-gold-600 bg-gold-50 hover:bg-gold-100 uppercase tracking-widest transition-colors">
                    View All Results
                  </button>
                </div>
                <div *ngIf="searchResults().length === 0 && searchTerm().length > 2" class="p-6 text-center text-gray-500">
                  No products found for "{{ searchTerm() }}"
                </div>
              </div>
            </div>

            <a routerLink="/compare" class="hidden sm:flex items-center justify-center w-10 h-10 hover:bg-gold-50 rounded-lg transition-colors duration-300 relative" title="Compare" aria-label="Compare Products">
              <span class="text-xl">⚖️</span>
              <span class="absolute top-0 right-0 w-5 h-5 bg-gold-500 text-white text-xs font-bold rounded-full flex items-center justify-center" *ngIf="compareService.compareList().length > 0">{{ compareService.compareList().length }}</span>
            </a>
            <a routerLink="/cart" class="flex items-center justify-center w-10 h-10 hover:bg-gold-50 rounded-lg transition-colors duration-300 relative" aria-label="Shopping Cart">
              <svg class="w-5 h-5 text-diamond-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path>
              </svg>
              <span class="absolute top-0 right-0 w-5 h-5 bg-gold-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{{ cartCount() }}</span>
            </a>
            <a routerLink="/account" class="hidden sm:flex items-center justify-center w-10 h-10 hover:bg-gold-50 rounded-lg transition-colors duration-300" aria-label="Account">
              <svg class="w-5 h-5 text-diamond-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
              </svg>
            </a>
            <button (click)="toggleMobileMenu()" class="md:hidden flex items-center justify-center w-10 h-10 hover:bg-gold-50 rounded-lg transition-colors duration-300" aria-label="Menu">
              <svg class="w-5 h-5 text-diamond-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </button>
          </div>
        </div>

        <!-- Mobile Menu -->
        <div *ngIf="mobileMenuOpen()" class="md:hidden border-t border-diamond-200 py-4 animate-slideUp">
          <nav class="flex flex-col gap-4">
            <a routerLink="/" (click)="mobileMenuOpen.set(false)" class="text-sm font-medium text-diamond-700 hover:text-gold-600">Home</a>
            <a routerLink="/products" (click)="mobileMenuOpen.set(false)" class="text-sm font-medium text-diamond-700 hover:text-gold-600">Collections</a>
            <a routerLink="/about" (click)="mobileMenuOpen.set(false)" class="text-sm font-medium text-diamond-700 hover:text-gold-600">About</a>
            <a routerLink="/contact" (click)="mobileMenuOpen.set(false)" class="text-sm font-medium text-diamond-700 hover:text-gold-600">Contact</a>
          </nav>
        </div>
      </div>
    </header>
  `,
})
export class HeaderComponent implements OnInit {
  compareService = inject(CompareService);
  apiService = inject(ApiService);
  private router = inject(Router);
  private elementRef = inject(ElementRef);

  cartCount = signal(0);
  mobileMenuOpen = signal(false);

  // Search
  isSearchOpen = signal(false);
  searchTerm = signal('');
  searchResults = signal<Product[]>([]);

  ngOnInit() {
      this.apiService.cart().subscribe(cart => {
          const count = cart ? cart.items.reduce((sum, item) => sum + item.quantity, 0) : 0;
          this.cartCount.set(count);
      });
      this.apiService.getCart().subscribe();
  }

  toggleMobileMenu() {
    this.mobileMenuOpen.update(value => !value);
  }

  toggleSearch() {
    this.isSearchOpen.update(v => !v);
    if (!this.isSearchOpen()) {
      this.searchTerm.set('');
      this.searchResults.set([]);
    }
  }

  onSearch() {
    if (this.searchTerm().length < 2) {
      this.searchResults.set([]);
      return;
    }

    this.apiService.searchProducts(this.searchTerm(), 5).subscribe(res => {
      this.searchResults.set(res.results);
    });
  }

  submitSearch() {
    if (this.searchTerm()) {
      this.router.navigate(['/products'], { queryParams: { search: this.searchTerm() } });
      this.closeSearch();
    }
  }

  clearSearch() {
    this.searchTerm.set('');
    this.searchResults.set([]);
  }

  closeSearch() {
    this.isSearchOpen.set(false);
    this.clearSearch();
  }

  onOutsideClick(event: Event) {
    // Basic outside click handler to close search if clicking away (and not on the input/results)
    // In complex apps, use a directive. Here, simple check if click target is inside header.
    // Actually, sticky header catches clicks. We want to close if clicking *outside* the search container.
    // For now, let's rely on manual close or navigation.
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price);
  }
}
