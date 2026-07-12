import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = environment.apiUrl + '/products';

  constructor(private http: HttpClient) {}

  getCategories(): Observable<any> {
    return this.http.get(`${this.apiUrl}/categories`);
  }

  getProducts(search?: string): Observable<any> {
    let url = this.apiUrl;
    if (search) {
      url += `?search=${encodeURIComponent(search)}`;
    }
    return this.http.get(url);
  }

  getProduct(id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/${id}`);
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



  // --- Bulk Print Queue ---
  // Store the full product object to preserve sku, name, and price even if navigated away
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

  clearPrintQueue() {
    this.printQueue.clear();
  }
}
