import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet, RouterLinkActive],
  template: `
    <div class="min-h-screen bg-gray-100 flex flex-col md:flex-row">
      <!-- Sidebar -->
      <aside
        [class.translate-x-0]="mobileMenuOpen()"
        [class.-translate-x-full]="!mobileMenuOpen()"
        class="w-64 bg-diamond-900 text-white flex-shrink-0 flex flex-col fixed md:relative h-full z-40 transition-transform duration-300 md:translate-x-0"
      >
        <div class="p-6 border-b border-diamond-800 flex justify-between items-center h-20 md:h-auto">
          <span class="text-xl font-display font-bold text-gold-500">Gemara Admin</span>
          <button (click)="mobileMenuOpen.set(false)" class="md:hidden text-gray-400">✕</button>
        </div>

        <nav class="flex-1 p-4 space-y-2 overflow-y-auto">
          <a routerLink="/admin/dashboard" (click)="mobileMenuOpen.set(false)" routerLinkActive="bg-diamond-800 text-gold-400" class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-diamond-800 transition-colors">
            <span>📊</span> Dashboard
          </a>
          <a routerLink="/admin/products" (click)="mobileMenuOpen.set(false)" routerLinkActive="bg-diamond-800 text-gold-400" class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-diamond-800 transition-colors">
            <span>💎</span> Products
          </a>
          <a routerLink="/admin/orders" (click)="mobileMenuOpen.set(false)" routerLinkActive="bg-diamond-800 text-gold-400" class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-diamond-800 transition-colors">
            <span>📦</span> Orders
          </a>
          <a routerLink="/admin/rfq" (click)="mobileMenuOpen.set(false)" routerLinkActive="bg-diamond-800 text-gold-400" class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-diamond-800 transition-colors">
            <span>💬</span> RFQ Requests
          </a>
        </nav>

        <div class="p-4 border-t border-diamond-800">
          <a routerLink="/" class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white transition-colors">
            <span>⬅️</span> Back to Store
          </a>
        </div>
      </aside>

      <!-- Overlay for mobile -->
      <div *ngIf="mobileMenuOpen()" (click)="mobileMenuOpen.set(false)" class="md:hidden fixed inset-0 bg-black/50 z-30 transition-opacity"></div>

      <!-- Mobile Header -->
      <div class="md:hidden fixed top-0 w-full bg-diamond-900 text-white z-20 px-4 flex justify-between items-center h-16 shadow-md">
        <span class="font-display font-bold text-gold-500 text-lg">Gemara Admin</span>
        <button (click)="toggleMobileMenu()" class="text-white p-2 focus:outline-none">
          <span class="text-2xl">☰</span>
        </button>
      </div>

      <!-- Main Content -->
      <main class="flex-1 overflow-y-auto p-4 md:p-8 pt-20 md:pt-8 w-full">
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class AdminLayoutComponent {
  mobileMenuOpen = signal(false);

  toggleMobileMenu() {
    this.mobileMenuOpen.update(v => !v);
  }
}
