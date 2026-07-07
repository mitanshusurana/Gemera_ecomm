import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay, of } from 'rxjs';
import { Product, ProductDetail, Category, PaginatedResponse, DeliveryAvailability } from '../core/models';
import { ApiConfigService } from './api-config.service';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('products');

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
      occasions?: string;
      styles?: string;
    }
  ): Observable<PaginatedResponse<Product>> {
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
      if (filters.occasions) params = params.set('occasions', filters.occasions);
      if (filters.styles) params = params.set('styles', filters.styles);
    }

    return this.http.get<PaginatedResponse<Product>>(this.baseUrl, { params });
  }

  getProductById(productId: string): Observable<ProductDetail> {
    return this.http.get<ProductDetail>(`${this.baseUrl}/${productId}`);
  }

  private categoriesCache$?: Observable<{ categories: Category[] }>;

  getCategories(): Observable<{ categories: Category[] }> {
    if (!this.categoriesCache$) {
      this.categoriesCache$ = this.http.get<{ categories: Category[] }>(`${this.baseUrl}/categories`).pipe(
        shareReplay(1)
      );
    }
    return this.categoriesCache$;
  }

  searchProducts(query: string, limit: number = 10): Observable<{ results: Product[] }> {
    const params = new HttpParams()
      .set('query', query)
      .set('limit', limit.toString());
    return this.http.get<{ results: Product[] }>(`${this.baseUrl}/search`, { params });
  }

  checkDeliveryAvailability(pincode: string): Observable<DeliveryAvailability> {
    const params = new HttpParams().set('pincode', pincode);
    return this.http.get<DeliveryAvailability>(`${this.baseUrl}/delivery-availability`, { params });
  }

  getSimilarProducts(productId: string): Observable<PaginatedResponse<Product>> {
    return this.http.get<PaginatedResponse<Product>>(`${this.baseUrl}/${productId}/similar`);
  }

  logProductView(productId: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${productId}/view`, {});
  }
}
