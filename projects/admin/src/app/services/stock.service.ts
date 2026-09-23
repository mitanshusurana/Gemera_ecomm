import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Client for /api/v1/admin/stock (per-store stock, transfers, stock takes) and
 * the ERP-code bulk mapping under /api/v1/admin/inventory. A null `storeId`
 * anywhere means the warehouse, i.e. `Product.stock`, the quantity the
 * storefront sells from.
 */

export const WAREHOUSE_NAME = 'Warehouse';

export interface SpringPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

export interface StoreQuantity {
  storeId: string;
  storeName: string;
  quantity: number;
  updatedAt: string | null;
}

export interface ProductStockLocations {
  productId: string;
  sku: string;
  name: string;
  price: number | null;
  warehouseQuantity: number | null;
  stores: StoreQuantity[];
  totalQuantity: number;
}

export interface StockRow {
  productId: string;
  sku: string;
  name: string;
  category: string | null;
  price: number | null;
  image: string | null;
  erpMaterialCode: string | null;
  quantity: number | null;
  value: number;
  updatedAt: string | null;
}

export interface LocationSummary {
  storeId: string | null;
  name: string;
  skus: number;
  pieces: number;
  value: number;
}

export interface StockSummary {
  locations: LocationSummary[];
  totalSkus: number;
  totalPieces: number;
  totalValue: number;
  draftTransfers: number;
  inTransitTransfers: number;
  openTakes: number;
}

export type TransferStatus = 'DRAFT' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export interface TransferLine {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price: number | null;
  quantity: number;
  receivedQuantity: number | null;
}

export interface StockTransfer {
  id: string;
  transferNumber: string;
  fromStoreId: string | null;
  fromStoreName: string;
  toStoreId: string | null;
  toStoreName: string;
  status: TransferStatus;
  note: string | null;
  createdBy: string | null;
  dispatchedBy: string | null;
  receivedBy: string | null;
  cancelledBy: string | null;
  createdAt: string;
  dispatchedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  lineCount: number;
  totalQuantity: number;
  totalReceived: number | null;
  lines: TransferLine[];
}

export interface CreateTransferRequest {
  fromStoreId: string | null;
  toStoreId: string | null;
  note?: string;
  lines: { productId?: string; sku?: string; quantity: number }[];
}

export type TakeStatus = 'OPEN' | 'CLOSED' | 'CANCELLED';

export interface TakeLine {
  id: string;
  productId: string;
  sku: string;
  name: string;
  price: number | null;
  image: string | null;
  expectedQuantity: number;
  countedQuantity: number | null;
  variance: number | null;
  varianceValue: number | null;
  note: string | null;
  lastCountedAt: string | null;
}

export interface StockTake {
  id: string;
  takeNumber: string;
  storeId: string | null;
  storeName: string;
  status: TakeStatus;
  startedBy: string | null;
  closedBy: string | null;
  note: string | null;
  createdAt: string;
  closedAt: string | null;
  lineCount: number;
  countedLines: number;
  varianceLines: number;
  lines: TakeLine[];
}

export interface CountRequest {
  productId?: string;
  sku?: string;
  /** Absolute count; wins over `increment`. */
  countedQuantity?: number;
  /** Added to the running count (default +1 on the server). */
  increment?: number;
  note?: string;
}

export interface CountResult {
  line: TakeLine;
  lineCreated: boolean;
  lineCount: number;
  countedLines: number;
  varianceLines: number;
}

export interface VarianceReport {
  takeId: string;
  takeNumber: string;
  storeId: string | null;
  storeName: string;
  status: TakeStatus;
  lineCount: number;
  countedLines: number;
  uncountedLines: number;
  surplusPieces: number;
  shortagePieces: number;
  netValue: number;
  lines: TakeLine[];
}

export interface ErpCodeMapping {
  sku: string;
  erpMaterialCode: string;
}

export interface ErpCodeMappingResult {
  updated: number;
  cleared: number;
  unchanged: number;
  notFound: number;
  invalid: number;
  rows: { sku: string; erpMaterialCode: string | null; status: 'UPDATED' | 'CLEARED' | 'UNCHANGED' | 'NOT_FOUND' | 'INVALID'; productName: string | null }[];
}

/** Message of an API error body (ProblemDetail with `message`/`detail`), or a fallback. */
export function apiErrorMessage(err: any, fallback: string): string {
  return err?.error?.message || err?.error?.detail || err?.message || fallback;
}

@Injectable({ providedIn: 'root' })
export class StockService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/admin/stock`;

  // ----- Quantities -----

  getSummary(): Observable<StockSummary> {
    return this.http.get<StockSummary>(`${this.base}/summary`);
  }

  getProductStock(productId: string): Observable<ProductStockLocations> {
    return this.http.get<ProductStockLocations>(`${this.base}/products/${productId}`);
  }

  /** Rows at a location: `storeId` null for the warehouse. */
  getRows(storeId: string | null, search = '', page = 0, size = 50): Observable<SpringPage<StockRow>> {
    let params = new HttpParams().set('page', String(page)).set('size', String(size));
    if (search) params = params.set('search', search);
    const url = storeId ? `${this.base}/stores/${storeId}` : `${this.base}/warehouse`;
    return this.http.get<SpringPage<StockRow>>(url, { params });
  }

  // ----- Transfers -----

  listTransfers(status = '', page = 0, size = 20): Observable<SpringPage<StockTransfer>> {
    let params = new HttpParams().set('page', String(page)).set('size', String(size));
    if (status) params = params.set('status', status);
    return this.http.get<SpringPage<StockTransfer>>(`${this.base}/transfers`, { params });
  }

  getTransfer(id: string): Observable<StockTransfer> {
    return this.http.get<StockTransfer>(`${this.base}/transfers/${id}`);
  }

  createTransfer(body: CreateTransferRequest): Observable<StockTransfer> {
    return this.http.post<StockTransfer>(`${this.base}/transfers`, body);
  }

  dispatchTransfer(id: string): Observable<StockTransfer> {
    return this.http.post<StockTransfer>(`${this.base}/transfers/${id}/dispatch`, {});
  }

  receiveTransfer(id: string, lines: { lineId: string; receivedQuantity: number }[]): Observable<StockTransfer> {
    return this.http.post<StockTransfer>(`${this.base}/transfers/${id}/receive`, { lines });
  }

  cancelTransfer(id: string): Observable<StockTransfer> {
    return this.http.post<StockTransfer>(`${this.base}/transfers/${id}/cancel`, {});
  }

  // ----- Stock takes -----

  listTakes(status = '', page = 0, size = 20): Observable<SpringPage<StockTake>> {
    let params = new HttpParams().set('page', String(page)).set('size', String(size));
    if (status) params = params.set('status', status);
    return this.http.get<SpringPage<StockTake>>(`${this.base}/takes`, { params });
  }

  getTake(id: string): Observable<StockTake> {
    return this.http.get<StockTake>(`${this.base}/takes/${id}`);
  }

  openTake(storeId: string | null, note?: string): Observable<StockTake> {
    return this.http.post<StockTake>(`${this.base}/takes`, { storeId, note: note || null });
  }

  count(takeId: string, body: CountRequest): Observable<CountResult> {
    return this.http.post<CountResult>(`${this.base}/takes/${takeId}/count`, body);
  }

  getVariance(takeId: string): Observable<VarianceReport> {
    return this.http.get<VarianceReport>(`${this.base}/takes/${takeId}/variance`);
  }

  closeTake(takeId: string): Observable<StockTake> {
    return this.http.post<StockTake>(`${this.base}/takes/${takeId}/close`, {});
  }

  cancelTake(takeId: string): Observable<StockTake> {
    return this.http.post<StockTake>(`${this.base}/takes/${takeId}/cancel`, {});
  }

  // ----- ERP material codes -----

  /** PUT /admin/inventory/erp-codes with `[{sku, erpMaterialCode}]`; a blank code clears the mapping. */
  mapErpCodes(rows: ErpCodeMapping[]): Observable<ErpCodeMappingResult> {
    return this.http.put<ErpCodeMappingResult>(`${environment.apiUrl}/admin/inventory/erp-codes`, rows);
  }
}
