import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = environment.apiUrl + '/products';

  constructor(private http: HttpClient) {}

  getProducts(search?: string, opts: { page?: number; size?: number } = {}): Observable<any> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    if (opts.page !== undefined) params = params.set('page', String(opts.page));
    if (opts.size !== undefined) params = params.set('size', String(opts.size));
    return this.http.get(this.apiUrl, { params });
  }

  getProduct(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
  }

  /** OPERATIONS-CONTRACT §1: case-insensitive SKU lookup, 404 when unknown. */
  getProductBySku(sku: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/sku/${encodeURIComponent(sku.trim())}`);
  }

  /** OPERATIONS-CONTRACT §5: products at or below their reorder point. */
  getLowStock(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/admin/inventory/low-stock`);
  }

  createProduct(product: any): Observable<any> {
    return this.http.post(this.apiUrl, product);
  }

  updateProduct(id: string, product: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/${id}`, product);
  }

  deleteProduct(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }

  uploadImage(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.apiUrl}/upload-image`, formData);
  }

  uploadVideo(file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`${this.apiUrl}/upload-video`, formData);
  }

  // --- Label print queue ---
  // The full product object is kept so the /products/labels view can render
  // without refetching; it falls back to GET /products/{id} for ids it does
  // not have (e.g. a bookmarked labels URL).
  private printQueue = new Map<string, any>();

  getPrintQueue(): any[] {
    return Array.from(this.printQueue.values());
  }

  addToPrintQueue(product: any) {
    this.printQueue.set(product.id, product);
  }

  removeFromPrintQueue(id: string) {
    this.printQueue.delete(id);
  }

  isInPrintQueue(id: string): boolean {
    return this.printQueue.has(id);
  }

  getQueuedProduct(id: string): any | undefined {
    return this.printQueue.get(id);
  }

  clearPrintQueue() {
    this.printQueue.clear();
  }
}
