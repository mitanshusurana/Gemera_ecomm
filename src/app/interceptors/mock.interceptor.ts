import { Injectable, inject } from '@angular/core';
import {
  HttpRequest,
  HttpHandler,
  HttpEvent,
  HttpInterceptor,
  HttpResponse
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { MockBackendService } from '../services/mock-backend.service';

@Injectable()
export class MockInterceptor implements HttpInterceptor {
  private mockBackend = inject(MockBackendService);
  // Flag to toggle mock globally. In a real app, this might come from environment.
  private useMock = true;

  intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (!this.useMock) {
      return next.handle(request);
    }

    const { url, method, body, params } = request;

    // --- Auth Routes ---
    if (url.endsWith('/auth/login') && method === 'POST') {
      return this.mockBackend.handleLogin(body as any);
    }
    if (url.endsWith('/auth/register') && method === 'POST') {
      return this.mockBackend.handleRegister(body as any);
    }
    if (url.endsWith('/auth/logout') && method === 'POST') {
      return this.mockBackend.handleLogout();
    }
    if (url.endsWith('/users/me') && method === 'GET') {
      return this.mockBackend.handleCurrentUser();
    }

    // --- Product Routes ---
    if (url.endsWith('/products') && method === 'GET') {
       return this.mockBackend.handleGetProducts(params);
    }
    if (url.includes('/products/search') && method === 'GET') {
        return this.mockBackend.handleSearchProducts(params);
    }
    if (url.includes('/products/categories') && method === 'GET') {
        return this.mockBackend.handleGetCategories();
    }
    if (url.match(/\/products\/[^\/]+$/) && method === 'GET') {
        // Extract ID
        const id = url.split('/').pop()!;
        return this.mockBackend.handleGetProductById(id);
    }

    // --- Cart Routes ---
    if (url.endsWith('/cart') && method === 'GET') {
        return this.mockBackend.handleGetCart();
    }
    if (url.endsWith('/cart/items') && method === 'POST') {
        return this.mockBackend.handleAddToCart(body as any);
    }
    if (url.match(/\/cart\/items\/[^\/]+$/) && method === 'PUT') {
        const id = url.split('/').pop()!;
        return this.mockBackend.handleUpdateCartItem(id, body as any);
    }
    if (url.match(/\/cart\/items\/[^\/]+$/) && method === 'DELETE') {
        const id = url.split('/').pop()!;
        return this.mockBackend.handleRemoveFromCart(id);
    }
    if (url.endsWith('/cart/options') && method === 'POST') {
        return this.mockBackend.handleUpdateCartOptions(body as any);
    }
    if (url.endsWith('/cart/apply-coupon') && method === 'POST') {
        return this.mockBackend.handleApplyCoupon(body as any);
    }

    // If no match, pass through (or error if we want strict mock)
    // For now pass through to let real 404s happen or other unhandled routes
    return next.handle(request);
  }
}
