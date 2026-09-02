import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SettingService } from '../services/setting.service';
import { SeoService } from '../services/seo.service';

/**
 * Returns, shipping and cancellation policy.
 *
 * These pages did not exist, while the storefront promised "30-Day Returns"
 * and a "Lifetime Warranty" in six places and emitted a MerchantReturnPolicy
 * in structured data. The Consumer Protection (E-Commerce) Rules 2020 require
 * published return, refund, exchange and warranty terms.
 *
 * The text is content the business owns, so it is read from settings rather
 * than invented here. Where a policy has not been published, the page says so
 * plainly instead of showing placeholder terms that read as real ones.
 */
@Component({
  selector: 'app-policies',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="max-w-3xl mx-auto px-6 py-16">
      <h1 class="font-display text-4xl text-[#1d1d1f] mb-2">
        Shipping, Returns &amp; Cancellations
      </h1>
      <p class="text-sm text-[#7a7a7a] mb-10" *ngIf="lastUpdated()">
        Last updated: {{ lastUpdated() }}
      </p>

      <section class="mb-12" id="returns">
        <h2 class="font-display text-2xl text-[#1d1d1f] mb-3">Returns &amp; refunds</h2>

        <p *ngIf="returnDays() as days" class="text-[#1d1d1f] mb-4">
          You may return an eligible item within
          <strong>{{ days }} days</strong> of delivery.
        </p>

        <div
          *ngIf="returnsText(); else returnsMissing"
          class="prose prose-sm max-w-none text-[#1d1d1f]"
          [innerText]="returnsText()"
        ></div>

        <ng-template #returnsMissing>
          <div class="border border-amber-300 bg-amber-50 rounded-lg p-4">
            <p class="text-sm text-amber-900 font-semibold mb-1">
              This policy has not been published yet.
            </p>
            <p class="text-sm text-amber-900">
              Please
              <a routerLink="/contact" class="underline">contact us</a>
              before returning an item, and we will confirm the terms that apply
              to your order in writing.
            </p>
          </div>
        </ng-template>
      </section>

      <section class="mb-12" id="shipping">
        <h2 class="font-display text-2xl text-[#1d1d1f] mb-3">Shipping</h2>
        <div
          *ngIf="shippingText(); else shippingMissing"
          class="prose prose-sm max-w-none text-[#1d1d1f]"
          [innerText]="shippingText()"
        ></div>
        <ng-template #shippingMissing>
          <p class="text-sm text-[#7a7a7a]">
            Shipping terms have not been published yet.
            <a routerLink="/contact" class="underline">Contact us</a> for
            delivery timelines and charges on your order.
          </p>
        </ng-template>
      </section>

      <section class="mb-12" id="cancellation">
        <h2 class="font-display text-2xl text-[#1d1d1f] mb-3">Cancellations</h2>
        <div
          *ngIf="cancellationText(); else cancellationMissing"
          class="prose prose-sm max-w-none text-[#1d1d1f]"
          [innerText]="cancellationText()"
        ></div>
        <ng-template #cancellationMissing>
          <p class="text-sm text-[#7a7a7a]">
            Cancellation terms have not been published yet.
            <a routerLink="/contact" class="underline">Contact us</a> as soon as
            possible if you need to cancel an order.
          </p>
        </ng-template>
      </section>

      <section class="mb-12" id="warranty" *ngIf="warrantyText()">
        <h2 class="font-display text-2xl text-[#1d1d1f] mb-3">Warranty</h2>
        <div
          class="prose prose-sm max-w-none text-[#1d1d1f]"
          [innerText]="warrantyText()"
        ></div>
      </section>

      <section class="border-t border-[#e0e0e0] pt-8">
        <h2 class="font-display text-xl text-[#1d1d1f] mb-2">Grievance officer</h2>
        <p class="text-sm text-[#1d1d1f]" *ngIf="grievanceOfficer(); else noOfficer">
          {{ grievanceOfficer() }}
          <span *ngIf="grievanceEmail()"> &middot; {{ grievanceEmail() }}</span>
        </p>
        <ng-template #noOfficer>
          <p class="text-sm text-[#7a7a7a]">
            A grievance officer must be named here under the IT Rules 2021 and
            the Consumer Protection (E-Commerce) Rules 2020. Set
            <code>grievanceOfficerName</code> and
            <code>grievanceOfficerEmail</code> in admin settings.
          </p>
        </ng-template>
      </section>
    </div>
  `,
})
export class PoliciesComponent implements OnInit {
  private settingService = inject(SettingService);
  private seo = inject(SeoService);

  private settings = signal<Record<string, string>>({});

  returnDays = computed(() => {
    const raw = this.settings()['returnPolicyDays'];
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  });

  returnsText = computed(() => this.settings()['returnPolicyText'] || '');
  shippingText = computed(() => this.settings()['shippingPolicyText'] || '');
  cancellationText = computed(() => this.settings()['cancellationPolicyText'] || '');
  warrantyText = computed(() => this.settings()['warrantyPolicyText'] || '');
  grievanceOfficer = computed(() => this.settings()['grievanceOfficerName'] || '');
  grievanceEmail = computed(() => this.settings()['grievanceOfficerEmail'] || '');
  lastUpdated = computed(() => this.settings()['policiesLastUpdated'] || '');

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Shipping, Returns & Cancellations | Caratloop',
      description:
        'Our shipping, returns, refund and cancellation terms, and how to reach our grievance officer.',
      url: 'https://www.caratloop.com/returns',
    });

    this.settingService.getSettings().subscribe((s) => this.settings.set(s || {}));
  }
}
