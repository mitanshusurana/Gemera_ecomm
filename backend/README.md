# Backend Development Guide & API Specification

This document serves as the **single source of truth** for backend development. It consolidates all API contracts, data models, and business logic requirements derived from the frontend codebase and initial specifications.

---

## ⚠️ Critical Implementation Addendum (Frontend Requirements)

The following requirements are **strictly required** by the current frontend implementation but were missing or unclear in previous documentation. The backend **must** implement these to prevent frontend breakage.

### 1. Product Filtering
The `GET /api/v1/products` endpoint must support the following additional query parameters:
*   `occasions`: (string) Comma-separated list of occasions (e.g., "wedding,anniversary").
*   `styles`: (string) Comma-separated list of styles (e.g., "modern,vintage").

### 2. Advanced Cart Item Options (Customization)
The `POST /api/v1/cart/items` endpoint must accept and persist an `options` object in the request body. This is crucial for the "Build Your Own Ring" feature and Engravings.

**Request Body Schema:**
```json
{
  "productId": "uuid",
  "quantity": 1,
  "options": {
    "metal": "18K Gold",       // Optional: Selected metal type
    "diamond": "VVS1",         // Optional: Selected diamond quality
    "stoneId": "uuid-stone",   // Optional: For 'Builder' flow (selected loose stone)
    "stoneName": "Emerald",    // Optional: Name of the stone
    "customization": "Love You" // Optional: Engraving text
  }
}
```

### 3. Cart Options (Gift Wrapping)
A dedicated endpoint is required to toggle global cart options like gift wrapping.

*   **Endpoint:** `POST /api/v1/cart/options`
*   **Request Body:**
    ```json
    {
      "giftWrap": true
    }
    ```
*   **Response:** Updated `Cart` object.

### 4. RFQ (Request for Quote) Extras
The frontend service `RFQService` expects these specific endpoints which were previously undocumented:
*   **Cancel Request:** `POST /api/v1/rfq/requests/{rfqId}/cancel`
*   **Statistics (Admin):** `GET /api/v1/rfq/statistics`
    *   Response: `{ "totalRequests": 10, "totalQuotes": 5, "acceptanceRate": 0.5, "averageQuoteValue": 5000 }`

---

## 🛠️ General Architecture & Rules

1.  **Base URL:** All endpoints must be prefixed with `/api/v1`.
2.  **Authentication:**
    *   Use JWT (JSON Web Tokens).
    *   Header format: `Authorization: Bearer <token>`.
    *   Implement Refresh Token Rotation (`POST /auth/refresh`).
3.  **CORS:** Allow requests from the Angular frontend origin (default `http://localhost:4200` for dev).
4.  **Error Handling:** Return standard HTTP status codes (400, 401, 403, 404, 500) with a JSON body: `{ "message": "Error details" }`.
5.  **Pagination:** Use 0-indexed page numbers. Default size: 20.
6.  **Date Format:** ISO 8601 (`YYYY-MM-DDTHH:mm:ssZ`).

---

## 📡 API Contracts

### Authentication APIs

#### 1. User Registration
*   **Endpoint:** `POST /auth/register`
*   **Body:**
    ```json
    {
      "email": "user@example.com",
      "password": "secure_password",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1234567890"
    }
    ```
*   **Response (201):** User object (id, email, names, etc.)

#### 2. User Login
*   **Endpoint:** `POST /auth/login`
*   **Body:** `{ "email": "...", "password": "..." }`
*   **Response (200):**
    ```json
    {
      "token": "jwt_token",
      "refreshToken": "refresh_token",
      "user": { ... }
    }
    ```

#### 3. Refresh Token
*   **Endpoint:** `POST /auth/refresh`
*   **Body:** `{ "refreshToken": "..." }`

#### 4. Logout
*   **Endpoint:** `POST /auth/logout`

### Product APIs

#### 5. Get All Products
*   **Endpoint:** `GET /products`
*   **Params:** `page`, `size`, `sortBy`, `order`, `category`, `priceMin`, `priceMax`, `search`, `occasions`, `styles`.
*   **Response:**
    ```json
    {
      "content": [ { "id": "...", "name": "...", "price": 100, ... } ],
      "pageable": { "page": 0, "size": 20, "totalElements": 100, "totalPages": 5 }
    }
    ```

#### 6. Get Product by ID
*   **Endpoint:** `GET /products/{id}`
*   **Response:** `ProductDetail` (includes `images`, `specifications`, `relatedProducts`).

#### 7. Get Categories
*   **Endpoint:** `GET /products/categories`
*   **Response:** `{ "categories": [ ... ] }`

#### 8. Search
*   **Endpoint:** `GET /products/search?query=...`

### Cart APIs

#### 9. Get Cart
*   **Endpoint:** `GET /cart`
*   **Response:**
    ```json
    {
      "id": "...",
      "items": [ ... ],
      "subtotal": 100,
      "tax": 10,
      "shipping": 5,
      "total": 115,
      "giftWrap": false
    }
    ```

#### 10. Add Item
*   **Endpoint:** `POST /cart/items`
*   **Body:** (See **Critical Implementation Addendum #2**)

#### 11. Update Quantity
*   **Endpoint:** `PUT /cart/items/{itemId}`
*   **Body:** `{ "quantity": 2 }`

#### 12. Remove Item
*   **Endpoint:** `DELETE /cart/items/{itemId}`

#### 13. Apply Coupon
*   **Endpoint:** `POST /cart/apply-coupon`
*   **Body:** `{ "couponCode": "SAVE20" }`

### Order APIs

#### 14. Create Order (Checkout)
*   **Endpoint:** `POST /orders`
*   **Body:**
    ```json
    {
      "shippingAddress": { ... },
      "billingAddress": { ... },
      "paymentMethod": "CREDIT_CARD",
      "shippingMethod": "EXPRESS"
    }
    ```
*   **Response:** Order object (id, status: "PENDING_PAYMENT", total, etc.)

#### 15. Get User Orders
*   **Endpoint:** `GET /orders`

#### 16. Get Order Details
*   **Endpoint:** `GET /orders/{orderId}`

### Payment APIs

#### 17. Initialize Stripe
*   **Endpoint:** `POST /payments/stripe/initialize`
*   **Body:** `{ "orderId": "...", "amount": 5000, "currency": "USD" }`
*   **Response:** `{ "clientSecret": "..." }`

#### 18. Initialize Razorpay
*   **Endpoint:** `POST /payments/razorpay/initialize`
*   **Body:** `{ "orderId": "...", "amount": 500000, "currency": "INR" }`

### User Profile APIs

#### 19. Get Me
*   **Endpoint:** `GET /users/me`

#### 20. Update Profile
*   **Endpoint:** `PUT /users/me`

#### 21. Wishlist Operations
*   `GET /users/wishlist`
*   `POST /users/wishlist` (Body: `{ "productId": "..." }`)
*   `DELETE /users/wishlist/{productId}`

### RFQ (Request for Quote) APIs

*   **Create Request:** `POST /rfq/requests`
*   **Get Request:** `GET /rfq/requests/{id}`
*   **Get User Requests:** `GET /rfq/requests/user/{userId}`
*   **Accept Quote:** `POST /rfq/requests/{id}/accept`
*   **Negotiate:** `POST /rfq/requests/{id}/negotiate`
*   **(Admin) Create Quote:** `POST /rfq/requests/{id}/quote`

---

## 📦 Data Models (Reference)

### Product
```typescript
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  stock: number;
  images: string[]; // Array of URLs
}
```

### Cart Item
```typescript
interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  product: Product;
  // Custom fields
  selectedMetal?: string;
  selectedDiamond?: string;
  stoneId?: string;
  customization?: string;
}
```
