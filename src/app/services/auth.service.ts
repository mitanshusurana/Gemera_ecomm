import { Injectable, inject } from '@angular/core';
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
  private baseUrl = this.apiConfig.getEndpoint('auth');
  private usersUrl = this.apiConfig.getEndpoint('users');
  private authToken$ = new BehaviorSubject<string | null>(localStorage.getItem('authToken'));
  private user$ = new BehaviorSubject<User | null>(null);

  constructor() {
    if (this.authToken$.value) {
      this.refreshUser();
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

  // Helper to fetch user if token exists but user is null (page reload)
  private refreshUser() {
    this.http.get<User>(`${this.usersUrl}/me`).subscribe({
        next: user => this.user$.next(user),
        error: () => this.logout() // Token invalid
    });
  }

  private setAuthToken(token: string, refreshToken?: string): void {
    this.authToken$.next(token);
    localStorage.setItem('authToken', token);
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
  }

  private clearAuthToken(): void {
    this.authToken$.next(null);
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
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
