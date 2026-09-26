import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule, NgOptimizedImage } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { OrderService } from '../services/order.service';
import { ToastService } from '../services/toast.service';
import { Order } from '../core/models';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';

@Component({
  selector: 'app-track-order',
  standalone: true,
  imports: [CommonModule, FormsModule, CurrencyConvertPipe, NgOptimizedImage],
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">
      <div class="max-w-[720px] mx-auto px-6 py-16">
        <div class="text-center mb-10">
          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-2 block">Order Tracking</span>
          <h1 class="font-display font-semibold text-3xl sm:text-4xl text-[#1d1d1f] tracking-tight">Track Your Order</h1>
        </div>

        <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
          <div class="space-y-6">
            <div>
              <label for="track-order-number" class="block text-sm font-semibold text-[#1d1d1f] mb-2">Order Number</label>
              <input type="text"
                     id="track-order-number"
                     [(ngModel)]="orderId"
                     placeholder="e.g. ORD-12345"
                     class="input-field">
            </div>

            <button (click)="trackOrder()"
                    [disabled]="loading()"
                    class="btn-apple-pill w-full">
              {{ loading() ? 'Tracking...' : 'Track Order' }}
            </button>
          </div>
        </div>

        <!-- Result -->
        <div *ngIf="order()" class="mt-8 bg-white border border-[#e0e0e0] rounded-[18px] p-6 animate-fade-in">
           <div class="flex justify-between items-start mb-6 pb-6 border-b border-[#e0e0e0]">
              <div>
                 <h2 class="font-display font-semibold text-xl text-[#1d1d1f]">Order Status: {{ order()?.status }}</h2>
                 <p class="text-sm text-[#6e6e73] mt-1">Order #{{ order()?.orderNumber }}</p>
              </div>
              <div class="text-right">
                 <p class="text-xs text-[#6e6e73] uppercase tracking-wide">Estimated Delivery</p>
                 <p class="font-semibold text-[#1d1d1f]">{{ order()?.estimatedDelivery | date:'mediumDate' }}</p>
              </div>
           </div>

           <div class="space-y-4">
              <div *ngFor="let item of order()?.items" class="flex items-center gap-4 bg-[#f5f5f7] p-3 rounded-[12px]">
                 <div class="w-16 h-16 bg-white rounded-[12px] border border-[#e0e0e0] flex items-center justify-center overflow-hidden">
                    <img *ngIf="item.product?.imageUrl || item.product?.images?.[0]" [ngSrc]="item.product?.imageUrl || item.product?.images?.[0] || ''" width="64" height="64" class="w-full h-full object-cover" [alt]="item.product?.name || item.description || 'Item'">
                    <span *ngIf="!item.product?.imageUrl && !item.product?.images?.[0]" class="text-xl">💎</span>
                 </div>
                 <div class="flex-1">
                    <h4 class="font-sans font-semibold text-sm text-[#1d1d1f]">{{ item.product?.name || item.description || 'Custom piece' }}</h4>
                    <p class="text-xs text-[#6e6e73]">{{ item.selectedMetal?.name }} {{ item.selectedDiamond?.name }}</p>
                 </div>
                 <div class="text-right">
                    <p class="font-semibold text-[#1d1d1f]">{{ item.price | currencyConvert }}</p>
                    <p class="text-xs text-[#6e6e73]">Qty: {{ item.quantity }}</p>
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

    this.orderService.trackOrder(this.orderId).subscribe({
      next: (res) => {
        this.order.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.toastService.show('Order not found', 'error');
        this.loading.set(false);
      }
    });
  }
}
