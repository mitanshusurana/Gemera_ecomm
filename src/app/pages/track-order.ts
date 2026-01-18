import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { OrderService } from '../services/order.service';
import { ToastService } from '../services/toast.service';
import { Order } from '../core/models';
import { CurrencyService } from '../services/currency.service';

@Component({
  selector: 'app-track-order',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-white font-sans text-[#4f3267]">
      <div class="container mx-auto px-4 py-12 max-w-2xl">
        <h1 class="text-3xl font-serif font-bold text-center mb-8 text-[#4f3267]">Track Your Order</h1>

        <div class="bg-gray-50 p-8 rounded-2xl border border-gray-100 shadow-sm">
          <div class="space-y-6">
            <div>
              <label class="block text-sm font-bold text-gray-700 mb-2">Order Number</label>
              <input type="text"
                     [(ngModel)]="orderId"
                     placeholder="e.g. ORD-12345"
                     class="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#4f3267] focus:ring-1 focus:ring-[#4f3267]">
            </div>

            <button (click)="trackOrder()"
                    [disabled]="loading()"
                    class="w-full bg-[#4f3267] text-white font-bold py-3 rounded-lg hover:bg-[#362247] transition-colors disabled:opacity-50">
              {{ loading() ? 'Tracking...' : 'Track Order' }}
            </button>
          </div>
        </div>

        <!-- Result -->
        <div *ngIf="order()" class="mt-8 bg-white p-6 rounded-2xl border border-gray-100 shadow-lg animate-fade-in">
           <div class="flex justify-between items-start mb-6 pb-6 border-b border-gray-100">
              <div>
                 <h2 class="text-xl font-bold text-[#4f3267]">Order Status: {{ order()?.status }}</h2>
                 <p class="text-sm text-gray-500 mt-1">Order #{{ order()?.orderNumber }}</p>
              </div>
              <div class="text-right">
                 <p class="text-xs text-gray-500 uppercase tracking-wide">Estimated Delivery</p>
                 <p class="font-bold text-gray-900">{{ order()?.estimatedDelivery | date:'mediumDate' }}</p>
              </div>
           </div>

           <div class="space-y-4">
              <div *ngFor="let item of order()?.items" class="flex items-center gap-4 bg-gray-50 p-3 rounded-lg">
                 <div class="w-16 h-16 bg-white rounded border border-gray-200 flex items-center justify-center overflow-hidden">
                    <img *ngIf="item.product.imageUrl || item.product.images?.[0]" [src]="item.product.imageUrl || item.product.images?.[0]" class="w-full h-full object-cover">
                    <span *ngIf="!item.product.imageUrl && !item.product.images?.[0]" class="text-xl">💎</span>
                 </div>
                 <div class="flex-1">
                    <h4 class="font-bold text-sm text-gray-900">{{ item.product.name }}</h4>
                    <p class="text-xs text-gray-500">{{ item.selectedMetal?.name }} {{ item.selectedDiamond?.name }}</p>
                 </div>
                 <div class="text-right">
                    <p class="font-bold text-[#4f3267]">{{ formatPrice(item.price) }}</p>
                    <p class="text-xs text-gray-500">Qty: {{ item.quantity }}</p>
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>
  `
})
export class TrackOrderComponent implements OnInit {
  orderId = '';
  loading = signal(false);
  order = signal<Order | null>(null);

  private route = inject(ActivatedRoute);
  private orderService = inject(OrderService);
  private toastService = inject(ToastService);
  private currencyService = inject(CurrencyService);

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      if (params['id']) {
        this.orderId = params['id'];
        this.trackOrder();
      }
    });
  }

  trackOrder() {
    if (!this.orderId) {
      this.toastService.show('Please enter an order number', 'error');
      return;
    }

    this.loading.set(true);
    this.order.set(null);

    // Mock logic: try to get by ID, if fails, mock a not found or just show the mock logic
    // Since our mock backend expects ID (guid) not Order Number (ORD-...), let's just try to call getById
    // In a real app we'd have a specific track endpoint.
    // Here we will use getOrderById.

    // For demo purposes, if they type any string, we might just fetch the mock order "order-1" or handle error
    this.orderService.getOrderById(this.orderId).subscribe({
      next: (res) => {
        this.order.set(res);
        this.loading.set(false);
      },
      error: () => {
         // Fallback for demo if ID match failed, try to mock a result for "ORD-12345"
         if (this.orderId.startsWith('ORD-')) {
            // Mock response
            setTimeout(() => {
                this.order.set({
                    id: 'mock-track',
                    orderNumber: this.orderId,
                    userId: 'guest',
                    status: 'SHIPPED',
                    total: 55000,
                    createdAt: new Date().toISOString(),
                    estimatedDelivery: new Date(Date.now() + 86400000 * 3).toISOString(),
                    items: [
                        {
                            id: 'i1',
                            product: { name: '1.5 Carat Diamond Solitaire', price: 45000, imageUrl: 'https://images.unsplash.com/photo-1515562141207-6461823488d2?w=600&h=400&fit=crop' } as any,
                            quantity: 1,
                            price: 45000,
                            selectedMetal: { name: '18K White Gold' },
                            selectedDiamond: { name: 'VS1' }
                        }
                    ]
                } as Order);
                this.loading.set(false);
            }, 1000);
         } else {
             this.toastService.show('Order not found', 'error');
             this.loading.set(false);
         }
      }
    });
  }

  formatPrice(p: number) { return this.currencyService.format(p); }
}
