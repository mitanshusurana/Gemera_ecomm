import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-white">
      <div class="bg-diamond-50 py-12 md:py-20">
        <div class="container-luxury text-center">
          <h1 class="text-4xl md:text-6xl font-display font-bold text-diamond-900 mb-6">Contact Us</h1>
          <p class="text-xl text-gray-600 max-w-2xl mx-auto">We are here to assist you with any questions or inquiries.</p>
        </div>
      </div>

      <div class="container-luxury section-padding">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
                <h2 class="text-2xl font-display font-bold text-diamond-900 mb-6">Get in Touch</h2>
                <form class="space-y-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
                        <input type="text" class="input-field" placeholder="Your Name">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input type="email" class="input-field" placeholder="your@email.com">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                        <input type="text" class="input-field" placeholder="Inquiry about...">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-1">Message</label>
                        <textarea rows="5" class="input-field" placeholder="How can we help you?"></textarea>
                    </div>
                    <button type="button" class="btn-primary w-full">Send Message</button>
                </form>
            </div>

            <div class="bg-diamond-50 p-8 rounded-xl h-fit">
                <h2 class="text-2xl font-display font-bold text-diamond-900 mb-6">Contact Information</h2>
                <div class="space-y-6">
                    <div class="flex items-start gap-4">
                        <div class="text-gold-500 text-xl">📍</div>
                        <div>
                            <h3 class="font-bold text-gray-900">Visit Our Showroom</h3>
                            <p class="text-gray-600">123 Luxury Lane, Jewelry District<br>New York, NY 10001</p>
                        </div>
                    </div>
                    <div class="flex items-start gap-4">
                        <div class="text-gold-500 text-xl">📞</div>
                        <div>
                            <h3 class="font-bold text-gray-900">Phone</h3>
                            <p class="text-gray-600">+1 (800) 123-4567</p>
                            <p class="text-sm text-gray-500">Mon-Fri, 9am - 6pm EST</p>
                        </div>
                    </div>
                    <div class="flex items-start gap-4">
                        <div class="text-gold-500 text-xl">✉️</div>
                        <div>
                            <h3 class="font-bold text-gray-900">Email</h3>
                            <p class="text-gray-600">concierge@gemara.com</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  `,
})
export class ContactComponent {}
