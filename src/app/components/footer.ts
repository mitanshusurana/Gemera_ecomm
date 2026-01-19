import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { WhatsappButtonComponent } from "./whatsapp-button";
import { APP_CATEGORIES } from "../core/constants";

@Component({
  selector: "app-footer",
  standalone: true,
  imports: [CommonModule, WhatsappButtonComponent, RouterLink],
  template: `
    <footer class="bg-primary-950 text-white w-full overflow-hidden border-t-4 border-secondary-500">
      <!-- Newsletter Section -->
      <div class="bg-primary-900 border-b border-primary-800">
          <div class="container-luxury py-8 md:py-12 flex flex-col md:flex-row items-center justify-between gap-6">
             <div class="text-center md:text-left">
                <h3 class="font-display font-bold text-2xl mb-1">Join the Gemara Family</h3>
                <p class="text-primary-200 text-sm">Be the first to know about new collections & exclusive offers.</p>
             </div>
             <div class="flex w-full md:w-auto max-w-md gap-0">
                <input type="email" placeholder="Enter your email" class="w-full px-4 py-3 bg-white text-gray-900 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-secondary-500">
                <button class="bg-secondary-500 hover:bg-secondary-600 text-white font-bold px-6 py-3 rounded-r-lg transition-colors whitespace-nowrap">
                   Sign Up
                </button>
             </div>
          </div>
      </div>

      <!-- Main Footer -->
      <div class="container-luxury section-padding pt-16 pb-8">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 mb-12">
          <!-- Brand -->
          <div class="col-span-1">
            <div class="flex items-center gap-2 mb-6">
              <div class="flex flex-col">
                <span class="font-bold text-2xl font-display tracking-wide">GEMARA</span>
                <span class="text-[0.6rem] uppercase tracking-[0.2em] text-secondary-500 font-semibold">Fine Jewels</span>
              </div>
            </div>
            <p class="text-sm text-primary-200 mb-6 leading-relaxed">
              Crafting stories in stone. We bring you ethically sourced, museum-quality gemstones and heritage jewelry designed for the modern connoisseur.
            </p>
            <div class="flex gap-4">
              <a href="#" class="w-8 h-8 rounded-full bg-primary-800 flex items-center justify-center hover:bg-secondary-500 transition-colors">
                <span class="sr-only">Facebook</span>
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
              </a>
              <a href="#" class="w-8 h-8 rounded-full bg-primary-800 flex items-center justify-center hover:bg-secondary-500 transition-colors">
                <span class="sr-only">Instagram</span>
                <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.057-1.645.069-4.849.069-3.205 0-3.584-.012-4.849-.069-3.259-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
              </a>
            </div>
          </div>

          <!-- Quick Links -->
          <div>
            <h4 class="font-bold mb-6 font-display text-lg text-white">Collections</h4>
            <ul class="space-y-3">
              <li><a routerLink="/rfq" class="text-sm font-bold text-secondary-400 hover:text-white transition-colors flex items-center gap-1">📋 Request for Quote</a></li>
              <li><a routerLink="/treasure" class="text-sm font-bold text-secondary-400 hover:text-white transition-colors flex items-center gap-1">✨ Treasure Plan</a></li>
              <li *ngFor="let cat of categories.slice(0, 5)">
                <a [routerLink]="['/products']" [queryParams]="{category: cat.value}" class="text-sm text-primary-200 hover:text-secondary-400 transition-colors">{{ cat.displayName }}</a>
              </li>
            </ul>
          </div>

          <!-- Customer Service -->
          <div>
            <h4 class="font-bold mb-6 font-display text-lg text-white">Customer Care</h4>
            <ul class="space-y-3">
              <li><a routerLink="/contact" class="text-sm text-primary-200 hover:text-secondary-400 transition-colors">Contact Us</a></li>
              <li><a routerLink="/about" class="text-sm text-primary-200 hover:text-secondary-400 transition-colors">Shipping & Returns</a></li>
              <li><a routerLink="/account" class="text-sm text-primary-200 hover:text-secondary-400 transition-colors">Track Order</a></li>
              <li><a routerLink="/verify-certificate" class="text-sm text-primary-200 hover:text-secondary-400 transition-colors">Certifications</a></li>
            </ul>
          </div>

          <!-- Contact Info -->
          <div>
            <h4 class="font-bold mb-6 font-display text-lg text-white">Contact Us</h4>
             <ul class="space-y-4">
               <li class="flex items-start gap-3 text-sm text-primary-200">
                 <span class="text-secondary-500 mt-1">📍</span>
                 <span>123 Jewel Street, Luxury Tower,<br>New York, NY 10001</span>
               </li>
               <li class="flex items-center gap-3 text-sm text-primary-200">
                 <span class="text-secondary-500">📞</span>
                 <a href="tel:+1234567890" class="hover:text-white">+1 (234) 567-890</a>
               </li>
               <li class="flex items-center gap-3 text-sm text-primary-200">
                 <span class="text-secondary-500">✉️</span>
                 <a href="mailto:support@gemara.com" class="hover:text-white">support@gemara.com</a>
               </li>
             </ul>
          </div>
        </div>

        <!-- Bottom Footer -->
        <div
          class="border-t border-primary-800 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-primary-300"
        >
          <div class="text-center md:text-left">&copy; 2024 Gemara Fine Jewels. All rights reserved.</div>
          <div class="flex flex-wrap justify-center gap-6">
            <a routerLink="/privacy" class="hover:text-white transition-colors">Privacy Policy</a>
            <a routerLink="/terms" class="hover:text-white transition-colors">Terms of Service</a>
          </div>
        </div>
      </div>
    </footer>

    <!-- WhatsApp Button -->
    <app-whatsapp-button></app-whatsapp-button>
  `,
})
export class FooterComponent {
  categories = APP_CATEGORIES;
}
