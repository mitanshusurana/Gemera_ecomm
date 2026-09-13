import { Component, signal, computed, OnInit, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { StoreService, Store } from '../services/store.service';

@Component({
  selector: 'app-store-locator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- APPLE DESIGN SYSTEM: STORE LOCATOR (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">
      <!-- Parchment Header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-16 px-6 text-center">
        <div class="max-w-[800px] mx-auto">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Boutiques &amp; Showrooms</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl text-[#1d1d1f] tracking-tight mb-4">Find a Store</h1>
          <p class="text-base text-[#7a7a7a]">Experience our jewellery in person at a store near you.</p>
        </div>
      </section>

      <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-12">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Store List -->
          <div class="lg:col-span-1 space-y-4 h-[600px] overflow-y-auto pr-2 custom-scrollbar">
             <div *ngIf="isLoading()" class="text-center py-8">
                <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-[#D4AF37] mx-auto"></div>
                <p class="text-[#6e6e73] text-sm mt-3">Loading stores...</p>
             </div>

             <div *ngIf="error()" class="bg-red-50 text-red-700 border border-red-200 p-4 rounded-[12px] text-sm">
                {{ error() }}
             </div>

             <div *ngFor="let store of stores()"
                  (click)="selectedStore.set(store)"
                  (keydown.enter)="selectedStore.set(store)"
                  role="button"
                  tabindex="0"
                  [class.border-[#D4AF37]]="selectedStore()?.id === store.id"
                  [class.ring-2]="selectedStore()?.id === store.id"
                  [class.ring-[#D4AF37]]="selectedStore()?.id === store.id"
                  class="bg-white p-6 rounded-[18px] border border-[#e0e0e0] cursor-pointer hover:border-[#D4AF37]/40 transition-colors">
                <h3 class="font-sans font-semibold text-[#1d1d1f] text-lg mb-2">{{ store.name }}</h3>
                <p class="text-sm text-[#6e6e73] mb-3">{{ store.address }}</p>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#6e6e73] mb-4">
                   <span>🕒 {{ store.hours }}</span>
                   <span>📞 {{ store.phone }}</span>
                </div>
                <div class="flex gap-2">
                   <a [href]="telLink(store)" class="flex-1 btn-apple-pill-secondary text-xs !py-2 !px-3" (click)="$event.stopPropagation()">Call Store</a>
                   <a [href]="directionsLink(store)" target="_blank" rel="noopener" class="flex-1 btn-apple-pill text-xs !py-2 !px-3" (click)="$event.stopPropagation()">Get Directions</a>
                </div>
             </div>
          </div>

          <!-- Map Placeholder -->
          <div class="lg:col-span-2 bg-[#f5f5f7] border border-[#e0e0e0] rounded-[18px] overflow-hidden relative h-[600px]">
             <iframe *ngIf="mapUrl()" [src]="mapUrl()" title="Map of the selected store" class="absolute inset-0 w-full h-full border-0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
             <div class="absolute inset-0 flex items-end justify-start p-6 pointer-events-none">
                <div *ngIf="selectedStore()" class="bg-white p-6 rounded-[18px] border border-[#e0e0e0] shadow-lg max-w-sm w-full animate-fade-in-up pointer-events-auto">
                   <h3 class="font-display font-semibold text-xl text-[#1d1d1f] mb-2">{{ selectedStore()?.name }}</h3>
                   <p class="text-[#6e6e73] text-sm mb-4">{{ selectedStore()?.address }}</p>
                   <a [href]="directionsLink(selectedStore()!)" target="_blank" rel="noopener" class="w-full btn-apple-pill">Navigate Now</a>
                </div>
                <div *ngIf="!selectedStore() && !isLoading()" class="pointer-events-auto bg-white/80 backdrop-blur-md border border-[#e0e0e0] px-5 py-3 rounded-full">
                   <p class="text-sm font-semibold text-[#1d1d1f]">Select a store to view details</p>
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
  private sanitizer = inject(DomSanitizer);

  stores = signal<Store[]>([]);
  selectedStore = signal<Store | null>(null);
  isLoading = signal(true);
  error = signal('');

  /** OpenStreetMap embed centred on the selected store (no API key needed). */
  mapUrl = computed<SafeResourceUrl | null>(() => {
    const s = this.selectedStore();
    if (!s || !s.lat || !s.lng) return null;
    const d = 0.01;
    const bbox = `${s.lng - d},${s.lat - d},${s.lng + d},${s.lat + d}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${s.lat},${s.lng}`
    );
  });

  /** tel: link; strips spaces and punctuation so mobile dialers accept it. */
  telLink(store: Store): string {
    return "tel:" + (store.phone || "").replace(/[^0-9+]/g, "");
  }

  /** Google Maps directions to the store, by coordinates when we have them. */
  directionsLink(store: Store): string {
    const destination = store.lat && store.lng ? `${store.lat},${store.lng}` : encodeURIComponent(`${store.name}, ${store.address}`);
    return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  }

  ngOnInit() {
    this.storeService.getStores().subscribe({
        next: (response) => {
            this.stores.set(response.stores);
            if (response.stores.length > 0) {
                this.selectedStore.set(response.stores[0]);
            }
            this.isLoading.set(false);
        },
        error: () => {
            this.error.set('Unable to load store locations. Please try again later.');
            this.isLoading.set(false);
        }
    });
  }
}
