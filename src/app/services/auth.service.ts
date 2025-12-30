import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuthResponse, User } from '../core/models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private baseUrl = '/api/v1/auth';
  private authToken$ = new BehaviorSubject<string | null>(localStorage.getItem('authToken'));
  private user$ = new BehaviorSubject<User | null>(null);

  constructor() {
    if (this.authToken$.value) {
      this.refreshUser();
    }
  }

  register(data: { email: string; password: string; firstName: string; lastName: string; phone: string }): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/register`, data);
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, { email, password }).pipe(
      tap(response => {
        this.setAuthToken(response.token);
        this.user$.next(response.user);
      })
    );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/logout`, {}).pipe(
      tap(() => {
        this.clearAuthToken();
        this.user$.next(null);
      })
    );
  }

  // Helper to fetch user if token exists but user is null (page reload)
  private refreshUser() {
    this.http.get<User>('/api/v1/users/me').subscribe({
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
