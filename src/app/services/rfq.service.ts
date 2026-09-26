import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";
import { ApiConfigService } from "./api-config.service";

export interface RFQItem {
  productId: string;
  quantity: number;
  specifications?: Record<string, any>;
  customization?: string;
  description?: string;
  targetPrice?: number;
}

export interface RFQQuote {
  price: number;
  validUntil?: string | null;
  notes?: string | null;
  status?: "QUOTED" | "ACCEPTED";
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
    | "CANCELLED"
    | "EXPIRED";
  createdAt?: string;
  expiresAt?: string;
  quotedPrice?: number;
  quotedAt?: string;
  validUntil?: string;
  quotes?: RFQQuote[];
  /** The order created when the quote was accepted, when any. */
  orderId?: string | null;
  orderNumber?: string | null;
  orderStatus?: string | null;
}

/** Response of POST /rfq/requests/{id}/accept. */
export interface AcceptQuoteResponse {
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  /** Null when already paid or the gateway is not configured (retry via OrderService.paymentOrder). */
  razorpayOrderId: string | null;
  /** Paise. */
  amount: number | null;
  currency: string;
  amountInr: number;
}

@Injectable({
  providedIn: "root",
})
export class RFQService {
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint("rfq");

  constructor(private http: HttpClient) {}

  /**
   * Create a new RFQ request
   */
  createRequest(rfqRequest: RFQRequest): Observable<RFQRequest> {
    return this.http.post<RFQRequest>(`${this.baseUrl}/requests`, rfqRequest);
  }

  /** The signed-in customer's requests, newest first. */
  myRequests(userId: string, page = 0, size = 20): Observable<{ content: RFQRequest[] }> {
    const params = new HttpParams().set("page", String(page)).set("size", String(size));
    return this.http.get<{ content: RFQRequest[] }>(`${this.baseUrl}/requests/user/${userId}`, { params });
  }

  /** Accepts the latest quote: the API creates the order and its Razorpay order. */
  accept(id: string): Observable<AcceptQuoteResponse> {
    return this.http.post<AcceptQuoteResponse>(`${this.baseUrl}/requests/${id}/accept`, {});
  }

  reject(id: string, reason: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/requests/${id}/reject`, { reason });
  }
}
