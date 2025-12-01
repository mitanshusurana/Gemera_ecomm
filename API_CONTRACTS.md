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
    "origin": "Lab-grown"
  },
  "relatedProducts": ["uuid1", "uuid2", "uuid3"]
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
      }
    }
  ],
  "subtotal": 45000,
  "tax": 4500,
  "shipping": 500,
  "total": 50000,
  "appliedDiscount": 0
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
  "quantity": 1
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

### 15. Get Order by ID
```
GET /orders/{orderId}
Authorization: Bearer {token}

Response (200 OK):
{
  "id": "uuid",
  "orderNumber": "ORD-2024-001",
  "items": [...],
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

### 17. Update Order Status (Admin)
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

## Payment APIs

### 18. Initialize Payment (Stripe)
```
POST /payments/stripe/initialize
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "orderId": "uuid",
  "amount": 50000,
  "currency": "USD",
  "paymentMethod": "STRIPE"
}

Response (200 OK):
{
  "paymentId": "uuid",
  "clientSecret": "pi_1234567890_secret_XXXXX",
  "status": "PENDING",
  "paymentGateway": "STRIPE"
}
```

### 19. Verify Payment (Stripe)
```
POST /payments/stripe/verify
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "paymentId": "uuid",
  "paymentIntentId": "pi_1234567890"
}

Response (200 OK):
{
  "id": "uuid",
  "orderId": "uuid",
  "status": "COMPLETED",
  "amount": 50000,
  "transactionId": "pi_1234567890",
  "paymentMethod": "STRIPE"
}
```

### 20. Initialize Payment (Razorpay)
```
POST /payments/razorpay/initialize
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "orderId": "uuid",
  "amount": 5000000,
  "currency": "INR",
  "paymentMethod": "RAZORPAY",
  "customerEmail": "user@example.com",
  "customerPhone": "+1234567890"
}

Response (200 OK):
{
  "paymentId": "uuid",
  "orderId": "order_XXXXX",
  "amount": 5000000,
  "currency": "INR",
  "status": "PENDING",
  "paymentGateway": "RAZORPAY"
}
```

### 21. Verify Payment (Razorpay)
```
POST /payments/razorpay/verify
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "paymentId": "uuid",
  "razorpayPaymentId": "pay_XXXXX",
  "razorpayOrderId": "order_XXXXX",
  "razorpaySignature": "signature_XXXXX"
}

Response (200 OK):
{
  "id": "uuid",
  "orderId": "uuid",
  "status": "COMPLETED",
  "amount": 5000000,
  "transactionId": "pay_XXXXX",
  "paymentMethod": "RAZORPAY"
}
```

## User/Profile APIs

### 22. Get Current User
```
GET /users/me
Authorization: Bearer {token}

Response (200 OK):
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "avatar": "https://s3-bucket.com/avatars/user-001.jpg",
  "addresses": [
    {
      "id": "uuid",
      "type": "SHIPPING",
      "firstName": "John",
      "lastName": "Doe",
      "address": "123 Main St",
      "city": "New York",
      "state": "NY",
      "zipCode": "10001",
      "country": "USA",
      "isDefault": true
    }
  ],
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### 23. Update User Profile
```
PUT /users/me
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}

Response (200 OK):
{
  "id": "uuid",
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890"
}
```

### 24. Get Wishlist
```
GET /users/wishlist
Authorization: Bearer {token}

Response (200 OK):
{
  "items": [
    {
      "id": "uuid",
      "productId": "uuid",
      "product": {
        "id": "uuid",
        "name": "Diamond Solitaire Ring",
        "price": 45000,
        "imageUrl": "https://s3-bucket.com/products/ring-001.jpg"
      },
      "addedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### 25. Add to Wishlist
```
POST /users/wishlist
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "productId": "uuid"
}

Response (200 OK):
{
  "id": "uuid",
  "productId": "uuid"
}
```

### 26. Remove from Wishlist
```
DELETE /users/wishlist/{productId}
Authorization: Bearer {token}

Response (200 OK):
{
  "message": "Removed from wishlist"
}
```

## Review & Rating APIs

### 27. Get Product Reviews
```
GET /products/{productId}/reviews?page=0&size=10

Response (200 OK):
{
  "content": [
    {
      "id": "uuid",
      "productId": "uuid",
      "userId": "uuid",
      "userName": "John Doe",
      "rating": 5,
      "title": "Excellent quality",
      "comment": "Highly satisfied with the quality and delivery",
      "verified": true,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pageable": {
    "page": 0,
    "size": 10,
    "totalElements": 45,
    "totalPages": 5
  }
}
```

### 28. Create Review
```
POST /products/{productId}/reviews
Authorization: Bearer {token}
Content-Type: application/json

Request Body:
{
  "rating": 5,
  "title": "Excellent quality",
  "comment": "Highly satisfied with the quality and delivery"
}

Response (201 Created):
{
  "id": "uuid",
  "productId": "uuid",
  "userId": "uuid",
  "rating": 5,
  "title": "Excellent quality",
  "comment": "Highly satisfied with the quality and delivery",
  "verified": false,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

## Admin/Analytics APIs (Optional)

### 29. Get Dashboard Analytics
```
GET /admin/analytics
Authorization: Bearer {adminToken}

Response (200 OK):
{
  "totalRevenue": 1000000,
  "totalOrders": 250,
  "totalCustomers": 150,
  "averageOrderValue": 4000,
  "topProducts": [
    {
      "id": "uuid",
      "name": "Diamond Solitaire Ring",
      "sold": 45,
      "revenue": 2025000
    }
  ],
  "ordersByStatus": {
    "PENDING": 10,
    "CONFIRMED": 50,
    "SHIPPED": 150,
    "DELIVERED": 40
  }
}
```

## Security & Implementation Notes

1. **Authentication**: Use JWT tokens with refresh token rotation
2. **CORS**: Configure CORS to allow requests from Angular frontend
3. **HTTPS**: All endpoints must use HTTPS in production
4. **Rate Limiting**: Implement rate limiting to prevent abuse
5. **Input Validation**: Validate all request inputs on backend
6. **SQL Injection Prevention**: Use parameterized queries/prepared statements
7. **CSRF Protection**: Include CSRF tokens for state-changing operations
8. **PCI Compliance**: Handle payment data securely (never store full card data)
9. **Data Encryption**: Encrypt sensitive data in transit and at rest
10. **Audit Logging**: Log all transactions and sensitive operations
11. **Error Handling**: Return appropriate HTTP status codes and error messages
12. **S3 Integration**: Generate signed URLs for S3 image/video access
13. **Pagination**: Implement efficient pagination for large datasets
14. **Caching**: Use caching headers appropriately for static content

## S3 Integration Notes

- Images should be stored with structure: `/products/{productId}/images/`
- Videos should be stored with structure: `/products/{productId}/videos/`
- Categories images: `/categories/`
- Use signed URLs for temporary access to private media
- Implement CDN/CloudFront for faster image delivery
- Support multiple image formats (WebP, JPEG, PNG)
- Implement image optimization and responsive image serving
