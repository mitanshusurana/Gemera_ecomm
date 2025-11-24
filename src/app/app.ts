import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './components/header';
import { FooterComponent } from './components/footer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  template: `
    <app-header></app-header>
    <main class="min-h-screen">
      <router-outlet></router-outlet>
    </main>
    <app-footer></app-footer>
  `,
})
export class App {}
