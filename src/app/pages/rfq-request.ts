import { Component, signal, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { RFQService, RFQRequest, RFQItem } from "../services/rfq.service";
import { ToastService } from "../services/toast.service";
import { environment } from "../../environments/environment";

@Component({
  selector: "app-rfq-request",
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <!-- APPLE DESIGN SYSTEM: REQUEST FOR QUOTE (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">
      <!-- Parchment Header -->
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-16 px-6">
        <div class="max-w-[1080px] mx-auto">
          <!-- Breadcrumb -->
          <nav aria-label="Breadcrumb" class="flex items-center gap-2 text-xs text-[#6e6e73] mb-6">
            <a routerLink="/" class="text-[#D4AF37] hover:underline">Home</a>
            <span>/</span>
            <span class="text-[#1d1d1f]">Request for Quote</span>
          </nav>

          <span class="text-xs uppercase tracking-[0.2em] font-semibold text-[#D4AF37] mb-3 block">Trade &amp; Bulk Orders</span>
          <h1 class="font-display font-semibold text-4xl md:text-5xl text-[#1d1d1f] tracking-tight">
            Request for Quote
          </h1>
          <p class="text-base text-[#7a7a7a] mt-4 max-w-xl">
            For bulk orders and B2B inquiries, get personalized quotes from our
            team
          </p>
        </div>
      </section>

      <div class="max-w-[1080px] mx-auto px-6 py-12">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <!-- Form -->
          <div class="lg:col-span-2">
            <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8 md:p-10" *ngIf="!submissionSuccess()">
              <form
                (ngSubmit)="submitRequest()"
                #rfqForm="ngForm"
                class="space-y-8"
              >
                <!-- Contact Information -->
                <div class="border-b border-[#e0e0e0] pb-8">
                  <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">
                    Contact Information
                  </h2>

                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label
                        for="rfq-firstName"
                        class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2"
                      >
                        First Name
                      </label>
                      <input
                        id="rfq-firstName"
                        type="text"
                        [(ngModel)]="rfqData.firstName"
                        name="firstName"
                        required
                        class="input-field"
                        placeholder="John"
                      />
                    </div>
                    <div>
                      <label
                        for="rfq-lastName"
                        class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2"
                      >
                        Last Name
                      </label>
                      <input
                        id="rfq-lastName"
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
                    <label
                      for="rfq-email"
                      class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2"
                    >
                      Email Address
                    </label>
                    <input
                      id="rfq-email"
                      type="email"
                      [(ngModel)]="rfqData.email"
                      name="email"
                      required
                      class="input-field"
                      placeholder="john@example.com"
                    />
                  </div>

                  <div class="mt-6">
                    <label
                      for="rfq-companyName"
                      class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2"
                    >
                      Company Name
                    </label>
                    <input
                      id="rfq-companyName"
                      type="text"
                      [(ngModel)]="rfqData.companyName"
                      name="companyName"
                      required
                      class="input-field"
                      placeholder="Your Company"
                    />
                  </div>

                  <div class="mt-6">
                    <label
                      for="rfq-phone"
                      class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2"
                    >
                      Phone Number
                    </label>
                    <input
                      id="rfq-phone"
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
                <div class="border-b border-[#e0e0e0] pb-8">
                  <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">
                    Product Information
                  </h2>

                  <div class="space-y-4 mb-6">
                    <ng-container
                      *ngFor="let item of rfqItems(); let i = index"
                    >
                      <div
                        class="bg-[#fafafc] border border-[#e0e0e0] rounded-[12px] p-5 space-y-4"
                      >
                        <div class="flex justify-between items-center">
                          <span class="text-sm font-semibold text-[#1d1d1f]"
                            >Item {{ i + 1 }}</span
                          >
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
                            <label
                              [attr.for]="'rfq-productId-' + i"
                              class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2"
                            >
                              Product Category
                            </label>
                            <select
                              [id]="'rfq-productId-' + i"
                              [(ngModel)]="item.productId"
                              [name]="'productId_' + i"
                              required
                              class="input-field"
                            >
                              <option value="">
                                Select a product category
                              </option>
                              <option value="engagement-rings">
                                Engagement Rings
                              </option>
                              <option value="loose-gemstones">
                                Loose Gemstones
                              </option>
                              <option value="spiritual-idols">
                                Spiritual Idols
                              </option>
                              <option value="gemstone-jewelry">
                                Gemstone Jewelry
                              </option>
                              <option value="precious-metals">
                                Precious Metals
                              </option>
                              <option value="custom">Custom Designs</option>
                            </select>
                          </div>
                          <div>
                            <label
                              [attr.for]="'rfq-quantity-' + i"
                              class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2"
                            >
                              Quantity
                            </label>
                            <input
                              [id]="'rfq-quantity-' + i"
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
                          <label
                            [attr.for]="'rfq-specs-' + i"
                            class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2"
                          >
                            Specifications (Optional)
                          </label>
                          <textarea
                            [id]="'rfq-specs-' + i"
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
                    class="btn-outline text-sm !py-2.5 !px-5"
                  >
                    + Add Another Item
                  </button>
                </div>

                <!-- Additional Information -->
                <div class="border-b border-[#e0e0e0] pb-8">
                  <h2 class="font-display font-semibold text-2xl text-[#1d1d1f] mb-6">
                    Additional Information
                  </h2>

                  <div class="mb-6">
                    <label
                      for="rfq-budget"
                      class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2"
                    >
                      Estimated Budget (Optional)
                    </label>
                    <div class="flex items-center gap-3">
                      <span class="text-[#6e6e73] font-semibold">$</span>
                      <input
                        id="rfq-budget"
                        type="number"
                        [(ngModel)]="rfqData.estimatedBudget"
                        name="budget"
                        class="flex-1 input-field"
                        placeholder="50000"
                      />
                    </div>
                  </div>

                  <div class="mb-6">
                    <label
                      for="rfq-timeline"
                      class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2"
                    >
                      Delivery Timeline
                    </label>
                    <select
                      id="rfq-timeline"
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
                    <label
                      for="rfq-notes"
                      class="block text-xs font-semibold text-[#1d1d1f] uppercase tracking-wider mb-2"
                    >
                      Additional Notes
                    </label>
                    <textarea
                      id="rfq-notes"
                      [(ngModel)]="rfqData.notes"
                      name="notes"
                      class="input-field"
                      placeholder="Tell us more about your requirements, preferences, or any special requests..."
                      rows="4"
                    ></textarea>
                  </div>
                </div>

                <div class="flex flex-col sm:flex-row gap-4">
                  <a
                    routerLink="/"
                    class="flex-1 btn-outline"
                  >
                    Cancel
                  </a>
                  <button
                    type="submit"
                    [disabled]="!rfqForm.valid"
                    class="flex-1 btn-apple-pill"
                  >
                    Submit RFQ
                  </button>
                </div>
              </form>
            </div>

            <!-- Success Message -->
            <div *ngIf="submissionSuccess()" class="bg-white border border-[#e0e0e0] rounded-[18px] p-12 text-center">
              <div class="mb-6 inline-block">
                <div
                  class="w-24 h-24 rounded-full bg-green-50 text-green-600 flex items-center justify-center animate-scaleUp"
                >
                  <span class="text-5xl">✓</span>
                </div>
              </div>

              <h2 class="font-display font-semibold text-3xl text-[#1d1d1f] tracking-tight mb-4">
                RFQ Submitted Successfully
              </h2>
              <p class="text-[#6e6e73] mb-4">
                Thank you for your request. Our sales team will review your
                requirements and send you a personalized quote within 24
                business hours.
              </p>
              <p class="text-sm text-[#6e6e73] mb-8">
                RFQ Number:
                <span class="font-semibold text-[#D4AF37]">{{ rfqNumber() }}</span>
              </p>

              <p class="text-[#6e6e73] mb-8">
                A confirmation email has been sent to
                <span class="font-semibold text-[#1d1d1f]">{{ rfqData.email }}</span>
              </p>

              <button (click)="reset()" routerLink="/" class="btn-apple-pill">
                Return to Home
              </button>
            </div>
          </div>

          <!-- Sidebar -->
          <div class="lg:col-span-1 space-y-6">
            <!-- Benefits -->
            <div class="bg-[#fafafc] border border-[#e0e0e0] rounded-[18px] p-8">
              <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] mb-6">
                Why Choose RFQ?
              </h3>
              <div class="space-y-4">
                <div class="flex gap-3">
                  <span class="text-[#D4AF37] font-semibold">✓</span>
                  <p class="text-sm text-[#6e6e73]">
                    Personalized quotes for bulk orders
                  </p>
                </div>
                <div class="flex gap-3">
                  <span class="text-[#D4AF37] font-semibold">✓</span>
                  <p class="text-sm text-[#6e6e73]">Best price negotiation</p>
                </div>
                <div class="flex gap-3">
                  <span class="text-[#D4AF37] font-semibold">✓</span>
                  <p class="text-sm text-[#6e6e73]">Flexible payment terms</p>
                </div>
                <div class="flex gap-3">
                  <span class="text-[#D4AF37] font-semibold">✓</span>
                  <p class="text-sm text-[#6e6e73]">Priority customer support</p>
                </div>
                <div class="flex gap-3">
                  <span class="text-[#D4AF37] font-semibold">✓</span>
                  <p class="text-sm text-[#6e6e73]">
                    Custom specifications available
                  </p>
                </div>
              </div>
            </div>

            <!-- Contact Info -->
            <div class="bg-white border border-[#e0e0e0] rounded-[18px] p-8">
              <h3 class="font-sans font-semibold text-lg text-[#1d1d1f] mb-6">
                Need Help?
              </h3>
              <div class="space-y-4">
                <div>
                  <p class="text-xs uppercase tracking-wider text-[#7a7a7a] mb-1">Phone</p>
                  <a
                    [href]="'tel:+' + env.whatsappNumber"
                    class="text-[#D4AF37] hover:underline font-semibold"
                  >
                    +{{env.whatsappNumber}}
                  </a>
                </div>
                <div>
                  <p class="text-xs uppercase tracking-wider text-[#7a7a7a] mb-1">Email</p>
                  <a
                    href="mailto:sales@gemsandjewelry.com"
                    class="text-[#D4AF37] hover:underline font-semibold"
                  >
                    sales@gemsandjewelry.com
                  </a>
                </div>
                <div>
                  <p class="text-xs uppercase tracking-wider text-[#7a7a7a] mb-1">WhatsApp</p>
                  <a
                    [href]="'https://wa.me/' + env.whatsappNumber"
                    target="_blank"
                    rel="noopener"
                    class="text-[#D4AF37] hover:underline font-semibold"
                  >
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
})
export class RFQRequestComponent {
  env = environment;
  rfqData = {
    firstName: "",
    lastName: "",
    email: "",
    companyName: "",
    phone: "",
    estimatedBudget: 0,
    deliveryTimeline: "",
    notes: "",
  };

  rfqItems = signal<RFQItem[]>([{ productId: "", quantity: 1 }]);
  submissionSuccess = signal(false);
  rfqNumber = signal("");

  private toastService = inject(ToastService);

  constructor(private rfqService: RFQService) {}

  addItem(): void {
    this.rfqItems.update((items) => [...items, { productId: "", quantity: 1 }]);
  }

  removeItem(index: number): void {
    this.rfqItems.update((items) => items.filter((_, i) => i !== index));
  }

  submitRequest(): void {
    // Append contact info to notes if it exists, as backend might not have specific fields
    const contactInfo = `Contact: ${this.rfqData.firstName} ${this.rfqData.lastName}, Phone: ${this.rfqData.phone}`;
    const fullNotes = this.rfqData.notes ? `${this.rfqData.notes}\n\n${contactInfo}` : contactInfo;

    const request: RFQRequest = {
      userId: "current-user",
      email: this.rfqData.email,
      companyName: this.rfqData.companyName,
      items: this.rfqItems(),
      estimatedBudget: this.rfqData.estimatedBudget || undefined,
      deliveryTimeline: this.rfqData.deliveryTimeline || undefined,
      additionalNotes: fullNotes,
    };

    this.rfqService.createRequest(request).subscribe({
      next: (response) => {
        this.rfqNumber.set(response.rfqNumber || "RFQ-" + new Date().getTime());
        this.submissionSuccess.set(true);
        this.toastService.show('RFQ submitted successfully', 'success');
      },
      error: () => {
        this.toastService.show("Error submitting RFQ. Please try again.", 'error');
      },
    });
  }

  reset(): void {
    this.rfqData = {
      firstName: "",
      lastName: "",
      email: "",
      companyName: "",
      phone: "",
      estimatedBudget: 0,
      deliveryTimeline: "",
      notes: "",
    };
    this.rfqItems.set([{ productId: "", quantity: 1 }]);
    this.submissionSuccess.set(false);
    this.rfqNumber.set("");
  }
}
