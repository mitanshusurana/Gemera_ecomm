import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, shareReplay } from 'rxjs';
import { Product, ProductDetail, ProductFacets, Category, PaginatedResponse, DeliveryAvailability } from '../core/models';
import { ApiConfigService } from './api-config.service';

/** UI sort options. Each maps to one Spring `sort=field,dir` value below. */
export type ProductSort = 'newest' | 'price-low' | 'price-high' | 'name';

const SORT_PARAM: Record<ProductSort, string> = {
  'newest': 'createdAt,desc',
  'price-low': 'price,asc',
  'price-high': 'price,desc',
  'name': 'name,asc',
};

/**
 * Query parameters accepted by GET /products. List filters may be passed as an
 * array or as an already comma-joined string; matching is case-insensitive
 * server-side.
 */
export interface ProductFilters {
  category?: string;
  subCategory?: string | string[];
  metals?: string | string[];
  stones?: string | string[];
  designStyles?: string | string[];
  occasions?: string | string[];
  styles?: string | string[];
  priceMin?: number;
  priceMax?: number;
  search?: string;
  certified?: boolean;
  featured?: boolean;
  sort?: ProductSort;
}

const LIST_PARAMS = ['subCategory', 'metals', 'stones', 'designStyles', 'occasions', 'styles'] as const;

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
    filters?: ProductFilters
  ): Observable<PaginatedResponse<Product>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    if (filters) {
      if (filters.category) params = params.set('category', filters.category);

      for (const key of LIST_PARAMS) {
        const raw = filters[key];
        const joined = Array.isArray(raw) ? raw.filter(Boolean).join(',') : raw;
        if (joined) params = params.set(key, joined);
      }

      if (filters.priceMin !== undefined && filters.priceMin !== null)
        params = params.set('priceMin', filters.priceMin.toString());
      if (filters.priceMax !== undefined && filters.priceMax !== null)
        params = params.set('priceMax', filters.priceMax.toString());
      if (filters.search) params = params.set('search', filters.search);
      if (filters.certified) params = params.set('certified', 'true');
      if (filters.featured) params = params.set('featured', 'true');
      if (filters.sort) params = params.set('sort', SORT_PARAM[filters.sort]);
    }

    return this.http.get<PaginatedResponse<Product>>(this.baseUrl, { params });
  }

  /** Distinct filter values across the catalogue; drives the storefront filter lists. */
  getFacets(): Observable<ProductFacets> {
    return this.http.get<ProductFacets>(`${this.baseUrl}/facets`);
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
