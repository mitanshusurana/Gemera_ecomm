import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, User } from '../services/api.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-white">
      <!-- Breadcrumb -->
      <div class="bg-diamond-50 border-b border-diamond-200">
        <div class="container-luxury py-4">
          <div class="flex items-center gap-2 text-sm">
            <a routerLink="/" class="text-gold-600 hover:text-gold-700">Home</a>
            <span class="text-gray-500">/</span>
            <span class="text-gray-700">My Account</span>
          </div>
        </div>
      </div>

      <div class="container-luxury section-padding">
        <h1 class="text-5xl md:text-6xl font-display font-bold text-diamond-900 mb-12">
          My Account
        </h1>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
          <!-- Sidebar Navigation -->
          <div class="md:col-span-1">
            <div class="card p-4 space-y-2 sticky top-24">
              <button (click)="activeTab.set('profile')" 
                      [ngClass]="activeTab() === 'profile' ? 'bg-gold-50 text-gold-600 border-l-4 border-gold-600' : 'text-gray-700 hover:bg-diamond-50'"
                      class="w-full text-left px-4 py-3 font-medium transition-all duration-300">
                Profile Information
              </button>
              <button (click)="activeTab.set('orders')" 
                      [ngClass]="activeTab() === 'orders' ? 'bg-gold-50 text-gold-600 border-l-4 border-gold-600' : 'text-gray-700 hover:bg-diamond-50'"
                      class="w-full text-left px-4 py-3 font-medium transition-all duration-300">
                My Orders
              </button>
              <button (click)="activeTab.set('addresses')" 
                      [ngClass]="activeTab() === 'addresses' ? 'bg-gold-50 text-gold-600 border-l-4 border-gold-600' : 'text-gray-700 hover:bg-diamond-50'"
                      class="w-full text-left px-4 py-3 font-medium transition-all duration-300">
                Addresses
              </button>
              <button (click)="activeTab.set('wishlist')" 
                      [ngClass]="activeTab() === 'wishlist' ? 'bg-gold-50 text-gold-600 border-l-4 border-gold-600' : 'text-gray-700 hover:bg-diamond-50'"
                      class="w-full text-left px-4 py-3 font-medium transition-all duration-300">
                Wishlist
              </button>
              <button (click)="activeTab.set('settings')" 
                      [ngClass]="activeTab() === 'settings' ? 'bg-gold-50 text-gold-600 border-l-4 border-gold-600' : 'text-gray-700 hover:bg-diamond-50'"
                      class="w-full text-left px-4 py-3 font-medium transition-all duration-300">
                Settings
              </button>
              <hr class="my-2 border-diamond-200">
              <button (click)="logout()" class="w-full text-left px-4 py-3 font-medium text-red-600 hover:bg-red-50 transition-all duration-300">
                Logout
              </button>
            </div>
          </div>

          <!-- Main Content -->
          <div class="md:col-span-3">
            <!-- Profile Tab -->
            <div *ngIf="activeTab() === 'profile'" class="card p-8 animate-slideUp">

              <!-- Loyalty Points Summary -->
              <div class="bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-xl p-6 mb-8 flex justify-between items-center shadow-lg">
                <div>
                  <p class="text-gray-400 text-sm font-semibold uppercase tracking-wider mb-1">Gemara Loyalty Points</p>
                  <h3 class="text-3xl font-bold font-display flex items-center gap-2">
                    <span class="text-4xl">💎</span> 1,250
                  </h3>
                  <p class="text-gray-400 text-xs mt-2">You are 750 points away from Platinum Tier</p>
                </div>
                <div class="text-right">
                  <button class="bg-gold-500 hover:bg-gold-600 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-colors mb-2">
                    Redeem Points
                  </button>
                  <p class="text-xs text-gray-400">Expires: Dec 31, 2025</p>
                </div>
              </div>

              <h2 class="text-3xl font-bold text-diamond-900 mb-8">Profile Information</h2>

              <form (ngSubmit)="updateProfile()" #profileForm="ngForm" class="space-y-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label class="block text-sm font-semibold text-gray-900 mb-2">First Name</label>
                    <input type="text" [(ngModel)]="user()!.firstName" name="firstName" required 
                           class="input-field" placeholder="John">
                  </div>
                  <div>
                    <label class="block text-sm font-semibold text-gray-900 mb-2">Last Name</label>
                    <input type="text" [(ngModel)]="user()!.lastName" name="lastName" required 
                           class="input-field" placeholder="Doe">
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-semibold text-gray-900 mb-2">Email Address</label>
                  <input type="email" [(ngModel)]="user()!.email" name="email" disabled 
                         class="input-field bg-diamond-50 cursor-not-allowed" placeholder="john@example.com">
                  <p class="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                </div>

                <div>
                  <label class="block text-sm font-semibold text-gray-900 mb-2">Phone Number</label>
                  <input type="tel" [(ngModel)]="user()!.phone" name="phone" required 
                         class="input-field" placeholder="+1 (555) 000-0000">
                </div>

                <button type="submit" class="btn-primary">
                  Save Changes
                </button>
              </form>
            </div>

            <!-- Orders Tab -->
            <div *ngIf="activeTab() === 'orders'" class="space-y-6 animate-slideUp">
              <div class="card p-8">
                <h2 class="text-3xl font-bold text-diamond-900 mb-8">My Orders</h2>

                <div class="space-y-8">
                  <div *ngFor="let order of [1,2]" class="border border-diamond-200 rounded-lg p-6 hover:shadow-md transition-shadow duration-300">
                    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
                      <div>
                        <p class="text-sm text-gold-600 font-semibold mb-1">Order #ORD-2024-{{ 100 + order }}</p>
                        <p class="text-gray-600 text-sm">Placed on January {{ order }}, 2024</p>
                      </div>
                      <div class="text-right">
                        <p class="text-2xl font-bold text-diamond-900">{{ formatPrice(45000 + order * 1000) }}</p>
                        <!-- <span class="inline-block mt-2 badge badge-emerald">Processing</span> -->
                      </div>
                    </div>

                    <!-- Tracking Timeline -->
                    <div class="relative flex justify-between items-center mb-6 px-4">
                      <!-- Progress Bar -->
                      <div class="absolute top-1/2 left-0 w-full h-1 bg-gray-200 -z-10"></div>
                      <div class="absolute top-1/2 left-0 h-1 bg-gold-500 -z-10 transition-all duration-1000" [style.width]="order === 1 ? '60%' : '20%'"></div>

                      <!-- Step 1 -->
                      <div class="flex flex-col items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-gold-500 text-white flex items-center justify-center text-xs font-bold">✓</div>
                        <span class="text-xs font-semibold text-gray-700">Confirmed</span>
                      </div>
                      <!-- Step 2 -->
                      <div class="flex flex-col items-center gap-2">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" [ngClass]="order >= 1 ? 'bg-gold-500 text-white' : 'bg-gray-200 text-gray-500'">
                          {{ order >= 1 ? '✓' : '2' }}
                        </div>
                        <span class="text-xs font-semibold" [ngClass]="order >= 1 ? 'text-gray-700' : 'text-gray-400'">Processing</span>
                      </div>
                      <!-- Step 3 -->
                      <div class="flex flex-col items-center gap-2">
                        <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" [ngClass]="order === 1 ? 'bg-gold-500 text-white' : 'bg-gray-200 text-gray-500'">
                          {{ order === 1 ? '3' : '3' }}
                        </div>
                        <span class="text-xs font-semibold" [ngClass]="order === 1 ? 'text-gray-700' : 'text-gray-400'">Polishing</span>
                      </div>
                      <!-- Step 4 -->
                      <div class="flex flex-col items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-xs font-bold">4</div>
                        <span class="text-xs font-semibold text-gray-400">Shipped</span>
                      </div>
                    </div>

                    <div class="border-t border-diamond-200 pt-4 flex justify-between items-center">
                      <p class="text-gray-600 text-sm">Diamond Solitaire Ring</p>
                      <button class="text-gold-600 hover:text-gold-700 text-sm font-semibold">Track Detail →</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Addresses Tab -->
            <div *ngIf="activeTab() === 'addresses'" class="space-y-6 animate-slideUp">
              <div class="card p-8">
                <div class="flex justify-between items-center mb-8">
                  <h2 class="text-3xl font-bold text-diamond-900">Saved Addresses</h2>
                  <button class="btn-outline">
                    + Add New Address
                  </button>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div class="border-2 border-gold-500 border-dashed rounded-lg p-6 bg-gold-50">
                    <div class="flex justify-between items-start mb-4">
                      <div>
                        <h3 class="font-bold text-gray-900">John Doe</h3>
                        <p class="text-xs text-gold-600 font-semibold mt-1">DEFAULT ADDRESS</p>
                      </div>
                    </div>
                    <p class="text-gray-700 text-sm mb-3">
                      123 Main Street<br>
                      New York, NY 10001<br>
                      United States<br>
                      +1 (555) 000-0000
                    </p>
                    <div class="flex gap-2">
                      <button class="text-sm text-gold-600 hover:text-gold-700 font-semibold">Edit</button>
                      <button class="text-sm text-red-600 hover:text-red-700 font-semibold">Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Wishlist Tab -->
            <div *ngIf="activeTab() === 'wishlist'" class="space-y-6 animate-slideUp">
              <div class="card p-8">
                <div class="flex justify-between items-center mb-8">
                  <h2 class="text-3xl font-bold text-diamond-900">My Wishlists</h2>
                  <button (click)="createBoard()" class="btn-outline flex items-center gap-2">
                    <span>+</span> Create Board
                  </button>
                </div>

                <!-- Boards Tabs (Mock) -->
                <div class="flex gap-4 mb-6 border-b border-gray-200 pb-2">
                  <button class="text-gold-600 border-b-2 border-gold-600 font-semibold px-2 pb-2">All Items</button>
                  <button class="text-gray-500 hover:text-gray-700 px-2 pb-2">Wedding Ideas</button>
                  <button class="text-gray-500 hover:text-gray-700 px-2 pb-2">Gifts for Mom</button>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div *ngFor="let _ of [1,2,3]" class="card card-hover group overflow-hidden">
                    <div class="relative overflow-hidden h-48 bg-diamond-100 flex items-center justify-center">
                      <span class="text-3xl">💎</span>
                      <button class="absolute top-4 left-4 w-10 h-10 bg-rose-500 text-white rounded-lg flex items-center justify-center transition-all duration-300">
                        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
                        </svg>
                      </button>
                    </div>
                    <div class="p-6">
                      <p class="text-xs text-gold-600 font-semibold uppercase mb-1">Diamond</p>
                      <h3 class="font-semibold text-gray-900 mb-3">Diamond Solitaire Ring</h3>
                      <div class="flex justify-between items-center">
                        <span class="text-2xl font-bold text-diamond-900">$45,000</span>
                      </div>
                      <button class="w-full btn-primary mt-4">Add to Cart</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Settings Tab -->
            <div *ngIf="activeTab() === 'settings'" class="card p-8 animate-slideUp">
              <h2 class="text-3xl font-bold text-diamond-900 mb-8">Settings</h2>

              <div class="space-y-8">
                <div>
                  <h3 class="text-lg font-bold text-gray-900 mb-4">Email Notifications</h3>
                  <div class="space-y-3">
                    <label class="flex items-center gap-3">
                      <input type="checkbox" checked class="w-4 h-4">
                      <span class="text-gray-700">Order updates and shipping notifications</span>
                    </label>
                    <label class="flex items-center gap-3">
                      <input type="checkbox" checked class="w-4 h-4">
                      <span class="text-gray-700">New collection and product launches</span>
                    </label>
                    <label class="flex items-center gap-3">
                      <input type="checkbox" checked class="w-4 h-4">
                      <span class="text-gray-700">Exclusive offers and promotions</span>
                    </label>
                    <label class="flex items-center gap-3">
                      <input type="checkbox" class="w-4 h-4">
                      <span class="text-gray-700">Monthly newsletter</span>
                    </label>
                  </div>
                </div>

                <div class="border-t border-diamond-200 pt-8">
                  <h3 class="text-lg font-bold text-gray-900 mb-4">Privacy & Security</h3>
                  <div class="space-y-3">
                    <a href="#" class="block text-gold-600 hover:text-gold-700 font-semibold">Change Password</a>
                    <a href="#" class="block text-gold-600 hover:text-gold-700 font-semibold">Two-Factor Authentication</a>
                    <a href="#" class="block text-gold-600 hover:text-gold-700 font-semibold">Manage Login Sessions</a>
                  </div>
                </div>

                <button class="btn-primary">
                  Save Preferences
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AccountComponent implements OnInit {
  activeTab = signal('profile');
  user = signal<User | null>(null);

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.loadUserProfile();
  }

  private loadUserProfile(): void {
    this.apiService.getCurrentUser().subscribe({
      next: (user) => {
        this.user.set(user);
      },
      error: (error) => {
        console.error('Error loading user profile:', error);
      },
    });
  }

  createBoard(): void {
    const name = prompt("Enter new board name (e.g., 'Dream Ring'):");
    if (name) {
      alert(`Created new wishlist board: ${name}`);
    }
  }

  updateProfile(): void {
    if (this.user()) {
      this.apiService.updateProfile(this.user()!).subscribe({
        next: (user) => {
          this.user.set(user);
          console.log('Profile updated successfully');
        },
        error: (error) => {
          console.error('Error updating profile:', error);
        },
      });
    }
  }

  logout(): void {
    this.apiService.logout().subscribe({
      next: () => {
        console.log('Logged out successfully');
      },
      error: (error) => {
        console.error('Error logging out:', error);
      },
    });
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(price);
  }
}
