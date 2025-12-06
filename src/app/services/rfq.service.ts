import { Injectable } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";

export interface RFQItem {
  productId: string;
  quantity: number;
  specifications?: Record<string, any>;
  customization?: string;
}

export interface RFQRequest {
  id?: string;
  rfqNumber?: string;
  userId: string;
  email: string;
  companyName: string;
  items: RFQItem[];
  estimatedBudget?: number;
  deliveryTimeline?: string;
  additionalNotes?: string;
  status?:
    | "PENDING"
    | "QUOTED"
    | "NEGOTIATING"
    | "ACCEPTED"
    | "REJECTED"
    | "EXPIRED";
  createdAt?: string;
  expiresAt?: string;
  quotedPrice?: number;
  quotedAt?: string;
  validUntil?: string;
}

export interface RFQQuote {
  id?: string;
  rfqId: string;
  rfqNumber: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    discount?: number;
    description: string;
  }>;
  subtotal: number;
  tax: number;
  shippingCost: number;
  total: number;
  paymentTerms: string;
  deliveryTimeline: string;
  validity: string;
  validUntil: string;
  notes?: string;
  quotedBy?: string;
  quotedAt: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED";
}

export interface RFQResponse {
  rfqId: string;
  status: "ACCEPTED" | "REJECTED" | "NEGOTIATION_REQUEST";
  message?: string;
  counterOffer?: {
    items: Array<{ productId: string; quantity: number }>;
    notes: string;
  };
}

@Injectable({
  providedIn: "root",
})
export class RFQService {
  private baseUrl = "/api/v1/rfq";

  constructor(private http: HttpClient) {}

  /**
   * Create a new RFQ request
   */
  createRequest(rfqRequest: RFQRequest): Observable<RFQRequest> {
    return this.http.post<RFQRequest>(`${this.baseUrl}/requests`, rfqRequest);
  }

  /**
   * Get RFQ request by ID
   */
  getRequest(rfqId: string): Observable<RFQRequest> {
    return this.http.get<RFQRequest>(`${this.baseUrl}/requests/${rfqId}`);
  }

  /**
   * Get RFQ request by RFQ number
   */
  getRequestByNumber(rfqNumber: string): Observable<RFQRequest> {
    return this.http.get<RFQRequest>(
      `${this.baseUrl}/requests/number/${rfqNumber}`,
    );
  }

  /**
   * Get all RFQ requests for a user
   */
  getUserRequests(
    userId: string,
    page: number = 0,
    size: number = 20,
    status?: string,
  ): Observable<{ content: RFQRequest[]; totalElements: number }> {
    let params = new HttpParams()
      .set("page", page.toString())
      .set("size", size.toString());

    if (status) {
      params = params.set("status", status);
    }

    return this.http.get<{
      content: RFQRequest[];
      totalElements: number;
    }>(`${this.baseUrl}/requests/user/${userId}`, { params });
  }

  /**
   * Update RFQ request
   */
  updateRequest(
    rfqId: string,
    updates: Partial<RFQRequest>,
  ): Observable<RFQRequest> {
    return this.http.put<RFQRequest>(
      `${this.baseUrl}/requests/${rfqId}`,
      updates,
    );
  }

  /**
   * Cancel RFQ request
   */
  cancelRequest(rfqId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/requests/${rfqId}/cancel`, {});
  }

  /**
   * Get quote for RFQ
   */
  getQuote(rfqId: string): Observable<RFQQuote> {
    return this.http.get<RFQQuote>(`${this.baseUrl}/requests/${rfqId}/quote`);
  }

  /**
   * Get all quotes for RFQ
   */
  getAllQuotes(
    rfqId: string,
    page: number = 0,
    size: number = 10,
  ): Observable<{ content: RFQQuote[]; totalElements: number }> {
    const params = new HttpParams()
      .set("page", page.toString())
      .set("size", size.toString());

    return this.http.get<{
      content: RFQQuote[];
      totalElements: number;
    }>(`${this.baseUrl}/requests/${rfqId}/quotes`, { params });
  }

  /**
   * Download quote as PDF
   */
  downloadQuote(rfqId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/requests/${rfqId}/quote/pdf`, {
      responseType: "blob",
    });
  }

  /**
   * Accept quote
   */
  acceptQuote(rfqId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/requests/${rfqId}/accept`, {});
  }

  /**
   * Reject quote
   */
  rejectQuote(rfqId: string, reason?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/requests/${rfqId}/reject`, {
      reason,
    });
  }

  /**
   * Request negotiation on quote
   */
  requestNegotiation(
    rfqId: string,
    negotiationData: {
      items?: Array<{ productId: string; quantity: number }>;
      requestedPrice?: number;
      notes: string;
    },
  ): Observable<any> {
    return this.http.post(
      `${this.baseUrl}/requests/${rfqId}/negotiate`,
      negotiationData,
    );
  }

  /**
   * Get all RFQ requests (admin only)
   */
  getAllRequests(
    page: number = 0,
    size: number = 20,
    status?: string,
  ): Observable<{ content: RFQRequest[]; totalElements: number }> {
    let params = new HttpParams()
      .set("page", page.toString())
      .set("size", size.toString());

    if (status) {
      params = params.set("status", status);
    }

    return this.http.get<{
      content: RFQRequest[];
      totalElements: number;
    }>(`${this.baseUrl}/requests`, { params });
  }

  /**
   * Create quote for RFQ (admin only)
   */
  createQuote(rfqId: string, quote: RFQQuote): Observable<RFQQuote> {
    return this.http.post<RFQQuote>(
      `${this.baseUrl}/requests/${rfqId}/quote`,
      quote,
    );
  }

  /**
   * Update quote (admin only)
   */
  updateQuote(
    rfqId: string,
    quoteId: string,
    updates: Partial<RFQQuote>,
  ): Observable<RFQQuote> {
    return this.http.put<RFQQuote>(
      `${this.baseUrl}/requests/${rfqId}/quote/${quoteId}`,
      updates,
    );
  }

  /**
   * Send quote to user (admin only)
   */
  sendQuote(rfqId: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/requests/${rfqId}/send-quote`, {});
  }

  /**
   * Get RFQ statistics (admin only)
   */
  getStatistics(): Observable<{
    totalRequests: number;
    totalQuotes: number;
    acceptanceRate: number;
    averageQuoteValue: number;
  }> {
    return this.http.get<{
      totalRequests: number;
      totalQuotes: number;
      acceptanceRate: number;
      averageQuoteValue: number;
    }>(`${this.baseUrl}/statistics`);
  }
}
