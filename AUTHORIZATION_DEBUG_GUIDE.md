# Authorization Token Debugging Guide

## Issue Summary
Authorization tokens were not being sent with API requests after login.

## Root Causes Found & Fixed

### 1. **Hardcoded URLs in AuthService**
- `refreshUser()` was using hardcoded `/api/v1/users/me` instead of ApiConfigService
- **Fixed:** Now uses `this.apiConfig.getEndpoint('users')/me`

### 2. **Hardcoded URLs in OrderService**
- `initializePayment()` and `verifyPayment()` were using hardcoded `/api/v1/payments/` URLs
- **Fixed:** Now uses `this.apiConfig.getEndpoint('payments')`

### 3. **Missing Console Logging**
- Added detailed logging to AuthInterceptor to help debug token issues

## How Token Flow Works (Detailed)

```
┌─────────────────────────────────────────────────────────┐
│ 1. USER LOGS IN                                          │
│    - login() method called with email & password          │
│    - API returns AuthResponse with token & refreshToken  │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│ 2. TOKEN STORED                                          │
│    - setAuthToken() called with token                    │
│    - Token stored in localStorage: key='authToken'       │
│    - BehaviorSubject updated for state management        │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│ 3. API REQUEST MADE                                      │
│    - Any HTTP request to /api/... routes                 │
│    - AuthInterceptor intercepts the request              │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│ 4. INTERCEPTOR ADDS TOKEN                                │
│    - Reads token from localStorage                       │
│    - Clones request with Authorization header            │
│    - Header format: "Bearer {token}"                     │
└──────────────────┬──────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────┐
│ 5. REQUEST SENT TO BACKEND                              │
│    Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
└─────────────────────────────────────────────────────────┘
```

## Debugging Steps

### Step 1: Check Browser Console
Open DevTools (F12) → Console tab and look for messages like:
```
[AuthInterceptor] Token from localStorage: Present
[AuthInterceptor] Request URL: http://localhost:8080/api/v1/orders
[AuthInterceptor] Adding Authorization header with token
```

### Step 2: Check localStorage
In DevTools → Application → Local Storage:
- Look for key: `authToken`
- Should contain your JWT token (long string starting with eyJ...)

### Step 3: Check Network Tab
In DevTools → Network tab → API request:
- Click on the request
- Go to Headers tab
- Look for `Authorization: Bearer {token}`
- Should show your full token

### Step 4: Check API Response
If you still see 401 errors:
- The server might be expecting a different header format
- The server might be checking for CORS
- The token might have expired

## Logging Output Examples

**When Token is Present:**
```
[AuthInterceptor] Token from localStorage: Present
[AuthInterceptor] Request URL: http://localhost:8080/api/v1/cart
[AuthInterceptor] Adding Authorization header with token
[AuthInterceptor] Authorization header added. Headers: authorization
```

**When Token is Missing:**
```
[AuthInterceptor] Token from localStorage: Not found
[AuthInterceptor] Request URL: http://localhost:8080/api/v1/cart
[AuthInterceptor] No token found in localStorage
```

## Common Issues & Solutions

### Issue: Token not found in localStorage
**Solution:** 
1. Check if login was successful
2. Check if `setAuthToken()` is being called
3. Check localStorage in DevTools

### Issue: Authorization header not being added
**Solution:**
1. Check if URL contains `/api/`
2. Check if interceptor is registered in app.config.ts
3. Check console logs for errors

### Issue: Backend returns 401 Unauthorized
**Solution:**
1. Verify token is being sent (check Network tab)
2. Verify token format is correct ("Bearer {token}")
3. Check if backend JWT_SECRET is configured correctly
4. Check if token has not expired

### Issue: Interceptor not running
**Solution:**
1. Check app.config.ts has AuthInterceptor registered
2. Check AuthInterceptor is imported correctly
3. Clear browser cache and refresh

## Files Changed

1. **auth.interceptor.ts** - Added detailed logging
2. **auth.service.ts** - Fixed hardcoded URL in refreshUser()
3. **order.service.ts** - Fixed hardcoded URLs in payment methods

## Test the Fix

1. Start the app: `npm start`
2. Open DevTools Console (F12)
3. Log in with credentials
4. Check console for `[AuthInterceptor]` messages
5. Navigate to a protected page (cart, orders, etc.)
6. Verify Authorization header in Network tab

## Next Steps

If authorization still doesn't work:
1. Check backend is returning token in correct format
2. Verify backend is checking `Authorization: Bearer {token}` format
3. Check backend CORS configuration allows Authorization header
4. Verify JWT secret is configured on backend
