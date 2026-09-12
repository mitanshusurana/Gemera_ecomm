import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- APPLE DESIGN SYSTEM: LEGAL READING PAGE (DESIGN.md) -->
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f]">
      <div class="max-w-3xl mx-auto px-6 py-16">
        <h1 class="font-display font-semibold text-4xl md:text-5xl text-[#1d1d1f] tracking-tight mb-10">Terms & Conditions</h1>
        <div class="prose prose-neutral max-w-none text-[#1d1d1f] prose-p:text-[#1d1d1f] prose-li:text-[#1d1d1f] prose-strong:text-[#1d1d1f] prose-code:text-[#1d1d1f] prose-headings:font-display prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-[#1d1d1f] prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-3 prose-h3:text-xl prose-a:text-[#D4AF37] prose-a:no-underline hover:prose-a:underline">
            <p>Welcome to Caratloop. By accessing or using our website, you agree to be bound by these Terms and Conditions.</p>

            <h2>1. General Conditions</h2>
            <p>We reserve the right to refuse service to anyone for any reason at any time. You understand that your content (not including credit card information), may be transferred unencrypted and involve transmissions over various networks.</p>

            <h2>2. Products and Services</h2>
            <p>Certain products or services may be available exclusively online through the website. These products or services may have limited quantities and are subject to return or exchange only according to our Return Policy.</p>

            <h2>3. Pricing</h2>
            <p>Prices for our products are subject to change without notice. We reserve the right at any time to modify or discontinue the Service (or any part or content thereof) without notice at any time.</p>

            <h2>4. Accuracy of Billing and Account Information</h2>
            <p>We reserve the right to refuse any order you place with us. We may, in our sole discretion, limit or cancel quantities purchased per person, per household or per order.</p>
        </div>
      </div>
    </div>
  `,
})
export class TermsComponent {}
