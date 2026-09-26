import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AccountReturnsComponent } from '../components/account-returns';

/** /returns/mine: the account's returns block on its own page. */
@Component({
  selector: 'app-returns-mine',
  standalone: true,
  imports: [RouterLink, AccountReturnsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-h-screen bg-white font-sans text-[#1d1d1f] pb-24">
      <section class="bg-[#f5f5f7] border-b border-[#e0e0e0] py-12 px-6">
        <div class="max-w-[960px] mx-auto">
          <nav aria-label="Breadcrumb" class="flex items-center gap-2 text-xs text-[#6e6e73] mb-6">
            <a routerLink="/account" [queryParams]="{ tab: 'orders' }" class="text-[#D4AF37] hover:underline">My orders</a>
            <span>/</span>
            <span class="text-[#1d1d1f]">Returns</span>
          </nav>
          <h1 class="font-display font-semibold text-3xl md:text-4xl tracking-tight">My returns</h1>
        </div>
      </section>
      <div class="max-w-[960px] mx-auto px-6 py-10">
        <app-account-returns />
      </div>
    </div>
  `,
})
export class ReturnsMineComponent {}
