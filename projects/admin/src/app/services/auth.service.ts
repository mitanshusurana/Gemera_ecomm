import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl + '/auth';

  constructor(private http: HttpClient, private router: Router) {}

  login(credentials: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, credentials).pipe(
      tap((response: any) => {
        if (response.user && response.user.role !== 'ADMIN') {
          throw new Error('Unauthorized: User is not an admin.');
        }
        if (response.token) {
          localStorage.setItem('admin_token', response.token);
          localStorage.setItem('admin_user', JSON.stringify(response.user));
        }
      })
    );
  }

  logout() {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
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
   * This used to return `!!getToken()` -- the presence of any string in
   * localStorage. An expired or garbage value rendered the entire admin shell,
   * and every route was guarded by nothing more than that.
   *
   * This is a usability and exposure control, not authorisation: the token is
   * unverified here, and the backend remains the only authority. Every admin
   * endpoint must enforce hasRole('ADMIN') independently.
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
    return typeof role === 'string' ? role : null;
  }

  isAdmin(): boolean {
    return (this.currentRole() || '').toUpperCase().includes('ADMIN');
  }

  /**
   * Email of the signed-in admin, for display only. Prefers the token's
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
