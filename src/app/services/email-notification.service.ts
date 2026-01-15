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

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  placeholders: string[];
}

@Injectable({
  providedIn: "root",
})
export class EmailNotificationService {
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint("email");

  constructor(private http: HttpClient) {}

  /**
   * Send order confirmation email
   */
  sendOrderConfirmation(orderData: {
    email: string;
    orderNumber: string;
    orderTotal: number;
    items: Array<{ name: string; quantity: number; price: number }>;
    shippingAddress: {
      firstName: string;
      lastName: string;
      address: string;
      city: string;
      state: string;
      zipCode: string;
      country: string;
    };
    estimatedDelivery: string;
  }): Observable<EmailNotification> {
    const notification: EmailNotification = {
      type: "ORDER_CONFIRMATION",
      email: orderData.email,
      subject: `Order Confirmation #${orderData.orderNumber}`,
      templateName: "order_confirmation",
      data: orderData,
    };
    return this.http.post<EmailNotification>(
      `${this.baseUrl}/send`,
      notification,
    );
  }

  /**
   * Send shipping notification email
   */
  sendShippingNotification(shipmentData: {
    email: string;
    orderNumber: string;
    trackingNumber: string;
    carrier: string;
    estimatedDelivery: string;
    items: Array<{ name: string; quantity: number }>;
  }): Observable<EmailNotification> {
    const notification: EmailNotification = {
      type: "SHIPPING",
      email: shipmentData.email,
      subject: `Your Order ${shipmentData.orderNumber} has shipped`,
      templateName: "shipping_notification",
      data: shipmentData,
    };
    return this.http.post<EmailNotification>(
      `${this.baseUrl}/send`,
      notification,
    );
  }

  /**
   * Send delivery confirmation email
   */
  sendDeliveryConfirmation(deliveryData: {
    email: string;
    orderNumber: string;
    deliveryDate: string;
    items: Array<{ name: string; quantity: number }>;
  }): Observable<EmailNotification> {
    const notification: EmailNotification = {
      type: "DELIVERY",
      email: deliveryData.email,
      subject: `Delivered: Order #${deliveryData.orderNumber}`,
      templateName: "delivery_confirmation",
      data: deliveryData,
    };
    return this.http.post<EmailNotification>(
      `${this.baseUrl}/send`,
      notification,
    );
  }

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
   * Get email notification by ID
   */
  getNotification(notificationId: string): Observable<EmailNotification> {
    return this.http.get<EmailNotification>(
      `${this.baseUrl}/notifications/${notificationId}`,
    );
  }

  /**
   * Get all notifications for a user
   */
  getUserNotifications(
    email: string,
    page: number = 0,
    size: number = 20,
  ): Observable<{ content: EmailNotification[]; totalElements: number }> {
    return this.http.get<{
      content: EmailNotification[];
      totalElements: number;
    }>(`${this.baseUrl}/notifications`, {
      params: { email, page: page.toString(), size: size.toString() },
    });
  }

  /**
   * Subscribe user to email notifications
   */
  subscribeToNotifications(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/subscribe`, { email });
  }

  /**
   * Unsubscribe user from email notifications
   */
  unsubscribeFromNotifications(email: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/unsubscribe`, { email });
  }

  /**
   * Get email template by name
   */
  getTemplate(templateName: string): Observable<EmailTemplate> {
    return this.http.get<EmailTemplate>(
      `${this.baseUrl}/templates/${templateName}`,
    );
  }

  /**
   * Get all email templates
   */
  getTemplates(): Observable<EmailTemplate[]> {
    return this.http.get<EmailTemplate[]>(`${this.baseUrl}/templates`);
  }
}
