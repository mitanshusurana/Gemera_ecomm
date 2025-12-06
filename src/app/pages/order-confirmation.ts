import { Component, OnInit, signal } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-order-confirmation',
  standalone: true,
  imports: [CommonModule, RouterLink, DecimalPipe],
  template: `
    <div class="min-h-screen bg-gradient-to-b from-gold-50 to-white">
      <!-- Breadcrumb -->
      <div class="bg-diamond-50 border-b border-diamond-200">
        <div class="container-luxury py-4">
          <div class="flex items-center gap-2 text-sm">
            <a routerLink="/" class="text-gold-600 hover:text-gold-700">Home</a>
            <span class="text-gray-500">/</span>
            <span class="text-gray-700">Order Confirmation</span>
          </div>
        </div>
      </div>

      <div class="container-luxury section-padding">
        <!-- Success Animation -->
        <div class="text-center mb-12">
          <div class="mb-6 inline-block">
            <div class="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center animate-scaleIn">
              <span class="text-5xl">✓</span>
            </div>
          </div>

          <h1 class="text-5xl md:text-6xl font-display font-bold text-diamond-900 mb-4">
            Thank You!
          </h1>
          <p class="text-xl text-gray-600 mb-8">
            Your order has been confirmed successfully
          </p>

          <!-- Order Number -->
          <div class="inline-block bg-white border-2 border-gold-500 rounded-lg px-8 py-4 mb-12">
            <p class="text-sm text-gray-600 mb-2">Order Number</p>
            <p class="text-3xl font-bold text-gold-600">{{ orderNumber() }}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Main Content -->
          <div class="lg:col-span-2 space-y-8">
            <!-- Order Details -->
            <div class="card p-8">
              <h2 class="text-2xl font-bold text-diamond-900 mb-6">Order Details</h2>

              <div class="space-y-6">
                <!-- Order Status -->
                <div>
                  <h3 class="font-semibold text-gray-900 mb-4">Status</h3>
                  <div class="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <span class="w-3 h-3 rounded-full bg-blue-500"></span>
                    <span class="font-semibold text-blue-900">Processing</span>
                  </div>
                  <p class="text-sm text-gray-600 mt-2">
                    Your order is being prepared for shipment. We'll notify you when it ships.
                  </p>
                </div>

                <!-- Estimated Delivery -->
                <div class="border-t border-diamond-200 pt-6">
                  <h3 class="font-semibold text-gray-900 mb-4">Estimated Delivery</h3>
                  <div class="bg-diamond-50 rounded-lg p-4">
                    <p class="text-lg font-bold text-gray-900">{{ estimatedDelivery() }}</p>
                    <p class="text-sm text-gray-600 mt-2">Free insured shipping worldwide</p>
                  </div>
                </div>

                <!-- Shipping Address -->
                <div class="border-t border-diamond-200 pt-6">
                  <h3 class="font-semibold text-gray-900 mb-4">Shipping Address</h3>
                  <div class="bg-diamond-50 rounded-lg p-4 text-sm text-gray-700 space-y-1">
                    <p>{{ shippingAddress().firstName }} {{ shippingAddress().lastName }}</p>
                    <p>{{ shippingAddress().address }}</p>
                    <p>
                      {{ shippingAddress().city }}, {{ shippingAddress().state }}
                      {{ shippingAddress().zipCode }}
                    </p>
                    <p>{{ shippingAddress().country }}</p>
                  </div>
                </div>

                <!-- Order Items -->
                <div class="border-t border-diamond-200 pt-6">
                  <h3 class="font-semibold text-gray-900 mb-4">Items</h3>
                  <div class="space-y-4">
                    <ng-container *ngFor="let item of orderItems()">
                      <div class="flex gap-4 pb-4 border-b border-diamond-200 last:border-b-0">
                        <img
                          [src]="item.product.imageUrl"
                          [alt]="item.product.name"
                          class="w-20 h-20 rounded-lg object-cover"
                        />
                        <div class="flex-1">
                          <p class="font-semibold text-gray-900">{{ item.product.name }}</p>
                          <p class="text-sm text-gray-600">SKU: {{ item.product.sku }}</p>
                          <p class="text-sm text-gray-600">Qty: {{ item.quantity }}</p>
                        </div>
                        <div class="text-right">
                          <p class="font-semibold text-gray-900">
                            {{ formatPrice(item.price * item.quantity) }}
                          </p>
                        </div>
                      </div>
                    </ng-container>
                  </div>
                </div>
              </div>
            </div>

            <!-- Next Steps -->
            <div class="bg-sapphire-50 border border-sapphire-200 rounded-lg p-8">
              <h3 class="text-xl font-bold text-diamond-900 mb-6">What's Next?</h3>
              <div class="space-y-4">
                <div class="flex gap-4">
                  <span class="flex-shrink-0 w-8 h-8 rounded-full bg-sapphire-600 text-white flex items-center justify-center font-bold">
                    1
                  </span>
                  <div>
                    <p class="font-semibold text-gray-900">Confirmation Email</p>
                    <p class="text-sm text-gray-600">
                      Check your email for order confirmation and tracking details.
                    </p>
                  </div>
                </div>
                <div class="flex gap-4">
                  <span class="flex-shrink-0 w-8 h-8 rounded-full bg-sapphire-600 text-white flex items-center justify-center font-bold">
                    2
                  </span>
                  <div>
                    <p class="font-semibold text-gray-900">Quality Inspection</p>
                    <p class="text-sm text-gray-600">
                      Our team will inspect your items for quality and authenticity.
                    </p>
                  </div>
                </div>
                <div class="flex gap-4">
                  <span class="flex-shrink-0 w-8 h-8 rounded-full bg-sapphire-600 text-white flex items-center justify-center font-bold">
                    3
                  </span>
                  <div>
                    <p class="font-semibold text-gray-900">Shipment</p>
                    <p class="text-sm text-gray-600">
                      Your items will be shipped with tracking number within 2-3 business days.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Order Summary Sidebar -->
          <div class="lg:col-span-1">
            <div class="card p-8 sticky top-24">
              <h3 class="font-display text-2xl font-bold text-diamond-900 mb-6">Order Summary</h3>

              <div class="space-y-4 mb-4 pb-4 border-b border-diamond-200">
                <div class="flex justify-between">
                  <span class="text-gray-600">Subtotal</span>
                  <span class="font-semibold">{{ formatPrice(orderSummary().subtotal) }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Shipping</span>
                  <span class="font-semibold">FREE</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Tax</span>
                  <span class="font-semibold">{{ formatPrice(orderSummary().tax) }}</span>
                </div>
              </div>

              <div class="flex justify-between mb-6 text-xl">
                <span class="font-bold text-gray-900">Total</span>
                <span class="font-bold text-2xl text-gold-600">{{ formatPrice(orderSummary().total) }}</span>
              </div>

              <div class="space-y-3 mb-6">
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">✓</span>
                  <p class="text-sm text-gray-600">Free insured shipping</p>
                </div>
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">✓</span>
                  <p class="text-sm text-gray-600">30-day money-back guarantee</p>
                </div>
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">✓</span>
                  <p class="text-sm text-gray-600">Lifetime warranty included</p>
                </div>
              </div>

              <button routerLink="/" class="w-full btn-primary">
                Continue Shopping
              </button>
            </div>
          </div>
        </div>

        <!-- Help Section -->
        <div class="mt-16 bg-diamond-50 rounded-lg p-8 text-center">
          <h3 class="text-xl font-bold text-diamond-900 mb-4">Need Help?</h3>
          <p class="text-gray-600 mb-6">
            Have questions about your order? Our customer support team is here to help.
          </p>
          <div class="flex gap-4 justify-center flex-wrap">
            <a routerLink="/contact" class="btn-primary">Contact Us</a>
            <a href="https://wa.me/917976091951" target="_blank" rel="noopener" class="btn-ghost border border-diamond-300">
              WhatsApp Support
            </a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      @keyframes scaleIn {
        from {
          transform: scale(0);
          opacity: 0;
        }
        to {
          transform: scale(1);
          opacity: 1;
        }
      }

      .animate-scaleIn {
        animation: scaleIn 0.5s ease-out;
      }
    `,
  ],
})
export class OrderConfirmationComponent implements OnInit {
  orderNumber = signal('');
  estimatedDelivery = signal('');
  orderItems = signal<any[]>([]);
  shippingAddress = signal<any>({
    firstName: '',
    lastName: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
  });
  orderSummary = signal({ subtotal: 0, tax: 0, total: 0 });

  constructor(
    private route: ActivatedRoute,
    private apiService: ApiService
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const orderId = params['orderId'];
      if (orderId) {
        this.loadOrder(orderId);
      }
    });

    const sessionOrderId = sessionStorage.getItem('lastOrderId');
    if (sessionOrderId) {
      this.loadOrder(sessionOrderId);
      sessionStorage.removeItem('lastOrderId');
    }
  }

  formatPrice(amount: number): string {
    return '$' + amount.toFixed(2);
  }

  private loadOrder(orderId: string): void {
    this.apiService.getOrderById(orderId).subscribe({
      next: (order) => {
        this.orderNumber.set(order.orderNumber);
        this.orderItems.set(order.items);

        const subtotal = order.items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        );
        const tax = subtotal * 0.1;
        const total = subtotal + tax;

        this.orderSummary.set({ subtotal, tax, total });

        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + 3);
        this.estimatedDelivery.set(
          deliveryDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        );
      },
      error: (error) => {
        console.error('Error loading order:', error);
      },
    });
  }
}
