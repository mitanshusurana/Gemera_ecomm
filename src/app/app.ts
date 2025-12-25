import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header';
import { FooterComponent } from './components/footer';
import { ToastContainerComponent } from './components/toast-container';
import { ChatWidgetComponent } from './components/chat-widget';
import { routeAnimations } from './app.animations';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent, ToastContainerComponent, ChatWidgetComponent],
  animations: [routeAnimations],
  template: `
    <div class="fixed top-4 left-4 z-[100] md:hidden">
       <!-- Skip Link (Hidden visually, accessible to screen readers) -->
       <a href="#main-content" class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-white p-4 border border-gold-500 z-[200]">Skip to content</a>
    </div>

    <app-header></app-header>
    <main id="main-content" class="min-h-screen" [@routeAnimations]="o.isActivated ? o.activatedRoute : ''">
      <router-outlet #o="outlet"></router-outlet>
    </main>
    <app-footer></app-footer>
    <app-toast-container></app-toast-container>
    <app-chat-widget></app-chat-widget>
  `,
})
export class App {}
