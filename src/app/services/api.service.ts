import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map, tap } from 'rxjs/operators';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  rating: number;
  reviewCount: number;
  imageUrl: string;
  videoUrl?: string;
  category: string;
  subcategory: string;
  gemstones: string[];
  metal: string;
  weight: number;
  stock: number;
  sku: string;
  certifications: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetail extends Product {
  images: { url: string; alt: string }[];
  specifications: {
    carat?: number;
    clarity?: string;
    color?: string;
    cut?: string;
    origin?: string;
  };
  relatedProducts: string[];
}

export interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  price: number;
  product: Product;
}

export interface Cart {
  id: string;
  items: CartItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  appliedDiscount: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId: string;
  items: CartItem[];
  status: string;
  total: number;
  trackingNumber?: string;
  estimatedDelivery?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  displayName: string;
  image: string;
  subcategories?: Array<{ id: string; name: string; displayName: string }>;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  avatar?: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: User;
}

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  private baseUrl = '/api/v1';
  private authToken$ = new BehaviorSubject<string | null>(null);
  private user$ = new BehaviorSubject<User | null>(null);
  private cart$ = new BehaviorSubject<Cart | null>(null);

  constructor(private http: HttpClient) {
    this.loadAuthToken();
  }

  // Auth Methods
  register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone: string;
  }): Observable<User> {
    return this.http.post<User>(`${this.baseUrl}/auth/register`, data);
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/auth/login`, { email, password })
      .pipe(
        tap((response) => {
          this.setAuthToken(response.token);
          this.user$.next(response.user);
        })
      );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/auth/logout`, {}).pipe(
      tap(() => {
        this.clearAuthToken();
        this.user$.next(null);
        this.cart$.next(null);
      })
    );
  }

  refreshToken(refreshToken: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.baseUrl}/auth/refresh`, { refreshToken })
      .pipe(
        tap((response) => {
          this.setAuthToken(response.token);
        })
      );
  }

  // Product Methods
  getProducts(
    page: number = 0,
    size: number = 20,
    filters?: {
      sortBy?: string;
      order?: string;
      category?: string;
      priceMin?: number;
      priceMax?: number;
      search?: string;
    }
  ): Observable<{ content: Product[]; pageable: any }> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    if (filters) {
      if (filters.sortBy) params = params.set('sortBy', filters.sortBy);
      if (filters.order) params = params.set('order', filters.order);
      if (filters.category) params = params.set('category', filters.category);
      if (filters.priceMin !== undefined)
        params = params.set('priceMin', filters.priceMin.toString());
      if (filters.priceMax !== undefined)
        params = params.set('priceMax', filters.priceMax.toString());
      if (filters.search) params = params.set('search', filters.search);
    }

    return this.http.get<{ content: Product[]; pageable: any }>(
      `${this.baseUrl}/products`,
      { params }
    );
  }

  getProductById(productId: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`${this.baseUrl}/products/${productId}`);
  }

  getCategories(): Observable<{ categories: Category[] }> {
    return this.http.get<{ categories: Category[] }>(
      `${this.baseUrl}/products/categories`
    );
  }

  searchProducts(
    query: string,
    limit: number = 10
  ): Observable<{ results: Product[] }> {
    const params = new HttpParams()
      .set('query', query)
      .set('limit', limit.toString());
    return this.http.get<{ results: Product[] }>(
      `${this.baseUrl}/products/search`,
      { params }
    );
  }

  // Cart Methods
  getCart(): Observable<Cart> {
    return this.http
      .get<Cart>(`${this.baseUrl}/cart`, {
        headers: { Authorization: `Bearer ${this.getAuthToken()}` },
      })
      .pipe(tap((cart) => this.cart$.next(cart)));
  }

  addToCart(productId: string, quantity: number = 1): Observable<Cart> {
    return this.http
      .post<Cart>(
        `${this.baseUrl}/cart/items`,
        { productId, quantity },
        {
          headers: { Authorization: `Bearer ${this.getAuthToken()}` },
        }
      )
      .pipe(tap((cart) => this.cart$.next(cart)));
  }

  updateCartItem(itemId: string, quantity: number): Observable<Cart> {
    return this.http
      .put<Cart>(
        `${this.baseUrl}/cart/items/${itemId}`,
        { quantity },
        {
          headers: { Authorization: `Bearer ${this.getAuthToken()}` },
        }
      )
      .pipe(tap((cart) => this.cart$.next(cart)));
  }

  removeFromCart(itemId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/cart/items/${itemId}`, {
      headers: { Authorization: `Bearer ${this.getAuthToken()}` },
    });
  }

  applyCoupon(couponCode: string): Observable<Cart> {
    return this.http
      .post<Cart>(
        `${this.baseUrl}/cart/apply-coupon`,
        { couponCode },
        {
          headers: { Authorization: `Bearer ${this.getAuthToken()}` },
        }
      )
      .pipe(tap((cart) => this.cart$.next(cart)));
  }

  // Order Methods
  createOrder(orderData: any): Observable<Order> {
    return this.http.post<Order>(`${this.baseUrl}/orders`, orderData, {
      headers: { Authorization: `Bearer ${this.getAuthToken()}` },
    });
  }

  getOrderById(orderId: string): Observable<Order> {
    return this.http.get<Order>(`${this.baseUrl}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${this.getAuthToken()}` },
    });
  }

  getUserOrders(page: number = 0, size: number = 10): Observable<any> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    return this.http.get<any>(`${this.baseUrl}/orders`, {
      params,
      headers: { Authorization: `Bearer ${this.getAuthToken()}` },
    });
  }

  updateOrderStatus(orderId: string, status: string, trackingNumber?: string): Observable<any> {
    return this.http.put(
      `${this.baseUrl}/orders/${orderId}/status`,
      { status, trackingNumber },
      {
        headers: { Authorization: `Bearer ${this.getAuthToken()}` },
      }
    );
  }

  // Payment Methods
  initializePayment(
    orderId: string,
    amount: number,
    currency: string = 'USD',
    paymentMethod: string = 'CREDIT_CARD'
  ): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/payments/initialize`,
      { orderId, amount, currency, paymentMethod },
      {
        headers: { Authorization: `Bearer ${this.getAuthToken()}` },
      }
    );
  }

  verifyPayment(paymentId: string, paymentToken: string): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/payments/verify`,
      { paymentId, paymentToken },
      {
        headers: { Authorization: `Bearer ${this.getAuthToken()}` },
      }
    );
  }

  // User Profile Methods
  getCurrentUser(): Observable<User> {
    return this.http
      .get<User>(`${this.baseUrl}/users/me`, {
        headers: { Authorization: `Bearer ${this.getAuthToken()}` },
      })
      .pipe(tap((user) => this.user$.next(user)));
  }

  updateProfile(data: Partial<User>): Observable<User> {
    return this.http
      .put<User>(`${this.baseUrl}/users/me`, data, {
        headers: { Authorization: `Bearer ${this.getAuthToken()}` },
      })
      .pipe(tap((user) => this.user$.next(user)));
  }

  getWishlist(): Observable<any> {
    return this.http.get(`${this.baseUrl}/users/wishlist`, {
      headers: { Authorization: `Bearer ${this.getAuthToken()}` },
    });
  }

  addToWishlist(productId: string): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/users/wishlist`,
      { productId },
      {
        headers: { Authorization: `Bearer ${this.getAuthToken()}` },
      }
    );
  }

  removeFromWishlist(productId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/users/wishlist/${productId}`, {
      headers: { Authorization: `Bearer ${this.getAuthToken()}` },
    });
  }

  // Review Methods
  getProductReviews(productId: string, page: number = 0, size: number = 10): Observable<any> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    return this.http.get<any>(`${this.baseUrl}/products/${productId}/reviews`, {
      params,
    });
  }

  createReview(productId: string, review: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/products/${productId}/reviews`, review, {
      headers: { Authorization: `Bearer ${this.getAuthToken()}` },
    });
  }

  // Token Management
  private setAuthToken(token: string): void {
    this.authToken$.next(token);
    localStorage.setItem('authToken', token);
  }

  private loadAuthToken(): void {
    const token = localStorage.getItem('authToken');
    if (token) {
      this.authToken$.next(token);
    }
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

  // Observables
  user(): Observable<User | null> {
    return this.user$.asObservable();
  }

  cart(): Observable<Cart | null> {
    return this.cart$.asObservable();
  }

  authToken(): Observable<string | null> {
    return this.authToken$.asObservable();
  }
}
