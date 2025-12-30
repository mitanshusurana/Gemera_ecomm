import { Injectable } from '@angular/core';
import { HttpResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { delay } from 'rxjs/operators';
import { MOCK_PRODUCTS, MOCK_CATEGORIES } from '../data/mock-data';
import { Product, ProductDetail, Cart, CartItem, User, AuthResponse, Order, Category } from '../core/models';

@Injectable({
  providedIn: 'root'
})
export class MockBackendService {
  private mockCart: Cart = {
    id: 'mock-cart',
    items: [],
    subtotal: 0,
    tax: 0,
    shipping: 0,
    total: 0,
    appliedDiscount: 0
  };

  private mockUser: User | null = null;
  private mockToken: string | null = null;

  constructor() {}

  // --- Auth Handlers ---
  handleLogin(body: any): Observable<HttpResponse<AuthResponse>> {
    const { email } = body;
    const mockUser: User = {
      id: 'mock-user-123',
      email: email,
      firstName: 'Test',
      lastName: 'User',
      phone: '1234567890',
      role: email.includes('admin') ? 'ADMIN' : 'USER',
      createdAt: new Date().toISOString()
    };

    const response: AuthResponse = {
      token: 'mock-jwt-token-' + Math.random().toString(36).substring(7),
      refreshToken: 'mock-refresh-token',
      user: mockUser
    };

    this.mockUser = mockUser;
    this.mockToken = response.token;

    return of(new HttpResponse({ status: 200, body: response })).pipe(delay(500));
  }

  handleRegister(body: any): Observable<HttpResponse<User>> {
    const user: User = {
      id: 'mock-user-' + Math.random().toString(36).substring(7),
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      createdAt: new Date().toISOString()
    };
    return of(new HttpResponse({ status: 200, body: user })).pipe(delay(500));
  }

  handleLogout(): Observable<HttpResponse<any>> {
    this.mockUser = null;
    this.mockToken = null;
    this.mockCart.items = [];
    this.calculateCartTotals();
    return of(new HttpResponse({ status: 200, body: {} })).pipe(delay(300));
  }

  handleCurrentUser(): Observable<HttpResponse<User>> {
      if (!this.mockUser) {
          // Attempt to restore from "token" if implied, but for mock backend let's say 401 if no user?
          // For simplicity in this session, if we have a token in localStorage (managed by AuthService),
          // we might want to return a dummy user.
          // But strict adherence: if handleLogin wasn't called in this session, we might return 401.
          // However, for reload persistence, we often just return a user if a token exists.
          // Let's assume the Auth service checks token existence.
          const user: User = {
            id: 'mock-user-123',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            phone: '1234567890',
            role: 'USER',
            createdAt: new Date().toISOString()
          };
          this.mockUser = user; // Auto-login for mock convenience
          return of(new HttpResponse({ status: 200, body: user })).pipe(delay(200));
      }
      return of(new HttpResponse({ status: 200, body: this.mockUser })).pipe(delay(200));
  }

  // --- Product Handlers ---
  handleGetProducts(params: any): Observable<HttpResponse<{ content: Product[]; pageable: any }>> {
    let products = [...MOCK_PRODUCTS];
    const category = params.get('category');
    const search = params.get('search');
    const priceMin = params.get('priceMin');
    const priceMax = params.get('priceMax');
    const sortBy = params.get('sortBy');
    const order = params.get('order');

    if (category) {
        const cat = category.toLowerCase();
        products = products.filter(
        (p) =>
            p.category.toLowerCase().includes(cat) ||
            p.subcategory?.toLowerCase().includes(cat)
        );
    }
    if (search) {
        const s = search.toLowerCase();
        products = products.filter(
        (p) =>
            p.name.toLowerCase().includes(s) ||
            p.description.toLowerCase().includes(s)
        );
    }
    if (priceMin) {
        products = products.filter((p) => p.price >= Number(priceMin));
    }
    if (priceMax) {
        products = products.filter((p) => p.price <= Number(priceMax));
    }

    if (sortBy === 'price') {
        products.sort((a, b) =>
        order === 'desc' ? b.price - a.price : a.price - b.price
        );
    } else if (sortBy === 'newest') {
        products.reverse();
    }

    // Pagination
    const page = Number(params.get('page')) || 0;
    const size = Number(params.get('size')) || 20;
    const start = page * size;
    const end = start + size;
    const content = products.slice(start, end);

    const response = {
        content,
        pageable: {
          pageNumber: page,
          pageSize: size,
          totalElements: products.length,
          totalPages: Math.ceil(products.length / size),
        },
    };
    return of(new HttpResponse({ status: 200, body: response })).pipe(delay(500));
  }

  handleGetProductById(id: string): Observable<HttpResponse<ProductDetail>> {
      const product = MOCK_PRODUCTS.find((p) => p.id === id);
      const body = product || MOCK_PRODUCTS[0];
      return of(new HttpResponse({ status: 200, body })).pipe(delay(500));
  }

  handleGetCategories(): Observable<HttpResponse<{ categories: Category[] }>> {
      return of(new HttpResponse({ status: 200, body: { categories: MOCK_CATEGORIES } })).pipe(delay(500));
  }

  handleSearchProducts(params: any): Observable<HttpResponse<{ results: Product[] }>> {
      const q = (params.get('query') || '').toLowerCase();
      const limit = Number(params.get('limit')) || 10;
      const results = MOCK_PRODUCTS.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
      ).slice(0, limit);
      return of(new HttpResponse({ status: 200, body: { results } })).pipe(delay(300));
  }

  // --- Cart Handlers ---
  handleGetCart(): Observable<HttpResponse<Cart>> {
      this.calculateCartTotals();
      return of(new HttpResponse({ status: 200, body: { ...this.mockCart } })).pipe(delay(300));
  }

  handleAddToCart(body: any): Observable<HttpResponse<Cart>> {
      const { productId, quantity, options } = body;
      const product = MOCK_PRODUCTS.find(p => p.id === productId);

      if (product) {
        const existing = this.mockCart.items.find(i =>
            i.productId === productId &&
            i.selectedMetal === options?.metal &&
            i.selectedDiamond === options?.diamond &&
            i.stoneId === options?.stoneId
        );

        if (existing) {
            existing.quantity += quantity;
        } else {
            this.mockCart.items.push({
                id: 'item-' + Math.random().toString(36).substring(7),
                productId,
                quantity,
                price: options?.price || product.price,
                product: product,
                selectedMetal: options?.metal,
                selectedDiamond: options?.diamond,
                stoneId: options?.stoneId,
                stoneName: options?.stoneName,
                customization: options?.customization
            });
        }
        this.calculateCartTotals();
      }
      return of(new HttpResponse({ status: 200, body: { ...this.mockCart } })).pipe(delay(300));
  }

  handleUpdateCartItem(id: string, body: any): Observable<HttpResponse<Cart>> {
      const item = this.mockCart.items.find(i => i.id === id);
      if (item) {
          item.quantity = body.quantity;
          if (item.quantity <= 0) {
            this.mockCart.items = this.mockCart.items.filter(i => i.id !== id);
          }
          this.calculateCartTotals();
      }
      return of(new HttpResponse({ status: 200, body: { ...this.mockCart } })).pipe(delay(300));
  }

  handleRemoveFromCart(id: string): Observable<HttpResponse<Cart>> {
      this.mockCart.items = this.mockCart.items.filter(i => i.id !== id);
      this.calculateCartTotals();
      return of(new HttpResponse({ status: 200, body: { ...this.mockCart } })).pipe(delay(300));
  }

  handleUpdateCartOptions(body: any): Observable<HttpResponse<Cart>> {
      this.mockCart.giftWrap = body.giftWrap;
      this.calculateCartTotals();
      return of(new HttpResponse({ status: 200, body: { ...this.mockCart } })).pipe(delay(300));
  }

  handleApplyCoupon(body: any): Observable<HttpResponse<Cart>> {
      if (body.couponCode === 'DISCOUNT10') {
          this.mockCart.appliedDiscount = 1000;
      } else {
          this.mockCart.appliedDiscount = 0;
      }
      this.calculateCartTotals();
      return of(new HttpResponse({ status: 200, body: { ...this.mockCart } })).pipe(delay(500));
  }

  // --- Helper ---
  private calculateCartTotals() {
    const subtotal = this.mockCart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const tax = Math.round(subtotal * 0.1);
    const shipping = subtotal > 0 ? (subtotal > 50000 ? 0 : 500) : 0;
    const giftWrapFee = this.mockCart.giftWrap ? 5 : 0;
    const total = subtotal + tax + shipping + giftWrapFee - this.mockCart.appliedDiscount;

    this.mockCart.subtotal = subtotal;
    this.mockCart.tax = tax;
    this.mockCart.shipping = shipping;
    this.mockCart.total = total;
  }
}
