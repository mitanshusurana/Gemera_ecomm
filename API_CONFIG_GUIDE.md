# API Configuration - Centralized Base URL Setup

## Overview

The project now uses a **centralized API configuration service** (`ApiConfigService`) to manage the base URL for all backend API calls. This eliminates the need to update base URLs in individual services.

## Files Updated

### New File Created
- [src/app/services/api-config.service.ts](src/app/services/api-config.service.ts) - Centralized API configuration

### Services Updated to Use ApiConfigService
1. [src/app/services/auth.service.ts](src/app/services/auth.service.ts)
2. [src/app/services/product.service.ts](src/app/services/product.service.ts)
3. [src/app/services/cart.service.ts](src/app/services/cart.service.ts)
4. [src/app/services/order.service.ts](src/app/services/order.service.ts)
5. [src/app/services/email-notification.service.ts](src/app/services/email-notification.service.ts)
6. [src/app/services/rfq.service.ts](src/app/services/rfq.service.ts)

## How It Works

### ApiConfigService Structure
```typescript
@Injectable({ providedIn: 'root' })
export class ApiConfigService {
  readonly baseUrl = '/api/v1';
  
  getEndpoint(endpoint: string): string {
    return `${this.baseUrl}/${endpoint}`.replace(/\/+/g, '/');
  }
}
```

### Using in Services
Each service now injects `ApiConfigService` and uses it to build the base URL:

```typescript
export class AuthService {
  private apiConfig = inject(ApiConfigService);
  private baseUrl = this.apiConfig.getEndpoint('auth');
  // Results in: '/api/v1/auth'
}
```

## Changing the Backend URL

To point all network calls to a different backend, simply update the `baseUrl` in [ApiConfigService](src/app/services/api-config.service.ts):

### Local Development
```typescript
readonly baseUrl = '/api/v1';  // Relative path (same domain)
```

### External Backend
```typescript
readonly baseUrl = 'https://api.yourdomain.com/api/v1';  // Full URL
```

### Environment-Specific Configuration
For environment-specific URLs, you can enhance the service:

```typescript
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ApiConfigService {
  readonly baseUrl = environment.apiBaseUrl;
  
  getEndpoint(endpoint: string): string {
    return `${this.baseUrl}/${endpoint}`.replace(/\/+/g, '/');
  }
}
```

## Benefits

✅ **Single Point of Change** - Update one file to change all API endpoints
✅ **Centralized Configuration** - Easy to manage API URLs
✅ **Environment Support** - Can integrate with Angular environment files
✅ **Consistent URL Structure** - All services use the same pattern
✅ **Easy to Extend** - Add authentication headers, logging, or other interceptors

## API Endpoint Structure

All services now follow this pattern:

| Service | Endpoint | Full URL |
|---------|----------|----------|
| Auth | `auth` | `/api/v1/auth` |
| Products | `products` | `/api/v1/products` |
| Cart | `cart` | `/api/v1/cart` |
| Orders | `orders` | `/api/v1/orders` |
| Email | `email` | `/api/v1/email` |
| RFQ | `rfq` | `/api/v1/rfq` |

## Migration Complete ✓

All 6 services have been successfully updated to use the centralized `ApiConfigService` instead of hardcoding their base URLs.
