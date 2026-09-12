import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { ApiConfigService } from "./api-config.service";

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
}
