import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthResponse, User } from '../core/models';
import { LoginRequest, RegisterRequest } from '../core/dtos';
import { ApiConfigService } from './api-config.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('auth');
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
        this.setAuthToken(response.token);
        this.user$.next(response.user);
      })
    );
  }

  logout(): Observable<any> {
    // No backend API for logout, just clear local state
    this.clearAuthToken();
    this.user$.next(null);
    this.router.navigate(['/login']);
    return of(null);
  }

  // Helper to fetch user if token exists but user is null (page reload)
  private refreshUser() {
    this.http.get<User>(`${this.apiConfig.getEndpoint('users')}/me`).subscribe({
        next: user => this.user$.next(user),
        error: () => this.logout() // Token invalid
    });
  }

  private setAuthToken(token: string): void {
    this.authToken$.next(token);
    localStorage.setItem('authToken', token);
  }

  private clearAuthToken(): void {
    this.authToken$.next(null);
    localStorage.removeItem('authToken');
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
