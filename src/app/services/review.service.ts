import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { PaginatedResponse } from '../core/models';

export interface Review {
  id?: string;
  rating: number;
  comment: string;
  productId: string;
  userId?: string;
  userName?: string;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
  private http = inject(HttpClient);
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('reviews');

  submitReview(review: Review): Observable<Review> {
    return this.http.post<Review>(this.baseUrl, review);
  }

  getProductReviews(productId: string, page: number = 0, size: number = 5): Observable<PaginatedResponse<Review>> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());
    return this.http.get<PaginatedResponse<Review>>(`${this.baseUrl}/product/${productId}`, { params });
  }
}
