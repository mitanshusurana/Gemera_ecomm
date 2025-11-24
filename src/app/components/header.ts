import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <header class="sticky top-0 z-50 bg-white border-b border-diamond-200 backdrop-blur-md bg-white/95">
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
            <a href="#categories" 
               class="text-sm font-medium text-diamond-700 hover:text-gold-600 transition-colors duration-300">
              Categories
            </a>
            <a href="#about" 
               class="text-sm font-medium text-diamond-700 hover:text-gold-600 transition-colors duration-300">
              About
            </a>
            <a href="#contact" 
               class="text-sm font-medium text-diamond-700 hover:text-gold-600 transition-colors duration-300">
              Contact
            </a>
          </nav>

          <!-- Actions -->
          <div class="flex items-center gap-4">
            <button class="hidden sm:flex items-center justify-center w-10 h-10 hover:bg-gold-50 rounded-lg transition-colors duration-300">
              <svg class="w-5 h-5 text-diamond-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </button>
            <button class="hidden sm:flex items-center justify-center w-10 h-10 hover:bg-gold-50 rounded-lg transition-colors duration-300 relative">
              <svg class="w-5 h-5 text-diamond-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
              </svg>
              <span class="absolute top-0 right-0 w-5 h-5 bg-rose-500 text-white text-xs font-bold rounded-full flex items-center justify-center">0</span>
            </button>
            <button class="flex items-center justify-center w-10 h-10 hover:bg-gold-50 rounded-lg transition-colors duration-300 relative">
              <svg class="w-5 h-5 text-diamond-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path>
              </svg>
              <span class="absolute top-0 right-0 w-5 h-5 bg-gold-500 text-white text-xs font-bold rounded-full flex items-center justify-center">{{ cartCount() }}</span>
            </button>
            <a routerLink="/account" class="hidden sm:flex items-center justify-center w-10 h-10 hover:bg-gold-50 rounded-lg transition-colors duration-300">
              <svg class="w-5 h-5 text-diamond-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
              </svg>
            </a>
            <button (click)="toggleMobileMenu()" class="md:hidden flex items-center justify-center w-10 h-10 hover:bg-gold-50 rounded-lg transition-colors duration-300">
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
            <a href="#categories" (click)="mobileMenuOpen.set(false)" class="text-sm font-medium text-diamond-700 hover:text-gold-600">Categories</a>
            <a href="#about" (click)="mobileMenuOpen.set(false)" class="text-sm font-medium text-diamond-700 hover:text-gold-600">About</a>
            <a href="#contact" (click)="mobileMenuOpen.set(false)" class="text-sm font-medium text-diamond-700 hover:text-gold-600">Contact</a>
          </nav>
        </div>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  cartCount = signal(0);
  mobileMenuOpen = signal(false);

  toggleMobileMenu() {
    this.mobileMenuOpen.update(value => !value);
  }
}
