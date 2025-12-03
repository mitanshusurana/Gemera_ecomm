import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface ContactForm {
  name: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-white">
      <!-- Hero Section -->
      <div class="bg-gradient-to-r from-gold-500 to-gold-600 text-white section-padding">
        <div class="container-luxury text-center">
          <h1 class="text-5xl md:text-6xl font-display font-bold mb-4">Get in Touch</h1>
          <p class="text-xl text-gold-100 max-w-2xl mx-auto">
            We'd love to hear from you. Reach out with any questions or inquiries.
          </p>
        </div>
      </div>

      <!-- Contact Section -->
      <section class="container-luxury section-padding">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-16">
          <!-- Contact Info Card 1 -->
          <div class="card p-8 text-center">
            <div class="text-5xl mb-4">📍</div>
            <h3 class="font-semibold text-gray-900 mb-2 text-lg">Visit Us</h3>
            <p class="text-gray-600 mb-2">123 Jewel Street</p>
            <p class="text-gray-600 mb-2">New York, NY 10001</p>
            <p class="text-gray-600">United States</p>
          </div>

          <!-- Contact Info Card 2 -->
          <div class="card p-8 text-center">
            <div class="text-5xl mb-4">📞</div>
            <h3 class="font-semibold text-gray-900 mb-2 text-lg">Call Us</h3>
            <p class="text-gray-600 mb-2">+1 (555) 123-4567</p>
            <p class="text-gray-600 mb-2">+91 7976091951 (India)</p>
            <p class="text-gray-500 text-sm">Available 24/7</p>
          </div>

          <!-- Contact Info Card 3 -->
          <div class="card p-8 text-center">
            <div class="text-5xl mb-4">✉️</div>
            <h3 class="font-semibold text-gray-900 mb-2 text-lg">Email Us</h3>
            <p class="text-gray-600 mb-2">support@gemara.com</p>
            <p class="text-gray-600 mb-2">sales@gemara.com</p>
            <p class="text-gray-500 text-sm">We'll reply within 24 hours</p>
          </div>
        </div>

        <!-- Contact Form -->
        <div class="max-w-2xl mx-auto">
          <div class="card p-8 lg:p-12">
            <h2 class="text-3xl font-display font-bold text-diamond-900 mb-8">Send us a Message</h2>

            <!-- Success Message -->
            <div
              *ngIf="formSubmitted()"
              class="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg"
            >
              <p class="text-green-800 font-semibold">
                ✓ Thank you! Your message has been sent successfully.
              </p>
              <p class="text-green-700 text-sm mt-1">
                We'll get back to you within 24 hours.
              </p>
            </div>

            <form (ngSubmit)="submitForm()" *ngIf="!formSubmitted()">
              <!-- Name -->
              <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                <input
                  type="text"
                  [(ngModel)]="contactForm.name"
                  name="name"
                  required
                  placeholder="John Doe"
                  class="input-field"
                />
              </div>

              <!-- Email -->
              <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                <input
                  type="email"
                  [(ngModel)]="contactForm.email"
                  name="email"
                  required
                  placeholder="john@example.com"
                  class="input-field"
                />
              </div>

              <!-- Phone -->
              <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                <input
                  type="tel"
                  [(ngModel)]="contactForm.phone"
                  name="phone"
                  placeholder="+1 (555) 123-4567"
                  class="input-field"
                />
              </div>

              <!-- Subject -->
              <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">Subject *</label>
                <select
                  [(ngModel)]="contactForm.subject"
                  name="subject"
                  required
                  class="input-field"
                >
                  <option value="">Select a subject...</option>
                  <option value="inquiry">Product Inquiry</option>
                  <option value="custom">Custom Design Request</option>
                  <option value="bulk">Bulk Order</option>
                  <option value="partnership">Partnership Opportunity</option>
                  <option value="complaint">Complaint/Feedback</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <!-- Message -->
              <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">Message *</label>
                <textarea
                  [(ngModel)]="contactForm.message"
                  name="message"
                  required
                  rows="6"
                  placeholder="Tell us how we can help you..."
                  class="input-field resize-none"
                ></textarea>
              </div>

              <!-- Submit Button -->
              <button type="submit" class="w-full btn-primary text-lg py-4">
                Send Message
              </button>

              <!-- Required Fields Note -->
              <p class="text-xs text-gray-500 mt-4">* Required fields</p>
            </form>
          </div>
        </div>
      </section>

      <!-- Additional Contact Methods -->
      <section class="bg-diamond-50 section-padding">
        <div class="container-luxury">
          <h2 class="text-3xl font-display font-bold text-diamond-900 mb-12 text-center">Other Ways to Connect</h2>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <!-- WhatsApp -->
            <a
              href="https://wa.me/917976091951?text=Hello%20Gemara"
              target="_blank"
              rel="noopener noreferrer"
              class="card p-6 text-center hover:shadow-lg transition-all duration-300 group"
            >
              <div class="text-5xl mb-4 group-hover:scale-110 transition-transform">💬</div>
              <h3 class="font-semibold text-gray-900 mb-2">WhatsApp</h3>
              <p class="text-gray-600 text-sm">Quick message on WhatsApp for instant support</p>
            </a>

            <!-- Live Chat -->
            <div class="card p-6 text-center hover:shadow-lg transition-all duration-300 group cursor-pointer">
              <div class="text-5xl mb-4 group-hover:scale-110 transition-transform">💬</div>
              <h3 class="font-semibold text-gray-900 mb-2">Live Chat</h3>
              <p class="text-gray-600 text-sm">Chat with our team in real-time during business hours</p>
            </div>

            <!-- Social Media -->
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noopener noreferrer"
              class="card p-6 text-center hover:shadow-lg transition-all duration-300 group"
            >
              <div class="text-5xl mb-4 group-hover:scale-110 transition-transform">📸</div>
              <h3 class="font-semibold text-gray-900 mb-2">Instagram</h3>
              <p class="text-gray-600 text-sm">Follow us for the latest collections and inspirations</p>
            </a>

            <!-- Video Call -->
            <div class="card p-6 text-center hover:shadow-lg transition-all duration-300 group cursor-pointer">
              <div class="text-5xl mb-4 group-hover:scale-110 transition-transform">📹</div>
              <h3 class="font-semibold text-gray-900 mb-2">Video Consultation</h3>
              <p class="text-gray-600 text-sm">Book a personal video consultation with our experts</p>
            </div>
          </div>
        </div>
      </section>

      <!-- FAQ Section -->
      <section class="container-luxury section-padding">
        <h2 class="text-3xl font-display font-bold text-diamond-900 mb-12 text-center">Frequently Asked Questions</h2>

        <div class="max-w-2xl mx-auto space-y-4">
          <!-- FAQ 1 -->
          <div class="card p-6">
            <h3 class="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span class="text-gold-600">Q:</span>
              How long does shipping take?
            </h3>
            <p class="text-gray-600 ml-6">
              Standard shipping takes 5-7 business days. Express shipping (1-2 days) is available for orders over $5,000.
            </p>
          </div>

          <!-- FAQ 2 -->
          <div class="card p-6">
            <h3 class="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span class="text-gold-600">Q:</span>
              Are your gemstones certified?
            </h3>
            <p class="text-gray-600 ml-6">
              Yes, all gemstones over 0.5 carats come with official certification from GIA, IGI, or AGS.
            </p>
          </div>

          <!-- FAQ 3 -->
          <div class="card p-6">
            <h3 class="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span class="text-gold-600">Q:</span>
              Do you offer custom designs?
            </h3>
            <p class="text-gray-600 ml-6">
              Absolutely! We offer bespoke design services. Contact our design team to bring your vision to life.
            </p>
          </div>

          <!-- FAQ 4 -->
          <div class="card p-6">
            <h3 class="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <span class="text-gold-600">Q:</span>
              What's your return policy?
            </h3>
            <p class="text-gray-600 ml-6">
              We offer a 30-day money-back guarantee. Items must be in original condition and packaging.
            </p>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class ContactComponent {
  contactForm: ContactForm = {
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
  };

  formSubmitted = signal(false);

  submitForm(): void {
    if (this.validateForm()) {
      console.log('Form submitted:', this.contactForm);
      // In a real app, this would send to a backend
      this.formSubmitted.set(true);
      this.resetForm();

      // Hide success message after 5 seconds
      setTimeout(() => {
        this.formSubmitted.set(false);
      }, 5000);
    }
  }

  validateForm(): boolean {
    if (
      !this.contactForm.name ||
      !this.contactForm.email ||
      !this.contactForm.subject ||
      !this.contactForm.message
    ) {
      alert('Please fill in all required fields');
      return false;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.contactForm.email)) {
      alert('Please enter a valid email address');
      return false;
    }

    return true;
  }

  resetForm(): void {
    this.contactForm = {
      name: '',
      email: '',
      phone: '',
      subject: '',
      message: '',
    };
  }
}
