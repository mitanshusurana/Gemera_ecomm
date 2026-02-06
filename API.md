# Gems & Jewellery Ecommerce - Backend API Specification

## Base URL
`https://your-springboot-api.com/api/v1`

---

## Authentication & User Profile

| Method | Endpoint | Description | Request Body | Response |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Authenticate user | `LoginRequest` | `AuthResponse` |
| `POST` | `/auth/register` | Register new user | `RegisterRequest` | `User` |
| `POST` | `/auth/refresh` | Refresh JWT token | `{ refreshToken: string }` | `AuthResponse` |
| `POST` | `/auth/logout` | Logout user | - | `{ message: string }` |
| `PUT` | `/users/profile` | Update user profile | `Partial<User>` | `User` |
| `GET` | `/users/loyalty` | Get loyalty points | - | `{ points: number, tier: string }` |
| `POST` | `/users/addresses` | Add address | `Address` (without ID) | `User` |
| `PUT` | `/users/addresses/:id` | Update address | `Partial<Address>` | `User` |
| `DELETE` | `/users/addresses/:id` | Delete address | - | `User` |

---

## Products

| Method | Endpoint | Description | Request | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/products` | Get paginated products | Query: `page`, `size`, `category`, `priceMin`, `priceMax`, `sort`, `search` | `PaginatedResponse<Product>` |
| `GET` | `/products/:id` | Get product details | - | `ProductDetail` |
| `GET` | `/products/categories` | Get all categories | - | `{ categories: Category[] }` |
| `GET` | `/products/search` | Search products | Query: `query`, `limit` | `{ results: Product[] }` |

---

## Cart

| Method | Endpoint | Description | Request Body | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/cart` | Get current user's cart | - | `Cart` |
| `POST` | `/cart/items` | Add item to cart | `AddToCartRequest` | `Cart` |
| `PUT` | `/cart/items/:itemId` | Update item quantity | `UpdateCartItemRequest` | `Cart` |
| `DELETE` | `/cart/items/:itemId` | Remove item | - | `Cart` |
| `POST` | `/cart/apply-coupon` | Apply discount code | `ApplyCouponRequest` | `Cart` |
| `POST` | `/cart/options` | Update cart options (e.g. Gift Wrap) | `{ giftWrap: boolean }` | `Cart` |
| `POST` | `/cart/wishlist` | Add item to wishlist | `{ productId: string }` | `Cart` |
| `DELETE` | `/cart/wishlist/:productId` | Remove item from wishlist | - | `Cart` |

---

## Orders

| Method | Endpoint | Description | Request Body | Response |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/orders` | Create new order | `CreateOrderRequest` | `Order` |
| `GET` | `/orders` | Get user orders | Query: `page`, `size` | `PaginatedResponse<Order>` |
| `GET` | `/orders/:id` | Get order details | - | `Order` |
| `GET` | `/orders/track/:id` | Track order (Public) | - | `OrderTracking` |
| `PUT` | `/orders/:id/status` | Update status (Admin) | `{ status: string, trackingNumber?: string }` | `Order` |

---

## Payments (Razorpay)

| Method | Endpoint | Description | Request Body | Response |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/payments/razorpay-order` | Create Razorpay Order ID | `CreateRazorpayOrderRequest` | `RazorpayOrderResponse` |
| `POST` | `/transactions/failure` | Log failed transaction | `TransactionFailureRequest` | - |

---

## Store Locator

| Method | Endpoint | Description | Request | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/stores` | Get all store locations | - | `{ stores: Store[] }` |

---

## Treasure Plan

| Method | Endpoint | Description | Request Body | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/treasure/account` | Get plan details | - | `TreasureChestAccount` |
| `POST` | `/treasure/enroll` | Enroll in new plan | `{ planName: string, installmentAmount: number }` | `TreasureChestAccount` |

---

## Request for Quote (RFQ)

| Method | Endpoint | Description | Request Body | Response |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/rfq/requests` | Create RFQ | `RFQRequest` | `RFQRequest` |
| `GET` | `/rfq/requests/:id` | Get RFQ details | - | `RFQRequest` |
| `GET` | `/rfq/requests/number/:rfqNumber` | Get RFQ by Number | - | `RFQRequest` |
| `GET` | `/rfq/requests/user/:userId` | Get User Requests | Query: `page`, `size`, `status` | `PaginatedResponse<RFQRequest>` |
| `PUT` | `/rfq/requests/:id` | Update RFQ | `Partial<RFQRequest>` | `RFQRequest` |
| `POST` | `/rfq/requests/:id/cancel` | Cancel RFQ | - | - |
| `GET` | `/rfq/requests/:id/quote` | Get Quote | - | `RFQQuote` |
| `GET` | `/rfq/requests/:id/quotes` | Get All Quotes for RFQ | Query: `page`, `size` | `PaginatedResponse<RFQQuote>` |
| `GET` | `/rfq/requests/:id/quote/pdf` | Download Quote PDF | - | `Blob` |
| `POST` | `/rfq/requests/:id/accept` | Accept Quote | - | - |
| `POST` | `/rfq/requests/:id/reject` | Reject Quote | `{ reason: string }` | - |
| `POST` | `/rfq/requests/:id/negotiate` | Request Negotiation | `NegotiationRequest` | - |

---

## Certificate Verification

| Method | Endpoint | Description | Request | Response |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/certificates/:reportNumber` | Verify certificate | - | `CertificateDetail` |
| `GET` | `/certificates/:reportNumber/download` | Download Certificate PDF | - | `Blob` |

---

## Email Notifications

| Method | Endpoint | Description | Request Body | Response |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/email/send` | Send email notification | `EmailNotification` | `EmailNotification` |
| `GET` | `/email/notifications/:id` | Get notification by ID | - | `EmailNotification` |
| `GET` | `/email/notifications` | Get user notifications | Query: `email`, `page`, `size` | `PaginatedResponse<EmailNotification>` |
| `POST` | `/email/subscribe` | Subscribe to newsletter | `{ email: string }` | - |
| `POST` | `/email/unsubscribe` | Unsubscribe from newsletter | `{ email: string }` | - |
| `GET` | `/email/templates/:name` | Get email template | - | `EmailTemplate` |
| `GET` | `/email/templates` | Get all templates | - | `EmailTemplate[]` |

---

## Data Models (DTOs)

### Authentication & User
```typescript
interface LoginRequest { email: string; password: string; }
interface RegisterRequest { firstName: string; lastName: string; email: string; phone: string; password: string; }
interface AuthResponse { token: string; refreshToken: string; user: User; }
interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role?: 'ADMIN' | 'USER';
  addresses?: Address[];
  loyaltyPoints?: number;
}
interface Address {
    id: string;
    firstName: string;
    lastName: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
    phone: string;
    isDefault?: boolean;
}
```

### Cart & Orders
```typescript
interface AddToCartRequest { productId: string; quantity: number; options?: any; }
interface UpdateCartItemRequest { quantity: number; }
interface CreateOrderRequest {
  shippingAddress: Address;
  billingAddress: Address;
  paymentMethod: string;
  shippingMethod: string;
  items: CartItem[];
  total: number;
  paymentDetails?: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  };
}
```

### Payments
```typescript
interface CreateRazorpayOrderRequest { amount: number; currency: string; }
interface RazorpayOrderResponse { id: string; amount: number; currency: string; status: string; }
interface TransactionFailureRequest {
  error_code: string;
  error_description: string;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
}
```

### Store
```typescript
interface Store {
  id: number;
  name: string;
  address: string;
  phone: string;
  hours: string;
  lat: number;
  lng: number;
}
```

### RFQ
```typescript
interface RFQRequest {
  id?: string;
  rfqNumber?: string;
  userId: string;
  email: string;
  companyName: string;
  items: RFQItem[];
  estimatedBudget?: number;
  deliveryTimeline?: string;
  additionalNotes?: string;
  status?: string;
  createdAt?: string;
  expiresAt?: string;
}

interface NegotiationRequest {
    items?: Array<{ productId: string; quantity: number }>;
    requestedPrice?: number;
    notes: string;
}
```

### Certificate
```typescript
interface CertificateDetail {
  id: string;
  reportNumber: string;
  lab: string;
  dateIssued: string;
  productName: string;
  carat: number;
  color: string;
  clarity: string;
  cut: string;
  shape: string;
  imageUrl?: string;
}
```

### Email
```typescript
interface EmailNotification {
  id?: string;
  type: "ORDER_CONFIRMATION" | "SHIPPING" | "DELIVERY" | "PROMOTIONAL";
  email: string;
  subject: string;
  templateName: string;
  data: Record<string, any>;
  sentAt?: string;
  status?: "PENDING" | "SENT" | "FAILED";
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlContent: string;
  placeholders: string[];
}
```
