import { Component, signal, OnInit, computed, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink, Router } from "@angular/router";
import { AuthService } from "../services/auth.service";
import { CartService } from "../services/cart.service";
import { OrderService } from "../services/order.service";
import { PaymentService } from "../services/payment.service";
import { EmailNotificationService } from "../services/email-notification.service";
import { Address } from "../core/models";

declare var Razorpay: any;

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
              >Confirm & Pay</span
            >
          </div>
        </div>

        <!-- Guest Checkout Banner -->
        <div *ngIf="!isAuthenticated()" class="bg-diamond-50 border border-diamond-200 rounded-lg p-4 mb-8 flex justify-between items-center animate-fade-in-up">
          <div class="flex items-center gap-3">
            <span class="text-2xl">👤</span>
            <div>
              <p class="font-bold text-diamond-900">Already have an account?</p>
              <p class="text-sm text-gray-600">Sign in for a faster checkout experience.</p>
            </div>
          </div>
          <a routerLink="/login" class="btn-outline text-sm px-4 py-2">Sign In</a>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Main Content -->
          <div class="lg:col-span-2">
            <!-- Step 1: Shipping Address -->
            <div *ngIf="currentStep() === 1" class="card p-8 animate-slideUp">
              <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-diamond-900">
                  Shipping Address
                </h2>
                <span *ngIf="!isAuthenticated()" class="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">GUEST CHECKOUT</span>
              </div>

              <!-- Saved Addresses Selection -->
              <div *ngIf="isAuthenticated() && savedAddresses().length > 0" class="mb-8 space-y-4">
                <h3 class="font-semibold text-gray-900">Saved Addresses</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div *ngFor="let address of savedAddresses()"
                       (click)="selectAddress(address)"
                       class="border-2 rounded-lg p-4 cursor-pointer hover:border-gold-500 transition-all"
                       [ngClass]="selectedAddressId() === address.id ? 'border-gold-500 bg-gold-50' : 'border-diamond-200'">
                    <div class="flex justify-between">
                      <span class="font-bold text-gray-900">{{ address.firstName }} {{ address.lastName }}</span>
                      <span *ngIf="address.isDefault" class="text-xs text-gold-600 font-bold">DEFAULT</span>
                    </div>
                    <p class="text-sm text-gray-600 mt-1">
                      {{ address.street }}<br>
                      {{ address.city }}, {{ address.state }} {{ address.zipCode }}
                    </p>
                  </div>

                  <!-- New Address Option -->
                  <div (click)="selectNewAddress()"
                       class="border-2 border-dashed border-diamond-300 rounded-lg p-4 flex items-center justify-center cursor-pointer hover:border-gold-500 hover:text-gold-600 text-gray-500 transition-all"
                       [ngClass]="selectedAddressId() === 'new' ? 'border-gold-500 bg-gold-50 text-gold-600' : ''">
                    <span class="font-semibold">+ Use New Address</span>
                  </div>
                </div>
              </div>

              <form *ngIf="selectedAddressId() === 'new' || !isAuthenticated()"
                (ngSubmit)="nextStep()"
                #shippingForm="ngForm"
                class="space-y-6 animate-fade-in-up"
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
                  Continue to Pay
                </button>
              </form>
            </div>

            <!-- Step 2: Order Review & Pay -->
            <div *ngIf="currentStep() === 2" class="space-y-6 animate-slideUp">
              <div class="card p-8">
                <h2 class="text-2xl font-bold text-diamond-900 mb-6">
                  Review & Pay
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
                  (click)="payNow()"
                  class="flex-1 btn-primary"
                  [disabled]="isProcessing()"
                >
                  {{ isProcessing() ? "Processing..." : "Pay Now" }}
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

  billingSameAsShipping = true;
  isAuthenticated = signal(false);

  // Address Selection
  savedAddresses = computed(() => {
    let addrs: Address[] = [];
    this.authService.user().subscribe(u => addrs = u?.addresses || []);
    return this.userAddresses();
  });

  userAddresses = signal<Address[]>([]);
  selectedAddressId = signal<string>('new');

  private paymentService = inject(PaymentService);

  constructor(
    private authService: AuthService,
    private cartService: CartService,
    private orderService: OrderService,
    private emailService: EmailNotificationService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.checkAuth();
    this.loadCartData();
    this.loadRazorpayScript();

    // Subscribe to user changes
    this.authService.user().subscribe(user => {
      if (user) {
        // Update basic info if new address form is active
        if (this.selectedAddressId() === 'new') {
            this.shippingData.firstName = user.firstName || '';
            this.shippingData.lastName = user.lastName || '';
            this.shippingData.email = user.email || '';
            this.shippingData.phone = user.phone || '';
        }

        // Update addresses list
        if (user.addresses && user.addresses.length > 0) {
            this.userAddresses.set(user.addresses);
            // Default to first address or default one
            const defaultAddr = user.addresses.find(a => a.isDefault) || user.addresses[0];
            this.selectAddress(defaultAddr);
        } else {
            this.userAddresses.set([]);
            this.selectedAddressId.set('new');
        }
      }
    });
  }

  loadRazorpayScript() {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
  }

  private checkAuth(): void {
    this.isAuthenticated.set(this.authService.isAuthenticated());
  }

  private loadCartData(): void {
    this.cartService.getCart().subscribe({
      next: (cart) => {
        this.cartItems.set(cart.items);
        this.cartTotal.set(cart.total);
      },
      error: (error) => {
        console.error("Error loading cart:", error);
      },
    });
  }

  selectAddress(address: Address) {
    this.selectedAddressId.set(address.id);
    this.shippingData = {
        firstName: address.firstName,
        lastName: address.lastName,
        email: this.shippingData.email,
        phone: address.phone,
        address: address.street,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
        country: address.country
    };
  }

  selectNewAddress() {
    this.selectedAddressId.set('new');
    this.authService.user().subscribe(user => {
        if (user) {
            this.shippingData = {
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                address: '',
                city: '',
                state: '',
                zipCode: '',
                country: 'USA'
            };
        }
    });
  }

  nextStep(): void {
    if (this.currentStep() < 2) {
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

  payNow() {
    if (typeof Razorpay === 'undefined') {
        alert('Payment gateway failed to load. Please check your internet connection or disable ad blockers.');
        return;
    }
    this.isProcessing.set(true);

    // Create Razorpay Order
    this.paymentService.createRazorpayOrder(this.cartTotal() * 100, 'INR').subscribe({
        next: (response) => {
            this.initiateRazorpayPayment(response);
        },
        error: (error) => {
            console.error('Error creating Razorpay order', error);
            this.isProcessing.set(false);
            alert('Failed to initiate payment. Please try again.');
        }
    });
  }

  initiateRazorpayPayment(orderData: any) {
      const options = {
          key: 'rzp_test_S5goGHXLEuP6hP',
          amount: orderData.amount,
          currency: orderData.currency,
          name: 'LuxeGems',
          description: 'Jewellery Purchase',
          order_id: orderData.id,
          prefill: {
              name: `${this.shippingData.firstName} ${this.shippingData.lastName}`,
              email: this.shippingData.email,
              contact: this.shippingData.phone
          },
          theme: {
              color: '#D4AF37'
          },
          handler: (response: any) => {
              this.handlePaymentSuccess(response);
          },
          modal: {
              ondismiss: () => {
                  this.isProcessing.set(false);
                  this.paymentService.logFailedTransaction({
                      error_code: 'PAYMENT_CANCELLED',
                      error_description: 'User closed the payment modal',
                      razorpay_order_id: orderData.id
                  }).subscribe();
              }
          }
      };

      const rzp = new Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
          this.isProcessing.set(false);
          this.paymentService.logFailedTransaction({
              error_code: response.error.code,
              error_description: response.error.description,
              error_source: response.error.source,
              error_step: response.error.step,
              error_reason: response.error.reason,
              razorpay_order_id: response.error.metadata.order_id,
              razorpay_payment_id: response.error.metadata.payment_id
          }).subscribe();
          alert('Payment Failed: ' + response.error.description);
      });
      rzp.open();
  }

  handlePaymentSuccess(response: any) {
    const orderData = {
      shippingAddress: this.shippingData,
      billingAddress: this.billingSameAsShipping ? this.shippingData : {},
      paymentMethod: "RAZORPAY",
      shippingMethod: "EXPRESS",
      items: this.cartItems(),
      total: this.cartTotal(),
      paymentDetails: {
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_order_id: response.razorpay_order_id,
          razorpay_signature: response.razorpay_signature
      }
    };

    this.orderService.createOrder(orderData).subscribe({
      next: (order) => {
        // Send email confirmation
        const deliveryDate = new Date();
        deliveryDate.setDate(deliveryDate.getDate() + 3);

        this.emailService
          .sendOrderConfirmation({
            email: this.shippingData.email,
            orderNumber: order.orderNumber || `ORD-${order.id?.substring(0, 8)}`,
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
        alert("Payment successful but order placement failed. Please contact support.");
      },
    });
  }
}
