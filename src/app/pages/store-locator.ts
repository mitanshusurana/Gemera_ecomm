import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StoreService, Store } from '../services/store.service';

@Component({
  selector: 'app-store-locator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50 font-sans">
      <div class="bg-primary-900 text-white py-12">
        <div class="container-luxury text-center">
          <h1 class="font-display font-bold mb-4">Find a Store</h1>
          <p class="text-primary-200">Experience our jewellery in person at a store near you.</p>
        </div>
      </div>

      <div class="container-luxury section-padding">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Store List -->
          <div class="lg:col-span-1 space-y-4 h-[600px] overflow-y-auto pr-2">
             <div *ngIf="isLoading()" class="text-center py-8">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-900 mx-auto"></div>
                <p class="text-gray-500 mt-2">Loading stores...</p>
             </div>

             <div *ngIf="error()" class="bg-red-50 text-red-700 p-4 rounded-lg">
                {{ error() }}
             </div>

             <div *ngFor="let store of stores()"
                  (click)="selectedStore.set(store)"
                  [class.border-primary-500]="selectedStore()?.id === store.id"
                  [class.ring-2]="selectedStore()?.id === store.id"
                  [class.ring-primary-100]="selectedStore()?.id === store.id"
                  class="bg-white p-6 rounded-lg border border-gray-200 cursor-pointer hover:shadow-md transition-all">
                <h3 class="font-bold text-gray-900 text-lg mb-2">{{ store.name }}</h3>
                <p class="text-sm text-gray-600 mb-3">{{ store.address }}</p>
                <div class="flex items-center gap-2 text-sm text-gray-500 mb-4">
                   <span>🕒 {{ store.hours }}</span>
                   <span>📞 {{ store.phone }}</span>
                </div>
                <div class="flex gap-2">
                   <button class="flex-1 btn-secondary text-xs py-2 px-3">Call Store</button>
                   <button class="flex-1 btn-primary text-xs py-2 px-3">Get Directions</button>
                </div>
             </div>
          </div>

          <!-- Map Placeholder -->
          <div class="lg:col-span-2 bg-gray-200 rounded-xl overflow-hidden relative h-[600px]">
             <div class="absolute inset-0 bg-[url('https://maps.googleapis.com/maps/api/staticmap?center=20.5937,78.9629&zoom=5&size=800x600&sensor=false')] bg-cover bg-center opacity-50"></div>
             <div class="absolute inset-0 flex items-center justify-center">
                <div *ngIf="selectedStore()" class="bg-white p-6 rounded-xl shadow-xl max-w-sm animate-fade-in-up">
                   <h3 class="font-bold text-xl mb-2">{{ selectedStore()?.name }}</h3>
                   <p class="text-gray-600 text-sm mb-4">{{ selectedStore()?.address }}</p>
                   <button class="w-full btn-primary">Navigate Now</button>
                </div>
                <div *ngIf="!selectedStore() && !isLoading()" class="bg-white/80 backdrop-blur-md p-4 rounded-lg">
                   <p class="font-bold text-gray-700">Select a store to view details</p>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class StoreLocatorComponent implements OnInit {
  private storeService = inject(StoreService);

  stores = signal<Store[]>([]);
  selectedStore = signal<Store | null>(null);
  isLoading = signal(true);
  error = signal('');

  ngOnInit() {
    this.storeService.getStores().subscribe({
        next: (response) => {
            this.stores.set(response.stores);
            if (response.stores.length > 0) {
                this.selectedStore.set(response.stores[0]);
            }
            this.isLoading.set(false);
        },
        error: (err) => {
            console.error('Failed to load stores', err);
            this.error.set('Unable to load store locations. Please try again later.');
            this.isLoading.set(false);
        }
    });
  }
}
