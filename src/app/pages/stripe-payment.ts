import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

interface PaymentDetails {
  amount: number;
  currency: string;
  orderId: string;
  paymentIntent: string;
}

@Component({
  selector: 'app-stripe-payment',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-diamond-50 to-white">
      <!-- Header -->
      <div class="bg-white border-b border-diamond-200">
        <div class="container-luxury py-6">
          <a routerLink="/" class="text-gold-600 hover:text-gold-700 font-semibold">
            ← Back to Home
          </a>
        </div>
      </div>

      <!-- Payment Container -->
      <div class="container-luxury section-padding">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Payment Form -->
          <div class="lg:col-span-2">
            <div class="card p-8">
              <h1 class="text-3xl font-display font-bold text-diamond-900 mb-2">
                Stripe Payment
              </h1>
              <p class="text-gray-600 mb-8">Complete your secure payment using Stripe</p>

              <!-- Order Summary -->
              <div class="bg-diamond-50 rounded-lg p-6 mb-8 border border-diamond-200">
                <h3 class="font-semibold text-gray-900 mb-4">Order Summary</h3>
                <div class="space-y-3">
                  <div class="flex justify-between">
                    <span class="text-gray-700">Order ID:</span>
                    <span class="font-mono text-gold-600">{{ orderSummary().orderId }}</span>
                  </div>
                  <div class="flex justify-between border-t border-diamond-200 pt-3">
                    <span class="text-gray-700">Amount:</span>
                    <span class="text-xl font-bold text-diamond-900">
                      {{ formatCurrency(orderSummary().amount, orderSummary().currency) }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Card Details Section -->
              <div class="mb-8">
                <h3 class="font-semibold text-gray-900 mb-4">Card Details</h3>

                <!-- Card Number -->
                <div class="mb-4">
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Card Number
                  </label>
                  <input
                    type="text"
                    [(ngModel)]="cardDetails.cardNumber"
                    placeholder="4242 4242 4242 4242"
                    class="input-field"
                    maxlength="19"
                  />
                  <p class="text-xs text-gray-500 mt-1">
                    💳 Test card: 4242 4242 4242 4242
                  </p>
                </div>

                <!-- Expiry and CVC -->
                <div class="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                      Expiry Date
                    </label>
                    <input
                      type="text"
                      [(ngModel)]="cardDetails.expiry"
                      placeholder="MM/YY"
                      class="input-field"
                      maxlength="5"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                      CVC
                    </label>
                    <input
                      type="text"
                      [(ngModel)]="cardDetails.cvc"
                      placeholder="123"
                      class="input-field"
                      maxlength="4"
                    />
                  </div>
                </div>

                <!-- Cardholder Name -->
                <div class="mb-6">
                  <label class="block text-sm font-medium text-gray-700 mb-2">
                    Cardholder Name
                  </label>
                  <input
                    type="text"
                    [(ngModel)]="cardDetails.name"
                    placeholder="John Doe"
                    class="input-field"
                  />
                </div>
              </div>

              <!-- Security Notice -->
              <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-8">
                <p class="text-sm text-green-800 flex items-center gap-2">
                  <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 111.414 1.414L7.414 9l3.293 3.293a1 1 0 11-1.414 1.414l-4-4z"
                      clip-rule="evenodd"
                    ></path>
                  </svg>
                  Your payment is secure and encrypted
                </p>
              </div>

              <!-- Pay Button -->
              <button
                (click)="processPayment()"
                [disabled]="isProcessing()"
                class="w-full btn-primary text-lg py-4"
              >
                <span *ngIf="!isProcessing()">
                  Pay {{ formatCurrency(orderSummary().amount, orderSummary().currency) }}
                </span>
                <span *ngIf="isProcessing()" class="flex items-center justify-center gap-2">
                  <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    ></circle>
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Processing...
                </span>
              </button>

              <!-- Test Mode Notice -->
              <p class="text-center text-sm text-gray-500 mt-6">
                🔧 This is a mock payment page. In production, Stripe Elements will be integrated.
              </p>
            </div>
          </div>

          <!-- Order Details Sidebar -->
          <div class="lg:col-span-1">
            <div class="card p-6 sticky top-24">
              <h3 class="font-semibold text-gray-900 mb-6">Order Details</h3>

              <!-- Sample Items -->
              <div class="space-y-4 mb-6 pb-6 border-b border-diamond-200">
                <div class="flex items-start justify-between">
                  <div>
                    <p class="font-medium text-gray-900">Diamond Ring</p>
                    <p class="text-sm text-gray-600">Qty: 1</p>
                  </div>
                  <p class="font-semibold text-gray-900">$45,000</p>
                </div>
              </div>

              <!-- Totals -->
              <div class="space-y-3 mb-6">
                <div class="flex justify-between text-gray-700">
                  <span>Subtotal:</span>
                  <span>$45,000</span>
                </div>
                <div class="flex justify-between text-gray-700">
                  <span>Shipping:</span>
                  <span>$0</span>
                </div>
                <div class="flex justify-between text-gray-700">
                  <span>Tax:</span>
                  <span>$4,500</span>
                </div>
                <div class="flex justify-between font-bold text-lg text-diamond-900 pt-3 border-t border-diamond-200">
                  <span>Total:</span>
                  <span>{{ formatCurrency(orderSummary().amount, orderSummary().currency) }}</span>
                </div>
              </div>

              <!-- Security Info -->
              <div class="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <p class="text-xs text-blue-800">
                  💳 PCI-DSS Compliant<br />
                  🔒 256-bit SSL Encrypted<br />
                  ✓ Verified by Stripe
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Success Modal -->
      <div
        *ngIf="paymentStatus() === 'success'"
        class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      >
        <div class="bg-white rounded-2xl shadow-2xl p-8 max-w-md text-center">
          <div class="mb-4">
            <svg class="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              ></path>
            </svg>
          </div>
          <h3 class="text-2xl font-bold text-diamond-900 mb-2">Payment Successful! 🎉</h3>
          <p class="text-gray-600 mb-6">
            Your order has been confirmed. You will receive a confirmation email shortly.
          </p>
          <a
            routerLink="/account"
            class="btn-primary inline-block"
          >
            View Order Details
          </a>
        </div>
      </div>
    </div>
  `,
})
export class StripePaymentComponent implements OnInit {
  orderSummary = signal({
    amount: 49500,
    currency: 'USD',
    orderId: 'ORD-2024-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
    paymentIntent: 'pi_' + Math.random().toString(36).substr(2, 20),
  });

  isProcessing = signal(false);
  paymentStatus = signal<'idle' | 'success' | 'error'>('idle');

  cardDetails = {
    cardNumber: '',
    expiry: '',
    cvc: '',
    name: '',
  };

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe((params) => {
      if (params['amount']) {
        const current = this.orderSummary();
        this.orderSummary.set({
          ...current,
          amount: parseInt(params['amount'], 10),
        });
      }
    });
  }

  processPayment(): void {
    if (!this.validateCard()) {
      alert('Please fill in all card details correctly');
      return;
    }

    this.isProcessing.set(true);

    // Simulate API call
    setTimeout(() => {
      this.isProcessing.set(false);
      this.paymentStatus.set('success');

      // Mock API call to backend
      console.log('Payment processed:', {
        orderId: this.orderSummary().orderId,
        amount: this.orderSummary().amount,
        paymentIntent: this.orderSummary().paymentIntent,
        cardLast4: this.cardDetails.cardNumber.slice(-4),
      });

      // Redirect after 3 seconds
      setTimeout(() => {
        // In real app: this.router.navigate(['/account']);
      }, 3000);
    }, 2000);
  }

  validateCard(): boolean {
    return (
      this.cardDetails.cardNumber.replace(/\s/g, '').length === 16 &&
      this.cardDetails.expiry.length === 5 &&
      this.cardDetails.cvc.length >= 3 &&
      this.cardDetails.name.trim().length > 0
    );
  }

  formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(amount);
  }
}
