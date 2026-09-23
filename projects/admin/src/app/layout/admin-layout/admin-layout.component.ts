import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Permission } from '../../core/permissions';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './admin-layout.component.html'
})
export class AdminLayoutComponent {
  private authService = inject(AuthService);

  /** Role and email of the signed-in user for the header. */
  readonly role = this.authService.role;
  readonly email = this.authService.currentUserEmail();

  /** Nav entries call this so a user never sees a page the API would refuse. */
  can(key: Permission): boolean {
    return this.authService.can(key);
  }

  /** "Sales", "Admin", ... for the header chip. */
  roleLabel(): string {
    const r = (this.role() || '').toString();
    return r ? r.charAt(0) + r.slice(1).toLowerCase() : '';
  }

  logout() {
    this.authService.logout();
  }
}
