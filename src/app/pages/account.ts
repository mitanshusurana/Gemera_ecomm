import { Component, OnInit, signal, inject, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { User, Order, Address, OrderItem, isPaidOrder } from '../core/models';
import { OrderService } from '../services/order.service';
import { WishlistService } from '../services/wishlist.service';
import { ToastService } from '../services/toast.service';
import { CategoryLabelService } from '../services/category-label.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import { COUNTRIES } from '../core/countries';
import { AccountRepairsComponent } from '../components/account-repairs';
import { AccountExchangeComponent } from '../components/account-exchange';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, NgOptimizedImage, FormsModule, RouterLink, CurrencyConvertPipe, AccountRepairsComponent, AccountExchangeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">
      <!-- Breadcrumb -->
      <div class="bg-[#f5f5f7] border-b border-[#e0e0e0]">
        <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-4">
          <div class="flex items-center gap-2 text-sm">
            <a routerLink="/" class="text-[#D4AF37] hover:underline">Home</a>
            <span class="text-[#6e6e73]">/</span>
            <span class="text-[#1d1d1f]">My Account</span>
          </div>
        </div>
      </div>

      <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-16">
        <h1 class="font-display font-semibold text-4xl md:text-5xl tracking-tight text-[#1d1d1f] mb-12">
          My Account
        </h1>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
          <!-- Sidebar Navigation -->
          <div class="md:col-span-1">
            <!-- Desktop Sidebar -->
            <div class="hidden md:block bg-white border border-[#e0e0e0] rounded-[18px] p-3 space-y-1 sticky top-[112px]">
              <button (click)="activeTab.set('profile')"
                      [ngClass]="activeTab() === 'profile' ? 'bg-[#1d1d1f] text-white' : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'"
                      class="w-full text-left px-4 py-2.5 rounded-full text-sm font-medium transition-colors duration-200 active-press">
                Profile Information
              </button>
              <button (click)="activeTab.set('orders')"
                      [ngClass]="activeTab() === 'orders' ? 'bg-[#1d1d1f] text-white' : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'"
                      class="w-full text-left px-4 py-2.5 rounded-full text-sm font-medium transition-colors duration-200 active-press">
                My Orders
              </button>
              <button (click)="activeTab.set('addresses')"
                      [ngClass]="activeTab() === 'addresses' ? 'bg-[#1d1d1f] text-white' : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'"
                      class="w-full text-left px-4 py-2.5 rounded-full text-sm font-medium transition-colors duration-200 active-press">
                Addresses
              </button>
              <button (click)="activeTab.set('wishlist')"
                      [ngClass]="activeTab() === 'wishlist' ? 'bg-[#1d1d1f] text-white' : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'"
                      class="w-full text-left px-4 py-2.5 rounded-full text-sm font-medium transition-colors duration-200 active-press">
                Wishlist
              </button>
              <button (click)="activeTab.set('settings')"
                      [ngClass]="activeTab() === 'settings' ? 'bg-[#1d1d1f] text-white' : 'text-[#1d1d1f] hover:bg-[#f5f5f7]'"
                      class="w-full text-left px-4 py-2.5 rounded-full text-sm font-medium transition-colors duration-200 active-press">
                Settings
              </button>
              <hr class="my-2 border-[#f0f0f0]">
              <button (click)="logout()" class="w-full text-left px-4 py-2.5 rounded-full text-sm font-medium text-red-600 hover:bg-red-50 transition-colors duration-200 active-press">
                Logout
              </button>
            </div>

            <!-- Mobile Navigation (Horizontal Scroll) -->
            <div class="md:hidden mb-6 overflow-x-auto pb-2 -mx-6 px-6 no-scrollbar">
               <div class="flex gap-2">
                  <button (click)="activeTab.set('profile')"
                          [class]="activeTab() === 'profile' ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]' : 'bg-white text-[#1d1d1f] border-[#e0e0e0]'"
                          class="px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition-colors active-press">
                     Profile
                  </button>
                  <button (click)="activeTab.set('orders')"
                          [class]="activeTab() === 'orders' ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]' : 'bg-white text-[#1d1d1f] border-[#e0e0e0]'"
                          class="px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition-colors active-press">
                     Orders
                  </button>
                  <button (click)="activeTab.set('addresses')"
                          [class]="activeTab() === 'addresses' ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]' : 'bg-white text-[#1d1d1f] border-[#e0e0e0]'"
                          class="px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition-colors active-press">
                     Addresses
                  </button>
                  <button (click)="activeTab.set('wishlist')"
                          [class]="activeTab() === 'wishlist' ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]' : 'bg-white text-[#1d1d1f] border-[#e0e0e0]'"
                          class="px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition-colors active-press">
                     Wishlist
                  </button>
                  <button (click)="activeTab.set('settings')"
                          [class]="activeTab() === 'settings' ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]' : 'bg-white text-[#1d1d1f] border-[#e0e0e0]'"
                          class="px-4 py-2 rounded-full border text-sm font-medium whitespace-nowrap transition-colors active-press">
                     Settings
                  </button>
                  <button (click)="logout()"
                          class="px-4 py-2 rounded-full border border-red-200 bg-red-50 text-red-600 text-sm font-medium whitespace-nowrap active-press">
                     Logout
                  </button>
               </div>
            </div>
          </div>

          <!-- Main Content -->
          <div class="md:col-span-3">
            <!-- Profile Tab -->
            <div *ngIf="activeTab() === 'profile'" class="bg-white border border-[#e0e0e0] rounded-[18px] p-8 animate-fadeIn">

              <!-- Loyalty Points Summary -->
              <div class="bg-[#1c1c1e] text-white rounded-[18px] p-6 mb-8">
                <p class="text-[#a1a1a6] text-xs font-semibold uppercase tracking-[0.15em] mb-1">Caratloop Loyalty Points</p>
                <h3 class="font-display font-semibold text-3xl text-white flex items-center gap-2">
                  <span class="text-4xl">💎</span> {{ loyalty().points | number }}
                </h3>
                <p class="text-[#a1a1a6] text-xs mt-2">Current Tier: {{ loyalty().tier }}</p>
              </div>

              <h2 class="font-display font-semibold text-2xl md:text-3xl tracking-tight text-[#1d1d1f] mb-8">Profile Information</h2>

              <form (ngSubmit)="updateProfile()" #profileForm="ngForm" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label class="block text-sm font-medium text-[#1d1d1f] mb-2">First Name</label>
                    <input type="text" [(ngModel)]="user()!.firstName" name="firstName" required
                           class="input-field" placeholder="John">
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-[#1d1d1f] mb-2">Last Name</label>
                    <input type="text" [(ngModel)]="user()!.lastName" name="lastName" required
                           class="input-field" placeholder="Doe">
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-medium text-[#1d1d1f] mb-2">Email Address</label>
                  <input type="email" [(ngModel)]="user()!.email" name="email" disabled
                         class="input-field cursor-not-allowed" placeholder="john@example.com">
                  <p class="text-xs text-[#6e6e73] mt-1">Email cannot be changed</p>
                </div>

                <div>
                  <label class="block text-sm font-medium text-[#1d1d1f] mb-2">Phone Number</label>
                  <input type="tel" [(ngModel)]="user()!.phone" name="phone" required
                         class="input-field" placeholder="+1 (555) 000-0000">
                </div>

                <button type="submit" class="btn-apple-pill">
                  Save Changes
                </button>
              </form>
            </div>

            <!-- Orders Tab -->
            <div *ngIf="activeTab() === 'orders'" class="space-y-6 animate-fadeIn">
              <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
                <h2 class="font-display font-semibold text-2xl md:text-3xl tracking-tight text-[#1d1d1f] mb-8">My Orders</h2>

                <div class="space-y-8">
                  <div *ngFor="let order of orders().content" class="border border-[#e0e0e0] rounded-[18px] p-6 hover:border-[#D4AF37]/40 transition-colors duration-300">
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                      <div>
                        <p class="text-sm text-[#D4AF37] font-semibold mb-1">Order #{{ order.orderNumber }}</p>
                        <p class="text-[#6e6e73] text-sm">Placed on {{ order.createdAt | date }}</p>
                      </div>
                      <div class="md:text-right">
                        <p class="font-sans font-semibold text-2xl text-[#1d1d1f]">{{ order.total | currencyConvert }}</p>
                        <span class="badge mt-2" [ngClass]="getStatusBadgeClass(order.status)">{{ order.status }}</span>
                      </div>
                    </div>

                    <!-- Tracking Timeline -->
                    <div class="relative flex items-center justify-between mb-6">
                      <!-- Progress Bar Background -->
                      <div class="absolute top-4 left-8 right-8 h-1 bg-[#e0e0e0] -translate-y-1/2 z-0"></div>
                      <!-- Progress Bar Active -->
                      <div class="absolute top-4 left-8 h-1 bg-[#D4AF37] -translate-y-1/2 z-0 transition-all duration-1000"
                           [style.width]="order.status === 'DELIVERED' ? 'calc(100% - 4rem)' : (order.status === 'SHIPPED' ? 'calc(66.6% - 2.6rem)' : (order.status === 'PROCESSING' ? 'calc(33.3% - 1.3rem)' : '0%'))">
                      </div>

                      <!-- Step 1: Confirmed -->
                      <div class="flex flex-col items-center gap-2 z-10 w-16">
                        <div class="w-8 h-8 rounded-full bg-[#D4AF37] text-black flex items-center justify-center text-xs font-semibold ring-4 ring-white">✓</div>
                        <span class="text-xs font-medium text-[#1d1d1f] text-center">Confirmed</span>
                      </div>
                      <!-- Step 2: Processing -->
                      <div class="flex flex-col items-center gap-2 z-10 w-16">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ring-4 ring-white"
                             [ngClass]="['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status) ? 'bg-[#D4AF37] text-black' : 'bg-[#f5f5f7] border border-[#e0e0e0] text-[#6e6e73]'">
                             {{ ['PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status) ? '✓' : '2' }}
                        </div>
                        <span class="text-xs font-medium text-[#1d1d1f] text-center">Processing</span>
                      </div>
                      <!-- Step 3: Shipped -->
                      <div class="flex flex-col items-center gap-2 z-10 w-16">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ring-4 ring-white"
                             [ngClass]="['SHIPPED', 'DELIVERED'].includes(order.status) ? 'bg-[#D4AF37] text-black' : 'bg-[#f5f5f7] border border-[#e0e0e0] text-[#6e6e73]'">
                             {{ ['SHIPPED', 'DELIVERED'].includes(order.status) ? '✓' : '3' }}
                        </div>
                        <span class="text-xs font-medium text-[#1d1d1f] text-center">Shipped</span>
                      </div>
                      <!-- Step 4: Delivered -->
                      <div class="flex flex-col items-center gap-2 z-10 w-16">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ring-4 ring-white"
                             [ngClass]="order.status === 'DELIVERED' ? 'bg-[#D4AF37] text-black' : 'bg-[#f5f5f7] border border-[#e0e0e0] text-[#6e6e73]'">
                             {{ order.status === 'DELIVERED' ? '✓' : '4' }}
                        </div>
                        <span class="text-xs font-medium text-[#1d1d1f] text-center">Delivered</span>
                      </div>
                    </div>

                    <!-- Tax invoice (GST contract) -->
                    <div *ngIf="order.invoiceNumber || isPaid(order)" class="border-t border-[#f0f0f0] pt-4 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <ng-container *ngIf="order.invoiceNumber; else invoicePending">
                        <div>
                          <p class="text-sm font-semibold text-[#1d1d1f]">Tax invoice {{ order.invoiceNumber }}</p>
                          <p *ngIf="order.invoiceDate" class="text-xs text-[#6e6e73] mt-0.5">Issued {{ order.invoiceDate | date:'mediumDate' }}</p>
                        </div>
                        <button type="button" (click)="downloadInvoice(order)" [disabled]="downloadingInvoiceId() === order.id"
                                class="btn-outline !py-2 !px-4 text-sm whitespace-nowrap self-start sm:self-auto">
                          {{ downloadingInvoiceId() === order.id ? 'Preparing…' : 'Download invoice' }}
                        </button>
                      </ng-container>
                      <ng-template #invoicePending>
                        <p class="text-sm text-[#6e6e73]">Your tax invoice will appear here shortly.</p>
                      </ng-template>
                    </div>

                    <div class="border-t border-[#f0f0f0] pt-4 flex justify-between items-center">
                      <p class="text-[#6e6e73] text-sm" *ngIf="order.items && order.items.length > 0">{{ getItemName(order.items[0]) }} <span *ngIf="order.items.length > 1">and {{ order.items.length - 1 }} more</span></p>
                      <p class="text-[#6e6e73] text-sm" *ngIf="!order.items || order.items.length === 0">No items</p>
                      <a [routerLink]="['/track-order']" [queryParams]="{id: order.orderNumber}" class="text-[#D4AF37] hover:underline text-sm font-medium">Track Detail →</a>
                    </div>
                  </div>

                  <div *ngIf="orders().content?.length === 0" class="text-center py-8 text-[#6e6e73] flex flex-col items-center">
                      <p class="mb-4">No orders found.</p>
                      <a routerLink="/products" class="btn-apple-pill">Back to Shopping</a>
                  </div>
                </div>
              </div>
            </div>

            <!-- Repairs & services (shown with the orders) -->
            <app-account-repairs *ngIf="activeTab() === 'orders'" class="block animate-fadeIn" />
            <app-account-exchange *ngIf="activeTab() === 'orders'" class="block animate-fadeIn" />

            <!-- Addresses Tab -->
            <div *ngIf="activeTab() === 'addresses'" class="space-y-6 animate-fadeIn">
              <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
                  <h2 class="font-display font-semibold text-2xl md:text-3xl tracking-tight text-[#1d1d1f]">Saved Addresses</h2>
                  <button (click)="openAddressModal()" class="btn-outline text-sm !py-2.5 !px-5">
                    + Add New Address
                  </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div *ngFor="let address of user()?.addresses" class="border rounded-[18px] p-6 relative group transition-colors"
                       [ngClass]="address.isDefault ? 'border-[#D4AF37] bg-[#fbf8ef]' : 'border-[#e0e0e0] bg-white hover:border-[#D4AF37]/40'">
                    <div class="flex justify-between items-start mb-4">
                      <div>
                        <h3 class="font-sans font-semibold text-base text-[#1d1d1f]">{{ address.firstName }} {{ address.lastName }}</h3>
                        <p *ngIf="address.isDefault" class="text-[11px] tracking-wide text-[#D4AF37] font-semibold mt-1">DEFAULT ADDRESS</p>
                      </div>
                    </div>
                    <p class="text-[#6e6e73] text-sm mb-3">
                      {{ address.street }}<br>
                      {{ address.city }}, {{ address.state }} {{ address.zipCode }}<br>
                      {{ address.country }}<br>
                      {{ address.phone }}
                    </p>
                    <div *ngIf="pendingDeleteId() !== address.id" class="flex gap-4">
                      <button (click)="openAddressModal(address)" class="text-sm text-[#D4AF37] hover:underline font-medium">Edit</button>
                      <button (click)="pendingDeleteId.set(address.id)" class="text-sm text-red-600 hover:underline font-medium">Delete</button>
                    </div>
                    <div *ngIf="pendingDeleteId() === address.id" class="flex flex-wrap items-center gap-3 animate-fadeIn">
                      <span class="text-sm text-[#1d1d1f]">Delete this address?</span>
                      <button type="button" (click)="deleteAddress(address.id)" [disabled]="deletingAddress()"
                              class="rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-medium px-4 py-1.5 transition-colors active-press disabled:opacity-60">
                        {{ deletingAddress() ? 'Deleting…' : 'Delete' }}
                      </button>
                      <button type="button" (click)="pendingDeleteId.set(null)" [disabled]="deletingAddress()"
                              class="rounded-full bg-[#1d1d1f] hover:bg-black text-white text-xs font-medium px-4 py-1.5 transition-colors active-press disabled:opacity-60">
                        Cancel
                      </button>
                    </div>
                  </div>

                  <div *ngIf="!user()?.addresses || user()!.addresses!.length === 0" class="col-span-full text-center py-8 text-[#6e6e73]">
                    No addresses saved yet.
                  </div>
                </div>
              </div>
            </div>

            <!-- Wishlist Tab -->
            <div *ngIf="activeTab() === 'wishlist'" class="space-y-6 animate-fadeIn">
              <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
                <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
                  <h2 class="font-display font-semibold text-2xl md:text-3xl tracking-tight text-[#1d1d1f]">My Wishlist</h2>
                  <span *ngIf="wishlistService.count() > 0" class="text-sm text-[#6e6e73]">{{ wishlistService.count() }} saved {{ wishlistService.count() === 1 ? 'item' : 'items' }}</span>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div *ngFor="let item of wishlistService.items()" class="store-utility-card group">
                    <div class="relative overflow-hidden aspect-square bg-[#f5f5f7] rounded-[12px] mb-6 flex items-center justify-center">
                      <img *ngIf="item.imageUrl || item.images?.[0]" [ngSrc]="item.imageUrl || item.images?.[0] || ''" fill class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" [alt]="item.name">
                      <span *ngIf="!item.imageUrl && !item.images?.[0]" class="text-3xl">💎</span>
                      <button (click)="removeFromWishlist(item.id)" aria-label="Remove from wishlist" class="absolute top-4 left-4 w-10 h-10 bg-white/90 backdrop-blur-md border border-[#e0e0e0] text-red-600 hover:border-red-200 rounded-full flex items-center justify-center active-press z-10">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                        </svg>
                      </button>
                    </div>
                    <div>
                      <p class="text-xs text-[#D4AF37] font-semibold uppercase tracking-wider mb-1">{{ categoryLabels.label(item.category) }}</p>
                      <h3 class="font-sans font-medium text-base text-[#1d1d1f] mb-3">{{ item.name }}</h3>
                      <div class="flex justify-between items-center">
                        <span class="font-sans font-semibold text-xl text-[#1d1d1f]">{{ item.price | currencyConvert }}</span>
                      </div>
                      <a [routerLink]="['/products', item.id]" class="btn-apple-pill w-full mt-4 text-sm !py-2.5">View Details</a>
                    </div>
                  </div>
                  <div *ngIf="wishlistService.items().length === 0" class="col-span-full text-center py-12 text-[#6e6e73] flex flex-col items-center">
                    <p class="mb-4">Your wishlist is empty.</p>
                    <a routerLink="/products" class="btn-apple-pill">Back to Shopping</a>
                  </div>
                </div>
              </div>
            </div>

            <!-- Settings Tab -->
            <div *ngIf="activeTab() === 'settings'" class="bg-white border border-[#e0e0e0] rounded-[18px] p-8 animate-fadeIn">
              <h2 class="font-display font-semibold text-2xl md:text-3xl tracking-tight text-[#1d1d1f] mb-8">Settings</h2>

              <div class="space-y-8">
                <!-- Preferences (growth contract, section 3): saved through the same PUT users/profile as name/phone -->
                <div *ngIf="user()" class="border border-[#e0e0e0] rounded-[18px] p-6">
                  <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] mb-1">Preferences</h3>
                  <p class="text-sm text-[#6e6e73] mb-6">Optional. Helps us size, source and suggest pieces for you faster.</p>

                  <form (ngSubmit)="updateProfile()" class="space-y-6">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label for="prefBirthday" class="block text-sm font-medium text-[#1d1d1f] mb-2">Birthday</label>
                        <input id="prefBirthday" type="date" [(ngModel)]="user()!.birthday" name="birthday" class="input-field">
                      </div>
                      <div>
                        <label for="prefAnniversary" class="block text-sm font-medium text-[#1d1d1f] mb-2">Anniversary</label>
                        <input id="prefAnniversary" type="date" [(ngModel)]="user()!.anniversary" name="anniversary" class="input-field">
                      </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label for="prefRingSize" class="block text-sm font-medium text-[#1d1d1f] mb-2">Ring Size (US)</label>
                        <select id="prefRingSize" [(ngModel)]="user()!.ringSize" name="ringSize" class="input-field">
                          <option value="">Not set</option>
                          <option *ngFor="let size of ringSizeOptions" [value]="size">{{ size }}</option>
                        </select>
                      </div>
                      <div>
                        <label for="prefMetal" class="block text-sm font-medium text-[#1d1d1f] mb-2">Preferred Metal</label>
                        <select id="prefMetal" [(ngModel)]="user()!.preferredMetal" name="preferredMetal" class="input-field">
                          <option value="">Not set</option>
                          <option *ngFor="let metal of metalOptions" [value]="metal">{{ metal }}</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <span class="block text-sm font-medium text-[#1d1d1f] mb-2">Preferred Stones</span>
                      <div class="flex flex-wrap gap-2" role="group" aria-label="Preferred stones">
                        <button *ngFor="let stone of stoneOptions" type="button"
                                (click)="toggleStone(stone)"
                                [attr.aria-pressed]="hasStone(stone)"
                                [ngClass]="hasStone(stone) ? 'bg-[#1d1d1f] text-white border-[#1d1d1f]' : 'bg-[#f5f5f7] text-[#1d1d1f] border-[#e0e0e0] hover:border-[#D4AF37]'"
                                class="px-4 py-2 rounded-full border text-xs font-medium transition-colors active-press">
                          {{ stone }}
                        </button>
                      </div>
                    </div>

                    <label class="flex items-start gap-2">
                      <input type="checkbox" [(ngModel)]="user()!.marketingOptIn" name="marketingOptIn"
                             class="w-4 h-4 mt-1 rounded border-[#e0e0e0] accent-[#D4AF37]">
                      <span class="text-sm text-[#1d1d1f]">
                        Send me new collections and offers
                        <span class="block text-xs text-[#6e6e73]">A few emails a year about new pieces and offers; you can turn this off any time.</span>
                      </span>
                    </label>

                    <button type="submit" class="btn-apple-pill">Save Preferences</button>
                  </form>
                </div>

                <div>
                  <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] mb-4">Privacy & Security</h3>
                  <button *ngIf="!showChangePassword()" type="button" (click)="openChangePassword()"
                          class="text-[#D4AF37] hover:underline font-medium">
                    Change Password
                  </button>

                  <form *ngIf="showChangePassword()" (ngSubmit)="submitChangePassword()"
                        class="bg-[#f5f5f7] border border-[#e0e0e0] rounded-[18px] p-6 space-y-4 max-w-md animate-fadeIn">
                    <h4 class="font-sans font-semibold text-base text-[#1d1d1f]">Change Password</h4>
                    <div>
                      <label for="oldPassword" class="block text-sm font-medium text-[#1d1d1f] mb-2">Current Password</label>
                      <input id="oldPassword" type="password" [(ngModel)]="passwordChange.oldPassword" name="oldPassword"
                             autocomplete="current-password" required class="input-field !bg-white">
                    </div>
                    <div>
                      <label for="newPassword" class="block text-sm font-medium text-[#1d1d1f] mb-2">New Password</label>
                      <input id="newPassword" type="password" [(ngModel)]="passwordChange.newPassword" name="newPassword"
                             autocomplete="new-password" required minlength="8" class="input-field !bg-white">
                      <p class="text-xs text-[#6e6e73] mt-1">At least 8 characters.</p>
                    </div>
                    <div>
                      <label for="confirmPassword" class="block text-sm font-medium text-[#1d1d1f] mb-2">Confirm New Password</label>
                      <input id="confirmPassword" type="password" [(ngModel)]="passwordChange.confirmPassword" name="confirmPassword"
                             autocomplete="new-password" required class="input-field !bg-white">
                    </div>
                    <p *ngIf="passwordError()" class="text-sm text-red-600">{{ passwordError() }}</p>
                    <div class="flex gap-2 pt-2">
                      <button type="button" (click)="closeChangePassword()" class="btn-ghost flex-1" [disabled]="changingPassword()">Cancel</button>
                      <button type="submit" class="btn-apple-pill flex-1" [disabled]="changingPassword()">
                        {{ changingPassword() ? 'Updating…' : 'Update Password' }}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Address Modal -->
      <div *ngIf="isAddressModalOpen()" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div class="bg-white border border-[#e0e0e0] rounded-[18px] shadow-2xl p-8 max-w-md w-full animate-scaleUp">
          <h3 class="font-display font-semibold text-2xl tracking-tight text-[#1d1d1f] mb-6">{{ currentAddress().id ? 'Edit' : 'Add New' }} Address</h3>
          <form (ngSubmit)="saveAddress()" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <input [(ngModel)]="currentAddress().firstName" name="firstName" placeholder="First Name" aria-label="First name" class="input-field" required>
              <input [(ngModel)]="currentAddress().lastName" name="lastName" placeholder="Last Name" aria-label="Last name" class="input-field" required>
            </div>
            <input [(ngModel)]="currentAddress().street" name="street" placeholder="Street Address" aria-label="Street address" class="input-field" required>
            <div class="grid grid-cols-2 gap-4">
              <input [(ngModel)]="currentAddress().city" name="city" placeholder="City" aria-label="City" class="input-field" required>
              <input [(ngModel)]="currentAddress().state" name="state" placeholder="State" aria-label="State" class="input-field" required>
            </div>
            <div class="grid grid-cols-2 gap-4">
              <input [(ngModel)]="currentAddress().zipCode" name="zipCode" placeholder="ZIP Code" aria-label="ZIP code" class="input-field" required>
              <select [(ngModel)]="currentAddress().country" name="country" aria-label="Country" class="input-field" required>
                <option *ngFor="let country of countriesList" [value]="country">{{ country }}</option>
              </select>
            </div>
            <input [(ngModel)]="currentAddress().phone" name="phone" placeholder="Phone" aria-label="Phone" class="input-field" required>

            <label class="flex items-center gap-2">
              <input type="checkbox" [(ngModel)]="currentAddress().isDefault" name="isDefault" class="w-4 h-4 rounded border-[#e0e0e0] accent-[#D4AF37]">
              <span class="text-sm text-[#1d1d1f]">Set as default address</span>
            </label>

            <div class="flex gap-2 pt-4">
              <button type="button" (click)="isAddressModalOpen.set(false)" class="btn-ghost flex-1">Cancel</button>
              <button type="submit" class="btn-apple-pill flex-1">Save</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `,
})
export class AccountComponent implements OnInit {
  activeTab = signal('profile');
  user = signal<User | null>(null);
  orders = signal<{ content: Order[] }>({ content: [] });
  loyalty = signal<{ points: number, tier: string }>({ points: 0, tier: 'Silver' });
  /** Order whose invoice PDF is being fetched, so only that button shows progress. */
  downloadingInvoiceId = signal<string | null>(null);

  // Address State
  isAddressModalOpen = signal(false);
  currentAddress = signal<Partial<Address>>({});
  countriesList = COUNTRIES;
  /** Address whose inline "Delete / Cancel" confirmation is showing. */
  pendingDeleteId = signal<string | null>(null);
  deletingAddress = signal(false);

  // Preferences (growth contract, section 3)
  /** US ring sizes 4 to 20 in half steps, as the strings the API stores. */
  readonly ringSizeOptions: string[] = Array.from({ length: 33 }, (_, i) => String(4 + i * 0.5));
  readonly metalOptions = ['Gold', 'White Gold', 'Rose Gold', 'Platinum', 'Silver'];
  readonly stoneOptions = ['Diamond', 'Emerald', 'Ruby', 'Blue Sapphire', 'Yellow Sapphire', 'Pearl', 'Coral', 'Other'];

  // Change-password panel state
  showChangePassword = signal(false);
  changingPassword = signal(false);
  passwordError = signal<string | null>(null);
  passwordChange = { oldPassword: '', newPassword: '', confirmPassword: '' };

  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private orderService = inject(OrderService);
  private toastService = inject(ToastService);
  wishlistService = inject(WishlistService);
  categoryLabels = inject(CategoryLabelService);

  constructor() {
    effect(() => {
      if (this.activeTab() === 'orders') {
        this.loadOrders();
      } else if (this.activeTab() === 'wishlist') {
        this.wishlistService.load().subscribe({ error: () => { /* items() falls back to the cart snapshot */ } });
      }
    });
  }

  ngOnInit(): void {
    this.loadUserProfile();
    // this.loadOrders(); // Handled by effect
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        this.activeTab.set(params['tab']);
      }
    });

    // Load Loyalty Points
    this.authService.getLoyaltyPoints().subscribe({
        next: (data) => this.loyalty.set(data),
        error: () => this.loyalty.set({ points: 0, tier: 'Silver' }) // Graceful degradation
    });
  }

  private loadOrders(): void {
    this.orderService.getUserOrders().subscribe({
        next: (response) => {
            // Handle both paginated and direct array responses
            const ordersData = Array.isArray(response)
              ? { content: response }
              : (response.content ? response : { content: [response] });

            // Add orderNumber if missing
            if (ordersData.content) {
              ordersData.content = ordersData.content.map((order: Order, index: number) => ({
                ...order,
                orderNumber: order.orderNumber || `ORD-${order.id?.substring(0, 8) || index + 1}`
              }));
            }

            this.orders.set(ordersData);
        },
        error: () => {
          // Error loading orders
        }
    });
  }

  private loadUserProfile(): void {
    this.authService.user().subscribe({
      next: (user) => {
        this.user.set(user);
      },
      error: () => {
        // Error loading user profile
      },
    });
  }

  removeFromWishlist(productId: string): void {
    this.wishlistService.remove(productId).subscribe({
      next: () => this.toastService.show('Removed from wishlist', 'success'),
      error: () => this.toastService.show('Failed to remove from wishlist', 'error'),
    });
  }

  openChangePassword(): void {
    this.passwordChange = { oldPassword: '', newPassword: '', confirmPassword: '' };
    this.passwordError.set(null);
    this.showChangePassword.set(true);
  }

  closeChangePassword(): void {
    this.showChangePassword.set(false);
    this.passwordError.set(null);
    this.passwordChange = { oldPassword: '', newPassword: '', confirmPassword: '' };
  }

  submitChangePassword(): void {
    const { oldPassword, newPassword, confirmPassword } = this.passwordChange;
    if (!oldPassword || !newPassword || !confirmPassword) {
      this.passwordError.set('Please fill in all three fields.');
      return;
    }
    if (newPassword.length < 8) {
      this.passwordError.set('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      this.passwordError.set('New passwords do not match.');
      return;
    }
    if (newPassword === oldPassword) {
      this.passwordError.set('New password must differ from the current one.');
      return;
    }
    this.passwordError.set(null);
    this.changingPassword.set(true);
    this.authService.changePassword(oldPassword, newPassword).subscribe({
      next: (res) => {
        this.changingPassword.set(false);
        this.toastService.show(res?.message || 'Password updated', 'success');
        this.closeChangePassword();
      },
      error: (err) => {
        this.changingPassword.set(false);
        const message = err?.error?.message || 'Failed to change password';
        this.passwordError.set(message);
        this.toastService.show(message, 'error');
      },
    });
  }

  /** `preferredStones` is a comma list on the wire; split for the chips. */
  private stonesOf(user: User | null): string[] {
    return (user?.preferredStones || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  hasStone(stone: string): boolean {
    return this.stonesOf(this.user()).includes(stone);
  }

  toggleStone(stone: string): void {
    const current = this.user();
    if (!current) return;
    const stones = this.stonesOf(current);
    const next = stones.includes(stone) ? stones.filter((s) => s !== stone) : [...stones, stone];
    // New object so OnPush re-renders the chips; the same signal feeds updateProfile().
    this.user.set({ ...current, preferredStones: next.join(',') });
  }

  updateProfile(): void {
    const currentUser = this.user();
    if (currentUser) {
        // Cleared date / select inputs bind to '' which the API cannot parse
        // as a LocalDate or a meaningful size; send null so they clear.
        const payload: Partial<User> = {
          ...currentUser,
          birthday: currentUser.birthday || null,
          anniversary: currentUser.anniversary || null,
          ringSize: currentUser.ringSize || null,
          preferredMetal: currentUser.preferredMetal || null,
          preferredStones: currentUser.preferredStones || null,
          marketingOptIn: !!currentUser.marketingOptIn,
        };
        this.authService.updateProfile(payload).subscribe({
            next: () => {
                this.toastService.show('Profile updated successfully', 'success');
            },
            error: () => {
                this.toastService.show('Failed to update profile', 'error');
            }
        });
    }
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.router.navigate(['/']);
      },
      error: () => {
        // Error logging out
      },
    });
  }

  getItemName(item: OrderItem): string {
    if (item?.product?.name) {
      return item.product.name;
    }
    return 'Unknown Item';
  }

  /** Paid orders receive a tax invoice; the list says so until it is issued. */
  isPaid(order: Order): boolean {
    return isPaidOrder(order);
  }

  downloadInvoice(order: Order): void {
    if (!order?.id || !order.invoiceNumber || this.downloadingInvoiceId()) return;
    this.downloadingInvoiceId.set(order.id);
    this.orderService.downloadInvoice(order.id, order.invoiceNumber).subscribe({
      error: () => {
        this.downloadingInvoiceId.set(null);
        // GET failures stay silent in the error interceptor; say something here.
        this.toastService.show('The invoice is not available yet. Please try again in a few minutes.', 'error');
      },
      complete: () => this.downloadingInvoiceId.set(null),
    });
  }

  // Semantic tint layered over the neutral `badge` pill.
  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'DELIVERED': return '!bg-green-50 !border-green-200 !text-green-600';
      case 'SHIPPED': return '!bg-blue-50 !border-blue-200 !text-blue-600';
      case 'PROCESSING': return '!bg-amber-50 !border-amber-200 !text-amber-600';
      case 'CANCELLED': return '!bg-red-50 !border-red-200 !text-red-600';
      default: return '';
    }
  }

  // Address Methods
  openAddressModal(address?: Address) {
    this.currentAddress.set(address ? { ...address } : { country: 'India' });
    this.isAddressModalOpen.set(true);
  }

  saveAddress() {
    const addr = this.currentAddress();
    if (addr.id) {
      this.authService.updateAddress(addr.id, addr).subscribe({
        next: () => {
            this.toastService.show('Address updated successfully', 'success');
            this.isAddressModalOpen.set(false);
        },
        error: () => {
            this.toastService.show('Failed to update address', 'error');
        }
      });
    } else {
      this.authService.addAddress(addr as Address).subscribe({
        next: () => {
            this.toastService.show('Address added successfully', 'success');
            this.isAddressModalOpen.set(false);
        },
        error: () => {
            this.toastService.show('Failed to add address', 'error');
        }
      });
    }
  }

  /** Called from the inline confirmation, after the user has clicked Delete a second time. */
  deleteAddress(id: string) {
    this.deletingAddress.set(true);
    this.authService.deleteAddress(id).subscribe({
      next: () => {
          this.deletingAddress.set(false);
          this.pendingDeleteId.set(null);
          this.toastService.show('Address deleted successfully', 'success');
      },
      error: () => {
          this.deletingAddress.set(false);
          this.pendingDeleteId.set(null);
          this.toastService.show('Failed to delete address', 'error');
      }
    });
  }
}
