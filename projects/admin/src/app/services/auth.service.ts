import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';
import { MyPermissions, Permission, isStaffRole } from '../core/permissions';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl + '/auth';

  /**
   * Role and permission keys from GET /auth/me/permissions, cached for the
   * session. `null` until loaded; the permission guard awaits the load.
   */
  readonly permissions = signal<MyPermissions | null>(null);
  readonly permissionKeys = computed(() => new Set(this.permissions()?.permissions ?? []));
  /** Role as the API reports it, else the token claim while the fetch is in flight. */
  readonly role = computed(() => this.permissions()?.role ?? this.currentRole());

  private permissionsRequest: Promise<MyPermissions | null> | null = null;

  constructor(private http: HttpClient, private router: Router) {}

  login(credentials: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, credentials).pipe(
      tap((response: any) => {
        if (response.user && !isStaffRole(response.user.role)) {
          throw new Error('Unauthorized: this account is not a staff account.');
        }
        if (response.token) {
          localStorage.setItem('admin_token', response.token);
          localStorage.setItem('admin_user', JSON.stringify(response.user));
        }
        // Fresh session: forget whatever the previous user could do.
        this.permissions.set(null);
        this.permissionsRequest = null;
      })
    );
  }

  logout() {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('admin_token');
    }
    return null;
  }

  /**
   * True only for a token that is present, well-formed and unexpired.
   *
   * This is a usability and exposure control, not authorisation: the token is
   * unverified here, and the backend remains the only authority. Every admin
   * endpoint enforces its own permission key independently.
   */
  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;

    const claims = this.decodeToken(token);
    if (!claims) {
      // Not a readable JWT. Treat as invalid and clear it, rather than
      // rendering the admin UI around a value the API will reject.
      this.clearSession();
      return false;
    }

    if (typeof claims['exp'] === 'number' && Date.now() >= claims['exp'] * 1000) {
      this.clearSession();
      return false;
    }

    return true;
  }

  /** Current role from the token, not from the separately-stored user blob. */
  currentRole(): string | null {
    const token = this.getToken();
    const claims = token ? this.decodeToken(token) : null;
    const role = claims?.['role'] ?? claims?.['roles'] ?? null;
    if (typeof role === 'string' && role) return role.replace(/^ROLE_/, '').toUpperCase();
    // Tokens issued before the API added the role claim carry only the subject;
    // fall back to the user blob stored at login.
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('admin_user');
        const user = raw ? JSON.parse(raw) : null;
        if (user && typeof user.role === 'string') return user.role.toUpperCase();
      } catch {
        // Corrupt blob: treat as no role.
      }
    }
    return null;
  }

  /** Any back-office role (not a customer). */
  isStaff(): boolean {
    return isStaffRole(this.role());
  }

  /** Kept for callers that only care about the owner role. */
  isAdmin(): boolean {
    return (this.role() || '').toUpperCase() === 'ADMIN';
  }

  /**
   * Whether the signed-in user holds `key`. False until the permissions have
   * loaded, so templates never flash a control the user cannot use.
   */
  can(key: Permission | string): boolean {
    return this.permissionKeys().has(key);
  }

  /**
   * Loads /auth/me/permissions once per session (or once per `force`).
   * Resolves to null when there is no token or the call fails; the guard
   * then treats the user as having no permissions.
   */
  ensurePermissions(force = false): Promise<MyPermissions | null> {
    if (!this.getToken()) {
      this.permissions.set(null);
      return Promise.resolve(null);
    }
    if (!force && this.permissions()) {
      return Promise.resolve(this.permissions());
    }
    if (!force && this.permissionsRequest) {
      return this.permissionsRequest;
    }
    this.permissionsRequest = firstValueFrom(
      this.http.get<MyPermissions>(`${this.apiUrl}/me/permissions`)
    )
      .then(p => {
        const normalised: MyPermissions = {
          role: String(p?.role ?? '').toUpperCase(),
          staff: !!p?.staff,
          permissions: Array.isArray(p?.permissions) ? p.permissions : [],
        };
        this.permissions.set(normalised);
        return normalised;
      })
      .catch(() => {
        this.permissionsRequest = null;
        return null;
      });
    return this.permissionsRequest;
  }

  /**
   * Email of the signed-in user, for display only. Prefers the token's
   * subject (the backend uses the email as the JWT subject) and falls back to
   * the user blob stored at login.
   */
  currentUserEmail(): string | null {
    const token = this.getToken();
    const claims = token ? this.decodeToken(token) : null;
    const sub = claims?.['sub'] ?? claims?.['email'];
    if (typeof sub === 'string' && sub.includes('@')) return sub;

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('admin_user');
        const user = raw ? JSON.parse(raw) : null;
        if (user && typeof user.email === 'string') return user.email;
      } catch {
        // Corrupt blob: nothing useful to show.
      }
    }
    return null;
  }

  clearSession(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
    }
    this.permissions.set(null);
    this.permissionsRequest = null;
  }

  /** Read JWT claims without verifying. Never used to grant access. */
  private decodeToken(token: string): Record<string, any> | null {
    try {
      const part = token.split('.')[1];
      if (!part) return null;
      const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
      const padded = base64.padEnd(
        base64.length + ((4 - (base64.length % 4)) % 4),
        '=',
      );
      return JSON.parse(atob(padded));
    } catch {
      return null;
    }
  }
}
