import { Component, OnInit, computed, signal, inject, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router, NavigationEnd, RouterLinkActive } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { ProductService } from '../services/product.service';
import { Product, User } from '../core/models';
import { FormsModule } from '@angular/forms';
import { WishlistService } from '../services/wishlist.service';
import { CurrencyService } from '../services/currency.service';


@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="bg-surface sticky top-0 z-50 shadow-sm font-sans">
      <!-- Top Bar (Purple) -->
      <div class="bg-primary text-surface py-1.5 text-xs tracking-wide">
        <div class="container mx-auto px-4 flex justify-between items-center gap-2 md:gap-4 relative overflow-visible">
          <div class="hidden sm:flex gap-6 flex-shrink-0 whitespace-nowrap">
            <span class="flex items-center gap-1.5 font-medium">
              <svg class="w-3.5 h-3.5 text-accent" fill="currentColor" viewBox="0 0 20 20"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z"/></svg>
              Caratloop Treasure Plan
            </span>
            <span class="hidden md:inline opacity-80">|</span>
            <span class="inline font-medium text-accent">Free Shipping on Orders Over $500</span>
          </div>
          <div class="flex gap-4 md:gap-6 text-surface items-center whitespace-nowrap w-full sm:w-auto justify-between sm:justify-end">
            <a routerLink="/rfq" class="hidden md:inline hover:text-surface transition-colors font-bold text-accent">Bulk Orders</a>
            <a routerLink="/stores" class="hidden lg:inline hover:text-surface transition-colors">Find a Store</a>
            <a href="#" class="hover:text-surface transition-colors">Help</a>
            <a routerLink="/track-order" class="hover:text-surface transition-colors" aria-label="Track Order Header Menu">Track Order</a>

            <!-- Currency Selector -->
            <div class="relative group ml-2" (mouseenter)="isCurrencyDropdownOpen = true" (mouseleave)="isCurrencyDropdownOpen = false">
              <button class="flex items-center gap-1 hover:text-surface transition-colors font-bold text-accent uppercase cursor-pointer"
                      (click)="isCurrencyDropdownOpen = !isCurrencyDropdownOpen"
                      (focus)="isCurrencyDropdownOpen = true"
                      (blur)="closeCurrencyDropdownWithDelay()">
                {{ currentCurrency() }}
                <svg class="w-3 h-3 transition-transform" [class.rotate-180]="isCurrencyDropdownOpen" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </button>
              <div class="absolute right-0 top-full pt-2 z-[100]" [class.hidden]="!isCurrencyDropdownOpen" [class.block]="isCurrencyDropdownOpen">
                <div class="bg-surface text-ink rounded-md shadow-xl py-1 border border-ink min-w-[100px] transform origin-top-right transition-all">
                  <button *ngFor="let code of availableCurrencies"
                          (click)="setCurrency(code)"
                          class="block w-full text-left px-4 py-1.5 text-xs hover:bg-primary-50 hover:text-ink font-medium"
                          [class.text-ink]="currentCurrency() === code"
                          [class.bg-primary-50]="currentCurrency() === code">
                    {{ code }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Header -->
      <div class="container mx-auto px-4 py-3">
        <div class="flex items-center justify-between gap-6">

          <!-- Mobile Menu & Logo -->
          <div class="flex items-center gap-4">
            <button class="lg:hidden text-ink" (click)="toggleMobileMenu()" aria-label="Toggle Mobile Menu">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
              </svg>
            </button>

            <!-- Logo -->
            <a routerLink="/" class="flex items-center">
              <img src="/logo-with-name.png" alt="Caratloop Fine Jewelry Logo" class="h-16 w-auto object-contain" width="163" height="80" />
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
                class="w-full pl-4 pr-10 py-2.5 bg-surface border border-primary-200 rounded-lg focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 transition-all text-sm placeholder-gray-400 text-ink"
              >
              <button aria-label="Submit search" class="absolute right-0 top-0 h-full px-4 bg-primary text-surface rounded-r-lg hover:bg-primary transition-colors">
                 <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
              </button>
            </div>

            <!-- Search Results Dropdown -->
            <div *ngIf="isSearchFocused && searchResults.length > 0" class="absolute top-full left-0 w-full bg-surface shadow-xl rounded-b-lg mt-0.5 border-x border-b border-ink py-2 z-50">
              <a
                *ngFor="let result of searchResults"
                [routerLink]="['/products', result.id]"
                class="block px-4 py-2 hover:bg-primary-50 flex items-center gap-3 transition-colors"
              >
                <div class="w-10 h-10 bg-surface rounded flex-shrink-0 overflow-hidden border border-ink">
                  <img *ngIf="result.imageUrl" [src]="result.imageUrl" class="w-full h-full object-cover">
                </div>
                <div>
                  <div class="text-sm font-medium text-ink">{{result.name}}</div>
                  <div class="text-xs text-accent font-semibold uppercase">{{result.category}}</div>
                </div>
              </a>
            </div>
          </div>

          <!-- Icons Actions -->
          <div class="flex items-center gap-3 md:gap-6">
            <!-- Treasure Icon (New) -->
            <a routerLink="/treasure" class="hidden sm:flex flex-col items-center text-ink hover:text-ink transition-colors group">
              <div class="w-6 h-6 flex items-center justify-center mb-0.5">
                 <span class="text-xl group-hover:scale-110 transition-transform">💎</span>
              </div>
              <span class="text-[0.65rem] font-bold uppercase tracking-wide">Plan</span>
            </a>

            <!-- User -->
            <div class="relative group">
              <a [routerLink]="user() ? '/account' : '/login'" class="flex flex-col items-center text-ink hover:text-ink transition-colors">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                </svg>
                <span class="text-[0.65rem] font-bold uppercase tracking-wide">Account</span>
              </a>
               <!-- User Dropdown -->
              <div *ngIf="user()" class="absolute right-0 top-full pt-2 hidden group-hover:block w-48 z-50">
                <div class="bg-surface shadow-lg rounded-lg py-2 border border-ink">
                  <div class="px-4 py-2 border-b border-ink text-xs text-ink">Hello, {{ user()?.firstName }}</div>
                  <a routerLink="/account" class="block px-4 py-2 text-sm text-ink hover:bg-primary-50 hover:text-ink">My Account</a>
                  <a [routerLink]="['/account']" [queryParams]="{tab: 'orders'}" class="block px-4 py-2 text-sm text-ink hover:bg-primary-50 hover:text-ink">My Orders</a>
                  <a routerLink="/treasure" class="block px-4 py-2 text-sm font-extrabold text-accent hover:bg-secondary-50">My Treasure Plan</a>
                  <button (click)="logout()" class="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Logout</button>
                </div>
              </div>
            </div>

            <!-- Wishlist -->
            <a routerLink="/wishlist" class="flex flex-col items-center text-ink hover:text-ink transition-colors relative">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
              </svg>
              <span class="text-[0.65rem] font-bold uppercase tracking-wide">Wishlist</span>
              <span *ngIf="wishlistCount() > 0" class="absolute -top-1 -right-1 bg-accent text-surface text-[0.6rem] w-4 h-4 flex items-center justify-center rounded-full font-bold shadow-sm">
                {{ wishlistCount() }}
              </span>
            </a>

            <!-- Cart -->
            <a routerLink="/cart" class="flex flex-col items-center text-ink hover:text-ink transition-colors relative">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path>
              </svg>
              <span class="text-[0.65rem] font-bold uppercase tracking-wide">Cart</span>
              <span *ngIf="cartCount() > 0" class="absolute -top-1 -right-1 bg-accent text-surface text-[0.6rem] w-4 h-4 flex items-center justify-center rounded-full font-bold shadow-sm">
                {{ cartCount() }}
              </span>
            </a>
          </div>
        </div>

        <!-- Navigation Categories (Desktop) -->
        <nav class="hidden lg:flex justify-center items-center gap-8 mt-4 border-t border-ink pt-3 relative">
            <div *ngFor="let cat of categories" class="group/menu">
              <a [routerLink]="['/products']"
                 [queryParams]="{category: cat.name}"
                 class="text-sm font-semibold text-ink hover:text-ink uppercase tracking-wide px-2 py-3 relative block">
                  {{ cat.displayName }}
                  <span class="absolute bottom-0 left-0 w-full h-0.5 bg-primary scale-x-0 group-hover/menu:scale-x-100 transition-transform origin-left"></span>
              </a>

              <!-- Mega Menu Dropdown -->
              <div *ngIf="cat.subcategories && cat.subcategories.length > 0" class="absolute top-full left-0 w-full bg-surface shadow-2xl border-t border-ink opacity-0 invisible group-hover/menu:opacity-100 group-hover/menu:visible transition-all duration-300 z-50">
                <div class="container-luxury py-8">
                  <div class="flex flex-wrap gap-x-12 gap-y-8">
                    <div *ngFor="let subcat of cat.subcategories" class="min-w-[150px]">
                      <a [routerLink]="['/products']" [queryParams]="{category: subcat.name}" class="font-display font-bold text-ink mb-3 block hover:text-ink">
                        {{ subcat.displayName }} <span *ngIf="subcat.subcategories?.length" class="text-xs">›</span>
                      </a>
                      <ul *ngIf="subcat.subcategories && subcat.subcategories.length > 0" class="space-y-2">
                        <li *ngFor="let child of subcat.subcategories">
                          <a [routerLink]="['/products']" [queryParams]="{category: child.name}" class="text-sm text-ink hover:text-ink transition-colors">
                            {{ child.displayName }}
                          </a>
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <a routerLink="/custom-design" class="text-sm font-bold text-ink hover:text-ink uppercase tracking-wide px-2 py-3 relative group/menu flex items-center gap-1">
                <span class="text-lg">🎨</span> Custom Design
            </a>
            <a routerLink="/treasure" class="text-sm font-bold text-accent hover:text-accent uppercase tracking-wide px-2 py-3 relative group/menu flex items-center gap-1">
                <span class="text-lg">💎</span> Treasure Plan
            </a>
        </nav>
      </div>

      <!-- Mobile Menu -->
      <div *ngIf="isMobileMenuOpen" class="lg:hidden border-t border-ink bg-surface absolute w-full shadow-lg z-50 left-0">
        <div class="px-4 py-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
          <div class="relative">
             <input
                type="text"
                [(ngModel)]="searchQuery"
                (input)="onSearchInput()"
                placeholder="Search..."
                class="w-full px-4 py-2 border border-ink rounded-lg focus:outline-none focus:border-primary-500"
              >
          </div>
          <a routerLink="/" (click)="toggleMobileMenu()" class="font-medium text-ink py-2 border-b border-ink">Home</a>
          <div *ngFor="let cat of categories" class="border-b border-ink">
            <div class="flex justify-between items-center py-2">
              <a [routerLink]="['/products']" [queryParams]="{category: cat.name}" (click)="toggleMobileMenu()" class="font-medium text-ink flex-1">
                {{ cat.displayName }}
              </a>
              <button *ngIf="cat.subcategories?.length" (click)="activeMobileCategory = activeMobileCategory === cat.id ? null : cat.id" class="px-2 py-1 text-ink">
                <svg class="w-4 h-4 transition-transform" [class.rotate-180]="activeMobileCategory === cat.id" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
              </button>
            </div>

            <div *ngIf="activeMobileCategory === cat.id && cat.subcategories?.length" class="pl-4 pb-2">
              <div *ngFor="let subcat of cat.subcategories" class="py-1">
                <a [routerLink]="['/products']" [queryParams]="{category: subcat.name}" (click)="toggleMobileMenu()" class="text-sm font-semibold text-ink block py-1">
                  {{ subcat.displayName }}
                </a>
                <div *ngIf="subcat.subcategories?.length" class="pl-4">
                   <a *ngFor="let child of subcat.subcategories" [routerLink]="['/products']" [queryParams]="{category: child.name}" (click)="toggleMobileMenu()" class="text-sm text-ink block py-1">
                     - {{ child.displayName }}
                   </a>
                </div>
              </div>
            </div>
          </div>
          <a routerLink="/custom-design" (click)="toggleMobileMenu()" class="font-bold text-ink py-2 border-b border-ink flex items-center gap-2">🎨 Custom Design</a>
          <a routerLink="/treasure" (click)="toggleMobileMenu()" class="font-bold text-accent py-2 border-b border-ink flex items-center gap-2">💎 Treasure Plan</a>
        </div>
      </div>
    </header>
  `
})
export class HeaderComponent implements OnInit {
  activeMobileCategory: string | null = null;
  isMobileMenuOpen = false;
  isCurrencyDropdownOpen = false;
  searchQuery = '';
  searchResults: Product[] = [];
  isSearchFocused = false;
  categories: any[] = [];

  private authService = inject(AuthService);
  private cartService = inject(CartService);
  private productService = inject(ProductService);
  private router = inject(Router);
  private wishlistService = inject(WishlistService);
  private currencyService = inject(CurrencyService);
  private cdr = inject(ChangeDetectorRef);

  userSignal = signal<User | null>(null);
  user = this.userSignal;

  cartCount = signal(0);
  wishlistCount = this.wishlistService.count;

  availableCurrencies = this.currencyService.availableCurrencies;
  currentCurrency = this.currencyService.currentCurrency;

  ngOnInit() {
    this.productService.getCategories().subscribe({
      next: (res: any) => {
        this.categories = res.categories;
        this.cdr.markForCheck();
      }
    });
  }

  constructor() {
    this.authService.user()
      .pipe(takeUntilDestroyed())
      .subscribe(u => this.userSignal.set(u));

    this.cartService.cart()
      .pipe(takeUntilDestroyed())
      .subscribe(c => {
        const count = c?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;
        this.cartCount.set(count);
      });

    // Close mobile menu on route change
    this.router.events
      .pipe(takeUntilDestroyed())
      .subscribe(event => {
        if (event instanceof NavigationEnd) {
          this.isMobileMenuOpen = false;
          this.cdr.markForCheck();
        }
      });
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    this.cdr.markForCheck();
  }

  logout() {
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/']);
    });
  }

  onSearchInput() {
    if (this.searchQuery.length > 2) {
      this.productService.searchProducts(this.searchQuery).subscribe(res => {
        this.searchResults = res.results;
        this.cdr.markForCheck();
      });
    } else {
      this.searchResults = [];
    }
  }

  onSearchBlur() {
    // Delay hiding so click on result works
    setTimeout(() => {
      this.isSearchFocused = false;
      this.cdr.markForCheck();
    }, 200);
  }

  closeCurrencyDropdownWithDelay() {
    setTimeout(() => {
      this.isCurrencyDropdownOpen = false;
      this.cdr.markForCheck();
    }, 200);
  }

  setCurrency(code: any) {
    this.currencyService.setCurrency(code);
    this.isCurrencyDropdownOpen = false;
  }
}
