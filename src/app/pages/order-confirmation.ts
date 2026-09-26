import { Component, OnInit, signal, computed, ChangeDetectionStrategy, PLATFORM_ID, inject } from "@angular/core";
import { CommonModule, NgOptimizedImage, isPlatformBrowser } from "@angular/common";
import { RouterLink, ActivatedRoute } from "@angular/router";
import { OrderService } from "../services/order.service";
import { AuthService } from "../services/auth.service";
import { ToastService } from "../services/toast.service";
import { maskGiftCardCode } from "../services/gift-card.service";
import { isPaidOrder } from "../core/models";
import { CurrencyConvertPipe } from "../pipes/currency-convert.pipe";
import { environment } from "../../environments/environment";

@Component({
  selector: "app-order-confirmation",
  standalone: true,
  imports: [CommonModule, RouterLink, NgOptimizedImage, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">
      <!-- Breadcrumb -->
      <div class="bg-[#f5f5f7] border-b border-[#e0e0e0]">
        <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-4">
          <div class="flex items-center gap-2 text-sm">
            <a routerLink="/" class="text-[#6e6e73] hover:text-[#D4AF37]">Home</a>
            <span class="text-[#a1a1a6]">/</span>
            <span class="text-[#1d1d1f] font-medium">Order Confirmation</span>
          </div>
        </div>
      </div>

      <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-16">
        <!-- Success Animation -->
        <div class="text-center mb-12">
          <div class="mb-6 inline-block">
            <div
              class="w-24 h-24 rounded-full bg-[#f5f5f7] border border-[#e0e0e0] flex items-center justify-center animate-scaleUp"
            >
              <svg class="w-12 h-12 text-[#D4AF37]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
          </div>

          <h1
            class="font-display font-semibold text-4xl md:text-5xl tracking-tight text-[#1d1d1f] mb-4"
          >
            Thank You!
          </h1>
          <p class="text-lg text-[#6e6e73] mb-8">
            Your order has been confirmed successfully
          </p>

          <!-- Order Number -->
          <div class="mb-12">
            <div
              class="inline-block bg-white border border-[#e0e0e0] rounded-[18px] px-8 py-4"
            >
              <p class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-2">Order Number</p>
              <p class="font-display font-semibold text-3xl text-[#1d1d1f]">{{ orderNumber() }}</p>
            </div>

            <!-- Optional preferences prompt: only for signed-in customers with neither field set -->
            <p *ngIf="showPreferencePrompt()" class="mt-4 text-sm text-[#6e6e73]">
              <a routerLink="/account" [queryParams]="{ tab: 'settings' }" class="hover:text-[#D4AF37]">
                Tell us your ring size and preferred metal for faster custom orders
                <span aria-hidden="true">→</span>
              </a>
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Main Content -->
          <div class="lg:col-span-2 space-y-8">
            <!-- Order Details -->
            <div class="card p-8">
              <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">
                Order Details
              </h2>

              <div class="space-y-6">
                <!-- Order Status -->
                <div>
                  <h3 class="font-sans font-semibold text-base text-[#1d1d1f] mb-4">Status</h3>
                  <div
                    class="flex items-center gap-3 px-4 py-3 bg-blue-50 border border-blue-100 rounded-[12px]"
                  >
                    <span class="w-3 h-3 rounded-full bg-blue-500"></span>
                    <span class="font-semibold text-blue-900">Processing</span>
                  </div>
                  <p class="text-sm text-[#6e6e73] mt-2">
                    Your order is being prepared for shipment. We'll notify you
                    when it ships.
                  </p>
                </div>

                <!-- Tax invoice (GST contract): issued once the order is paid -->
                <div *ngIf="invoiceNumber() || isPaid()" class="border-t border-[#e0e0e0] pt-6">
                  <h3 class="font-sans font-semibold text-base text-[#1d1d1f] mb-4">
                    Tax invoice
                  </h3>
                  <div
                    *ngIf="invoiceNumber(); else invoicePending"
                    class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#f5f5f7] rounded-[12px] p-4"
                  >
                    <div>
                      <p class="font-semibold text-[#1d1d1f]">Tax invoice {{ invoiceNumber() }}</p>
                      <p *ngIf="invoiceDate()" class="text-sm text-[#6e6e73] mt-0.5">
                        Issued {{ invoiceDate() | date: 'mediumDate' }}
                      </p>
                    </div>
                    <button
                      type="button"
                      (click)="downloadInvoice()"
                      [disabled]="downloadingInvoice()"
                      class="btn-apple-pill !py-2.5 !px-5 text-sm whitespace-nowrap"
                    >
                      {{ downloadingInvoice() ? 'Preparing…' : 'Download invoice' }}
                    </button>
                  </div>
                  <ng-template #invoicePending>
                    <p class="text-sm text-[#6e6e73]">Your tax invoice will appear here shortly.</p>
                  </ng-template>
                </div>

                <!-- Estimated Delivery -->
                <div class="border-t border-[#e0e0e0] pt-6">
                  <h3 class="font-sans font-semibold text-base text-[#1d1d1f] mb-4">
                    Estimated Delivery
                  </h3>
                  <div class="bg-[#f5f5f7] rounded-[12px] p-4">
                    <p class="text-lg font-semibold text-[#1d1d1f]">
                      {{ estimatedDelivery() }}
                    </p>
                    <p class="text-sm text-[#6e6e73] mt-2">
                      Free insured shipping worldwide
                    </p>
                  </div>
                </div>

                <!-- Shipping Address -->
                <div class="border-t border-[#e0e0e0] pt-6">
                  <h3 class="font-sans font-semibold text-base text-[#1d1d1f] mb-4">
                    Shipping Address
                  </h3>
                  <div
                    class="bg-[#f5f5f7] rounded-[12px] p-4 text-sm text-[#1d1d1f] space-y-1"
                  >
                    <p>
                      {{ shippingAddress().firstName }}
                      {{ shippingAddress().lastName }}
                    </p>
                    <p>{{ shippingAddress().address }}</p>
                    <p>
                      {{ shippingAddress().city }},
                      {{ shippingAddress().state }}
                      {{ shippingAddress().zipCode }}
                    </p>
                    <p>{{ shippingAddress().country }}</p>
                  </div>
                </div>

                <!-- Order Items -->
                <div class="border-t border-[#e0e0e0] pt-6">
                  <h3 class="font-sans font-semibold text-base text-[#1d1d1f] mb-4">Items</h3>
                  <div class="space-y-4">
                    <ng-container *ngFor="let item of orderItems()">
                      <div
                        class="flex gap-4 pb-4 border-b border-[#f0f0f0] last:border-b-0"
                      >
                        <img
                          [ngSrc]="item.product?.imageUrl || item.product?.images?.[0] || ''"
                          [alt]="item.product?.name || item.description || 'Item'"
                          width="80"
                          height="80"
                          class="rounded-[12px] object-cover"
                          *ngIf="item.product?.imageUrl || item.product?.images?.[0]"
                        />
                        <div class="flex-1">
                          <p class="font-semibold text-[#1d1d1f]">
                            {{ item.product?.name || item.description || 'Custom piece' }}
                          </p>
                          <p class="text-sm text-[#6e6e73]">
                            SKU: {{ item.product?.sku || 'N/A' }}
                          </p>
                          <p class="text-sm text-[#6e6e73]">
                            Qty: {{ item.quantity }}
                          </p>
                        </div>
                        <div class="text-right">
                          <p class="font-semibold text-[#1d1d1f]">
                            {{ (item.price * item.quantity) | currencyConvert }}
                          </p>
                        </div>
                      </div>
                    </ng-container>
                  </div>
                </div>
              </div>
            </div>

            <!-- Next Steps -->
            <div
              class="bg-[#f5f5f7] border border-[#e0e0e0] rounded-[18px] p-8"
            >
              <h3 class="font-display font-semibold text-xl text-[#1d1d1f] mb-6">
                What's Next?
              </h3>
              <div class="space-y-4">
                <div class="flex gap-4">
                  <span
                    class="flex-shrink-0 w-8 h-8 rounded-full bg-[#1d1d1f] text-white flex items-center justify-center text-sm font-semibold"
                  >
                    1
                  </span>
                  <div>
                    <p class="font-semibold text-[#1d1d1f]">
                      Confirmation Email
                    </p>
                    <p class="text-sm text-[#6e6e73]">
                      Check your email for order confirmation and tracking
                      details.
                    </p>
                  </div>
                </div>
                <div class="flex gap-4">
                  <span
                    class="flex-shrink-0 w-8 h-8 rounded-full bg-[#1d1d1f] text-white flex items-center justify-center text-sm font-semibold"
                  >
                    2
                  </span>
                  <div>
                    <p class="font-semibold text-[#1d1d1f]">
                      Quality Inspection
                    </p>
                    <p class="text-sm text-[#6e6e73]">
                      Our team will inspect your items for quality and
                      authenticity.
                    </p>
                  </div>
                </div>
                <div class="flex gap-4">
                  <span
                    class="flex-shrink-0 w-8 h-8 rounded-full bg-[#1d1d1f] text-white flex items-center justify-center text-sm font-semibold"
                  >
                    3
                  </span>
                  <div>
                    <p class="font-semibold text-[#1d1d1f]">Shipment</p>
                    <p class="text-sm text-[#6e6e73]">
                      Your items will be shipped with tracking number within 2-3
                      business days.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Order Summary Sidebar -->
          <div class="lg:col-span-1">
            <div class="card p-8 sticky top-[120px]">
              <h3 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">
                Order Summary
              </h3>

              <div class="space-y-4 mb-4 pb-4 border-b border-[#e0e0e0] text-sm">
                <div class="flex justify-between">
                  <span class="text-[#6e6e73]">Subtotal</span>
                  <span class="font-semibold">{{
                    orderSummary().subtotal | currencyConvert
                  }}</span>
                </div>
                <div
                  *ngIf="orderSummary().discount > 0"
                  class="flex justify-between text-emerald-600"
                >
                  <span>Discount</span>
                  <span class="font-semibold"
                    >-{{ orderSummary().discount | currencyConvert }}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-[#6e6e73]">Shipping</span>
                  <span
                    class="font-semibold"
                    [class.text-emerald-600]="orderSummary().shipping === 0"
                    >{{
                      orderSummary().shipping === 0
                        ? 'FREE'
                        : (orderSummary().shipping | currencyConvert)
                    }}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-[#6e6e73]">Tax</span>
                  <span class="font-semibold">{{
                    orderSummary().tax | currencyConvert
                  }}</span>
                </div>
                <div
                  *ngIf="orderSummary().giftCardAmount > 0"
                  class="flex justify-between text-emerald-600"
                >
                  <span>Gift card<ng-container *ngIf="orderSummary().appliedGiftCard"> ({{ orderSummary().appliedGiftCard }})</ng-container></span>
                  <span class="font-semibold"
                    >-{{ orderSummary().giftCardAmount | currencyConvert }}</span
                  >
                </div>
              </div>

              <div class="flex justify-between items-center mb-6">
                <span class="font-semibold text-base text-[#1d1d1f]">{{
                  orderSummary().giftCardAmount > 0 ? 'Amount paid' : 'Total'
                }}</span>
                <span class="font-semibold text-2xl text-[#1d1d1f]">{{
                  orderSummary().total | currencyConvert
                }}</span>
              </div>
              <p
                *ngIf="orderSummary().giftCardAmount > 0 && orderSummary().total === 0"
                class="text-sm text-[#6e6e73] -mt-4 mb-6"
              >
                Paid in full with your gift card. No further payment is due.
              </p>

              <div class="space-y-3 mb-6">
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">✓</span>
                  <p class="text-sm text-[#6e6e73]">Free insured shipping</p>
                </div>
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">✓</span>
                  <p class="text-sm text-[#6e6e73]">
                    <a routerLink="/returns" class="underline">Returns and warranty terms</a>
                  </p>
                </div>
              </div>

              <button routerLink="/" class="w-full btn-apple-pill">
                Continue Shopping
              </button>
            </div>
          </div>
        </div>

        <!-- Help Section -->
        <div class="mt-16 bg-[#f5f5f7] border border-[#e0e0e0] rounded-[18px] p-8 text-center">
          <h3 class="font-display font-semibold text-xl text-[#1d1d1f] mb-4">Need Help?</h3>
          <p class="text-[#6e6e73] mb-6">
            Have questions about your order? Our customer support team is here
            to help.
          </p>
          <div class="flex gap-4 justify-center flex-wrap">
            <a routerLink="/contact" class="btn-apple-pill">Contact Us</a>
            <a
              [href]="whatsappUrl"
              target="_blank"
              rel="noopener"
              class="btn-outline"
            >
              WhatsApp Support
            </a>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class OrderConfirmationComponent implements OnInit {
  private platformId = inject(PLATFORM_ID);
  private authService = inject(AuthService);
  whatsappUrl = `https://wa.me/${environment.whatsappNumber}`;

  /**
   * Growth contract, section 3: one optional line for signed-in customers who
   * have told us neither a ring size nor a preferred metal. Guests never see it.
   */
  showPreferencePrompt = computed(() => {
    const user = this.authService.currentUser();
    return !!user && !user.ringSize && !user.preferredMetal;
  });
  orderNumber = signal("");
  estimatedDelivery = signal("");
  orderItems = signal<any[]>([]);

  // Tax invoice (GST contract)
  private orderId = signal("");
  invoiceNumber = signal("");
  invoiceDate = signal("");
  /** Paid orders get an invoice; until it is issued the page says so. */
  isPaid = signal(false);
  downloadingInvoice = signal(false);
  private toastService = inject(ToastService);
  shippingAddress = signal<any>({
    firstName: "",
    lastName: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "",
  });
  orderSummary = signal({
    subtotal: 0,
    tax: 0,
    shipping: 0,
    discount: 0,
    giftCardAmount: 0,
    appliedGiftCard: "",
    total: 0,
  });

  constructor(
    private route: ActivatedRoute,
    private orderService: OrderService,
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      const orderId = params["orderId"];
      if (orderId) {
        this.loadOrder(orderId);
      }
    });

    // Every route is server-rendered (RenderMode.Server on '**'), where
    // sessionStorage does not exist. Reading it unguarded threw a
    // ReferenceError during SSR, so this page failed to render at all on the
    // server -- on the screen a customer lands on immediately after paying.
    if (isPlatformBrowser(this.platformId)) {
      let sessionOrderId: string | null = null;
      try {
        sessionOrderId = sessionStorage.getItem("lastOrderId");
      } catch {
        // Storage can be unavailable (private mode, blocked site data).
        sessionOrderId = null;
      }

      if (sessionOrderId) {
        this.loadOrder(sessionOrderId);
        try {
          sessionStorage.removeItem("lastOrderId");
        } catch {
          /* nothing to clean up */
        }
      }
    }
  }

  private loadOrder(orderId: string): void {
    this.orderService.getOrderById(orderId).subscribe({
      next: (order) => {
        this.orderNumber.set(order.orderNumber || `ORD-${order.id?.substring(0, 8)}`);
        this.orderItems.set(order.items);
        this.orderId.set(order.id);
        this.invoiceNumber.set(order.invoiceNumber || "");
        this.invoiceDate.set(order.invoiceDate || "");
        this.isPaid.set(isPaidOrder(order));

        // Use what the server charged. This previously recomputed a subtotal
        // from the line items and applied 10% tax -- against a 3% cart -- so
        // the customer was shown a total they had not been charged. The API
        // returns the real breakdown; only fall back to summing lines if a
        // field is genuinely absent.
        const subtotal =
          order.subtotal ??
          order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const tax = order.tax ?? 0;
        const shipping = order.shipping ?? 0;
        const discount = order.discount ?? 0;
        const giftCardAmount = Number(order.giftCardAmount) || 0;
        const total =
          order.total ?? subtotal - discount + tax + shipping - giftCardAmount;

        this.orderSummary.set({
          subtotal,
          tax,
          shipping,
          discount,
          giftCardAmount,
          appliedGiftCard: maskGiftCardCode(order.appliedGiftCard),
          total,
        });

        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + 3);
        this.estimatedDelivery.set(
          deliveryDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }),
        );
      },
      error: () => {
        // Error loading order
      },
    });
  }

  downloadInvoice(): void {
    const id = this.orderId();
    const number = this.invoiceNumber();
    if (!id || !number || this.downloadingInvoice()) return;
    this.downloadingInvoice.set(true);
    this.orderService.downloadInvoice(id, number).subscribe({
      next: () => this.downloadingInvoice.set(false),
      error: () => {
        this.downloadingInvoice.set(false);
        // GET failures stay silent in the error interceptor; say something here.
        this.toastService.show(
          "The invoice is not available yet. Please try again in a few minutes.",
          "error",
        );
      },
      complete: () => this.downloadingInvoice.set(false),
    });
  }
}
