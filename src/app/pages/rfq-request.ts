import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { RFQService, RFQRequest, RFQItem } from '../services/rfq.service';

@Component({
  selector: 'app-rfq-request',
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
            <span class="text-gray-700">Request for Quote</span>
          </div>
        </div>
      </div>

      <div class="container-luxury section-padding">
        <h1 class="text-5xl md:text-6xl font-display font-bold text-diamond-900 mb-4">
          Request for Quote
        </h1>
        <p class="text-xl text-gray-600 mb-12">
          For bulk orders and B2B inquiries, get personalized quotes from our team
        </p>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <!-- Form -->
          <div class="lg:col-span-2">
            <div class="card p-8" *ngIf="!submissionSuccess()">
              <form (ngSubmit)="submitRequest()" #rfqForm="ngForm" class="space-y-6">
                <!-- Contact Information -->
                <div class="border-b border-diamond-200 pb-6">
                  <h2 class="text-2xl font-bold text-diamond-900 mb-6">Contact Information</h2>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label class="block text-sm font-semibold text-gray-900 mb-2">
                        First Name
                      </label>
                      <input
                        type="text"
                        [(ngModel)]="rfqData.firstName"
                        name="firstName"
                        required
                        class="input-field"
                        placeholder="John"
                      />
                    </div>
                    <div>
                      <label class="block text-sm font-semibold text-gray-900 mb-2">
                        Last Name
                      </label>
                      <input
                        type="text"
                        [(ngModel)]="rfqData.lastName"
                        name="lastName"
                        required
                        class="input-field"
                        placeholder="Doe"
                      />
                    </div>
                  </div>

                  <div class="mt-6">
                    <label class="block text-sm font-semibold text-gray-900 mb-2">
                      Email Address
                    </label>
                    <input
                      type="email"
                      [(ngModel)]="rfqData.email"
                      name="email"
                      required
                      class="input-field"
                      placeholder="john@example.com"
                    />
                  </div>

                  <div class="mt-6">
                    <label class="block text-sm font-semibold text-gray-900 mb-2">
                      Company Name
                    </label>
                    <input
                      type="text"
                      [(ngModel)]="rfqData.companyName"
                      name="companyName"
                      required
                      class="input-field"
                      placeholder="Your Company"
                    />
                  </div>

                  <div class="mt-6">
                    <label class="block text-sm font-semibold text-gray-900 mb-2">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      [(ngModel)]="rfqData.phone"
                      name="phone"
                      required
                      class="input-field"
                      placeholder="+1 (555) 000-0000"
                    />
                  </div>
                </div>

                <!-- Product Information -->
                <div class="border-b border-diamond-200 pb-6">
                  <h2 class="text-2xl font-bold text-diamond-900 mb-6">Product Information</h2>

                  <div class="space-y-4 mb-6">
                    <ng-container *ngFor="let item of rfqItems(); let i = index">
                      <div class="border border-diamond-200 rounded-lg p-4 space-y-4">
                        <div class="flex justify-between items-center">
                          <span class="font-semibold text-gray-900">Item {{ i + 1 }}</span>
                          <button
                            type="button"
                            (click)="removeItem(i)"
                            class="text-red-600 hover:text-red-700 text-sm font-semibold"
                          >
                            Remove
                          </button>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label class="block text-sm font-semibold text-gray-900 mb-2">
                              Product Category
                            </label>
                            <select
                              [(ngModel)]="item.productId"
                              [name]="'productId_' + i"
                              required
                              class="input-field"
                            >
                              <option value="">Select a product category</option>
                              <option value="engagement-rings">Engagement Rings</option>
                              <option value="loose-gemstones">Loose Gemstones</option>
                              <option value="spiritual-idols">Spiritual Idols</option>
                              <option value="gemstone-jewelry">Gemstone Jewelry</option>
                              <option value="precious-metals">Precious Metals</option>
                              <option value="custom">Custom Designs</option>
                            </select>
                          </div>
                          <div>
                            <label class="block text-sm font-semibold text-gray-900 mb-2">
                              Quantity
                            </label>
                            <input
                              type="number"
                              [(ngModel)]="item.quantity"
                              [name]="'quantity_' + i"
                              min="1"
                              required
                              class="input-field"
                              placeholder="100"
                            />
                          </div>
                        </div>

                        <div>
                          <label class="block text-sm font-semibold text-gray-900 mb-2">
                            Specifications (Optional)
                          </label>
                          <textarea
                            [(ngModel)]="item.customization"
                            [name]="'specs_' + i"
                            class="input-field"
                            placeholder="E.g., Carat weight, Color, Clarity, Metal type..."
                            rows="3"
                          ></textarea>
                        </div>
                      </div>
                    </ng-container>
                  </div>

                  <button
                    type="button"
                    (click)="addItem()"
                    class="btn-ghost border border-diamond-300"
                  >
                    + Add Another Item
                  </button>
                </div>

                <!-- Additional Information -->
                <div class="border-b border-diamond-200 pb-6">
                  <h2 class="text-2xl font-bold text-diamond-900 mb-6">Additional Information</h2>

                  <div class="mb-6">
                    <label class="block text-sm font-semibold text-gray-900 mb-2">
                      Estimated Budget (Optional)
                    </label>
                    <div class="flex gap-2">
                      <span class="text-gray-500 font-semibold">$</span>
                      <input
                        type="number"
                        [(ngModel)]="rfqData.estimatedBudget"
                        name="budget"
                        class="flex-1 input-field"
                        placeholder="50000"
                      />
                    </div>
                  </div>

                  <div class="mb-6">
                    <label class="block text-sm font-semibold text-gray-900 mb-2">
                      Delivery Timeline
                    </label>
                    <select
                      [(ngModel)]="rfqData.deliveryTimeline"
                      name="timeline"
                      class="input-field"
                    >
                      <option value="">Select delivery timeline</option>
                      <option value="ASAP">As soon as possible</option>
                      <option value="1_WEEK">Within 1 week</option>
                      <option value="2_WEEKS">Within 2 weeks</option>
                      <option value="1_MONTH">Within 1 month</option>
                      <option value="2_MONTHS">Within 2 months</option>
                      <option value="3_MONTHS">Within 3 months</option>
                    </select>
                  </div>

                  <div>
                    <label class="block text-sm font-semibold text-gray-900 mb-2">
                      Additional Notes
                    </label>
                    <textarea
                      [(ngModel)]="rfqData.notes"
                      name="notes"
                      class="input-field"
                      placeholder="Tell us more about your requirements, preferences, or any special requests..."
                      rows="4"
                    ></textarea>
                  </div>
                </div>

                <div class="flex gap-4">
                  <a routerLink="/" class="flex-1 btn-ghost border border-diamond-300">
                    Cancel
                  </a>
                  <button type="submit" [disabled]="!rfqForm.valid" class="flex-1 btn-primary">
                    Submit RFQ
                  </button>
                </div>
              </form>
            </div>

            <!-- Success Message -->
            <div *ngIf="submissionSuccess()" class="card p-12 text-center">
              <div class="mb-6 inline-block">
                <div class="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center animate-scaleIn">
                  <span class="text-5xl">✓</span>
                </div>
              </div>

              <h2 class="text-3xl font-display font-bold text-diamond-900 mb-4">
                RFQ Submitted Successfully
              </h2>
              <p class="text-gray-600 mb-4">
                Thank you for your request. Our sales team will review your requirements and send you a personalized quote within 24 business hours.
              </p>
              <p class="text-sm text-gray-500 mb-8">
                RFQ Number: <span class="font-bold text-gold-600">{{ rfqNumber() }}</span>
              </p>

              <p class="text-gray-600 mb-8">
                A confirmation email has been sent to <span class="font-semibold">{{ rfqData.email }}</span>
              </p>

              <button (click)="reset()" routerLink="/" class="btn-primary">
                Return to Home
              </button>
            </div>
          </div>

          <!-- Sidebar -->
          <div class="lg:col-span-1">
            <!-- Benefits -->
            <div class="card p-8 mb-8">
              <h3 class="text-xl font-bold text-diamond-900 mb-6">Why Choose RFQ?</h3>
              <div class="space-y-4">
                <div class="flex gap-3">
                  <span class="text-gold-600 font-bold">✓</span>
                  <p class="text-sm text-gray-700">
                    Personalized quotes for bulk orders
                  </p>
                </div>
                <div class="flex gap-3">
                  <span class="text-gold-600 font-bold">✓</span>
                  <p class="text-sm text-gray-700">
                    Best price negotiation
                  </p>
                </div>
                <div class="flex gap-3">
                  <span class="text-gold-600 font-bold">✓</span>
                  <p class="text-sm text-gray-700">
                    Flexible payment terms
                  </p>
                </div>
                <div class="flex gap-3">
                  <span class="text-gold-600 font-bold">✓</span>
                  <p class="text-sm text-gray-700">
                    Priority customer support
                  </p>
                </div>
                <div class="flex gap-3">
                  <span class="text-gold-600 font-bold">✓</span>
                  <p class="text-sm text-gray-700">
                    Custom specifications available
                  </p>
                </div>
              </div>
            </div>

            <!-- Contact Info -->
            <div class="card p-8">
              <h3 class="text-xl font-bold text-diamond-900 mb-6">Need Help?</h3>
              <div class="space-y-4">
                <div>
                  <p class="text-sm text-gray-600 mb-2">Phone</p>
                  <a href="tel:+917976091951" class="text-gold-600 hover:text-gold-700 font-semibold">
                    +91 7976091951
                  </a>
                </div>
                <div>
                  <p class="text-sm text-gray-600 mb-2">Email</p>
                  <a href="mailto:sales@gemsandjewelry.com" class="text-gold-600 hover:text-gold-700 font-semibold">
                    sales@gemsandjewelry.com
                  </a>
                </div>
                <div>
                  <p class="text-sm text-gray-600 mb-2">WhatsApp</p>
                  <a href="https://wa.me/917976091951" target="_blank" rel="noopener" class="text-gold-600 hover:text-gold-700 font-semibold">
                    Chat with us
                  </a>
                </div>
              </div>
            </div>
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
export class RFQRequestComponent {
  rfqData = {
    firstName: '',
    lastName: '',
    email: '',
    companyName: '',
    phone: '',
    estimatedBudget: 0,
    deliveryTimeline: '',
    notes: '',
  };

  rfqItems = signal<RFQItem[]>([{ productId: '', quantity: 1 }]);
  submissionSuccess = signal(false);
  rfqNumber = signal('');

  constructor(private rfqService: RFQService) {}

  addItem(): void {
    this.rfqItems.update((items) => [
      ...items,
      { productId: '', quantity: 1 },
    ]);
  }

  removeItem(index: number): void {
    this.rfqItems.update((items) => items.filter((_, i) => i !== index));
  }

  submitRequest(): void {
    const request: RFQRequest = {
      userId: 'current-user',
      email: this.rfqData.email,
      companyName: this.rfqData.companyName,
      items: this.rfqItems(),
      estimatedBudget: this.rfqData.estimatedBudget || undefined,
      deliveryTimeline: this.rfqData.deliveryTimeline || undefined,
      additionalNotes: this.rfqData.notes || undefined,
    };

    this.rfqService.createRequest(request).subscribe({
      next: (response) => {
        this.rfqNumber.set(response.rfqNumber || 'RFQ-' + new Date().getTime());
        this.submissionSuccess.set(true);
      },
      error: (error) => {
        console.error('Error submitting RFQ:', error);
        alert('Error submitting RFQ. Please try again.');
      },
    });
  }

  reset(): void {
    this.rfqData = {
      firstName: '',
      lastName: '',
      email: '',
      companyName: '',
      phone: '',
      estimatedBudget: 0,
      deliveryTimeline: '',
      notes: '',
    };
    this.rfqItems.set([{ productId: '', quantity: 1 }]);
    this.submissionSuccess.set(false);
    this.rfqNumber.set('');
  }
}
