# Gems & Jewellery Ecommerce - Backend API Specification

## Base URL
`https://your-springboot-api.com/api/v1`

---

## Authentication

| Method | Endpoint | Description | Request Body | Response |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/auth/login` | Authenticate user | `LoginRequest` | `AuthResponse` |
| `POST` | `/auth/register` | Register new user | `RegisterRequest` | `User` |
| `POST` | `/auth/refresh` | Refresh JWT token | `{ refreshToken: string }` | `AuthResponse` |
| `POST` | `/auth/logout` | Logout user | - | `{ message: string }` |

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

---

## Data Models (DTOs)

### Authentication
```typescript
interface LoginRequest { email: string; password: string; }
interface RegisterRequest { firstName: string; lastName: string; email: string; phone: string; password: string; }
interface AuthResponse { token: string; refreshToken: string; user: User; }
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
