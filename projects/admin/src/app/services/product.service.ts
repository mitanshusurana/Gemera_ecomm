import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/** POST /products/quick body (GROWTH-CONTRACT §1). */
export interface QuickCaptureRequest {
  category: string;
  subCategory?: string;
  name?: string;
  price?: number;
  unitPrice?: number;
  saleMode?: string;
  stock?: number;
  images: string[];
  primaryWeight?: number;
  notes?: string;
}

/** One row of the cost-price import (PUT /admin/inventory/cost-prices). */
export interface CostPriceRow {
  sku: string;
  costPrice: number | null;
}

export interface CostPriceImportResult {
  updated: number;
  cleared: number;
  unchanged: number;
  notFound: number;
  invalid: number;
  rows: { sku: string; costPrice: number | null; status: 'UPDATED' | 'CLEARED' | 'UNCHANGED' | 'NOT_FOUND' | 'INVALID'; productName: string | null }[];
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private apiUrl = environment.apiUrl + '/products';

  constructor(private http: HttpClient) {}

  /**
   * GROWTH-CONTRACT §1: `published=false` lists drafts (admin JWT). Omitted,
   * the admin sees everything.
   */
  getProducts(search?: string, opts: { page?: number; size?: number; published?: boolean } = {}): Observable<any> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    if (opts.page !== undefined) params = params.set('page', String(opts.page));
    if (opts.size !== undefined) params = params.set('size', String(opts.size));
    if (opts.published !== undefined) params = params.set('published', String(opts.published));
    return this.http.get(this.apiUrl, { params });
  }

  // --- Drafts and quick capture (GROWTH-CONTRACT §1) ---

  /**
   * Body `{ category, subCategory?, name?, price?, unitPrice?, saleMode?, stock?, images, primaryWeight?, notes? }`
   * -> a draft ProductDTO with itemType resolved from the category and the SKU generated.
   */
  quickCreate(body: QuickCaptureRequest): Observable<any> {
    return this.http.post(`${this.apiUrl}/quick`, body);
  }

  /** Runs the full item-type check and flips `published`; 400 lists the missing fields. */
  publish(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/publish`, {});
  }

  unpublish(id: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/unpublish`, {});
  }

  // --- Multi-channel feeds (GROWTH-CONTRACT §2) ---

  /** `{ published, includedInFeeds, excluded: [{ id, sku, name, reason }], urls }` */
  getFeedStatus(): Observable<any> {
    return this.http.get(`${environment.apiUrl}/admin/feeds/status`);
  }

  /** Public feed URLs, built from the API origin so they match what the server serves. */
  feedUrls(): { google: string; facebook: string; csv: string } {
    const base = `${environment.apiUrl.replace(/\/+$/, '')}/feeds`;
    return {
      google: `${base}/google.xml`,
      facebook: `${base}/facebook.csv`,
      csv: `${base}/products.csv`
    };
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

  /**
   * FINISH-CONTRACT §1: products that no longer pass their item-type rules.
   * Spring `Page<IncompleteProductDTO { id, sku, name, category, itemType, missingFields }>`.
   */
  getIncomplete(page = 0, size = 50): Observable<any> {
    const params = new HttpParams().set('page', String(page)).set('size', String(size));
    return this.http.get(`${environment.apiUrl}/admin/inventory/incomplete`, { params });
  }

  /**
   * PUT /admin/inventory/cost-prices with `[{sku, costPrice}]` (products.write);
   * a null cost clears the product's landed cost. Twin of StockService.mapErpCodes.
   */
  importCostPrices(rows: CostPriceRow[]): Observable<CostPriceImportResult> {
    return this.http.put<CostPriceImportResult>(`${environment.apiUrl}/admin/inventory/cost-prices`, rows);
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
