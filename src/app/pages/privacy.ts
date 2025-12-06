import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-white">
      <div class="container-luxury section-padding">
        <h1 class="text-4xl font-display font-bold text-diamond-900 mb-8">Privacy Policy</h1>
        <div class="prose max-w-none text-gray-700">
            <p>Last updated: October 26, 2023</p>
            <p>At Gemara, we take your privacy seriously. This Privacy Policy describes how your personal information is collected, used, and shared when you visit or make a purchase from our website.</p>

            <h3>1. Personal Information We Collect</h3>
            <p>When you visit the Site, we automatically collect certain information about your device, including information about your web browser, IP address, time zone, and some of the cookies that are installed on your device.</p>

            <h3>2. How We Use Your Personal Information</h3>
            <p>We use the Order Information that we collect generally to fulfill any orders placed through the Site (including processing your payment information, arranging for shipping, and providing you with invoices and/or order confirmations).</p>

            <h3>3. Sharing Your Personal Information</h3>
            <p>We share your Personal Information with third parties to help us use your Personal Information, as described above. For example, we use Google Analytics to help us understand how our customers use the Site.</p>

            <h3>4. Your Rights</h3>
            <p>If you are a European resident, you have the right to access personal information we hold about you and to ask that your personal information be corrected, updated, or deleted.</p>
        </div>
      </div>
    </div>
  `,
})
export class PrivacyPolicyComponent {}
