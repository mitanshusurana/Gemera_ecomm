import { Component, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink, Router } from "@angular/router";
import { ApiService } from "../services/api.service";
import { EmailNotificationService } from "../services/email-notification.service";

@Component({
  selector: "app-checkout",
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
            <a routerLink="/cart" class="text-gold-600 hover:text-gold-700"
              >Cart</a
            >
            <span class="text-gray-500">/</span>
            <span class="text-gray-700">Checkout</span>
          </div>
        </div>
      </div>

      <div class="container-luxury section-padding">
        <h1
          class="text-5xl md:text-6xl font-display font-bold text-diamond-900 mb-12"
        >
          Checkout
        </h1>

        <!-- Progress Steps -->
        <div class="mb-12">
          <div class="flex gap-4 items-center">
            <div
              class="flex items-center justify-center w-10 h-10 rounded-full"
              [ngClass]="
                currentStep() >= 1
                  ? 'bg-gold-500 text-white'
                  : 'bg-diamond-200 text-gray-700'
              "
            >
              1
            </div>
            <div
              class="flex-1 h-1"
              [ngClass]="currentStep() >= 2 ? 'bg-gold-500' : 'bg-diamond-200'"
            ></div>
            <div
              class="flex items-center justify-center w-10 h-10 rounded-full"
              [ngClass]="
                currentStep() >= 2
                  ? 'bg-gold-500 text-white'
                  : 'bg-diamond-200 text-gray-700'
              "
            >
              2
            </div>
            <div
              class="flex-1 h-1"
              [ngClass]="currentStep() >= 3 ? 'bg-gold-500' : 'bg-diamond-200'"
            ></div>
            <div
              class="flex items-center justify-center w-10 h-10 rounded-full"
              [ngClass]="
                currentStep() >= 3
                  ? 'bg-gold-500 text-white'
                  : 'bg-diamond-200 text-gray-700'
              "
            >
              3
            </div>
          </div>
          <div class="flex justify-between mt-4 text-sm">
            <span
              class="font-semibold"
              [ngClass]="currentStep() >= 1 ? 'text-gold-600' : 'text-gray-600'"
              >Shipping</span
            >
            <span
              class="font-semibold"
              [ngClass]="currentStep() >= 2 ? 'text-gold-600' : 'text-gray-600'"
              >Payment</span
            >
            <span
              class="font-semibold"
              [ngClass]="currentStep() >= 3 ? 'text-gold-600' : 'text-gray-600'"
              >Confirm</span
            >
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Main Content -->
          <div class="lg:col-span-2">
            <!-- Step 1: Shipping Address -->
            <div *ngIf="currentStep() === 1" class="card p-8 animate-slideUp">
              <h2 class="text-2xl font-bold text-diamond-900 mb-6">
                Shipping Address
              </h2>

              <form
                (ngSubmit)="nextStep()"
                #shippingForm="ngForm"
                class="space-y-6"
              >
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label
                      class="block text-sm font-semibold text-gray-900 mb-2"
                      >First Name</label
                    >
                    <input
                      type="text"
                      [(ngModel)]="shippingData.firstName"
                      name="firstName"
                      required
                      class="input-field"
                      placeholder="John"
                    />
                  </div>
                  <div>
                    <label
                      class="block text-sm font-semibold text-gray-900 mb-2"
                      >Last Name</label
                    >
                    <input
                      type="text"
                      [(ngModel)]="shippingData.lastName"
                      name="lastName"
                      required
                      class="input-field"
                      placeholder="Doe"
                    />
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-semibold text-gray-900 mb-2"
                    >Email Address</label
                  >
                  <input
                    type="email"
                    [(ngModel)]="shippingData.email"
                    name="email"
                    required
                    class="input-field"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label class="block text-sm font-semibold text-gray-900 mb-2"
                    >Phone Number</label
                  >
                  <input
                    type="tel"
                    [(ngModel)]="shippingData.phone"
                    name="phone"
                    required
                    class="input-field"
                    placeholder="+1 (555) 000-0000"
                  />
                </div>

                <div>
                  <label class="block text-sm font-semibold text-gray-900 mb-2"
                    >Street Address</label
                  >
                  <input
                    type="text"
                    [(ngModel)]="shippingData.address"
                    name="address"
                    required
                    class="input-field"
                    placeholder="123 Main Street"
                  />
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label
                      class="block text-sm font-semibold text-gray-900 mb-2"
                      >City</label
                    >
                    <input
                      type="text"
                      [(ngModel)]="shippingData.city"
                      name="city"
                      required
                      class="input-field"
                      placeholder="New York"
                    />
                  </div>
                  <div>
                    <label
                      class="block text-sm font-semibold text-gray-900 mb-2"
                      >State/Province</label
                    >
                    <input
                      type="text"
                      [(ngModel)]="shippingData.state"
                      name="state"
                      required
                      class="input-field"
                      placeholder="NY"
                    />
                  </div>
                  <div>
                    <label
                      class="block text-sm font-semibold text-gray-900 mb-2"
                      >ZIP Code</label
                    >
                    <input
                      type="text"
                      [(ngModel)]="shippingData.zipCode"
                      name="zipCode"
                      required
                      class="input-field"
                      placeholder="10001"
                    />
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-semibold text-gray-900 mb-2"
                    >Country</label
                  >
                  <select
                    [(ngModel)]="shippingData.country"
                    name="country"
                    required
                    class="input-field"
                  >
                    <option value="USA">United States</option>
                    <option value="Canada">Canada</option>
                    <option value="UK">United Kingdom</option>
                    <option value="Australia">Australia</option>
                  </select>
                </div>

                <label class="flex items-start gap-3">
                  <input
                    type="checkbox"
                    [(ngModel)]="billingSameAsShipping"
                    name="billingSame"
                    class="mt-1"
                  />
                  <span class="text-gray-700"
                    >Billing address is same as shipping</span
                  >
                </label>

                <button
                  type="submit"
                  [disabled]="!shippingForm.valid"
                  class="w-full btn-primary"
                >
                  Continue to Payment
                </button>
              </form>
            </div>

            <!-- Step 2: Payment Method -->
            <div *ngIf="currentStep() === 2" class="space-y-6 animate-slideUp">
              <div class="card p-8">
                <h2 class="text-2xl font-bold text-diamond-900 mb-6">
                  Payment Method
                </h2>

                <div class="space-y-4 mb-8">
                  <label
                    class="flex items-center gap-4 p-4 border-2 border-gold-500 rounded-lg cursor-pointer bg-gold-50"
                  >
                    <input
                      type="radio"
                      name="payment"
                      value="card"
                      checked
                      class="w-4 h-4"
                    />
                    <span class="font-semibold text-gray-900"
                      >Credit / Debit Card</span
                    >
                  </label>
                  <label
                    class="flex items-center gap-4 p-4 border-2 border-diamond-300 rounded-lg cursor-pointer hover:border-gold-500"
                  >
                    <input
                      type="radio"
                      name="payment"
                      value="paypal"
                      class="w-4 h-4"
                    />
                    <span class="font-semibold text-gray-900">PayPal</span>
                  </label>
                  <label
                    class="flex items-center gap-4 p-4 border-2 border-diamond-300 rounded-lg cursor-pointer hover:border-gold-500"
                  >
                    <input
                      type="radio"
                      name="payment"
                      value="apple"
                      class="w-4 h-4"
                    />
                    <span class="font-semibold text-gray-900">Apple Pay</span>
                  </label>
                </div>

                <form
                  (ngSubmit)="nextStep()"
                  #paymentForm="ngForm"
                  class="space-y-6"
                >
                  <div>
                    <label
                      class="block text-sm font-semibold text-gray-900 mb-2"
                      >Cardholder Name</label
                    >
                    <input
                      type="text"
                      [(ngModel)]="paymentData.cardName"
                      name="cardName"
                      required
                      class="input-field"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label
                      class="block text-sm font-semibold text-gray-900 mb-2"
                      >Card Number</label
                    >
                    <input
                      type="text"
                      [(ngModel)]="paymentData.cardNumber"
                      name="cardNumber"
                      required
                      class="input-field"
                      placeholder="1234 5678 9012 3456"
                      maxlength="19"
                    />
                  </div>

                  <div class="grid grid-cols-2 gap-6">
                    <div>
                      <label
                        class="block text-sm font-semibold text-gray-900 mb-2"
                        >Expiry Date</label
                      >
                      <input
                        type="text"
                        [(ngModel)]="paymentData.expiryDate"
                        name="expiryDate"
                        required
                        class="input-field"
                        placeholder="MM/YY"
                        maxlength="5"
                      />
                    </div>
                    <div>
                      <label
                        class="block text-sm font-semibold text-gray-900 mb-2"
                        >CVC</label
                      >
                      <input
                        type="text"
                        [(ngModel)]="paymentData.cvc"
                        name="cvc"
                        required
                        class="input-field"
                        placeholder="123"
                        maxlength="3"
                      />
                    </div>
                  </div>

                  <div class="flex gap-4">
                    <button
                      type="button"
                      (click)="previousStep()"
                      class="flex-1 btn-ghost border border-diamond-300"
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      [disabled]="!paymentForm.valid"
                      class="flex-1 btn-primary"
                    >
                      Review Order
                    </button>
                  </div>
                </form>
              </div>

              <!-- Security Info -->
              <div
                class="bg-sapphire-50 border border-sapphire-200 rounded-lg p-6"
              >
                <div class="flex gap-3">
                  <span class="text-2xl flex-shrink-0">🔒</span>
                  <div>
                    <h3 class="font-bold text-gray-900 mb-2">
                      Your payment is secure
                    </h3>
                    <p class="text-sm text-gray-700">
                      Your card information is encrypted and securely
                      transmitted using SSL technology. We never store your
                      complete card details.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Step 3: Order Review -->
            <div *ngIf="currentStep() === 3" class="space-y-6 animate-slideUp">
              <div class="card p-8">
                <h2 class="text-2xl font-bold text-diamond-900 mb-6">
                  Order Review
                </h2>

                <div class="space-y-6">
                  <div>
                    <h3 class="font-semibold text-gray-900 mb-4">
                      Shipping Address
                    </h3>
                    <div
                      class="bg-diamond-50 rounded-lg p-4 text-sm text-gray-700"
                    >
                      <p>
                        {{ shippingData.firstName }} {{ shippingData.lastName }}
                      </p>
                      <p>{{ shippingData.address }}</p>
                      <p>
                        {{ shippingData.city }}, {{ shippingData.state }}
                        {{ shippingData.zipCode }}
                      </p>
                      <p>{{ shippingData.country }}</p>
                    </div>
                  </div>

                  <div class="border-t border-diamond-200 pt-6">
                    <h3 class="font-semibold text-gray-900 mb-4">
                      Payment Method
                    </h3>
                    <div
                      class="bg-diamond-50 rounded-lg p-4 text-sm text-gray-700"
                    >
                      <p>
                        Credit Card ending in
                        {{ paymentData.cardNumber.slice(-4) }}
                      </p>
                    </div>
                  </div>

                  <div class="border-t border-diamond-200 pt-6">
                    <h3 class="font-semibold text-gray-900 mb-4">
                      Shipping Method
                    </h3>
                    <div class="space-y-2">
                      <label
                        class="flex items-center gap-3 p-4 border-2 border-gold-500 rounded-lg bg-gold-50"
                      >
                        <input
                          type="radio"
                          name="shipping"
                          value="express"
                          checked
                          class="w-4 h-4"
                        />
                        <div>
                          <p class="font-semibold text-gray-900">
                            Express Shipping (2-3 days)
                          </p>
                          <p class="text-sm text-gray-600">FREE</p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex gap-4">
                <button
                  type="button"
                  (click)="previousStep()"
                  class="flex-1 btn-ghost border border-diamond-300"
                  [disabled]="isProcessing()"
                >
                  Back
                </button>
                <button
                  (click)="placeOrder()"
                  class="flex-1 btn-primary"
                  [disabled]="isProcessing()"
                >
                  {{ isProcessing() ? "Processing..." : "Place Order" }}
                </button>
              </div>
            </div>
          </div>

          <!-- Order Summary Sidebar -->
          <div class="lg:col-span-1">
            <div class="card p-8 sticky top-24">
              <h3 class="font-display text-2xl font-bold text-diamond-900 mb-6">
                Order Summary
              </h3>

              <div
                class="space-y-3 mb-4 pb-4 border-b border-diamond-200 max-h-64 overflow-y-auto"
              >
                <ng-container *ngFor="let item of cartItems()">
                  <div
                    class="flex justify-between text-sm border-b border-diamond-100 pb-2"
                  >
                    <span class="text-gray-600">{{ item.product.name }}</span>
                    <span class="font-semibold">{{
                      formatPrice(item.price * item.quantity)
                    }}</span>
                  </div>
                </ng-container>
              </div>

              <div class="space-y-4 mb-4 pb-4 border-b border-diamond-200">
                <div class="flex justify-between">
                  <span class="text-gray-600">Subtotal</span>
                  <span class="font-semibold">{{
                    formatPrice(cartTotal() * 0.9)
                  }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Shipping</span>
                  <span class="font-semibold">FREE</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Tax</span>
                  <span class="font-semibold">{{
                    formatPrice(cartTotal() * 0.1)
                  }}</span>
                </div>
              </div>

              <div class="flex justify-between mb-6 text-xl">
                <span class="font-bold text-gray-900">Total</span>
                <span class="font-bold text-2xl text-gold-600">{{
                  formatPrice(cartTotal())
                }}</span>
              </div>

              <div class="space-y-3">
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">✓</span>
                  <p class="text-sm text-gray-600">
                    Free insured shipping worldwide
                  </p>
                </div>
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">✓</span>
                  <p class="text-sm text-gray-600">
                    30-day money-back guarantee
                  </p>
                </div>
                <div class="flex items-start gap-3">
                  <span class="text-green-600 font-bold mt-0.5">✓</span>
                  <p class="text-sm text-gray-600">
                    Lifetime warranty included
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CheckoutComponent implements OnInit {
  currentStep = signal(1);
  cartItems = signal<any[]>([]);
  cartTotal = signal(45000);
  isProcessing = signal(false);

  shippingData = {
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    country: "USA",
  };

  paymentData = {
    cardName: "",
    cardNumber: "",
    expiryDate: "",
    cvc: "",
  };

  billingSameAsShipping = true;

  constructor(
    private apiService: ApiService,
    private emailService: EmailNotificationService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.loadCartData();
  }

  private loadCartData(): void {
    this.apiService.getCart().subscribe({
      next: (cart) => {
        this.cartItems.set(cart.items);
        this.cartTotal.set(cart.total);
      },
      error: (error) => {
        console.error("Error loading cart:", error);
      },
    });
  }

  nextStep(): void {
    if (this.currentStep() < 3) {
      this.currentStep.set(this.currentStep() + 1);
    }
  }

  previousStep(): void {
    if (this.currentStep() > 1) {
      this.currentStep.set(this.currentStep() - 1);
    }
  }

  formatPrice(amount: number): string {
    return "$" + amount.toFixed(2);
  }

  placeOrder(): void {
    this.isProcessing.set(true);

    const orderData = {
      shippingAddress: this.shippingData,
      billingAddress: this.billingSameAsShipping ? this.shippingData : {},
      paymentMethod: "CREDIT_CARD",
      shippingMethod: "EXPRESS",
      items: this.cartItems(),
      total: this.cartTotal(),
    };

    this.apiService.createOrder(orderData).subscribe({
      next: (order) => {
        console.log("Order created:", order);

        const subtotal = order.items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0,
        );
        const tax = subtotal * 0.1;
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + 3);

        this.emailService
          .sendOrderConfirmation({
            email: this.shippingData.email,
            orderNumber: order.orderNumber,
            orderTotal: order.total,
            items: order.items.map((item) => ({
              name: item.product.name,
              quantity: item.quantity,
              price: item.price,
            })),
            shippingAddress: this.shippingData,
            estimatedDelivery: deliveryDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          })
          .subscribe({
            next: () => {
              console.log("Confirmation email sent");
              sessionStorage.setItem("lastOrderId", order.id);
              this.router.navigate(["/order-confirmation"]);
            },
            error: (emailError) => {
              console.error("Error sending email:", emailError);
              sessionStorage.setItem("lastOrderId", order.id);
              this.router.navigate(["/order-confirmation"]);
            },
          });
      },
      error: (error) => {
        console.error("Error creating order:", error);
        this.isProcessing.set(false);
        alert("Error placing order. Please try again.");
      },
    });
  }
}
