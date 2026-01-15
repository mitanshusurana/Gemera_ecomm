# Authentication Token Interceptor Setup

## Overview

A new **AuthInterceptor** has been created to automatically attach Bearer tokens to all API requests. This ensures that once a user logs in and receives a token, it will be automatically sent with every subsequent API call.

## How It Works

### 1. User Login Flow
```
User Login → API returns token → AuthService stores token in localStorage → Token ready for use
```

### 2. Token Attachment Flow
```
API Request → AuthInterceptor intercepts → Checks if token exists → Adds Authorization header → Request sent
```

### Files

**New File Created:**
- [src/app/interceptors/auth.interceptor.ts](src/app/interceptors/auth.interceptor.ts)

**Files Modified:**
- [src/app/app.config.ts](src/app/app.config.ts) - Registered the AuthInterceptor

## How AuthInterceptor Works

The interceptor automatically:
1. Retrieves the auth token from `AuthService`
2. Checks if the request is to an API endpoint (contains `/api/`)
3. Adds the `Authorization: Bearer {token}` header to the request
4. Passes the modified request to the next handler

```typescript
// Example: Before interceptor
GET /api/v1/orders
// No Authorization header

// After interceptor
GET /api/v1/orders
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Implementation Details

### AuthService (Already Exists)
```typescript
export class AuthService {
  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, body).pipe(
      tap(response => {
        this.setAuthToken(response.token);  // ← Token stored here
        this.user$.next(response.user);
      })
    );
  }

  getAuthToken(): string | null {
    return this.authToken$.value;  // ← AuthInterceptor uses this
  }
}
```

### AuthInterceptor (New)
```typescript
export class AuthInterceptor implements HttpInterceptor {
  intercept(request: HttpRequest<unknown>, next: HttpHandler) {
    const authToken = this.authService.getAuthToken();
    
    if (authToken && request.url.includes('/api/')) {
      request = request.clone({
        setHeaders: {
          Authorization: `Bearer ${authToken}`
        }
      });
    }
    
    return next.handle(request);
  }
}
```

## Request Flow Example

```typescript
// 1. User logs in
authService.login('user@example.com', 'password').subscribe(response => {
  // Token: 'abc123xyz789' is stored in AuthService and localStorage
});

// 2. User makes a request to get orders
orderService.getUserOrders().subscribe(orders => {
  // AuthInterceptor automatically adds header:
  // GET http://localhost:8080/api/v1/orders
  // Authorization: Bearer abc123xyz789
});
```

## Features

✅ **Automatic Token Attachment** - No manual header management needed
✅ **Smart Filtering** - Only adds token to API requests (skips static assets)
✅ **Token Refresh** - Works with existing auth flow
✅ **Logout Support** - Token is cleared from AuthService on logout
✅ **Error Handling** - Works alongside ErrorInterceptor

## Interceptor Order

Interceptors are executed in the order they are registered:

1. **AuthInterceptor** (runs first) - Adds Bearer token to requests
2. **ErrorInterceptor** (runs second) - Handles API errors

## Testing the Flow

1. Navigate to login page
2. Submit login credentials
3. Check browser DevTools Network tab
4. Make any API request (e.g., navigate to orders)
5. You should see the `Authorization: Bearer {token}` header in the request

## Token Persistence

- **Storage**: Token is saved in `localStorage` under key `authToken`
- **Persistence**: Token persists across page refreshes
- **Cleanup**: Token is cleared on logout
- **Retrieval**: `AuthService.getAuthToken()` returns current token or null

## No More Manual Header Management!

**Before** (Manual - no longer needed):
```typescript
const headers = new HttpHeaders({
  'Authorization': `Bearer ${token}`
});
this.http.get('/api/v1/orders', { headers });
```

**After** (Automatic):
```typescript
// Just call the service - token is added automatically
this.http.get('/api/v1/orders');
```

---

✓ **Setup Complete!** All API requests will now automatically include the Bearer token after user login.
