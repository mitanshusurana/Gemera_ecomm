import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterLink } from "@angular/router";
import { WhatsappButtonComponent } from "./whatsapp-button";

@Component({
  selector: "app-footer",
  standalone: true,
  imports: [CommonModule, WhatsappButtonComponent, RouterLink],
  template: `
    <footer class="bg-gradient-luxury text-white">
      <!-- Main Footer -->
      <div class="container-luxury section-padding">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-12 mb-12">
          <!-- Brand -->
          <div class="col-span-1">
            <div class="flex items-center gap-2 mb-6">
              <div
                class="w-10 h-10 bg-gold-500 rounded-lg flex items-center justify-center"
              >
                <span class="text-white font-bold text-lg">✦</span>
              </div>
              <div class="flex flex-col">
                <span class="font-bold text-lg font-display">Gemara</span>
                <span class="text-xs text-gold-300">Fine Jewels</span>
              </div>
            </div>
            <p class="text-sm text-gray-300 mb-6">
              Discover timeless elegance with our curated collection of finest
              gemstones and exquisite jewellery crafted for perfection.
            </p>
            <div class="flex gap-4">
              <a
                href="#"
                class="w-10 h-10 bg-white/10 hover:bg-gold-500 rounded-lg flex items-center justify-center transition-colors duration-300"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                  />
                </svg>
              </a>
              <a
                href="#"
                class="w-10 h-10 bg-white/10 hover:bg-gold-500 rounded-lg flex items-center justify-center transition-colors duration-300"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M8.29 20v-7.21H5.93V9.25h2.36V7.25c0-2.33 1.43-3.61 3.48-3.61.99 0 1.84.07 2.09.1v2.42h-1.44c-1.13 0-1.35.53-1.35 1.32v1.73h2.69l-.35 3.54h-2.34V20z"
                  />
                </svg>
              </a>
              <a
                href="#"
                class="w-10 h-10 bg-white/10 hover:bg-gold-500 rounded-lg flex items-center justify-center transition-colors duration-300"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.057-1.645.069-4.849.069-3.205 0-3.584-.012-4.849-.069-3.259-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
                  />
                </svg>
              </a>
              <a
                href="#"
                class="w-10 h-10 bg-white/10 hover:bg-gold-500 rounded-lg flex items-center justify-center transition-colors duration-300"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path
                    d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2s9 5 20 5a9.5 9.5 0 00-9-5.5c4.75 2.25 7-7 7-7s1.1 1.5 1-4.35a4.48 4.48 0 00-1-3.12z"
                  />
                </svg>
              </a>
            </div>
          </div>

          <!-- Quick Links -->
          <div>
            <h4 class="font-bold mb-6 font-display text-lg">Collections</h4>
            <ul class="space-y-3">
              <li>
                <a
                  routerLink="/products"
                  [queryParams]="{category: 'ring'}"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Diamond Rings</a
                >
              </li>
              <li>
                <a
                  routerLink="/products"
                  [queryParams]="{category: 'gemstone'}"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Gemstone Jewels</a
                >
              </li>
              <li>
                <a
                  routerLink="/products"
                  [queryParams]="{category: 'necklace'}"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Necklaces</a
                >
              </li>
              <li>
                <a
                  routerLink="/products"
                  [queryParams]="{category: 'bracelet'}"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Bracelets</a
                >
              </li>
              <li>
                <a
                  routerLink="/products"
                  [queryParams]="{category: 'earring'}"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Earrings</a
                >
              </li>
            </ul>
          </div>

          <!-- Customer Service -->
          <div>
            <h4 class="font-bold mb-6 font-display text-lg">Customer Care</h4>
            <ul class="space-y-3">
              <li>
                <a
                  routerLink="/contact"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Contact Us</a
                >
              </li>
              <li>
                <a
                  routerLink="/rfq"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Request for Quote</a
                >
              </li>
              <li>
                <a
                  routerLink="/about"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Shipping & Returns</a
                >
              </li>
              <li>
                <a
                  routerLink="/account"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Track Order</a
                >
              </li>
              <li>
                <a
                  routerLink="/about"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Size Guide</a
                >
              </li>
              <li>
                <a
                  routerLink="/about"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Certifications</a
                >
              </li>
            </ul>
          </div>

          <!-- Company -->
          <div>
            <h4 class="font-bold mb-6 font-display text-lg">Company</h4>
            <ul class="space-y-3">
              <li>
                <a
                  routerLink="/about"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >About Us</a
                >
              </li>
              <li>
                <a
                  routerLink="/about"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Our Story</a
                >
              </li>
              <li>
                <a
                  routerLink="/about"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Sustainability</a
                >
              </li>
              <li>
                <a
                  routerLink="/privacy"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Privacy Policy</a
                >
              </li>
              <li>
                <a
                  routerLink="/terms"
                  class="text-sm text-gray-300 hover:text-gold-400 transition-colors duration-300"
                  >Terms & Conditions</a
                >
              </li>
            </ul>
          </div>
        </div>

        <!-- Newsletter -->
        <div class="border-t border-white/20 pt-12 mb-12">
          <div class="max-w-md">
            <h3 class="font-display font-bold text-xl mb-3">
              Subscribe to Our Newsletter
            </h3>
            <p class="text-sm text-gray-300 mb-4">
              Get exclusive offers and latest collection updates.
            </p>
            <div class="flex gap-2">
              <input
                type="email"
                placeholder="Your email"
                class="flex-1 px-4 py-2.5 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gold-500"
              />
              <button class="btn-primary px-6">Subscribe</button>
            </div>
          </div>
        </div>

        <!-- Bottom Footer -->
        <div
          class="border-t border-white/20 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-gray-300"
        >
          <div class="text-center md:text-left">&copy; 2024 Gemara Fine Jewels. All rights reserved.</div>
          <div class="flex flex-wrap justify-center gap-4 md:gap-6 text-center">
            <a
              routerLink="/privacy"
              class="hover:text-gold-400 transition-colors duration-300"
              >Privacy Policy</a
            >
            <a
              routerLink="/terms"
              class="hover:text-gold-400 transition-colors duration-300"
              >Terms of Service</a
            >
            <a
              routerLink="/about"
              class="hover:text-gold-400 transition-colors duration-300"
              >Accessibility</a
            >
          </div>
          <div class="flex gap-3">
            <img
              src="https://img.shields.io/badge/Visa-1A1F71?style=for-the-badge&logo=Visa&logoColor=white"
              alt="Visa"
              class="h-6"
            />
            <img
              src="https://img.shields.io/badge/Mastercard-EB001B?style=for-the-badge&logo=Mastercard&logoColor=white"
              alt="Mastercard"
              class="h-6"
            />
            <img
              src="https://img.shields.io/badge/PayPal-003087?style=for-the-badge&logo=PayPal&logoColor=white"
              alt="PayPal"
              class="h-6"
            />
          </div>
        </div>
      </div>
    </footer>

    <!-- WhatsApp Button -->
    <app-whatsapp-button></app-whatsapp-button>
  `,
})
export class FooterComponent {}
