import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { tap, catchError, finalize } from 'rxjs/operators';
import { AuthResponse, User, Address } from '../core/models';
import { LoginRequest, RegisterRequest } from '../core/dtos';
import { ApiConfigService } from './api-config.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private httpBackend = inject(HttpBackend); // Bypass interceptors
  private router = inject(Router);
  private apiConfig = inject(ApiConfigService);
  private platformId = inject(PLATFORM_ID);
  private baseUrl = this.apiConfig.getEndpoint('auth');
  private usersUrl = this.apiConfig.getEndpoint('users');
  private authToken$ = new BehaviorSubject<string | null>(null);
  private user$ = new BehaviorSubject<User | null>(null);

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      const storedToken = localStorage.getItem('authToken');
      if (storedToken) {
        this.authToken$.next(storedToken);
        this.refreshUser();
      }
    }
  }

  register(data: RegisterRequest): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/register`, data);
  }

  login(email: string, password: string): Observable<AuthResponse> {
    const body: LoginRequest = { email, password };
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, body).pipe(
      tap(response => {
        this.setAuthToken(response.token, response.refreshToken);
        this.user$.next(response.user);
      })
    );
  }

  logout(): Observable<any> {
    // Call backend to invalidate token
    return this.http.post(`${this.baseUrl}/logout`, {}).pipe(
      finalize(() => {
        // Always clear local state, even if API fails
        this.clearAuthToken();
        this.user$.next(null);
        this.router.navigate(['/login']);
      })
    );
  }

  refreshToken(): Observable<AuthResponse> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('No refresh token available'));
    }

    // Use HttpBackend to bypass interceptors (avoid loop)
    const http = new HttpClient(this.httpBackend);
    return http.post<AuthResponse>(`${this.baseUrl}/refresh`, { refreshToken }).pipe(
      tap(response => {
        this.setAuthToken(response.token, response.refreshToken);
        // Note: API might not return user object on refresh, depends on implementation
        // If it does, update it. If not, keep existing.
        if (response.user) {
           this.user$.next(response.user);
        }
      })
    );
  }

  // Address Management Methods
  addAddress(address: Omit<Address, 'id'>): Observable<User> {
    return this.http.post<User>(`${this.usersUrl}/addresses`, address).pipe(
      tap(user => this.user$.next(user))
    );
  }

  updateAddress(id: string, address: Partial<Address>): Observable<User> {
    return this.http.put<User>(`${this.usersUrl}/addresses/${id}`, address).pipe(
      tap(user => this.user$.next(user))
    );
  }

  deleteAddress(id: string): Observable<User> {
    return this.http.delete<User>(`${this.usersUrl}/addresses/${id}`).pipe(
      tap(user => this.user$.next(user))
    );
  }

  updateProfile(data: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.usersUrl}/profile`, data).pipe(
      tap(user => this.user$.next(user))
    );
  }

  getLoyaltyPoints(): Observable<{ points: number, tier: string }> {
    return this.http.get<{ points: number, tier: string }>(`${this.usersUrl}/loyalty`);
  }

  /**
   * Silently clears user session locally (tokens and state)
   * without calling the backend or redirecting.
   * Useful when we discover the token is expired/invalid implicitly.
   */
  clearSession(): void {
    this.clearAuthToken();
    this.user$.next(null);
  }

  // Password Management
  forgotPassword(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/forgot-password`, { email });
  }

  resetPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/reset-password`, { token, newPassword });
  }

  changePassword(oldPassword: string, newPassword: string): Observable<any> {
    return this.http.post(`${this.usersUrl}/change-password`, { oldPassword, newPassword });
  }

  // Helper to fetch user if token exists but user is null (page reload)
  private refreshUser() {
    this.http.get<User>(`${this.usersUrl}/me`).subscribe({
        next: user => this.user$.next(user),
        error: () => this.clearSession() // Token invalid, fallback to guest gracefully
    });
  }

  private setAuthToken(token: string, refreshToken?: string): void {
    this.authToken$.next(token);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('authToken', token);
      if (refreshToken) {
        localStorage.setItem('refreshToken', refreshToken);
      }
    }
  }

  private clearAuthToken(): void {
    this.authToken$.next(null);
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('refreshToken');
    }
  }

  getRefreshToken(): string | null {
    if (isPlatformBrowser(this.platformId)) {
      return localStorage.getItem('refreshToken');
    }
    return null;
  }

  getAuthToken(): string | null {
    return this.authToken$.value;
  }

  isAuthenticated(): boolean {
    return !!this.authToken$.value;
  }

  user(): Observable<User | null> {
    return this.user$.asObservable();
  }

  authToken(): Observable<string | null> {
    return this.authToken$.asObservable();
  }
}
