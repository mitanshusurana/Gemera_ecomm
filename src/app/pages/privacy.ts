import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SettingService } from '../services/setting.service';
import { SeoService } from '../services/seo.service';

/**
 * Privacy notice, written for the Digital Personal Data Protection Act 2023.
 *
 * The previous page was a five-paragraph Shopify-style template last updated in
 * October 2023, addressed to "European residents", and it declared Google
 * Analytics use that does not exist. For an India-based merchant it omitted
 * every DPDP requirement: the Data Fiduciary's identity, the purpose and legal
 * basis, retention, Data Principal rights, and a Grievance Officer -- the last
 * also independently mandatory under the IT Rules 2021.
 *
 * Identity and contact details come from settings rather than being hardcoded,
 * and where the business has not supplied them the page says so instead of
 * printing a plausible-looking placeholder.
 */
@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-surface">
      <div class="container-luxury section-padding max-w-3xl">
        <h1 class="text-4xl font-display font-bold text-diamond-900 mb-2">
          Privacy Notice
        </h1>
        <p class="text-sm text-ink/70 mb-10">
          Issued under the Digital Personal Data Protection Act, 2023.
          <span *ngIf="lastUpdated()"> Last updated: {{ lastUpdated() }}.</span>
        </p>

        <div class="prose max-w-none text-ink">
          <h3>1. Who processes your data</h3>
          <p>
            <ng-container *ngIf="fiduciary(); else noFiduciary">
              <strong>{{ fiduciary() }}</strong> is the Data Fiduciary for the
              personal data described here.
            </ng-container>
            <ng-template #noFiduciary>
              <span class="text-amber-700">
                The registered entity name has not been configured. Set
                <code>legalEntityName</code> in admin settings.
              </span>
            </ng-template>
            <span *ngIf="address()"><br />{{ address() }}</span>
          </p>

          <h3>2. What we collect, and why</h3>
          <p>We collect only what a purchase or enquiry requires:</p>
          <ul>
            <li>
              <strong>Name, email, phone and delivery address</strong> &mdash;
              to process, deliver and support your order, and to create the
              account an order requires.
            </li>
            <li>
              <strong>Order and payment references</strong> &mdash; to take
              payment and handle refunds. Card details are entered on the
              payment provider's own page and never reach our servers.
            </li>
            <li>
              <strong>Enquiries you send us</strong> &mdash; to reply to you.
            </li>
            <li>
              <strong>Region, if you consent</strong> &mdash; to display prices
              in your currency. This shares your IP address with a third-party
              lookup service, and it is off unless you accept.
            </li>
          </ul>
          <p>
            We do not sell your data, and we do not use it for automated
            decision-making or profiling.
          </p>

          <h3>3. On what basis</h3>
          <p>
            For an order, processing is necessary to perform the contract you
            have entered into. For marketing email and for region detection, the
            basis is your consent, which you may withdraw at any time &mdash;
            withdrawal is as easy as giving it, and does not affect anything
            already done lawfully.
          </p>

          <h3>4. How long we keep it</h3>
          <p>
            Order and invoice records are retained for eight years, as required
            by tax and companies legislation. Enquiries and marketing consents
            are kept until you ask us to erase them or withdraw consent.
          </p>

          <h3>5. Your rights</h3>
          <p>As a Data Principal you may:</p>
          <ul>
            <li>ask what personal data we hold about you and how it is used;</li>
            <li>have inaccurate or incomplete data corrected;</li>
            <li>
              have data erased, except where we must retain it to meet a legal
              obligation;
            </li>
            <li>nominate someone to exercise these rights if you cannot;</li>
            <li>
              raise a grievance with us, and escalate to the Data Protection
              Board of India if you are not satisfied with our response.
            </li>
          </ul>
          <p>
            To exercise any of these, contact the Grievance Officer below or
            use our <a routerLink="/contact">contact page</a>.
          </p>

          <h3>6. Sharing</h3>
          <p>
            We share data only with the providers needed to deliver your order
            &mdash; the payment gateway, the courier, and our email provider
            &mdash; and only what each of them needs. We do not transfer
            personal data outside India except where a service we rely on
            operates internationally, and never to a territory restricted by
            the Central Government.
          </p>

          <h3>7. Security</h3>
          <p>
            Access to customer data is restricted to staff who need it, and
            changes to records are logged. If a breach occurs we will notify the
            Data Protection Board and affected individuals as the Act requires.
          </p>

          <h3>8. Grievance Officer</h3>
          <p *ngIf="officerName(); else noOfficer">
            {{ officerName() }}<br />
            <span *ngIf="officerEmail()">{{ officerEmail() }}<br /></span>
            <span *ngIf="officerPhone()">{{ officerPhone() }}</span>
          </p>
          <ng-template #noOfficer>
            <p class="text-amber-700">
              A Grievance Officer must be named here. This is mandatory under
              the DPDP Act 2023 and the IT Rules 2021. Set
              <code>grievanceOfficerName</code>,
              <code>grievanceOfficerEmail</code> and
              <code>grievanceOfficerPhone</code> in admin settings.
            </p>
          </ng-template>
        </div>
      </div>
    </div>
  `,
})
export class PrivacyPolicyComponent implements OnInit {
  private settingService = inject(SettingService);
  private seo = inject(SeoService);

  private settings = signal<Record<string, string>>({});

  fiduciary = computed(() => this.settings()['legalEntityName'] || '');
  address = computed(() => this.settings()['companyAddress'] || '');
  officerName = computed(() => this.settings()['grievanceOfficerName'] || '');
  officerEmail = computed(() => this.settings()['grievanceOfficerEmail'] || '');
  officerPhone = computed(() => this.settings()['grievanceOfficerPhone'] || '');
  lastUpdated = computed(() => this.settings()['privacyLastUpdated'] || '');

  ngOnInit(): void {
    this.seo.updateTags({
      title: 'Privacy Notice | Caratloop',
      description:
        'How Caratloop collects, uses and protects your personal data under the Digital Personal Data Protection Act 2023.',
      url: 'https://www.caratloop.com/privacy',
    });

    this.settingService.getSettings().subscribe((s) => this.settings.set(s || {}));
  }
}
