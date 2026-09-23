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
import { CartService, CART_PRICING, GUEST_GIFT_CARD_MESSAGE } from '../services/cart.service';
import { maskGiftCardCode } from '../services/gift-card.service';
import { SettingService } from '../services/setting.service';
import { OrderService } from '../services/order.service';
import { PaymentService } from '../services/payment.service';
import { CurrencyService } from '../services/currency.service';
import { EmailNotificationService } from '../services/email-notification.service';
import { ToastService } from '../services/toast.service';
import { CurrencyConvertPipe } from '../pipes/currency-convert.pipe';
import { HttpErrorResponse } from '@angular/common/http';
import { Address, Cart, CartItem } from '../core/models';
import { CreateOrderRequest, GSTIN_PATTERN, PAN_PATTERN, PAN_REQUIRED_FROM_INR } from '../core/dtos';
import { environment } from '../../environments/environment';
import { COUNTRIES } from '../core/countries';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, CurrencyConvertPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f]">
      <!-- Breadcrumb -->
      <div class="bg-white border-b border-[#e0e0e0]">
        <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-4">
          <div class="flex items-center gap-2 text-sm">
            <a routerLink="/" class="text-[#6e6e73] hover:text-[#D4AF37]">Home</a>
            <span class="text-[#a1a1a6]">/</span>
            <a routerLink="/cart" class="text-[#6e6e73] hover:text-[#D4AF37]"
              >Cart</a
            >
            <span class="text-[#a1a1a6]">/</span>
            <span class="text-[#1d1d1f] font-medium">Checkout</span>
          </div>
        </div>
      </div>

      <div class="max-w-[1440px] mx-auto px-6 md:px-12 py-12 md:py-16">
        <h1
          class="font-display font-semibold text-4xl md:text-5xl tracking-tight text-[#1d1d1f] mb-10"
        >
          Checkout
        </h1>

        <!-- Progress Steps -->
        <div class="mb-12">
          <div class="flex gap-4 items-center">
            <div
              class="flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold transition-colors"
              [ngClass]="
                currentStep() >= 1
                  ? 'bg-[#1d1d1f] text-white'
                  : 'bg-white border border-[#e0e0e0] text-[#6e6e73]'
              "
            >
              1
            </div>
            <div
              class="flex-1 h-px"
              [ngClass]="currentStep() >= 2 ? 'bg-[#D4AF37]' : 'bg-[#e0e0e0]'"
            ></div>
            <div
              class="flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold transition-colors"
              [ngClass]="
                currentStep() >= 2
                  ? 'bg-[#1d1d1f] text-white'
                  : 'bg-white border border-[#e0e0e0] text-[#6e6e73]'
              "
            >
              2
            </div>
          </div>
          <div class="flex justify-between mt-4 text-sm">
            <span
              class="font-semibold"
              [ngClass]="currentStep() >= 1 ? 'text-[#1d1d1f]' : 'text-[#6e6e73]'"
              >Shipping</span
            >
            <span
              class="font-semibold"
              [ngClass]="currentStep() >= 2 ? 'text-[#1d1d1f]' : 'text-[#6e6e73]'"
              >Confirm & Pay</span
            >
          </div>
        </div>

        <!-- Guest Checkout Banner -->
        <div
          *ngIf="!isAuthenticated()"
          class="bg-white border border-[#e0e0e0] rounded-[18px] p-5 mb-8 flex justify-between items-center gap-4 animate-fade-in-up"
        >
          <div class="flex items-center gap-3">
            <span class="text-2xl">👤</span>
            <div>
              <p class="font-semibold text-[#1d1d1f]">Already have an account?</p>
              <p class="text-sm text-[#6e6e73]">
                Sign in for a faster checkout experience.
              </p>
            </div>
          </div>
          <a routerLink="/login" [queryParams]="{returnUrl: '/checkout'}" class="btn-outline text-sm !py-2 !px-4 whitespace-nowrap"
            >Sign In</a
          >
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Main Content -->
          <div class="lg:col-span-2">
            <!-- Recovery State -->
            <div *ngIf="isRecovering()" class="card p-8 animate-slideUp text-center mb-8">
               <div class="flex justify-center mb-6">
                 <div class="w-12 h-12 border-4 border-[#e0e0e0] border-t-[#D4AF37] rounded-full animate-spin"></div>
               </div>
               <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-3">Finalizing Your Order</h2>
               <p class="text-[#6e6e73] mb-2">Your payment was received successfully. We're placing your order now.</p>
               <p class="text-sm text-[#D4AF37] font-semibold mb-8">Please do not refresh or close this page.</p>
               <button *ngIf="!isProcessing()" (click)="retryOrderPlacement()" class="text-sm text-[#6e6e73] hover:text-[#D4AF37] underline transition-colors">
                 Try again manually
               </button>
            </div>

            <!-- Step 1: Shipping Address -->
            <div *ngIf="currentStep() === 1 && !isRecovering()" class="card p-8 animate-slideUp">
              <div class="flex justify-between items-center mb-6">
                <h2 class="font-display font-semibold text-2xl text-[#1d1d1f]">
                  Shipping Address
                </h2>
                <span
                  *ngIf="!isAuthenticated()"
                  class="badge"
                  >GUEST CHECKOUT</span
                >
              </div>

              <!-- Saved Addresses Selection -->
              <div
                *ngIf="isAuthenticated() && savedAddresses().length > 0"
                class="mb-8 space-y-4"
              >
                <h3 class="font-sans font-semibold text-base text-[#1d1d1f]">Saved Addresses</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    *ngFor="let address of savedAddresses()"
                    (click)="selectAddress(address)"
                    class="border rounded-[12px] p-4 cursor-pointer hover:border-[#D4AF37] transition-colors"
                    [ngClass]="
                      selectedAddressId() === address.id
                        ? 'border-[#D4AF37] bg-[#fbf8ef]'
                        : 'border-[#e0e0e0] bg-white'
                    "
                  >
                    <div class="flex justify-between">
                      <span class="font-semibold text-[#1d1d1f]"
                        >{{ address.firstName }} {{ address.lastName }}</span
                      >
                      <span
                        *ngIf="address.isDefault"
                        class="text-xs text-[#D4AF37] font-semibold"
                        >DEFAULT</span
                      >
                    </div>
                    <p class="text-sm text-[#6e6e73] mt-1">
                      {{ address.street }}<br />
                      {{ address.city }}, {{ address.state }}
                      {{ address.zipCode }}
                    </p>
                  </div>

                  <!-- New Address Option -->
                  <div
                    (click)="selectNewAddress()"
                    class="border border-dashed border-[#d2d2d7] rounded-[12px] p-4 flex items-center justify-center cursor-pointer hover:border-[#D4AF37] hover:text-[#D4AF37] text-[#6e6e73] transition-colors"
                    [ngClass]="
                      selectedAddressId() === 'new'
                        ? 'border-[#D4AF37] bg-[#fbf8ef] text-[#D4AF37]'
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
                      for="checkout-first-name"
                      class="block text-sm font-semibold text-[#1d1d1f] mb-2"
                      >First Name</label
                    >
                    <input
                      id="checkout-first-name"
                      type="text"
                      formControlName="firstName"
                      class="input-field"
                      placeholder="John"
                    />
                    <div *ngIf="shippingForm.get('firstName')?.invalid && shippingForm.get('firstName')?.touched" class="text-red-600 text-xs mt-1">First name is required</div>
                  </div>
                  <div>
                    <label
                      for="checkout-last-name"
                      class="block text-sm font-semibold text-[#1d1d1f] mb-2"
                      >Last Name</label
                    >
                    <input
                      id="checkout-last-name"
                      type="text"
                      formControlName="lastName"
                      class="input-field"
                      placeholder="Doe"
                    />
                    <div *ngIf="shippingForm.get('lastName')?.invalid && shippingForm.get('lastName')?.touched" class="text-red-600 text-xs mt-1">Last name is required</div>
                  </div>
                </div>

                <div>
                  <label for="checkout-email" class="block text-sm font-semibold text-[#1d1d1f] mb-2"
                    >Email Address</label
                  >
                  <input
                    id="checkout-email"
                    type="email"
                    formControlName="email"
                    class="input-field"
                    placeholder="john@example.com"
                  />
                  <div *ngIf="shippingForm.get('email')?.invalid && shippingForm.get('email')?.touched" class="text-red-600 text-xs mt-1">Valid email is required</div>
                </div>

                <div *ngIf="!isAuthenticated()">
                  <div
                    class="bg-[#f5f5f7] border border-[#e0e0e0] rounded-[12px] p-4 mt-2 space-y-2"
                  >
                    <p class="text-sm text-[#1d1d1f] font-semibold">
                      An account will be created so you can track this order
                    </p>
                    <p class="text-xs text-[#6e6e73]">
                      We need it to process and track your order. We will email
                      you the sign-in address &mdash; never a password. You can
                      set one later from &lsquo;Forgot password&rsquo;.
                    </p>
                    <label class="flex items-center gap-3 cursor-pointer pt-1">
                      <input type="checkbox" [ngModel]="marketingOptIn" (ngModelChange)="marketingOptIn = $event" [ngModelOptions]="{standalone: true}" class="w-4 h-4 rounded accent-[#D4AF37]">
                      <span class="text-sm text-[#1d1d1f]">Also email me new arrivals and offers</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label for="checkout-phone" class="block text-sm font-semibold text-[#1d1d1f] mb-2"
                    >Phone Number</label
                  >
                  <input
                    id="checkout-phone"
                    type="tel"
                    formControlName="phone"
                    class="input-field"
                    placeholder="+1 (555) 000-0000"
                  />
                  <div *ngIf="shippingForm.get('phone')?.invalid && shippingForm.get('phone')?.touched" class="text-red-600 text-xs mt-1">Valid phone number is required</div>
                </div>

                <div>
                  <label for="checkout-street" class="block text-sm font-semibold text-[#1d1d1f] mb-2"
                    >Street Address</label
                  >
                  <input
                    id="checkout-street"
                    type="text"
                    formControlName="street"
                    class="input-field"
                    placeholder="123 Main Street"
                  />
                  <div *ngIf="shippingForm.get('street')?.invalid && shippingForm.get('street')?.touched" class="text-red-600 text-xs mt-1">Street address is required</div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label
                      for="checkout-city"
                      class="block text-sm font-semibold text-[#1d1d1f] mb-2"
                      >City</label
                    >
                    <input
                      id="checkout-city"
                      type="text"
                      formControlName="city"
                      class="input-field"
                      placeholder="New York"
                    />
                    <div *ngIf="shippingForm.get('city')?.invalid && shippingForm.get('city')?.touched" class="text-red-600 text-xs mt-1">City is required</div>
                  </div>
                  <div>
                    <label
                      for="checkout-state"
                      class="block text-sm font-semibold text-[#1d1d1f] mb-2"
                      >State/Province</label
                    >
                    <input
                      id="checkout-state"
                      type="text"
                      formControlName="state"
                      class="input-field"
                      placeholder="NY"
                    />
                    <div *ngIf="shippingForm.get('state')?.invalid && shippingForm.get('state')?.touched" class="text-red-600 text-xs mt-1">State is required</div>
                  </div>
                  <div>
                    <label
                      for="checkout-zip"
                      class="block text-sm font-semibold text-[#1d1d1f] mb-2"
                      >ZIP Code</label
                    >
                    <input
                      id="checkout-zip"
                      type="text"
                      formControlName="zipCode"
                      class="input-field"
                      placeholder="10001"
                    />
                    <div *ngIf="shippingForm.get('zipCode')?.invalid && shippingForm.get('zipCode')?.touched" class="text-red-600 text-xs mt-1">ZIP code is required</div>
                  </div>
                </div>

                <div>
                  <label for="checkout-country" class="block text-sm font-semibold text-[#1d1d1f] mb-2"
                    >Country</label
                  >
                  <select
                    id="checkout-country"
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
                    class="mt-1 w-4 h-4 rounded accent-[#D4AF37]"
                  />
                  <span class="text-sm text-[#1d1d1f]"
                    >Billing address is same as shipping</span
                  >
                </label>

                <button
                  type="submit"
                  [disabled]="!shippingForm.valid || isProcessing()"
                  class="w-full btn-apple-pill"
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
                <button (click)="nextStep()" class="w-full btn-apple-pill">
                  Continue to Pay
                </button>
              </div>
            </div>

            <!-- Step 2: Order Review & Pay -->
            <div *ngIf="currentStep() === 2 && !isRecovering()" class="space-y-6 animate-slideUp">
              <div class="card p-8">
                <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">
                  Review & Pay
                </h2>

                <div class="space-y-6">
                  <div>
                    <h3 class="font-sans font-semibold text-base text-[#1d1d1f] mb-4">
                      Shipping Address
                    </h3>
                    <div
                      class="bg-[#f5f5f7] rounded-[12px] p-4 text-sm text-[#1d1d1f]"
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

                  <!-- Billing details: optional tax identifiers for the invoice -->
                  <div class="border-t border-[#e0e0e0] pt-6">
                    <h3 class="font-sans font-semibold text-base text-[#1d1d1f] mb-1">
                      Billing details
                    </h3>
                    <p class="text-sm text-[#6e6e73] mb-4">
                      Optional. Add a GSTIN to receive a business tax invoice; your PAN is
                      printed on the invoice where the law requires it.
                    </p>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label for="checkout-gstin" class="block text-sm font-semibold text-[#1d1d1f] mb-2">
                          GSTIN <span class="font-normal text-[#6e6e73]">(for a business invoice)</span>
                        </label>
                        <input
                          id="checkout-gstin"
                          type="text"
                          [ngModel]="buyerGstin()"
                          (ngModelChange)="setBuyerGstin($event)"
                          [ngModelOptions]="{standalone: true}"
                          maxlength="15"
                          autocomplete="off"
                          autocapitalize="characters"
                          spellcheck="false"
                          placeholder="08ABCDE1234F1Z5"
                          class="input-field font-mono uppercase tracking-[0.08em]"
                          [attr.aria-invalid]="gstinError() ? 'true' : null"
                          aria-describedby="checkout-gstin-help"
                        />
                        <p id="checkout-gstin-help" class="text-xs mt-1" [ngClass]="gstinError() ? 'text-red-600' : 'text-[#6e6e73]'">
                          {{ gstinError() || '15 characters, as registered with GST.' }}
                        </p>
                      </div>
                      <div>
                        <label for="checkout-pan" class="block text-sm font-semibold text-[#1d1d1f] mb-2">
                          PAN
                          <span *ngIf="panRequired()" class="text-[#D4AF37]" aria-hidden="true">*</span>
                          <span *ngIf="!panRequired()" class="font-normal text-[#6e6e73]">(optional)</span>
                        </label>
                        <input
                          id="checkout-pan"
                          type="text"
                          [ngModel]="buyerPan()"
                          (ngModelChange)="setBuyerPan($event)"
                          [ngModelOptions]="{standalone: true}"
                          maxlength="10"
                          autocomplete="off"
                          autocapitalize="characters"
                          spellcheck="false"
                          placeholder="ABCDE1234F"
                          class="input-field font-mono uppercase tracking-[0.08em]"
                          [required]="panRequired()"
                          [attr.aria-invalid]="panError() ? 'true' : null"
                          aria-describedby="checkout-pan-help"
                        />
                        <p id="checkout-pan-help" class="text-xs mt-1" [ngClass]="panError() ? 'text-red-600' : 'text-[#6e6e73]'">
                          {{
                            panError() ||
                              (panRequired()
                                ? 'Required by Income-tax Rule 114B for purchases of ₹2,00,000 or more'
                                : '10 characters, e.g. ABCDE1234F.')
                          }}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div class="border-t border-[#e0e0e0] pt-6">
                    <h3 class="font-sans font-semibold text-base text-[#1d1d1f] mb-4">
                      Shipping Method
                    </h3>
                    <div class="space-y-2">
                      <label
                        class="flex items-center gap-3 p-4 border border-[#D4AF37] rounded-[12px] bg-[#fbf8ef]"
                      >
                        <input
                          type="radio"
                          name="shipping"
                          value="express"
                          checked
                          class="w-4 h-4 accent-[#D4AF37]"
                        />
                        <div>
                          <p class="font-semibold text-[#1d1d1f]">
                            Express Shipping (2-3 days)
                          </p>
                          <p class="text-sm text-[#6e6e73]">FREE</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div class="border-t border-[#e0e0e0] pt-6">
                    <h3 class="font-sans font-semibold text-base text-[#1d1d1f] mb-4">
                      Payment Method
                    </h3>
                    <div
                      *ngIf="isFullyCoveredByGiftCard()"
                      class="flex items-start gap-3 p-4 border border-[#D4AF37] rounded-[12px] bg-[#fbf8ef] mb-3"
                      role="status"
                    >
                      <span class="text-lg" aria-hidden="true">🎁</span>
                      <div>
                        <p class="font-semibold text-[#1d1d1f]">No payment needed</p>
                        <p class="text-sm text-[#6e6e73]">
                          Your gift card covers this order in full. Place the order to redeem
                          {{ cartGiftCardAmount() | currencyConvert }} from it.
                        </p>
                      </div>
                    </div>
                    <div class="space-y-3" *ngIf="!isFullyCoveredByGiftCard()">
                      <label
                        class="flex items-center gap-3 p-4 border rounded-[12px] cursor-pointer transition-colors"
                        [ngClass]="
                          selectedPaymentMethod === 'RAZORPAY'
                            ? 'border-[#D4AF37] bg-[#fbf8ef]'
                            : 'border-[#e0e0e0] hover:border-[#1d1d1f]'
                        "
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="RAZORPAY"
                          [(ngModel)]="selectedPaymentMethod"
                          class="w-4 h-4 accent-[#D4AF37]"
                        />
                        <div>
                          <p class="font-semibold text-[#1d1d1f]">
                            Pay Online (Cards, UPI, NetBanking)
                          </p>
                          <p class="text-sm text-[#6e6e73]">
                            Secure payment via Razorpay
                          </p>
                        </div>
                      </label>
                      <label
                        class="flex items-center gap-3 p-4 border rounded-[12px] transition-colors"
                        [ngClass]="
                          codBlocked()
                            ? 'border-[#e0e0e0] bg-[#f5f5f7] cursor-not-allowed'
                            : selectedPaymentMethod === 'COD'
                              ? 'border-[#D4AF37] bg-[#fbf8ef] cursor-pointer'
                              : 'border-[#e0e0e0] hover:border-[#1d1d1f] cursor-pointer'
                        "
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value="COD"
                          [(ngModel)]="selectedPaymentMethod"
                          [disabled]="codBlocked()"
                          class="w-4 h-4 accent-[#D4AF37] disabled:cursor-not-allowed"
                        />
                        <div>
                          <p class="font-semibold" [ngClass]="codBlocked() ? 'text-[#7a7a7a]' : 'text-[#1d1d1f]'">
                            Cash on Delivery (COD)
                          </p>
                          <p class="text-sm text-[#6e6e73]">
                            {{
                              codBlocked()
                                ? 'Cash on delivery is not available above ₹2,00,000 (Section 269ST)'
                                : 'Pay when your order is delivered'
                            }}
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div class="border-t border-[#e0e0e0] pt-6">
                    <h3 class="font-sans font-semibold text-base text-[#1d1d1f] mb-4">
                      Have a Coupon?
                    </h3>
                    <div class="flex gap-2">
                      <input type="text" [(ngModel)]="couponCode" name="couponCode" placeholder="Enter coupon code" aria-label="Coupon code" class="input-field flex-1" />
                      <button type="button" (click)="applyCoupon()" class="btn-outline text-sm !py-2.5 !px-5">Apply</button>
                    </div>
                  </div>

                  <div class="border-t border-[#e0e0e0] pt-6">
                    <h3 class="font-sans font-semibold text-base text-[#1d1d1f] mb-4">
                      Have a gift card?
                    </h3>
                    <div *ngIf="cartGiftCard(); else giftCardEntry" class="flex items-center justify-between gap-4 p-4 border border-[#D4AF37] rounded-[12px] bg-[#fbf8ef]">
                      <div>
                        <p class="font-mono text-sm tracking-[0.1em] text-[#1d1d1f]">{{ maskedGiftCard() }}</p>
                        <p class="text-sm text-[#6e6e73] mt-0.5">
                          {{ cartGiftCardAmount() | currencyConvert }} applied to this order
                        </p>
                      </div>
                      <button type="button" (click)="removeGiftCard()" [disabled]="isProcessing()" class="btn-ghost text-sm">Remove</button>
                    </div>
                    <ng-template #giftCardEntry>
                      <div class="flex gap-2">
                        <input
                          type="text"
                          [(ngModel)]="giftCardCode"
                          name="giftCardCode"
                          placeholder="CL-XXXX-XXXX-XXXX"
                          autocomplete="off"
                          autocapitalize="characters"
                          spellcheck="false"
                          aria-label="Gift card code"
                          class="input-field flex-1 font-mono uppercase tracking-[0.1em]"
                        />
                        <button type="button" (click)="applyGiftCard()" [disabled]="isProcessing()" class="btn-outline text-sm !py-2.5 !px-5">Apply</button>
                      </div>
                      <p class="text-xs text-[#6e6e73] mt-2">
                        The balance is applied to the amount due; anything left stays on the card.
                        <a routerLink="/gift-card" fragment="balance" class="text-[#D4AF37] hover:underline">Check a balance</a>
                      </p>
                    </ng-template>
                  </div>
                </div>
              </div>

              <!-- Server-side rejections (400 with a message) and tax-ID checks, inline next to the action -->
              <div
                *ngIf="orderError()"
                role="alert"
                class="flex items-start gap-3 p-4 border border-red-200 bg-red-50 rounded-[12px] text-sm text-red-700"
              >
                <svg class="w-5 h-5 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path stroke-linecap="round" d="M12 8v4m0 4h.01" /></svg>
                <p>{{ orderError() }}</p>
              </div>

              <div class="flex gap-4">
                <button
                  type="button"
                  (click)="previousStep()"
                  class="flex-1 btn-outline"
                  [disabled]="isProcessing()"
                >
                  Back
                </button>
                <button
                  (click)="placeOrder()"
                  class="flex-1 btn-apple-pill"
                  [disabled]="isProcessing()"
                >
                  {{
                    isProcessing()
                      ? 'Processing...'
                      : isFullyCoveredByGiftCard() || selectedPaymentMethod === 'COD'
                        ? 'Place Order'
                        : 'Pay Now'
                  }}
                </button>
              </div>
            </div>
          </div>

          <!-- Order Summary Sidebar -->
          <div class="lg:col-span-1">
            <div class="card p-8 sticky top-[120px]">
              <h3 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">
                Order Summary
              </h3>

              <div
                class="space-y-3 mb-4 pb-4 border-b border-[#e0e0e0] max-h-64 overflow-y-auto"
              >
                <ng-container *ngFor="let item of cartItems()">
                  <div
                    class="flex justify-between text-sm border-b border-[#f0f0f0] pb-2"
                  >
                    <span class="text-[#6e6e73]">{{ item.product.name }}</span>
                    <span class="font-semibold">{{
                      item.price * item.quantity | currencyConvert
                    }}</span>
                  </div>
                </ng-container>
              </div>

              <div class="space-y-4 mb-4 pb-4 border-b border-[#e0e0e0] text-sm">
                <div class="flex justify-between">
                  <span class="text-[#6e6e73]">Subtotal</span>
                  <span class="font-semibold">{{
                    cartSubtotal() | currencyConvert
                  }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-[#6e6e73]">Shipping</span>
                  <span
                    class="font-semibold"
                    [class.text-emerald-600]="cartShipping() === 0"
                    >{{
                      cartShipping() === 0
                        ? 'FREE'
                        : (cartShipping() | currencyConvert)
                    }}</span
                  >
                </div>
                <div *ngIf="cartGiftWrap()" class="flex justify-between">
                  <span class="text-[#6e6e73]">Gift wrapping</span>
                  <span class="font-semibold">{{
                    giftWrapFee | currencyConvert
                  }}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-[#6e6e73]">Tax</span>
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
                <div
                  *ngIf="cartGiftCard() && cartGiftCardAmount() > 0"
                  class="flex justify-between text-emerald-600"
                >
                  <span>Gift card ({{ maskedGiftCard() }})</span>
                  <span class="font-semibold"
                    >-{{ cartGiftCardAmount() | currencyConvert }}</span
                  >
                </div>
              </div>

              <div class="flex justify-between items-center mb-6">
                <span class="font-semibold text-base text-[#1d1d1f]">{{
                  cartGiftCard() ? 'Amount due' : 'Total'
                }}</span>
                <span class="font-semibold text-2xl text-[#1d1d1f]">{{
                  cartTotal() | currencyConvert
                }}</span>
              </div>

              <div class="space-y-4">
                <div class="flex items-start gap-3 p-3 bg-[#f5f5f7] rounded-[12px]">
                  <span class="text-lg">🛡️</span>
                  <div>
                    <p class="text-sm font-semibold text-[#1d1d1f]">Free Insured Shipping</p>
                    <p class="text-xs text-[#6e6e73] mt-0.5">Your package is fully insured until delivery</p>
                  </div>
                </div>
                <div *ngIf="returnPolicyDays() as days" class="flex items-start gap-3 p-3 bg-[#f5f5f7] rounded-[12px]">
                  <span class="text-lg">🔄</span>
                  <div>
                    <p class="text-sm font-semibold text-[#1d1d1f]">{{ days }}-Day Returns</p>
                    <p class="text-xs text-[#6e6e73] mt-0.5">
                      <a routerLink="/returns" class="underline">See our returns policy</a>
                    </p>
                  </div>
                </div>
                <div *ngIf="warrantyLabel()" class="flex items-start gap-3 p-3 bg-[#f5f5f7] rounded-[12px]">
                  <span class="text-lg">💎</span>
                  <div>
                    <p class="text-sm font-semibold text-[#1d1d1f]">{{ warrantyLabel() }}</p>
                    <p class="text-xs text-[#6e6e73] mt-0.5">
                      <a routerLink="/returns" class="underline">See warranty terms</a>
                    </p>
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
  cartShipping = signal(0);
  cartGiftWrap = signal(false);
  /** Applied gift-card code (server returns it unmasked) and the amount it covers. */
  cartGiftCard = signal<string | null>(null);
  cartGiftCardAmount = signal(0);
  maskedGiftCard = computed(() => maskGiftCardCode(this.cartGiftCard()));
  /** Nothing left to pay: the backend records the order as PAID via GIFT_CARD. */
  isFullyCoveredByGiftCard = computed(
    () => !!this.cartGiftCard() && this.cartGiftCardAmount() > 0 && this.cartTotal() <= 0,
  );
  giftCardCode = '';
  readonly giftWrapFee = CART_PRICING.giftWrapFee;
  isProcessing = signal(false);
  isRecovering = signal(false);
  pendingOrderData: any = null;

  // ---- Tax identifiers (GST contract) --------------------------------------
  /**
   * Payable total before the gift card, in INR: what the summary shows as the
   * order total and what Rule 114B / Section 269ST measure. A gift card does
   * not lower the consideration for those rules, only how it is settled.
   */
  cartTotalBeforeGiftCard = signal(0);
  payableTotal = computed(() =>
    this.cartTotalBeforeGiftCard() || this.cartTotal() + this.cartGiftCardAmount(),
  );
  /** PAN is mandatory from 2,00,000 INR (Income-tax Rule 114B). */
  panRequired = computed(() => this.payableTotal() >= PAN_REQUIRED_FROM_INR);
  /** Cash above 2,00,000 INR is barred by Section 269ST, so COD is blocked at the same level. */
  codBlocked = this.panRequired;

  buyerGstin = signal('');
  buyerPan = signal('');
  /** Set on the first place-order attempt so "required" messages do not fire while typing. */
  private taxIdsTouched = signal(false);

  gstinError = computed(() => {
    const v = this.buyerGstin();
    if (!v) return '';
    return GSTIN_PATTERN.test(v) ? '' : 'Enter a valid 15-character GSTIN (e.g. 08ABCDE1234F1Z5).';
  });
  panError = computed(() => {
    const v = this.buyerPan();
    if (!v) {
      return this.panRequired() && this.taxIdsTouched()
        ? 'PAN is required for purchases of ₹2,00,000 or more.'
        : '';
    }
    return PAN_PATTERN.test(v) ? '' : 'Enter a valid 10-character PAN (e.g. ABCDE1234F).';
  });

  /** Inline message next to the place-order button: client checks or the server's 400 `message`. */
  orderError = signal<string | null>(null);

  setBuyerGstin(value: string) {
    this.buyerGstin.set(normaliseTaxId(value));
    this.orderError.set(null);
  }

  setBuyerPan(value: string) {
    this.buyerPan.set(normaliseTaxId(value));
    this.orderError.set(null);
  }
  // Marketing consent. The previous flag (createAccountForGuest) was bound
  // to a checkbox and read nowhere, and it implied the account was optional
  // when the order cannot be placed without one. This governs the only part
  // that is genuinely a choice.
  marketingOptIn = false;

  /** Store settings; decides which promises the checkout may display. */
  storeSettings: Record<string, string> = {};

  /**
   * Published return window. These badges previously asserted "30-Day Returns"
   * and a "Lifetime Warranty" unconditionally, with no policy page anywhere on
   * the site to back either.
   */
  returnPolicyDays(): number | null {
    const raw = this.storeSettings['returnPolicyDays'];
    const n = raw ? parseInt(String(raw), 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  warrantyLabel(): string {
    return this.storeSettings['warrantyLabel'] || '';
  }
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
  private settingService = inject(SettingService);
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
    this.settingService
      .getSettings()
      .subscribe((s) => (this.storeSettings = s || {}));

    if (isPlatformBrowser(this.platformId)) {
      const pending = sessionStorage.getItem('pendingOrderData');
      if (pending) {
        this.pendingOrderData = JSON.parse(pending);
        this.isRecovering.set(true);
        // Auto-retry order placement after 2 seconds
        setTimeout(() => {
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
      next: (cart) => this.applyCartState(cart),
      error: () => {
        // Error loading cart
      },
    });
  }

  private applyCartState(cart: Cart): void {
    this.cartItems.set(cart.items);
    this.cartTotal.set(cart.total);
    this.cartSubtotal.set(cart.subtotal || 0);
    this.cartTax.set(cart.tax || 0);
    this.cartShipping.set(cart.shipping || 0);
    this.cartGiftWrap.set(!!cart.giftWrap);
    // The totals engine writes appliedDiscount; reading only `discount`
    // meant an applied coupon reduced the total with no line to show it.
    this.cartDiscount.set(cart.appliedDiscount ?? cart.discount ?? 0);
    this.cartGiftCard.set(cart.appliedGiftCard || null);
    this.cartGiftCardAmount.set(cart.giftCardAmount || 0);
    this.cartTotalBeforeGiftCard.set(Number(cart.totalBeforeGiftCard) || 0);
    // A coupon removal or gift-card change can push the total over the cash
    // limit while COD is already selected; fall back to the gateway.
    if (this.codBlocked() && this.selectedPaymentMethod === 'COD') {
      this.selectedPaymentMethod = 'RAZORPAY';
    }
  }

  /**
   * Client-side mirror of the server's tax-ID rules so the customer is told
   * before paying rather than after. The server remains authoritative.
   */
  private validateTaxIds(): boolean {
    this.taxIdsTouched.set(true);
    if (this.panRequired() && !this.buyerPan()) {
      this.orderError.set(
        'A PAN is required for purchases of ₹2,00,000 or more (Income-tax Rule 114B). Please add it under Billing details.',
      );
      return false;
    }
    if (this.panError()) {
      this.orderError.set(this.panError());
      return false;
    }
    if (this.gstinError()) {
      this.orderError.set(this.gstinError());
      return false;
    }
    if (this.codBlocked() && this.selectedPaymentMethod === 'COD' && !this.isFullyCoveredByGiftCard()) {
      this.orderError.set('Cash on delivery is not available above ₹2,00,000 (Section 269ST). Please pay online.');
      return false;
    }
    this.orderError.set(null);
    return true;
  }

  /**
   * POST /orders body shared by the COD, gift-card and Razorpay flows. Address
   * data excludes the email to match the backend DTO; cart item ids are
   * dropped because guest carts carry random ones. `total` is deliberately
   * not sent: the server prices the order from its own cart and never reads a
   * client total, and sending one would imply it is authoritative.
   */
  private buildOrderData(
    paymentMethod: 'COD' | 'GIFT_CARD' | 'RAZORPAY',
    paymentDetails: CreateOrderRequest['paymentDetails'],
  ): CreateOrderRequest {
    const { email, ...shippingAddr } = this.shippingForm.value;
    const billingAddr = this.billingSameAsShipping ? shippingAddr : {};
    const sanitizedItems = this.cartItems().map((item) => {
      const { id, ...itemWithoutId } = item;
      return itemWithoutId as CartItem;
    });

    const orderData: CreateOrderRequest = {
      shippingAddress: shippingAddr,
      billingAddress: billingAddr,
      paymentMethod,
      shippingMethod: 'EXPRESS',
      items: sanitizedItems,
      paymentDetails: paymentDetails ?? {},
    };
    if (this.buyerGstin()) orderData.buyerGstin = this.buyerGstin();
    if (this.buyerPan()) orderData.buyerPan = this.buyerPan();
    return orderData;
  }

  /**
   * The server's own explanation for a 400 (missing PAN, COD over the cash
   * limit, malformed GSTIN/PAN). Tolerates `message`, `error` and `detail`
   * bodies; null for anything that is not a validation failure.
   */
  private rejectionMessage(err: unknown): string | null {
    if (!(err instanceof HttpErrorResponse) || err.status !== 400) return null;
    const body = err.error;
    if (typeof body === 'string' && body.trim()) return body.trim();
    if (body && typeof body === 'object') {
      for (const key of ['message', 'error', 'detail'] as const) {
        const value = (body as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
      }
    }
    return 'The order could not be placed. Please check your billing details and try again.';
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

              // Marketing list only on an explicit opt-in. Previously nothing
              // read the checkbox at all.
              if (this.marketingOptIn) {
                this.emailService.subscribeToNotifications(registerData.email).subscribe({
                  error: (e) =>
                    console.error('Failed to record marketing opt-in', e),
                });
              }

              // CartService's user subscription will handle guest cart sync automatically on login
              // Just wait a little bit or proceed immediately
              setTimeout(() => {
                this.isProcessing.set(false);
                this.currentStep.set(this.currentStep() + 1);
              }, 500);
            },
            error: () => {
              this.isProcessing.set(false);
              this.toastService.show(
                'Account created but login failed. Please sign in.',
                'error',
              );
              this.router.navigate(['/login']);
            },
          });
      },
      error: () => {
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

    if (!this.validateTaxIds()) return;

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
    if (this.isFullyCoveredByGiftCard()) {
      // Nothing to collect: no Razorpay order, no COD. The backend debits the
      // card inside createOrder and marks the order PAID / GIFT_CARD.
      this.placeUnpaidOrder('GIFT_CARD');
    } else if (this.selectedPaymentMethod === 'COD') {
      this.handleCODPayment();
    } else {
      this.initiateRazorpay();
    }
  }

  private handleCODPayment() {
    this.placeUnpaidOrder('COD');
  }

  /** Orders that do not go through the gateway: COD, or fully covered by a gift card. */
  private placeUnpaidOrder(paymentMethod: 'COD' | 'GIFT_CARD') {
    // No gateway payment to reference.
    const orderData = this.buildOrderData(paymentMethod, {});

    this.orderService.createOrder(orderData).subscribe({
      next: (order) => {
        sessionStorage.setItem('lastOrderId', order.id);
        this.router.navigate(['/order-confirmation']);
      },
      error: (err: unknown) => {
        this.isProcessing.set(false);
        const rejection = this.rejectionMessage(err);
        if (rejection) {
          // The error interceptor has already toasted the API message; keep
          // it on screen next to the button so it can be acted on.
          this.orderError.set(rejection);
          return;
        }
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
      error: () => {
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
    const orderData = this.buildOrderData('RAZORPAY', {
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_signature: response.razorpay_signature,
    });

    this.orderService.createOrder(orderData).subscribe({
      next: (order) => {
        // Backend sends email confirmation automatically
        sessionStorage.setItem('lastOrderId', order.id);
        this.router.navigate(['/order-confirmation']);
      },
      error: (err: unknown) => {
        this.isProcessing.set(false);
        const rejection = this.rejectionMessage(err);
        if (rejection) {
          // A validation rejection will not pass on retry with the same body,
          // so do not enter the automatic recovery loop; show the reason and
          // keep the payment reference for support.
          this.orderError.set(
            `${rejection} Your payment ${response.razorpay_payment_id} has been recorded; please contact support if the amount was debited.`,
          );
          return;
        }
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
      error: (err: unknown) => {
        this.isProcessing.set(false);
        const rejection = this.rejectionMessage(err);
        if (rejection) {
          // Retrying the same body cannot fix a validation error; leave
          // recovery mode so the customer can see and correct the details.
          sessionStorage.removeItem('pendingOrderData');
          this.pendingOrderData = null;
          this.isRecovering.set(false);
          this.currentStep.set(2);
          this.orderError.set(rejection);
          return;
        }
        this.toastService.show('Still unable to place order. Please contact support with your payment ID.', 'error');
      }
    });
  }

  applyCoupon() {
    if (!this.couponCode) return;
    this.isProcessing.set(true);
    this.cartService.applyCoupon(this.couponCode).subscribe({
      next: (cart) => {
        this.isProcessing.set(false);
        this.applyCartState(cart);
        this.toastService.show('Coupon applied successfully', 'success');
      },
      error: () => {
        this.isProcessing.set(false);
        this.toastService.show('Invalid or expired coupon code.', 'error');
      }
    });
  }

  applyGiftCard() {
    const code = this.giftCardCode.trim();
    if (!code) {
      this.toastService.show('Enter your gift card code.', 'error');
      return;
    }
    this.isProcessing.set(true);
    this.cartService.applyGiftCard(code).subscribe({
      next: (cart) => {
        this.isProcessing.set(false);
        this.giftCardCode = '';
        this.applyCartState(cart);
        const applied = cart.giftCardAmount || 0;
        this.toastService.show(
          this.isFullyCoveredByGiftCard()
            ? 'Gift card applied. Your order is fully covered; no payment is needed.'
            : `Gift card applied: ${this.currencyService.format(applied)} off the amount due.`,
          'success',
        );
      },
      error: (err: unknown) => {
        this.isProcessing.set(false);
        // HTTP failures (invalid, expired, depleted: 400 with the API's own
        // message) are already toasted by the error interceptor. Only the
        // client-side guest rejection needs surfacing here.
        if (!(err instanceof HttpErrorResponse)) {
          this.toastService.show(
            err instanceof Error ? err.message : GUEST_GIFT_CARD_MESSAGE,
            'error',
          );
        }
      },
    });
  }

  removeGiftCard() {
    this.isProcessing.set(true);
    this.cartService.removeGiftCard().subscribe({
      next: (cart) => {
        this.isProcessing.set(false);
        this.applyCartState(cart);
        this.toastService.show('Gift card removed.', 'info');
      },
      error: (err: unknown) => {
        this.isProcessing.set(false);
        if (!(err instanceof HttpErrorResponse)) {
          this.toastService.show(
            err instanceof Error ? err.message : GUEST_GIFT_CARD_MESSAGE,
            'error',
          );
        }
      },
    });
  }
}

/** Upper-case, trim and strip inner whitespace: how PAN and GSTIN are printed. */
function normaliseTaxId(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/\s+/g, '').trim();
}
