import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, NavigationEnd, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { ProductService } from '../services/product.service';
import { Product, User } from '../core/models';
import { FormsModule } from '@angular/forms';
import { WishlistService } from '../services/wishlist.service';
import { APP_CATEGORIES } from '../core/constants';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <header class="bg-white sticky top-0 z-50 shadow-sm font-sans">
      <!-- Top Bar (Purple) -->
      <div class="bg-primary-800 text-white py-1.5 text-xs tracking-wide">
        <div class="container mx-auto px-4 flex justify-between items-center overflow-x-auto whitespace-nowrap gap-8 md:gap-4 no-scrollbar mask-fade">
          <div class="flex gap-6 flex-shrink-0">
            <span class="flex items-center gap-1.5 font-medium">
              <svg class="w-3.5 h-3.5 text-secondary-400" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/></svg>
              Gemara Treasure Plan
            </span>
            <span class="hidden sm:inline opacity-80">|</span>
            <span class="inline font-medium text-secondary-100">Free Shipping on Orders Over $500</span>
          </div>
          <div class="flex gap-6 flex-shrink-0 text-primary-100">
            <a routerLink="/stores" class="hover:text-white transition-colors">Find a Store</a>
            <a href="#" class="hover:text-white transition-colors">Help</a>
            <a routerLink="/track-order" class="hover:text-white transition-colors">Track Order</a>
          </div>
        </div>
      </div>

      <!-- Main Header -->
      <div class="container mx-auto px-4 py-3">
        <div class="flex items-center justify-between gap-6">

          <!-- Mobile Menu & Logo -->
          <div class="flex items-center gap-4">
            <button class="lg:hidden text-primary-900" (click)="toggleMobileMenu()">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </button>

            <!-- Logo -->
            <a routerLink="/" class="flex flex-col items-center leading-none">
              <span class="text-2xl font-display font-bold text-primary-800 tracking-wide">GEMARA</span>
              <span class="text-[0.6rem] uppercase tracking-[0.2em] text-secondary-600 font-semibold">Fine Jewels</span>
            </a>
          </div>

          <!-- Search Bar (Central) -->
          <div class="hidden md:block flex-1 max-w-xl relative group">
            <div class="relative">
              <input
                type="text"
                [(ngModel)]="searchQuery"
                (input)="onSearchInput()"
                (focus)="isSearchFocused = true"
                (blur)="onSearchBlur()"
                placeholder="Search for Rings, Earrings, Gemstones..."
                class="w-full pl-4 pr-10 py-2.5 bg-gray-50 border border-primary-200 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all text-sm placeholder-gray-400 text-gray-800"
              >
              <button class="absolute right-0 top-0 h-full px-4 bg-primary-800 text-white rounded-r-lg hover:bg-primary-900 transition-colors">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
              </button>
            </div>

            <!-- Search Results Dropdown -->
            <div *ngIf="isSearchFocused && searchResults.length > 0" class="absolute top-full left-0 w-full bg-white shadow-xl rounded-b-lg mt-0.5 border-x border-b border-gray-100 py-2 z-50">
              <a
                *ngFor="let result of searchResults"
                [routerLink]="['/products', result.id]"
                class="block px-4 py-2 hover:bg-primary-50 flex items-center gap-3 transition-colors"
              >
                <div class="w-10 h-10 bg-gray-100 rounded flex-shrink-0 overflow-hidden border border-gray-200">
                  <img *ngIf="result.imageUrl" [src]="result.imageUrl" class="w-full h-full object-cover">
                </div>
                <div>
                  <div class="text-sm font-medium text-gray-900">{{result.name}}</div>
                  <div class="text-xs text-secondary-600 font-semibold uppercase">{{result.category}}</div>
                </div>
              </a>
            </div>
          </div>

          <!-- Icons Actions -->
          <div class="flex items-center gap-3 md:gap-6">
            <!-- Treasure Icon (New) -->
            <a routerLink="/treasure" class="hidden sm:flex flex-col items-center text-primary-800 hover:text-primary-600 transition-colors group">
              <div class="w-6 h-6 flex items-center justify-center mb-0.5">
                 <span class="text-xl group-hover:scale-110 transition-transform">💎</span>
              </div>
              <span class="text-[0.65rem] font-bold uppercase tracking-wide">Plan</span>
            </a>

            <!-- User -->
            <div class="relative group">
              <a [routerLink]="user() ? '/account' : '/login'" class="flex flex-col items-center text-primary-800 hover:text-primary-600 transition-colors">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                <span class="text-[0.65rem] font-bold uppercase tracking-wide">Account</span>
              </a>
               <!-- User Dropdown -->
              <div *ngIf="user()" class="absolute right-0 top-full pt-2 hidden group-hover:block w-48 z-50">
                <div class="bg-white shadow-lg rounded-lg py-2 border border-gray-100">
                  <div class="px-4 py-2 border-b border-gray-50 text-xs text-gray-500">Hello, {{ user()?.firstName }}</div>
                  <a routerLink="/account" class="block px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700">My Account</a>
                  <a [routerLink]="['/account']" [queryParams]="{tab: 'orders'}" class="block px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-700">My Orders</a>
                  <a routerLink="/treasure" class="block px-4 py-2 text-sm text-secondary-700 font-semibold hover:bg-secondary-50">My Treasure Plan</a>
                  <button (click)="logout()" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Logout</button>
                </div>
              </div>
            </div>

            <!-- Wishlist -->
            <a routerLink="/wishlist" class="flex flex-col items-center text-primary-800 hover:text-primary-600 transition-colors relative">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
              </svg>
              <span class="text-[0.65rem] font-bold uppercase tracking-wide">Wishlist</span>
              <span *ngIf="wishlistCount() > 0" class="absolute -top-1 -right-1 bg-secondary-500 text-white text-[0.6rem] w-4 h-4 flex items-center justify-center rounded-full font-bold shadow-sm">
                {{ wishlistCount() }}
              </span>
            </a>

            <!-- Cart -->
            <a routerLink="/cart" class="flex flex-col items-center text-primary-800 hover:text-primary-600 transition-colors relative">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
              </svg>
              <span class="text-[0.65rem] font-bold uppercase tracking-wide">Cart</span>
              <span *ngIf="cartCount() > 0" class="absolute -top-1 -right-1 bg-secondary-500 text-white text-[0.6rem] w-4 h-4 flex items-center justify-center rounded-full font-bold shadow-sm">
                {{ cartCount() }}
              </span>
            </a>
          </div>
        </div>

        <!-- Navigation Categories (Desktop) -->
        <nav class="hidden lg:flex justify-center items-center gap-8 mt-4 border-t border-gray-100 pt-3">
            <a *ngFor="let cat of categories"
               [routerLink]="['/products']"
               [queryParams]="{category: cat.value}"
               class="text-sm font-semibold text-gray-700 hover:text-primary-700 uppercase tracking-wide px-2 py-1 relative group">
                {{ cat.displayName }}
                <span class="absolute bottom-0 left-0 w-full h-0.5 bg-primary-600 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></span>
            </a>
            <a routerLink="/treasure" class="text-sm font-bold text-secondary-600 hover:text-secondary-700 uppercase tracking-wide px-2 py-1 relative group flex items-center gap-1">
                <span class="text-lg">💎</span> Treasure Plan
            </a>
        </nav>
      </div>

      <!-- Mobile Menu -->
      <div *ngIf="isMobileMenuOpen" class="lg:hidden border-t border-gray-100 bg-white absolute w-full shadow-lg z-50 left-0">
        <div class="px-4 py-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
          <div class="relative">
             <input
                type="text"
                [(ngModel)]="searchQuery"
                (input)="onSearchInput()"
                placeholder="Search..."
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-primary-500"
              >
          </div>
          <a routerLink="/" (click)="toggleMobileMenu()" class="font-medium text-gray-800 py-2 border-b border-gray-50">Home</a>
          <a *ngFor="let cat of categories"
             [routerLink]="['/products']"
             [queryParams]="{category: cat.value}"
             (click)="toggleMobileMenu()"
             class="font-medium text-gray-800 py-2 border-b border-gray-50">
             {{ cat.displayName }}
          </a>
          <a routerLink="/treasure" (click)="toggleMobileMenu()" class="font-bold text-secondary-700 py-2 border-b border-gray-50 flex items-center gap-2">💎 Treasure Plan</a>
        </div>
      </div>
    </header>
  `
})
export class HeaderComponent {
  isMobileMenuOpen = false;
  searchQuery = '';
  searchResults: Product[] = [];
  isSearchFocused = false;
  categories = APP_CATEGORIES;

  private authService = inject(AuthService);
  private cartService = inject(CartService);
  private productService = inject(ProductService);
  private router = inject(Router);
  private wishlistService = inject(WishlistService);

  userSignal = signal<User | null>(null);
  user = this.userSignal;

  cartCount = signal(0);
  wishlistCount = this.wishlistService.count;

  constructor() {
    this.authService.user().subscribe(u => this.userSignal.set(u));
    this.cartService.cart().subscribe(c => {
      const count = c?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;
      this.cartCount.set(count);
    });

    // Close mobile menu on route change
    this.router.events.subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.isMobileMenuOpen = false;
      }
    });
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  logout() {
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/login']);
    });
  }

  onSearchInput() {
    if (this.searchQuery.length > 2) {
      this.productService.searchProducts(this.searchQuery).subscribe(res => {
        this.searchResults = res.results;
      });
    } else {
      this.searchResults = [];
    }
  }

  onSearchBlur() {
    // Delay hiding so click on result works
    setTimeout(() => {
      this.isSearchFocused = false;
    }, 200);
  }
}
