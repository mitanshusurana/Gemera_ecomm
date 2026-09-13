import { Component, OnInit, signal, inject, ChangeDetectionStrategy, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { ProductService } from '../services/product.service';
import { Product, User } from '../core/models';
import { FormsModule } from '@angular/forms';
import { GoldRateTickerComponent } from './gold-rate-ticker';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, NgOptimizedImage, GoldRateTickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- APPLE DESIGN SYSTEM: TWO-TIER NAVIGATION SYSTEM (DESIGN.md) -->
    <header class="fixed top-0 w-full z-50 transition-all duration-300">
      
      <!-- Tier 1: Global Black Top Bar (44px, bg-[#000000], text-white) -->
      <nav class="bg-[#000000] text-white h-[44px] flex items-center px-4 md:px-12 text-[12px] font-sans tracking-tight border-b border-white/10">
        <div class="max-w-[1440px] w-full mx-auto flex items-center justify-between">
          
          <!-- Logo & Brand (Left) -->
          <div class="flex items-center space-x-6">
            <a routerLink="/" class="flex items-center hover:opacity-80 transition-opacity">
              <img ngSrc="/logo-with-name.png" alt="Caratloop" class="h-6 w-auto brightness-200 invert" width="61" height="30" priority />
            </a>
            
            <!-- Quick Links Desktop -->
            <div class="hidden lg:flex items-center space-x-6 text-[#cccccc] font-normal">
              <a routerLink="/products" class="hover:text-white transition-colors">Collections</a>
              <a routerLink="/custom-design" class="hover:text-white transition-colors">Custom Design</a>
              <a routerLink="/treasure" class="hover:text-white transition-colors">Treasure Plan</a>
              <a routerLink="/verify-certificate" class="hover:text-white transition-colors">Verify Gem</a>
            </div>
          </div>

          <!-- Utility Bar (Right): Search, Account, Cart, Mobile Toggle -->
          <div class="flex items-center space-x-5 text-[#cccccc]">
            
            <!-- Gold Rate Ticker Highlight -->
            <div class="hidden sm:block text-[11px] text-[#D4AF37] font-medium border-r border-white/20 pr-4">
              <app-gold-rate-ticker></app-gold-rate-ticker>
            </div>

            <!-- Search Button -->
            <button (click)="isSearchFocused = !isSearchFocused" aria-label="Search" class="hover:text-white transition-colors active-press">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </button>

            <!-- User Account -->
            <a [routerLink]="user() ? '/account' : '/login'" aria-label="Account" class="hover:text-white transition-colors active-press">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
            </a>

            <!-- Cart Icon with Badge -->
            <a routerLink="/cart" aria-label="Cart" class="relative hover:text-white transition-colors active-press flex items-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
              <span *ngIf="cartCount() > 0" class="ml-1 bg-[#D4AF37] text-black text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {{ cartCount() }}
              </span>
            </a>

            <!-- Mobile Menu Hamburger -->
            <button class="lg:hidden hover:text-white transition-colors active-press" (click)="toggleMobileMenu()" aria-label="Toggle Menu">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </button>
          </div>

        </div>
      </nav>

      <!-- Tier 2: Frosted Sub-Nav Bar (52px, bg-[#f5f5f7]/85, backdrop-blur-xl) -->
      <nav class="sub-nav-frosted h-[52px] flex items-center px-4 md:px-12 text-[#1d1d1f]">
        <div class="max-w-[1440px] w-full mx-auto flex items-center justify-between">
          
          <!-- Category / Title -->
          <a routerLink="/products" class="font-display font-semibold text-lg tracking-tight hover:opacity-80 transition-opacity">
            Caratloop Fine Jewelry
          </a>

          <!-- Sub-Nav Links & Action Pill -->
          <div class="flex items-center space-x-6">
            <div class="hidden md:flex items-center space-x-6 text-[13px] font-sans text-[#1d1d1f]">
              <a routerLink="/products" [queryParams]="{category: 'rings'}" class="hover:text-[#D4AF37] transition-colors">Rings</a>
              <a routerLink="/products" [queryParams]="{category: 'necklaces'}" class="hover:text-[#D4AF37] transition-colors">Necklaces</a>
              <a routerLink="/products" [queryParams]="{category: 'earrings'}" class="hover:text-[#D4AF37] transition-colors">Earrings</a>
              <a routerLink="/products" [queryParams]="{category: 'diamonds'}" class="hover:text-[#D4AF37] transition-colors">Certified Diamonds</a>
            </div>

            <!-- Signature Gold Primary Action Pill -->
            <a routerLink="/builder" class="btn-apple-pill text-xs !py-1.5 !px-4">
              Build Custom Ring
            </a>
          </div>

        </div>
      </nav>

      <!-- Apple Search Overlay (Pill Input Grammar) -->
      <div *ngIf="isSearchFocused" class="absolute top-full left-0 w-full bg-[#f5f5f7]/95 backdrop-blur-2xl shadow-xl border-b border-[#e0e0e0] py-8 z-40 animate-fadeIn">
        <div class="max-w-[800px] mx-auto px-6">
          <div class="relative flex items-center">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (input)="onSearchInput()"
              placeholder="Search fine jewelry, diamonds, custom rings..."
              class="w-full bg-white border border-[#e0e0e0] rounded-full px-6 py-3 text-base text-[#1d1d1f] focus:outline-none focus:border-[#D4AF37] shadow-sm transition-colors"
              autofocus
            >
            <button (click)="isSearchFocused = false" class="ml-4 text-xs font-sans text-[#7a7a7a] hover:text-[#1d1d1f]">Cancel</button>
          </div>
          
          <div *ngIf="searchResults.length > 0" class="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
             <a *ngFor="let result of searchResults | slice:0:3" [routerLink]="['/products', result.id]" (click)="isSearchFocused = false" class="bg-white border border-[#e0e0e0] rounded-[18px] p-4 flex items-center gap-3 hover:border-[#D4AF37] transition-all group">
               <div class="w-14 h-14 bg-[#f5f5f7] rounded-lg overflow-hidden flex-shrink-0">
                 <img *ngIf="result.imageUrl" [src]="result.imageUrl" class="w-full h-full object-cover group-hover:scale-105 transition-transform">
               </div>
               <div>
                 <h4 class="font-sans font-medium text-[#1d1d1f] text-sm group-hover:text-[#D4AF37] transition-colors">{{ result.name }}</h4>
                 <p class="font-sans text-xs text-[#7a7a7a]">{{ result.category }}</p>
               </div>
             </a>
          </div>
        </div>
      </div>
      
      <!-- Mobile Tray Menu -->
      <div *ngIf="isMobileMenuOpen" class="lg:hidden bg-[#1c1c1e] text-white shadow-2xl border-t border-white/10 z-50 animate-fadeIn">
        <div class="px-6 py-6 flex flex-col gap-4 font-sans text-sm">
          <a routerLink="/" (click)="toggleMobileMenu()" class="py-2 border-b border-white/10 text-white/90">Home</a>
          <a routerLink="/products" (click)="toggleMobileMenu()" class="py-2 border-b border-white/10 text-white/90">Collections</a>
          <a routerLink="/custom-design" (click)="toggleMobileMenu()" class="py-2 border-b border-white/10 text-white/90">Custom Design</a>
          <a routerLink="/builder" (click)="toggleMobileMenu()" class="py-2 border-b border-white/10 text-[#D4AF37] font-semibold">Ring Builder</a>
          <a routerLink="/treasure" (click)="toggleMobileMenu()" class="py-2 border-b border-white/10 text-white/90">Treasure Plan</a>
          <a routerLink="/track-order" (click)="toggleMobileMenu()" class="py-2 text-white/90">Track Order</a>
        </div>
      </div>

    </header>
  `
})
export class HeaderComponent implements OnInit {
  isMobileMenuOpen = false;
  searchQuery = '';
  searchResults: Product[] = [];
  isSearchFocused = false;
  private searchSubject = new Subject<string>();

  private authService = inject(AuthService);
  private cartService = inject(CartService);
  private productService = inject(ProductService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  userSignal = signal<User | null>(null);
  user = this.userSignal;

  cartCount = signal(0);

  ngOnInit() {
    this.searchSubject.pipe(
      takeUntilDestroyed(this.destroyRef),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => this.productService.searchProducts(query))
    ).subscribe(res => {
      this.searchResults = res.results;
      this.cdr.markForCheck();
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
          this.isSearchFocused = false;
          this.cdr.markForCheck();
        }
      });
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    this.cdr.markForCheck();
  }

  onSearchInput() {
    if (this.searchQuery.length > 2) {
      this.searchSubject.next(this.searchQuery);
    } else {
      this.searchResults = [];
    }
  }

}
