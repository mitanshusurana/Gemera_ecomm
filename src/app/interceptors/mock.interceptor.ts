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
import { Address } from '../core/models';
import {
  LoginRequest,
  RegisterRequest,
  AddToCartRequest,
  UpdateCartItemRequest,
  UpdateCartOptionsRequest,
  ApplyCouponRequest,
  CreateOrderRequest,
  InitializePaymentRequest,
  VerifyPaymentRequest
} from '../core/dtos';

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
      return this.mockBackend.handleLogin(body as LoginRequest);
    }
    if (url.endsWith('/auth/register') && method === 'POST') {
      return this.mockBackend.handleRegister(body as RegisterRequest);
    }
    if (url.endsWith('/auth/logout') && method === 'POST') {
      return this.mockBackend.handleLogout();
    }
    if (url.endsWith('/users/me') && method === 'GET') {
      return this.mockBackend.handleCurrentUser();
    }
    if (url.endsWith('/users/addresses') && method === 'POST') {
      return this.mockBackend.handleAddAddress(body as Address);
    }
    if (url.match(/\/users\/addresses\/[^\/]+$/) && method === 'PUT') {
      const id = url.split('/').pop()!;
      return this.mockBackend.handleUpdateAddress(id, body as Partial<Address>);
    }
    if (url.match(/\/users\/addresses\/[^\/]+$/) && method === 'DELETE') {
      const id = url.split('/').pop()!;
      return this.mockBackend.handleDeleteAddress(id);
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
        return this.mockBackend.handleAddToCart(body as AddToCartRequest);
    }
    if (url.match(/\/cart\/items\/[^\/]+$/) && method === 'PUT') {
        const id = url.split('/').pop()!;
        return this.mockBackend.handleUpdateCartItem(id, body as UpdateCartItemRequest);
    }
    if (url.match(/\/cart\/items\/[^\/]+$/) && method === 'DELETE') {
        const id = url.split('/').pop()!;
        return this.mockBackend.handleRemoveFromCart(id);
    }
    if (url.endsWith('/cart/options') && method === 'POST') {
        return this.mockBackend.handleUpdateCartOptions(body as UpdateCartOptionsRequest);
    }
    if (url.endsWith('/cart/apply-coupon') && method === 'POST') {
        return this.mockBackend.handleApplyCoupon(body as ApplyCouponRequest);
    }

    // --- Order Routes ---
    if (url.endsWith('/orders') && method === 'POST') {
        return this.mockBackend.handleCreateOrder(body as CreateOrderRequest);
    }
    if (url.match(/\/orders\/?(\?.*)?$/) && method === 'GET') {
        return this.mockBackend.handleGetUserOrders();
    }
    if (url.match(/\/orders\/[^\/]+$/) && method === 'GET') {
        const id = url.split('/').pop()!;
        return this.mockBackend.handleGetOrderById(id);
    }

    // --- Payment Routes ---
    if (url.endsWith('/payments/initialize') && method === 'POST') {
        return this.mockBackend.handleInitializePayment(body as InitializePaymentRequest);
    }
    if (url.endsWith('/payments/verify') && method === 'POST') {
        return this.mockBackend.handleVerifyPayment(body as VerifyPaymentRequest);
    }

    // If no match, pass through (or error if we want strict mock)
    // For now pass through to let real 404s happen or other unhandled routes
    return next.handle(request);
  }
}
