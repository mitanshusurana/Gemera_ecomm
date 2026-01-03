# Backend API Specification

This document defines the API endpoints, request payloads, and responses required by the LuxeGems frontend. Use this specification to build the backend services.

## Base URL
All API endpoints should be prefixed with `/api`.

## Authentication

### Login
*   **Endpoint:** `POST /api/auth/login`
*   **Description:** Authenticates a user.
*   **Request Body:** `LoginRequest`
*   **Response:** `LoginResponse`

### Register
*   **Endpoint:** `POST /api/auth/register`
*   **Description:** Registers a new user.
*   **Request Body:** `RegisterRequest`
*   **Response:** `LoginResponse`

---

## Products

### Get All Products (Paginated)
*   **Endpoint:** `GET /api/products`
*   **Query Parameters:**
    *   `page` (number, default: 0): Page number (0-indexed).
    *   `size` (number, default: 12): Items per page.
    *   `category` (string, optional): Filter by category ID/slug.
    *   `minPrice`, `maxPrice` (number, optional): Price range.
    *   `sortBy` (string, optional): Field to sort by (e.g., 'price', 'date').
    *   `order` (string, optional): 'asc' or 'desc'.
    *   `occasions` (string, optional): Comma-separated list of occasions.
    *   `styles` (string, optional): Comma-separated list of styles.
*   **Response:** `PaginatedResponse<Product>`

### Get Product Detail
*   **Endpoint:** `GET /api/products/:id`
*   **Description:** Retrieves detailed information for a single product.
*   **Response:** `ProductDetail`

### Get Categories
*   **Endpoint:** `GET /api/categories`
*   **Response:** `{ categories: Category[] }`

---

## Cart

### Get Cart
*   **Endpoint:** `GET /api/cart`
*   **Description:** Retrieves the current user's cart.
*   **Response:** `Cart`

### Add Item to Cart
*   **Endpoint:** `POST /api/cart/items`
*   **Request Body:** `AddToCartRequest`
*   **Response:** `Cart` (Updated state)

### Update Cart Item Quantity
*   **Endpoint:** `PUT /api/cart/items/:itemId`
*   **Request Body:** `UpdateCartItemRequest`
*   **Response:** `Cart`

### Remove Item from Cart
*   **Endpoint:** `DELETE /api/cart/items/:itemId`
*   **Response:** `Cart`

---

## Orders

### Create Order
*   **Endpoint:** `POST /api/orders`
*   **Request Body:** `CreateOrderRequest`
*   **Response:** `Order`

---

## Data Transfer Objects (DTOs) & Models

### `Product`
```typescript
interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  category: string;
  stock: number;
  rating: number;
  reviewCount: number;
}
```

### `ProductDetail` (extends `Product`)
```typescript
interface ProductDetail extends Product {
  images: string[];
  specifications: Record<string, string>;
  relatedProducts: Product[];
}
```

### `Cart`
```typescript
interface Cart {
  items: CartItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
}
```

### `LoginRequest`
```typescript
interface LoginRequest {
  email: string;
  password: string;
}
```

### `LoginResponse`
```typescript
interface LoginResponse {
  token: string;
  user: UserDto;
}
```

### `AddToCartRequest`
```typescript
interface AddToCartRequest {
  productId: string;
  quantity: number;
  options?: {
    metal?: string;
    diamond?: string;
    customization?: string; // Engraving text
  };
}
```

### `PaginatedResponse<T>`
```typescript
interface PaginatedResponse<T> {
  content: T[];
  pageable: {
    pageNumber: number;
    pageSize: number;
    totalElements: number;
    totalPages: number;
  };
}
```
