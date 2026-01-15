import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, NavigationEnd, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { ProductService } from '../services/product.service';
import { Product, User } from '../core/models';
import { FormsModule } from '@angular/forms';
import { WishlistService } from '../services/wishlist.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, FormsModule],
  template: `
    <header class="bg-white border-b border-gray-200 sticky top-0 z-50">
      <!-- Top Bar -->
      <div class="bg-primary-900 text-white py-2 text-sm hidden sm:block">
        <div class="container mx-auto px-4 flex justify-between items-center">
          <div class="flex gap-4">
            <span>Free Shipping on Orders Over $500</span>
            <span>Lifetime Warranty</span>
          </div>
          <div class="flex gap-4">
            <a href="tel:+1234567890" class="hover:text-gold-400">+1 (234) 567-890</a>
            <a routerLink="/track-order" class="hover:text-gold-400">Track Order</a>
          </div>
        </div>
      </div>

      <!-- Main Header -->
      <div class="container mx-auto px-4 py-4">
        <div class="flex items-center justify-between gap-4">
          <!-- Mobile Menu Button -->
          <button class="lg:hidden p-2" (click)="toggleMobileMenu()">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
            </svg>
          </button>

          <!-- Logo -->
          <a routerLink="/" class="text-2xl font-serif font-bold text-primary-900 flex-shrink-0">
            GEMARA
          </a>

          <!-- Desktop Navigation -->
          <nav class="hidden lg:flex items-center gap-8">
            <a routerLink="/" routerLinkActive="text-gold-600" [routerLinkActiveOptions]="{exact: true}" class="font-medium hover:text-gold-600 transition-colors">Home</a>
            <a routerLink="/products" [queryParams]="{category: 'Engagement Ring'}" routerLinkActive="text-gold-600" class="font-medium hover:text-gold-600 transition-colors">Engagement</a>
            <a routerLink="/products" [queryParams]="{category: 'Wedding'}" routerLinkActive="text-gold-600" class="font-medium hover:text-gold-600 transition-colors">Wedding</a>
            <a routerLink="/products" [queryParams]="{category: 'Gemstone'}" routerLinkActive="text-gold-600" class="font-medium hover:text-gold-600 transition-colors">Gemstones</a>
            <a routerLink="/builder" routerLinkActive="text-gold-600" class="font-medium hover:text-gold-600 transition-colors">Build Your Ring</a>
            <a routerLink="/about" routerLinkActive="text-gold-600" class="font-medium hover:text-gold-600 transition-colors">Our Story</a>
          </nav>

          <!-- Search Bar -->
          <div class="hidden md:block flex-1 max-w-md mx-4 relative group">
            <div class="relative">
              <input
                type="text"
                [(ngModel)]="searchQuery"
                (input)="onSearchInput()"
                (focus)="isSearchFocused = true"
                (blur)="onSearchBlur()"
                placeholder="Search for diamonds, rings..."
                class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-full focus:outline-none focus:border-gold-500 transition-all duration-300"
              >
              <svg class="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>

            <!-- Search Results Dropdown -->
            <div *ngIf="isSearchFocused && searchResults.length > 0" class="absolute top-full left-0 w-full bg-white shadow-lg rounded-b-lg mt-1 border border-gray-100 py-2 z-50">
              <a
                *ngFor="let result of searchResults"
                [routerLink]="['/products', result.id]"
                class="block px-4 py-2 hover:bg-gray-50 flex items-center gap-3"
              >
                <div class="w-10 h-10 bg-gray-100 rounded flex-shrink-0 overflow-hidden">
                  <img *ngIf="result.imageUrl" [src]="result.imageUrl" class="w-full h-full object-cover">
                </div>
                <div>
                  <div class="text-sm font-medium text-gray-900">{{result.name}}</div>
                  <div class="text-xs text-gray-500">{{result.category}}</div>
                </div>
              </a>
            </div>
          </div>

          <!-- Icons -->
          <div class="flex items-center gap-4">
            <a routerLink="/wishlist" class="relative hover:text-gold-600 transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
              </svg>
              <span *ngIf="wishlistCount() > 0" class="absolute -top-2 -right-2 bg-gold-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                {{ wishlistCount() }}
              </span>
            </a>

            <a routerLink="/cart" class="relative hover:text-gold-600 transition-colors">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
              </svg>
              <span *ngIf="cartCount() > 0" class="absolute -top-2 -right-2 bg-gold-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full">
                {{ cartCount() }}
              </span>
            </a>

            <div class="relative group">
              <a [routerLink]="user() ? '/account' : '/login'" class="hover:text-gold-600 transition-colors flex items-center gap-2">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                <span *ngIf="user()" class="text-sm font-medium hidden sm:block">Hi, {{ user()?.firstName }}</span>
              </a>

              <!-- User Dropdown -->
              <div *ngIf="user()" class="absolute right-0 top-full pt-2 hidden group-hover:block w-48 z-50">
                <div class="bg-white shadow-lg rounded-lg py-2 border border-gray-100">
                  <a routerLink="/account" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">My Account</a>
                  <a [routerLink]="['/account']" [queryParams]="{tab: 'orders'}" class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">My Orders</a>
                  <button (click)="logout()" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-50">Logout</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Mobile Menu -->
      <div *ngIf="isMobileMenuOpen" class="lg:hidden border-t border-gray-200 bg-white">
        <div class="container mx-auto px-4 py-4 flex flex-col gap-4">
          <div class="relative">
             <input
                type="text"
                [(ngModel)]="searchQuery"
                (input)="onSearchInput()"
                placeholder="Search..."
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gold-500"
              >
          </div>
          <a routerLink="/" (click)="toggleMobileMenu()" class="font-medium text-gray-800">Home</a>
          <a routerLink="/products" [queryParams]="{category: 'Engagement Ring'}" (click)="toggleMobileMenu()" class="font-medium text-gray-800">Engagement Rings</a>
          <a routerLink="/products" [queryParams]="{category: 'Wedding'}" (click)="toggleMobileMenu()" class="font-medium text-gray-800">Wedding</a>
          <a routerLink="/products" [queryParams]="{category: 'Gemstone'}" (click)="toggleMobileMenu()" class="font-medium text-gray-800">Gemstones</a>
          <a routerLink="/builder" (click)="toggleMobileMenu()" class="font-medium text-gray-800">Build Your Ring</a>
          <a routerLink="/about" (click)="toggleMobileMenu()" class="font-medium text-gray-800">Our Story</a>
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
