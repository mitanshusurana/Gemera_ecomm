# Gems & Jewellery Ecommerce - Backend API Contracts

## Base URL

```
https://your-springboot-api.com/api/v1
```

## Authentication APIs

### 1. User Registration

```
POST /auth/register
Content-Type: application/json

Request Body:
{
  "email": "user@example.com",
  "password": "secure_password",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}

Response (201 Created):
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### 2. User Login

```
POST /auth/login
Content-Type: application/json

Request Body:
{
  "email": "user@example.com",
  "password": "secure_password"
}

Response (200 OK):
{
  "token": "jwt_token_here",
  "refreshToken": "refresh_token_here",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890"
  }
}
```

### 3. Refresh Token

```
POST /auth/refresh
Content-Type: application/json
Authorization: Bearer {refreshToken}

Request Body:
{
  "refreshToken": "refresh_token_here"
}

Response (200 OK):
{
  "token": "new_jwt_token",
  "refreshToken": "new_refresh_token"
}
```

### 4. Logout

```
POST /auth/logout
Authorization: Bearer {token}

Response (200 OK):
{
  "message": "Logged out successfully"
}
```

## Product APIs

### 5. Get All Products (with Pagination & Filtering)

```
GET /products?page=0&size=20&sortBy=createdAt&order=DESC&category=DIAMOND&priceMin=0&priceMax=100000&search=ring

Response (200 OK):
{
  "content": [
    {
      "id": "uuid",
      "name": "Diamond Solitaire Ring",
      "description": "Classic 1 carat diamond ring",
      "price": 45000,
      "originalPrice": 50000,
      "rating": 4.5,
      "reviewCount": 125,
      "imageUrl": "https://s3-bucket.com/products/ring-001.jpg",
      "videoUrl": "https://s3-bucket.com/products/ring-001.mp4",
      "category": "DIAMOND",
      "subcategory": "RINGS",
      "gemstones": ["Diamond"],
      "metal": "18K White Gold",
      "weight": 5.5,
      "stock": 15,
      "sku": "DS-RING-001",
      "certifications": ["GIA", "IGI"],
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pageable": {
    "page": 0,
    "size": 20,
    "totalElements": 250,
    "totalPages": 13
  }
}
```

### 6. Get Product by ID

```
GET /products/{productId}

Response (200 OK):
{
  "id": "uuid",
  "name": "Diamond Solitaire Ring",
  "description": "Classic 1 carat diamond ring",
  "price": 45000,
  "originalPrice": 50000,
  "rating": 4.5,
  "reviewCount": 125,
  "imageUrl": "https://s3-bucket.com/products/ring-001.jpg",
  "videoUrl": "https://s3-bucket.com/products/ring-001.mp4",
  "category": "DIAMOND",
  "subcategory": "RINGS",
  "gemstones": ["Diamond"],
  "metal": "18K White Gold",
  "weight": 5.5,
  "stock": 15,
  "sku": "DS-RING-001",
  "certifications": ["GIA", "IGI"],
  "images": [
    {
      "url": "https://s3-bucket.com/products/ring-001.jpg",
      "alt": "Front view"
    },
    {
      "url": "https://s3-bucket.com/products/ring-002.jpg",
      "alt": "Side view"
    }
  ],
  "specifications": {
    "carat": 1.0,
    "clarity": "VS1",
    "color": "G",
    "cut": "Excellent",
    "origin": "Lab-grown",
    "productDetails": {
       "sku": "DS-RING-001",
       "width": "2mm",
       "height": "20mm",
       "grossWeight": 4.5
    },
    "metalDetails": [
       { "type": "18K Gold", "weight": 4.0, "purity": "750" }
    ],
    "diamondDetails": [
       { "type": "Round", "count": 1, "totalWeight": 1.0, "clarity": "VS1", "color": "G" }
    ]
  },
  "relatedProducts": ["uuid1", "uuid2", "uuid3"],
  "priceBreakup": {
      "metal": 30000,
      "gemstone": 10000,
      "makingCharges": 2000,
      "tax": 1260,
      "total": 43260,
      "discount": 0,
      "grandTotal": 43260
  }
}
```

### 7. Get Categories

```
GET /products/categories

Response (200 OK):
{
  "categories": [
    {
      "id": "uuid",
      "name": "DIAMOND",
      "displayName": "Diamonds",
      "image": "https://s3-bucket.com/categories/diamond.jpg",
      "subcategories": [
        {
          "id": "uuid",
          "name": "RINGS",
          "displayName": "Rings"
        },
        {
          "id": "uuid",
          "name": "NECKLACES",
          "displayName": "Necklaces"
        }
      ]
    },
    {
      "id": "uuid",
      "name": "GEMSTONE",
      "displayName": "Gemstones"
    },
    {
      "id": "uuid",
      "name": "PRECIOUS_METAL",
      "displayName": "Precious Metals"
    }
  ]
}
```

### 8. Search Products

```
GET /products/search?query=diamond+ring&limit=10

Response (200 OK):
{
  "results": [
    {
      "id": "uuid",
      "name": "Diamond Solitaire Ring",
      "price": 45000,
      "imageUrl": "https://s3-bucket.com/products/ring-001.jpg"
    }
  ]
}
```

## Cart APIs

### 9. Get Cart

```
GET /cart
Authorization: Bearer {token}

Response (200 OK):
{
  "id": "uuid",
  "items": [
    {
      "id": "uuid",
      "productId": "uuid",
      "quantity": 1,
      "price": 45000,
      "product": {
        "id": "uuid",
        "name": "Diamond Solitaire Ring",
        "imageUrl": "https://s3-bucket.com/products/ring-001.jpg"
      },
      "selectedMetal": {"name": "18K Gold"},
      "selectedDiamond": {"name": "VS1"}
    }
  ],
  "subtotal": 45000,
  "tax": 4500,
  "shipping": 500,
  "total": 50000,
  "appliedDiscount": 0,
  "wishlist": [
     {
        "id": "uuid",
        "name": "Wishlisted Item",
        "price": 20000,
        "imageUrl": "..."
     }
  ]
}
```

### 10. Add Item to Cart

```
POST /cart/items
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "productId": "uuid",
  "quantity": 1,
  "options": {
     "metal": { "name": "18K Gold" },
     "diamond": { "name": "VS1" },
     "engraving": "Love You"
  }
}

Response (200 OK):
{
  "id": "uuid",
  "items": [...],
  "total": 50000
}
```

### 11. Update Cart Item

```
PUT /cart/items/{itemId}
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "quantity": 2
}

Response (200 OK):
{
  "id": "uuid",
  "items": [...],
  "total": 95000
}
```

### 12. Remove Cart Item

```
DELETE /cart/items/{itemId}
Authorization: Bearer {token}

Response (200 OK):
{
  "message": "Item removed from cart"
}
```

### 13. Apply Coupon/Discount Code

```
POST /cart/apply-coupon
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "couponCode": "SAVE20"
}

Response (200 OK):
{
  "id": "uuid",
  "items": [...],
  "subtotal": 45000,
  "discount": 9000,
  "tax": 3600,
  "shipping": 500,
  "total": 40100
}
```

## Order APIs

### 14. Create Order (Checkout)

```
POST /orders
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "shippingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "address": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  },
  "billingAddress": {
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "address": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001",
    "country": "USA"
  },
  "paymentMethod": "CREDIT_CARD",
  "shippingMethod": "EXPRESS"
}

Response (200 OK):
{
  "id": "uuid",
  "orderNumber": "ORD-2024-001",
  "userId": "uuid",
  "items": [...],
  "status": "PENDING_PAYMENT",
  "total": 50000,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### 15. Get Order by ID (Authenticated)

```
GET /orders/{orderId}
Authorization: Bearer {token}

Response (200 OK):
{
  "id": "uuid",
  "orderNumber": "ORD-2024-001",
  "items": [
     {
        "id": "uuid",
        "product": {...},
        "selectedMetal": {...},
        "selectedDiamond": {...}
     }
  ],
  "status": "CONFIRMED",
  "total": 50000,
  "trackingNumber": "TRACK123456",
  "estimatedDelivery": "2024-01-10T00:00:00Z",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### 16. Get User Orders

```
GET /orders?page=0&size=10
Authorization: Bearer {token}

Response (200 OK):
{
  "content": [
    {
      "id": "uuid",
      "orderNumber": "ORD-2024-001",
      "total": 50000,
      "status": "CONFIRMED",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pageable": {
    "page": 0,
    "size": 10,
    "totalElements": 5,
    "totalPages": 1
  }
}
```

### 17. Track Order (Public)

```
GET /orders/track/{orderId}

Response (200 OK):
{
  "id": "uuid",
  "orderNumber": "ORD-2024-001",
  "status": "SHIPPED",
  "estimatedDelivery": "2024-01-10T00:00:00Z",
  "items": [
     {
        "productName": "Diamond Ring",
        "quantity": 1,
        "imageUrl": "..."
     }
  ]
}
```

### 18. Update Order Status (Admin)

```
PUT /orders/{orderId}/status
Authorization: Bearer {adminToken}
Content-Type: application/json

Request Body:
{
  "status": "SHIPPED",
  "trackingNumber": "TRACK123456"
}

Response (200 OK):
{
  "id": "uuid",
  "status": "SHIPPED",
  "trackingNumber": "TRACK123456"
}
```

## Treasure Plan APIs

### 19. Get Treasure Plan Account

```
GET /treasure/account
Authorization: Bearer {token}

Response (200 OK):
{
   "id": "uuid",
   "planName": "Standard Plan",
   "balance": 9000,
   "installmentsPaid": 9,
   "totalInstallments": 10,
   "status": "ACTIVE",
   "nextDueDate": "2024-02-01"
}
```

### 20. Enroll in Treasure Plan

```
POST /treasure/enroll
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
   "planName": "Standard Plan",
   "installmentAmount": 1000
}

Response (200 OK):
{
   "id": "uuid",
   "status": "ACTIVE",
   "startDate": "2024-01-01"
}
```

## Store Locator APIs

### 21. Get All Stores

```
GET /stores

Response (200 OK):
{
   "stores": [
      {
         "id": "1",
         "name": "New York Flagship",
         "address": "123 5th Ave",
         "coordinates": { "lat": 40.7128, "lng": -74.0060 }
      }
   ]
}
```

## Payment APIs (Stripe/Razorpay)

*(Same as original)*

## User/Profile APIs

*(Same as original)*

## Review & Rating APIs

*(Same as original)*

## Email Notification APIs

*(Same as original)*

## RFQ APIs

*(Same as original)*
