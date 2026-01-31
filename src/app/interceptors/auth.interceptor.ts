import { Injectable } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor
} from '@angular/common/http';
import { Observable } from 'rxjs';

/**
 * HTTP Interceptor that automatically adds Bearer token to all requests
 * 
 * This interceptor:
 * 1. Retrieves the auth token from localStorage (avoiding circular dependency)
 * 2. Adds it to the Authorization header of every API request
 * 3. Skips non-API requests (e.g., static assets)
 */
@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    // Get the auth token directly from localStorage to avoid circular dependency
    // AuthService also stores the token here after login
    const authToken = localStorage.getItem('authToken');

    // Only add token to API requests (skip assets, etc.)
    // Check if request is to our API by looking for /api/ in the URL
    if (authToken && request.url.includes('/api/')) {
      // Clone the request and add the Authorization header
      request = request.clone({
        setHeaders: {
          Authorization: `Bearer ${authToken}`
        }
      });
    }

    return next.handle(request);
  }
}
