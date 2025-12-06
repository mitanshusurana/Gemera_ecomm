# End-to-End Testing Guide: Checkout Flow

This guide explains how to test the complete checkout flow from cart to order confirmation.

## Prerequisites

1. **Backend API Setup**: Ensure your backend API is running on the configured base URL
2. **Authentication**: You need a valid JWT token from login/registration
3. **Products**: Products should be available in the system with prices and stock

## Testing Steps

### Step 1: Browse and Add Products to Cart

1. Navigate to the home page (`/`)
2. Browse through featured products or click "Explore Collections"
3. Add products to cart using:
   - Quick view modal
   - Product detail page
   - Direct "Add to Cart" button

**Expected Behavior:**

- Cart count updates in header
- Toast notification confirms item added
- Product shows in cart page with correct price and quantity

### Step 2: Review Cart

1. Click on cart icon in header or navigate to `/cart`
2. Verify all items are displayed with:
   - Product name
   - Product image
   - Price per unit
   - Quantity selector
   - Subtotal for each item

**Expected Behavior:**

- Cart totals calculate correctly
- Can update quantities
- Can remove items
- Cart persists on page refresh

### Step 3: Login/Register (if not authenticated)

1. Click "Proceed to Checkout"
2. If not logged in, you'll be redirected to login/register
3. Enter credentials or register new account

**Expected Behavior:**

- Auth guard redirects to login if not authenticated
- Can create new account or login with existing
- JWT token is stored in local storage

### Step 4: Proceed to Checkout (Step 1: Shipping)

1. Click "Continue to Checkout" from cart page
2. Fill in shipping information:
   - First Name: `John`
   - Last Name: `Doe`
   - Email: `john@example.com`
   - Phone: `+1 (555) 000-0000`
   - Address: `123 Main Street`
   - City: `New York`
   - State: `NY`
   - ZIP Code: `10001`
   - Country: `USA`

3. Optionally uncheck "Billing address is same as shipping" to add different billing address

4. Click "Continue to Payment"

**Expected Behavior:**

- Form validates required fields
- Step indicator shows Step 1 highlighted
- Data persists if you go back and forth
- Shipping address is saved for order

### Step 5: Checkout (Step 2: Payment)

1. Payment method selection:
   - Select "Credit / Debit Card" (default)
   - Other options available: PayPal, Apple Pay

2. Fill in payment details:
   - Cardholder Name: `John Doe`
   - Card Number: `4242 4242 4242 4242` (test card)
   - Expiry: `12/25`
   - CVC: `123`

3. Review security information
4. Click "Review Order"

**Expected Behavior:**

- Step indicator shows Step 2 highlighted
- Payment form validates required fields
- Security badge displays
- "Back" button takes you to shipping form
- Previous data is retained

### Step 6: Checkout (Step 3: Order Review)

1. Review complete order summary:
   - Shipping address
   - Payment method (last 4 digits)
   - Shipping method (Express - Free)
   - All items with prices
   - Subtotal, Tax, Total

2. Review "What's Next" section showing:
   - Confirmation email
   - Quality inspection
   - Shipment with tracking

3. Click "Place Order"

**Expected Behavior:**

- All order data displays correctly
- "Back" button takes you to payment form
- "Place Order" button becomes disabled while processing
- Shows "Processing..." text while creating order

### Step 7: Order Confirmation

After successful order placement, you should see:

1. **Success Page** (`/order-confirmation`):
   - Success checkmark animation
   - Order number: `ORD-2024-XXXXX`
   - Order status: "Processing"
   - Estimated delivery date (3 days from order)

2. **Order Details Section**:
   - Order items with quantities and prices
   - Shipping address confirmation
   - Tracking information (once shipped)

3. **Order Summary Sidebar**:
   - Itemized costs
   - Subtotal, Tax, Total
   - All items listed

4. **Confirmation Email**:
   - Should be sent to order email address
   - Contains order number, items, shipping address, total

5. **Action Buttons**:
   - "Continue Shopping" - Returns to home page
   - "Contact Us" - Goes to contact page
   - "WhatsApp Support" - Opens WhatsApp chat

**Expected Behavior:**

- All order data loads from API
- Email notification is sent
- Order persists in user's order history
- Can view order from account page

## Testing with Different Scenarios

### Scenario 1: Multiple Items Order

**Steps:**

1. Add 3-4 different products to cart
2. Modify quantities for different items
3. Complete checkout

**Verify:**

- All items appear in order
- Quantities are correct
- Pricing is accurate
- Order total reflects all items

### Scenario 2: Edit Address During Checkout

**Steps:**

1. Fill shipping address
2. Click back to edit any field
3. Update information
4. Continue to payment
5. Complete order

**Verify:**

- Address changes persist
- Can edit at any step
- Final order has correct address

### Scenario 3: Use Different Payment Methods

**Steps:**

1. For Stripe payment: Use test cards
   - `4242 4242 4242 4242` (Visa)
   - `5555 5555 5555 4444` (Mastercard)
   - `6011 1111 1111 1117` (Discover)

2. For Razorpay payment: Use test cards
   - `5111 1111 1111 1118` (Visa)
   - Various payment methods available

**Verify:**

- Payment form accepts card
- Processing works correctly
- Order is created regardless of payment method

### Scenario 4: Check Email Notifications

**Steps:**

1. Complete order with test email
2. Check email inbox
3. Verify email contains:
   - Order number
   - Item details
   - Shipping address
   - Order total
   - Estimated delivery

**Email Triggers:**

- Order confirmation email when order is placed
- Shipping notification when order ships
- Delivery confirmation when item is delivered

## API Integration Testing

### Test Order Creation Endpoint

```bash
curl -X POST http://localhost:4200/api/v1/orders \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
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
    "billingAddress": {...},
    "paymentMethod": "CREDIT_CARD",
    "shippingMethod": "EXPRESS"
  }'
```

### Test Email Notification Endpoint

```bash
curl -X POST http://localhost:4200/api/v1/email/send \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ORDER_CONFIRMATION",
    "email": "user@example.com",
    "subject": "Order Confirmation",
    "templateName": "order_confirmation",
    "data": {
      "orderNumber": "ORD-2024-001",
      "total": 50000,
      "items": [...]
    }
  }'
```

### Test Order Retrieval

```bash
curl -X GET http://localhost:4200/api/v1/orders/{orderId} \
  -H "Authorization: Bearer {token}"
```

## Troubleshooting

### Issue: Order Creation Fails

**Possible Causes:**

1. Backend API not running
2. Invalid JWT token
3. Incomplete order data
4. Cart is empty

**Solutions:**

1. Check backend API is running on correct port
2. Re-login to get fresh token
3. Verify all required fields are filled
4. Ensure cart has items

### Issue: Email Not Sent

**Possible Causes:**

1. Email service not configured
2. Invalid email address
3. SMTP credentials not set up

**Solutions:**

1. Check backend email configuration
2. Use valid email address format
3. Set up SMTP credentials in backend

### Issue: Order Confirmation Page Not Loading

**Possible Causes:**

1. Order ID not stored in session
2. Order API endpoint not working
3. Route not configured

**Solutions:**

1. Check sessionStorage for `lastOrderId`
2. Test order retrieval API
3. Verify `/order-confirmation` route is configured

### Issue: Cart Data Not Loading

**Possible Causes:**

1. Cart API not configured
2. Hardcoded values in checkout component
3. Invalid cart response format

**Solutions:**

1. Implement cart API endpoint
2. Use dynamic cart data in checkout
3. Verify API response matches expected format

## Performance Testing

### Load Test Checkout Page

Test with different network conditions:

- Fast 3G
- Slow 3G
- Offline

**Expected Performance:**

- Page loads in < 2 seconds on 3G
- All assets cached for faster repeat visits
- Graceful degradation offline

### Test with Different Cart Sizes

- Empty cart (0 items)
- Small cart (1-3 items)
- Large cart (10+ items)

**Expected Behavior:**

- All sizes render correctly
- Performance remains acceptable
- Order summary scrolls if needed

## Security Testing

### Test Authentication

1. Try to access `/checkout` without login → Should redirect to login
2. Try to access `/order-confirmation` without token → Should redirect
3. Try with expired token → Should redirect to login
4. Try with invalid token → Should redirect to login

### Test Data Privacy

1. Verify no payment data stored locally
2. Verify addresses only stored in order
3. Verify personal info not logged

## Reporting

Create a test report documenting:

1. **Test Date**: When testing was performed
2. **Tester**: Who performed the tests
3. **Environment**: Browser, OS, network
4. **Test Cases**: Which scenarios were tested
5. **Results**: Pass/Fail for each scenario
6. **Issues Found**: Any bugs or issues
7. **Screenshots**: Evidence of successful completion

## Checklist for Complete E2E Testing

- [ ] Can browse and add products to cart
- [ ] Cart updates correctly with items and totals
- [ ] Can proceed to checkout when authenticated
- [ ] Shipping form validates and saves data
- [ ] Payment form accepts valid card data
- [ ] Order review page displays all information
- [ ] Order is created successfully
- [ ] Order confirmation page loads with correct data
- [ ] Order appears in user's order history
- [ ] Confirmation email is sent
- [ ] Can test with multiple items
- [ ] Can test with different payment methods
- [ ] Can test with different addresses
- [ ] Auth guard protects checkout pages
- [ ] Error handling works correctly
- [ ] Loading states display properly
- [ ] Mobile responsive design works
- [ ] Performance is acceptable
