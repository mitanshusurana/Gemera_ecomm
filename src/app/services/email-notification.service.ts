import { Injectable, inject } from "@angular/core";
import { HttpClient } from "@angular/common/http";
import { Observable } from "rxjs";
import { ApiConfigService } from "./api-config.service";

export interface EmailNotification {
  id?: string;
  type: "ORDER_CONFIRMATION" | "SHIPPING" | "DELIVERY" | "PROMOTIONAL";
  email: string;
  subject: string;
  templateName: string;
  data: Record<string, any>;
  sentAt?: string;
  status?: "PENDING" | "SENT" | "FAILED";
}

@Injectable({
  providedIn: "root",
})
export class EmailNotificationService {
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint("email");

  constructor(private http: HttpClient) {}

  /**
   * Send promotional email
   */
  sendPromotionalEmail(promotionData: {
    email: string;
    subject: string;
    content: string;
    discount?: number;
    validUntil?: string;
  }): Observable<EmailNotification> {
    const notification: EmailNotification = {
      type: "PROMOTIONAL",
      email: promotionData.email,
      subject: promotionData.subject,
      templateName: "promotional",
      data: promotionData,
    };
    return this.http.post<EmailNotification>(
      `${this.baseUrl}/send`,
      notification,
    );
  }

  /**
   * Subscribe user to email notifications
   */
  subscribeToNotifications(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/subscribe`, { email });
  }
}
