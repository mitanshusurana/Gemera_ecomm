import {
  Component,
  signal,
  OnInit,
  computed,
  inject,
  PLATFORM_ID,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { CartService } from '../services/cart.service';
import { OrderService } from '../services/order.service';
import { PaymentService } from '../services/payment.service';
import { CurrencyService } from '../services/currency.service';
import { EmailNotificationService } from '../services/email-notification.service';
import { ToastService } from '../services/toast.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import { Address, CartItem } from '../core/models';
import { environment } from '../../environments/environment';
import { COUNTRIES } from '../core/countries';

export interface PendingOrderData {
  shippingAddress: any;
  billingAddress: any;
  paymentMethod: string;
  shippingMethod: string;
  items: any[];
  total: number;
  paymentDetails: any;
}

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-surface">
      <!-- Breadcrumb -->
      <div class="bg-diamond-50 border-b border-diamond-200">
        <div class="container-luxury py-4">
          <div class="flex items-center gap-2 text-sm">
            <a routerLink="/" class="text-gold-600 hover:text-gold-700">Home</a>
            <span class="text-ink">/</span>
            <a routerLink="/cart" class="text-gold-600 hover:text-gold-700"
              >Cart</a
            >
            <span class="text-ink">/</span>
            <span class="text-ink">Checkout</span>
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
                  ? 'bg-gold-500 text-surface'
                  : 'bg-diamond-200 text-ink'
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
                  ? 'bg-gold-500 text-surface'
                  : 'bg-diamond-200 text-ink'
              "
            >
              2
            </div>
          </div>
          <div class="flex justify-between mt-4 text-sm">
            <span
              class="font-semibold"
              [ngClass]="currentStep() >= 1 ? 'text-gold-600' : 'text-ink'"
              >Shipping</span
            >
            <span
              class="font-semibold"
              [ngClass]="currentStep() >= 2 ? 'text-gold-600' : 'text-ink'"
              >Confirm & Pay</span
            >
          </div>
        </div>

        <!-- Guest Checkout Banner -->
        <div
          *ngIf="!isAuthenticated()"
          class="bg-diamond-50 border border-diamond-200 rounded-lg p-4 mb-8 flex justify-between items-center animate-fade-in-up"
        >
          <div class="flex items-center gap-3">
            <span class="text-2xl">👤</span>
            <div>
              <p class="font-bold text-diamond-900">Already have an account?</p>
              <p class="text-sm text-ink">
                Sign in for a faster checkout experience.
              </p>
            </div>
          </div>
          <a routerLink="/login" [queryParams]="{returnUrl: '/checkout'}" class="btn-outline text-sm px-4 py-2"
            >Sign In</a
          >
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Main Content -->
          <div class="lg:col-span-2">
            <!-- Recovery State -->
            <div *ngIf="isRecovering()" class="card p-8 animate-slideUp text-center mb-8">
               <div class="flex justify-center mb-6">
                 <div class="w-12 h-12 border-4 border-gold-200 border-t-gold-500 rounded-full animate-spin"></div>
               </div>
               <h2 class="text-2xl font-bold text-diamond-900 mb-3">Finalizing Your Order</h2>
               <p class="text-ink mb-2">Your payment was received successfully. We're placing your order now.</p>
               <p class="text-sm text-gold-600 font-semibold mb-8">Please do not refresh or close this page.</p>
               <button *ngIf="!isProcessing()" (click)="retryOrderPlacement()" class="text-sm text-ink hover:text-gold-600 underline transition-colors">
                 Try again manually
               </button>
            </div>

            <!-- Step 1: Shipping Address -->
            <div *ngIf="currentStep() === 1 && !isRecovering()" class="card p-8 animate-slideUp">
              <div class="flex justify-between items-center mb-6">
                <h2 class="text-2xl font-bold text-diamond-900">
                  Shipping Address
                </h2>
                <span
                  *ngIf="!isAuthenticated()"
                  class="text-xs font-semibold text-ink bg-surface px-2 py-1 rounded"
                  >GUEST CHECKOUT</span
                >
              </div>

              <!-- Saved Addresses Selection -->
              <div
                *ngIf="isAuthenticated() && savedAddresses().length > 0"
                class="mb-8 space-y-4"
              >
                <h3 class="font-semibold text-ink">Saved Addresses</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    *ngFor="let address of savedAddresses()"
                    (click)="selectAddress(address)"
                    class="border-2 rounded-lg p-4 cursor-pointer hover:border-gold-500 transition-all"
                    [ngClass]="
                      selectedAddressId() === address.id
                        ? 'border-gold-500 bg-gold-50'
                        : 'border-diamond-200'
                    "
                  >
                    <div class="flex justify-between">
                      <span class="font-bold text-ink"
                        >{{ address.firstName }} {{ address.lastName }}</span
                      >
                      <span
                        *ngIf="address.isDefault"
                        class="text-xs text-gold-600 font-bold"
                        >DEFAULT</span
                      >
                    </div>
                    <p class="text-sm text-ink mt-1">
                      {{ address.street }}<br />
                      {{ address.city }}, {{ address.state }}
                      {{ address.zipCode }}
                    </p>
                  </div>

                  <!-- New Address Option -->
                  <div
                    (click)="selectNewAddress()"
                    class="border-2 border-dashed border-diamond-300 rounded-lg p-4 flex items-center justify-center cursor-pointer hover:border-gold-500 hover:text-gold-600 text-ink transition-all"
                    [ngClass]="
                      selectedAddressId() === 'new'
                        ? 'border-gold-500 bg-gold-50 text-gold-600'
                        : ''
                    "
                  >
                    <span class="font-semibold">+ Use New Address</span>
                  </div>
                </div>
              </div>

              <form
                *ngIf="selectedAddressId() === 'new' || !isAuthenticated()"
                (ngSubmit)="nextStep()"
                [formGroup]="shippingForm"
                class="space-y-6 animate-fade-in-up"
              >
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label
                      class="block text-sm font-semibold text-ink mb-2"
                      >First Name</label
                    >
                    <input
                      type="text"
                      formControlName="firstName"
                      class="input-field"
                      placeholder="John"
                    />
                    <div *ngIf="shippingForm.get('firstName')?.invalid && shippingForm.get('firstName')?.touched" class="text-red-500 text-xs mt-1">First name is required</div>
                  </div>
                  <div>
                    <label
                      class="block text-sm font-semibold text-ink mb-2"
                      >Last Name</label
                    >
                    <input
                      type="text"
                      formControlName="lastName"
                      class="input-field"
                      placeholder="Doe"
                    />
                    <div *ngIf="shippingForm.get('lastName')?.invalid && shippingForm.get('lastName')?.touched" class="text-red-500 text-xs mt-1">Last name is required</div>
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-semibold text-ink mb-2"
                    >Email Address</label
                  >
                  <input
                    type="email"
                    formControlName="email"
                    class="input-field"
                    placeholder="john@example.com"
                  />
                  <div *ngIf="shippingForm.get('email')?.invalid && shippingForm.get('email')?.touched" class="text-red-500 text-xs mt-1">Valid email is required</div>
                </div>

                <div *ngIf="!isAuthenticated()">
                  <div
                    class="bg-blue-50 border border-blue-100 rounded-lg p-4 mt-2 space-y-2"
                  >
                    <label class="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" [ngModel]="createAccountForGuest" (ngModelChange)="createAccountForGuest = $event" [ngModelOptions]="{standalone: true}" class="w-4 h-4 text-blue-600 rounded">
                      <span class="text-sm text-blue-800 font-bold">Create an account for faster checkout next time</span>
                    </label>
                    <p class="text-xs text-blue-700 ml-7">
                      Your login details will be emailed to you!
                    </p>
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-semibold text-ink mb-2"
                    >Phone Number</label
                  >
                  <input
                    type="tel"
                    formControlName="phone"
                    class="input-field"
                    placeholder="+1 (555) 000-0000"
                  />
                  <div *ngIf="shippingForm.get('phone')?.invalid && shippingForm.get('phone')?.touched" class="text-red-500 text-xs mt-1">Valid phone number is required</div>
                </div>

                <div>
                  <label class="block text-sm font-semibold text-ink mb-2"
                    >Street Address</label
                  >
                  <input
                    type="text"
                    formControlName="street"
                    class="input-field"
                    placeholder="123 Main Street"
                  />
                  <div *ngIf="shippingForm.get('street')?.invalid && shippingForm.get('street')?.touched" class="text-red-500 text-xs mt-1">Street address is required</div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label
                      class="block text-sm font-semibold text-ink mb-2"
                      >City</label
                    >
                    <input
                      type="text"
                      formControlName="city"
                      class="input-field"
                      placeholder="New York"
                    />
                    <div *ngIf="shippingForm.get('city')?.invalid && shippingForm.get('city')?.touched" class="text-red-500 text-xs mt-1">City is required</div>
                  </div>
                  <div>
                    <label
                      class="block text-sm font-semibold text-ink mb-2"
                      >State/Province</label
                    >
                    <input
                      type="text"
                      formControlName="state"
                      class="input-field"
                      placeholder="NY"
                    />
                    <div *ngIf="shippingForm.get('state')?.invalid && shippingForm.get('state')?.touched" class="text-red-500 text-xs mt-1">State is required</div>
                  </div>
                  <div>
                    <label
                      class="block text-sm font-semibold text-ink mb-2"
                      >ZIP Code</label
                    >
                    <input
                      type="text"
                      formControlName="zipCode"
                      class="input-field"
                      placeholder="10001"
                    />
                    <div *ngIf="shippingForm.get('zipCode')?.invalid && shippingForm.get('zipCode')?.touched" class="text-red-500 text-xs mt-1">ZIP code is required</div>
                  </div>
                </div>

                <div>
                  <label class="block text-sm font-semibold text-ink mb-2"
                    >Country</label
                  >
                  <select
                    formControlName="country"
                    class="input-field"
                  >
                    <option
                      *ngFor="let country of countriesList"
                      [value]="country"
                    >
                      {{ country }}
                    </option>
                  </select>
                </div>

                <label class="flex items-start gap-3">
                  <input
                    type="checkbox"
                    [ngModel]="billingSameAsShipping"
                    (ngModelChange)="billingSameAsShipping = $event"
                    [ngModelOptions]="{standalone: true}"
                    class="mt-1"
                  />
                  <span class="text-ink"
                    >Billing address is same as shipping</span
                  >
                </label>

                <button
                  type="submit"
                  [disabled]="!shippingForm.valid || isProcessing()"
                  class="w-full btn-primary"
                >
                  {{
                    isProcessing() ? 'Creating Account...' : 'Continue to Pay'
                  }}
                </button>
              </form>

              <!-- Continue Button for Saved Address -->
              <div
                *ngIf="selectedAddressId() !== 'new' && isAuthenticated()"
                class="mt-8 animate-fade-in-up"
              >
                <button (click)="nextStep()" class="w-full btn-primary">
                  Continue to Pay
                </button>
              </div>
            </div>

            <!-- Step 2: Order Review & Pay -->
            <div *ngIf="currentStep() === 2 && !isRecovering()" class="space-y-6 animate-slideUp">
              <div class="card p-8">
                <h2 class="text-2xl font-bold text-diamond-900 mb-6">
                  Review & Pay
                </h2>

                <div class="space-y-6">
                  <div>
                    <h3 class="font-semibold text-ink mb-4">
                      Shipping Address
                    </h3>
                    <div
                      class="bg-diamond-50 rounded-lg p-4 text-sm text-ink"
                    >
                      <p>
                        {{ shippingForm.value.firstName }} {{ shippingForm.value.lastName }}
                      </p>
                      <p>{{ shippingForm.value.street }}</p>
                      <p>
                        {{ shippingForm.value.city }}, {{ shippingForm.value.state }}
                        {{ shippingForm.value.zipCode }}
                      </p>
                      <p>{{ shippingForm.value.country }}</p>
                    </div>
                  </div>

                  <div class="border-t border-diamond-200 pt-6">
                    <h3 class="font-semibold text-ink mb-4">
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
                          <p class="font-semibold text-ink">
                            Express Shipping (2-3 days)
                          </p>
                          <p class="text-sm text-ink">FREE</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div class="border-t border-diamond-200 pt-6">
                    <h3 class="font-semibold text-ink mb-4">
                      Payment Method
                    </h3>
                    <div class="space-y-3">
                      <label
                        class="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors"
                        [ngClass]="
                          selectedPaymentMethod === 'RAZORPAY'
                            ? 'border-gold-500 bg-gold-50'
                            : 'border-ink hover:border-gold-300'
                        "
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="RAZORPAY"
                          [(ngModel)]="selectedPaymentMethod"
                          class="w-4 h-4 text-gold-600"
                        />
                        <div>
                          <p class="font-semibold text-ink">
                            Pay Online (Cards, UPI, NetBanking)
                          </p>
                          <p class="text-sm text-ink">
                            Secure payment via Razorpay
                          </p>
                        </div>
                      </label>
                      <label
                        class="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors"
                        [ngClass]="
                          selectedPaymentMethod === 'COD'
                            ? 'border-gold-500 bg-gold-50'
                            : 'border-ink hover:border-gold-300'
                        "
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="COD"
                          [(ngModel)]="selectedPaymentMethod"
                          class="w-4 h-4 text-gold-600"
                        />
                        <div>
                          <p class="font-semibold text-ink">
                            Cash on Delivery (COD)
                          </p>
                          <p class="text-sm text-ink">
                            Pay when your order is delivered
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div class="border-t border-diamond-200 pt-6">
                    <h3 class="font-semibold text-ink mb-4">
                      Have a Coupon?
                    </h3>
                    <div class="flex gap-2">
                      <input type="text" [(ngModel)]="couponCode" name="couponCode" placeholder="Enter coupon code" class="input-field flex-1" />
                      <button type="button" (click)="applyCoupon()" class="btn-outline px-4 py-2 text-sm">Apply</button>
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
                  {{
                    isProcessing()
                      ? 'Processing...'
                      : selectedPaymentMethod === 'COD'
                        ? 'Place Order'
                        : 'Pay Now'
                  }}
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
                    <span class="text-ink">{{ item.product.name }}</span>
                    <span class="font-semibold">{{
                      item.price * item.quantity | currencyConvert
                    }}</span>
                  </div>
                </ng-container>
              </div>

              <div class="space-y-4 mb-4 pb-4 border-b border-diamond-200">
                <div class="flex justify-between">
                  <span class="text-ink">Subtotal</span>
                  <span class="font-semibold">{{
                    cartSubtotal() | currencyConvert
                  }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-ink">Shipping</span>
                  <span class="font-semibold text-emerald-600">FREE</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-ink">Tax</span>
                  <span class="font-semibold">{{
                    cartTax() | currencyConvert
                  }}</span>
                </div>
                <div
                  *ngIf="cartDiscount() > 0"
                  class="flex justify-between text-emerald-600"
                >
                  <span>Discount</span>
                  <span class="font-semibold"
                    >-{{ cartDiscount() | currencyConvert }}</span
                  >
                </div>
              </div>

              <div class="flex justify-between mb-6 text-xl">
                <span class="font-bold text-ink">Total</span>
                <span class="font-bold text-2xl text-gold-600">{{
                  cartTotal() | currencyConvert
                }}</span>
              </div>

              <div class="space-y-4">
                <div class="flex items-start gap-3 p-3 bg-diamond-50 rounded-lg">
                  <span class="text-lg">🛡️</span>
                  <div>
                    <p class="text-sm font-bold text-diamond-900">Free Insured Shipping</p>
                    <p class="text-xs text-ink mt-0.5">Your package is fully insured until delivery</p>
                  </div>
                </div>
                <div class="flex items-start gap-3 p-3 bg-diamond-50 rounded-lg">
                  <span class="text-lg">🔄</span>
                  <div>
                    <p class="text-sm font-bold text-diamond-900">30-Day Returns</p>
                    <p class="text-xs text-ink mt-0.5">No questions asked return policy</p>
                  </div>
                </div>
                <div class="flex items-start gap-3 p-3 bg-diamond-50 rounded-lg">
                  <span class="text-lg">💎</span>
                  <div>
                    <p class="text-sm font-bold text-diamond-900">Lifetime Warranty</p>
                    <p class="text-xs text-ink mt-0.5">Guaranteed quality and craftsmanship</p>
                  </div>
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
  cartItems = signal<CartItem[]>([]);
  cartTotal = signal(0);
  cartSubtotal = signal(0);
  cartTax = signal(0);
  cartDiscount = signal(0);
  isProcessing = signal(false);
  isRecovering = signal(false);
  pendingOrderData: any = null;
  private recoveryTimeout: ReturnType<typeof setTimeout> | undefined;
  createAccountForGuest = true;
  couponCode = '';

  countriesList = COUNTRIES;

  shippingForm: FormGroup;

  billingSameAsShipping = true;
  isAuthenticated = signal(false);

  selectedPaymentMethod: 'RAZORPAY' | 'COD' = 'RAZORPAY';

  // Address Selection
  savedAddresses = computed(() => {
    return this.userAddresses();
  });

  userAddresses = signal<Address[]>([]);
  selectedAddressId = signal<string>('new');

  private paymentService = inject(PaymentService);
  private currencyService = inject(CurrencyService);
  private toastService = inject(ToastService);
  private platformId = inject(PLATFORM_ID);

  constructor(
    private authService: AuthService,
    private cartService: CartService,
    private orderService: OrderService,
    private emailService: EmailNotificationService,
    private router: Router,
    private fb: FormBuilder,
  ) {
    this.shippingForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^[+]?[\d\s-]{10,}$/)]],
      street: ['', Validators.required],
      city: ['', Validators.required],
      state: ['', Validators.required],
      zipCode: ['', [Validators.required, Validators.pattern(/^\d{5,6}$/)]],
      country: ['India', Validators.required]
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const pending = sessionStorage.getItem('pendingOrderData');
      if (pending) {
        this.pendingOrderData = JSON.parse(pending);
        this.isRecovering.set(true);
        // Auto-retry order placement after 2 seconds
        this.recoveryTimeout = setTimeout(() => {
          this.retryOrderPlacement();
        }, 2000);
      }
    }
    this.checkAuth();
    this.loadCartData();
    this.loadRazorpayScript();

    // Subscribe to user changes
    this.authService.user().subscribe((user) => {
      if (user) {
        // Update basic info if new address form is active
        if (this.selectedAddressId() === 'new') {
          this.shippingForm.patchValue({
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            email: user.email || '',
            phone: user.phone || ''
          });
        }

        // Update addresses list
        if (user.addresses && user.addresses.length > 0) {
          this.userAddresses.set(user.addresses);
          // Default to first address or default one
          const defaultAddr =
            user.addresses.find((a) => a.isDefault) || user.addresses[0];
          this.selectAddress(defaultAddr);
        } else {
          this.userAddresses.set([]);
          this.selectedAddressId.set('new');
        }
      }
    });
  }

  loadRazorpayScript() {
    if (isPlatformBrowser(this.platformId)) {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      document.body.appendChild(script);
    }
  }

  private checkAuth(): void {
    this.isAuthenticated.set(this.authService.isAuthenticated());
  }

  private loadCartData(): void {
    this.cartService.getCart().subscribe({
      next: (cart) => {
        this.cartItems.set(cart.items);
        this.cartTotal.set(cart.total);
        this.cartSubtotal.set(cart.subtotal || 0);
        this.cartTax.set(cart.tax || 0);
        this.cartDiscount.set(cart.discount || 0);
      },
      error: (error) => {
        // Error loading cart
      },
    });
  }

  selectAddress(address: Address) {
    this.selectedAddressId.set(address.id);
    this.shippingForm.patchValue({
      firstName: address.firstName,
      lastName: address.lastName,
      phone: address.phone,
      street: address.street,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      country: address.country,
    });
  }

  selectNewAddress() {
    this.selectedAddressId.set('new');
    this.authService.user().subscribe((user) => {
      if (user) {
        this.shippingForm.patchValue({
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.phone,
          street: '',
          city: '',
          state: '',
          zipCode: '',
          country: 'India',
        });
      }
    });
  }

  nextStep(): void {
    if (this.currentStep() < 2) {
      if (!this.isAuthenticated()) {
        this.registerGuest();
      } else {
        this.currentStep.set(this.currentStep() + 1);
      }
    }
  }

  private generateRandomPassword(length: number = 10): string {
    const uppers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowers = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const specials = '!@#$%^&*';

    // Ensure at least one of each required character type
    const getRandomChar = (charset: string) =>
      charset[crypto.getRandomValues(new Uint32Array(1))[0] % charset.length];

    let password = [
      getRandomChar(uppers),
      getRandomChar(lowers),
      getRandomChar(numbers),
      getRandomChar(specials),
    ];

    // Fill the rest with random characters from all sets
    const allChars = uppers + lowers + numbers + specials;
    for (let i = password.length; i < length; i++) {
      password.push(getRandomChar(allChars));
    }

    // Shuffle the password
    for (let i = password.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
      [password[i], password[j]] = [password[j], password[i]];
    }

    return password.join('');
  }

  private registerGuest() {
    this.isProcessing.set(true);
    const autoPassword = this.generateRandomPassword();

    const registerData = {
      firstName: this.shippingForm.value.firstName,
      lastName: this.shippingForm.value.lastName,
      email: this.shippingForm.value.email,
      phone: this.shippingForm.value.phone,
      password: autoPassword,
    };

    this.authService.register(registerData).subscribe({
      next: () => {
        // Register success, now login to get token
        this.authService
          .login(registerData.email, registerData.password)
          .subscribe({
            next: () => {
              this.checkAuth(); // Update auth signal

              // Send email with the generated password
              this.emailService
                .sendPromotionalEmail({
                  email: registerData.email,
                  subject: 'Welcome to Caratloop - Your Account Details',
                  content: `Thank you for shopping with us! We have created an account for you so you can easily track your order. \n\nYour login email is: ${registerData.email}\n\nFor security reasons, we do not send passwords via email. Please use the 'Forgot Password' link on the login page to set your password.`,
                })
                .subscribe({
                  error: (e) =>
                    console.error('Failed to send welcome email', e),
                });

              // CartService's user subscription will handle guest cart sync automatically on login
              // Just wait a little bit or proceed immediately
              setTimeout(() => {
                this.isProcessing.set(false);
                this.currentStep.set(this.currentStep() + 1);
              }, 500);
            },
            error: (err) => {
              this.isProcessing.set(false);
              this.toastService.show(
                'Account created but login failed. Please sign in.',
                'error',
              );
              this.router.navigate(['/login']);
            },
          });
      },
      error: (err) => {
        this.isProcessing.set(false);
        this.toastService.show(
          'Failed to create account. Please try again or sign in.',
          'error',
        );
      },
    });
  }

  previousStep(): void {
    if (this.currentStep() > 1) {
      this.currentStep.set(this.currentStep() - 1);
    }
  }

  placeOrder() {
    if (this.isProcessing()) return;

    // Check for out of stock items
    const outOfStockItems = this.cartItems().filter(
      (item) => item.product && item.product.stock === 0,
    );
    if (outOfStockItems.length > 0) {
      const itemNames = outOfStockItems
        .map((i: CartItem) => i.product.name)
        .join(', ');
      this.toastService.show(
        `Some items are out of stock: ${itemNames}. Please remove them from cart.`,
        'error',
      );
      this.router.navigate(['/cart']);
      return;
    }

    this.isProcessing.set(true);

    // If using a new address and user is authenticated, save it to their profile
    if (this.selectedAddressId() === 'new' && this.isAuthenticated()) {
      const { email, ...addressData } = this.shippingForm.value;
      this.authService
        .addAddress({
          ...addressData,
          isDefault: this.userAddresses().length === 0,
        })
        .subscribe({
          next: () => {
            // Proceed with order after saving address
            this.processPaymentSelection();
          },
          error: () => {
            // Log but proceed anyway so we don't block checkout
            console.error('Failed to save address to profile');
            this.processPaymentSelection();
          },
        });
    } else {
      this.processPaymentSelection();
    }
  }

  private processPaymentSelection() {
    if (this.selectedPaymentMethod === 'COD') {
      this.handleCODPayment();
    } else {
      this.initiateRazorpay();
    }
  }

  private handleCODPayment() {
    // Sanitize address data to match Backend DTO (exclude email)
    const { email, ...shippingAddr } = this.shippingForm.value;
    const billingAddr = this.billingSameAsShipping ? shippingAddr : {};

    // Map cart items to DTO (exclude random ids for guest cart or invalid uuids)
    const sanitizedItems = this.cartItems().map((item) => {
      const { id, ...itemWithoutId } = item;
      return itemWithoutId;
    });

    const orderData: any = {
      shippingAddress: shippingAddr,
      billingAddress: billingAddr,
      paymentMethod: 'COD',
      shippingMethod: 'EXPRESS',
      items: sanitizedItems,
      total: this.cartTotal(),
      paymentDetails: {}, // Empty for COD
    };

    this.orderService.createOrder(orderData).subscribe({
      next: (order) => {
        sessionStorage.setItem('lastOrderId', order.id);
        this.router.navigate(['/order-confirmation']);
      },
      error: (error) => {
        this.isProcessing.set(false);
        this.toastService.show(
          'Order placement failed. Please contact support.',
          'error',
        );
      },
    });
  }

  private initiateRazorpay() {
    if (
      !isPlatformBrowser(this.platformId) ||
      typeof Razorpay === 'undefined'
    ) {
      this.isProcessing.set(false);
      this.toastService.show(
        'Payment gateway failed to load. Please check your internet connection or disable ad blockers.',
        'error',
      );
      return;
    }

    // Convert base amount to INR
    // Razorpay integration is currently configured for INR payments only.
    const amountInINR = this.currencyService.convert(this.cartTotal(), 'INR');
    // Convert to paise (smallest unit)
    const amountInPaise = Math.round(amountInINR * 100);

    // Create Razorpay Order
    this.paymentService.createRazorpayOrder(amountInPaise, 'INR').subscribe({
      next: (response) => {
        this.openRazorpayModal(response);
      },
      error: (error) => {
        this.isProcessing.set(false);
        this.toastService.show(
          'Failed to initiate payment. Please try again.',
          'error',
        );
      },
    });
  }

  openRazorpayModal(orderData: {
    id: string;
    amount: number;
    currency: string;
  }) {
    const options: Razorpay.Options = {
      key: environment.razorpayKey,
      amount: orderData.amount,
      currency: orderData.currency,
      name: 'Caratloop',
      description: 'Jewellery Purchase',
      order_id: orderData.id,
      prefill: {
        name: `${this.shippingForm.value.firstName} ${this.shippingForm.value.lastName}`,
        email: this.shippingForm.value.email,
        contact: this.shippingForm.value.phone,
      },
      theme: {
        color: '#D4AF37',
      },
      handler: (response: Razorpay.PaymentSuccessResponse) => {
        this.handlePaymentSuccess(response);
      },
      modal: {
        ondismiss: () => {
          this.isProcessing.set(false);
          this.paymentService
            .logFailedTransaction({
              error_code: 'PAYMENT_CANCELLED',
              error_description: 'User closed the payment modal',
              razorpay_order_id: orderData.id,
            })
            .subscribe();
        },
      },
    };

    const rzp = new Razorpay(options);
    rzp.on('payment.failed', (response: Razorpay.PaymentFailedResponse) => {
      this.isProcessing.set(false);
      this.paymentService
        .logFailedTransaction({
          error_code: response.error.code,
          error_description: response.error.description,
          error_source: response.error.source,
          error_step: response.error.step,
          error_reason: response.error.reason,
          razorpay_order_id: response.error.metadata.order_id,
          razorpay_payment_id: response.error.metadata.payment_id,
        })
        .subscribe();
      this.toastService.show(
        'Payment Failed: ' + response.error.description,
        'error',
      );
    });
    rzp.open();
  }

  handlePaymentSuccess(response: Razorpay.PaymentSuccessResponse) {
    // Sanitize address data to match Backend DTO (exclude email)
    const { email, ...shippingAddr } = this.shippingForm.value;
    const billingAddr = this.billingSameAsShipping ? shippingAddr : {};

    // Map cart items to DTO (exclude random ids for guest cart or invalid uuids)
    const sanitizedItems = this.cartItems().map((item) => {
      const { id, ...itemWithoutId } = item;
      return itemWithoutId;
    });

    const orderData: any = {
      shippingAddress: shippingAddr,
      billingAddress: billingAddr,
      paymentMethod: 'RAZORPAY',
      shippingMethod: 'EXPRESS',
      items: sanitizedItems,
      total: this.cartTotal(),
      paymentDetails: {
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
      },
    };

    this.orderService.createOrder(orderData).subscribe({
      next: (order) => {
        // Backend sends email confirmation automatically
        sessionStorage.setItem('lastOrderId', order.id);
        this.router.navigate(['/order-confirmation']);
      },
      error: (error) => {
        this.isProcessing.set(false);
        this.toastService.show(
          'Payment successful but order placement failed. We saved your payment details, please try again.',
          'error',
        );
        this.pendingOrderData = orderData;
        sessionStorage.setItem('pendingOrderData', JSON.stringify(orderData));
        this.isRecovering.set(true);
      },
    });
  }

  retryOrderPlacement() {
    if (!this.pendingOrderData) return;
    this.isProcessing.set(true);
    this.orderService.createOrder(this.pendingOrderData).subscribe({
      next: (order) => {
        sessionStorage.removeItem('pendingOrderData');
        sessionStorage.setItem('lastOrderId', order.id);
        this.router.navigate(['/order-confirmation']);
      },
      error: (error) => {
        this.isProcessing.set(false);
        this.toastService.show('Still unable to place order. Please contact support with your payment ID.', 'error');
      }
    });
  }

  applyCoupon() {
    if (!this.couponCode) return;
    this.isProcessing.set(true);
    this.cartService.applyCoupon(this.couponCode).subscribe({
      next: () => {
        this.isProcessing.set(false);
        this.toastService.show('Coupon applied successfully', 'success');
      },
      error: () => {
        this.isProcessing.set(false);
        this.toastService.show('Invalid or expired coupon code.', 'error');
      }
    });
  }
}
