import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Product, ProductDetail, Category, PaginatedResponse } from '../core/models';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private http = inject(HttpClient);
  private baseUrl = '/api/v1/products';

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

  getCategories(): Observable<{ categories: Category[] }> {
    return this.http.get<{ categories: Category[] }>(`${this.baseUrl}/categories`);
  }

  searchProducts(query: string, limit: number = 10): Observable<{ results: Product[] }> {
    const params = new HttpParams()
      .set('query', query)
      .set('limit', limit.toString());
    return this.http.get<{ results: Product[] }>(`${this.baseUrl}/search`, { params });
  }
}
