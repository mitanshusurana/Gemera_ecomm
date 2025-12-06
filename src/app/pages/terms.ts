import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-white">
      <div class="container-luxury section-padding">
        <h1 class="text-4xl font-display font-bold text-diamond-900 mb-8">Terms & Conditions</h1>
        <div class="prose max-w-none text-gray-700">
            <p>Welcome to Gemara. By accessing or using our website, you agree to be bound by these Terms and Conditions.</p>

            <h3>1. General Conditions</h3>
            <p>We reserve the right to refuse service to anyone for any reason at any time. You understand that your content (not including credit card information), may be transferred unencrypted and involve transmissions over various networks.</p>

            <h3>2. Products and Services</h3>
            <p>Certain products or services may be available exclusively online through the website. These products or services may have limited quantities and are subject to return or exchange only according to our Return Policy.</p>

            <h3>3. Pricing</h3>
            <p>Prices for our products are subject to change without notice. We reserve the right at any time to modify or discontinue the Service (or any part or content thereof) without notice at any time.</p>

            <h3>4. Accuracy of Billing and Account Information</h3>
            <p>We reserve the right to refuse any order you place with us. We may, in our sole discretion, limit or cancel quantities purchased per person, per household or per order.</p>
        </div>
      </div>
    </div>
  `,
})
export class TermsComponent {}
