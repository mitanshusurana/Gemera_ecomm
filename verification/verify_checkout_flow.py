from playwright.sync_api import sync_playwright, expect

def verify_checkout_flow(page):
    # 1. Login
    print("Navigating to login...")
    page.goto("http://localhost:4200/login")
    page.fill('input[name="email"]', "test@example.com")
    page.fill('input[name="password"]', "password")
    page.click('button[type="submit"]')

    # Wait for redirect to home
    print("Waiting for login redirect...")
    expect(page).to_have_url("http://localhost:4200/", timeout=10000)

    # 2. Add product to cart
    print("Adding product to cart...")
    page.goto("http://localhost:4200/products")
    # Wait for products to load
    page.wait_for_selector('.card', timeout=10000)
    # Click first Add to Cart button
    page.locator('.card button:has-text("Add to Cart")').first.click()

    # Wait for toast or cart update (optional, but good practice)
    page.wait_for_timeout(1000)

    # 3. Go to Cart
    print("Navigating to cart...")
    page.goto("http://localhost:4200/cart")
    expect(page.locator('h1')).to_contain_text("Shopping Cart")

    # 4. Proceed to Checkout
    print("Proceeding to checkout...")
    page.click('a[href="/checkout"]')
    expect(page).to_have_url("http://localhost:4200/checkout")

    # 5. Fill Shipping (Step 1)
    print("Filling shipping details...")
    page.fill('input[name="firstName"]', "John")
    page.fill('input[name="lastName"]', "Doe")
    page.fill('input[name="email"]', "john@example.com")
    page.fill('input[name="phone"]', "1234567890")
    page.fill('input[name="address"]', "123 Test St")
    page.fill('input[name="city"]', "Test City")
    page.fill('input[name="state"]', "NY")
    page.fill('input[name="zipCode"]', "10001")
    page.click('button:has-text("Continue to Payment")')

    # 6. Fill Payment (Step 2)
    print("Filling payment details...")
    page.fill('input[name="cardName"]', "John Doe")
    page.fill('input[name="cardNumber"]', "1234567812345678")
    page.fill('input[name="expiryDate"]', "12/25")
    page.fill('input[name="cvc"]', "123")
    page.click('button:has-text("Review Order")')

    # 7. Place Order (Step 3)
    print("Placing order...")
    # Ensure "Place Order" button is visible
    expect(page.locator('button:has-text("Place Order")')).to_be_visible()
    page.click('button:has-text("Place Order")')

    # 8. Verify Confirmation
    print("Verifying confirmation...")
    # Wait for redirect to order-confirmation
    expect(page).to_have_url("http://localhost:4200/order-confirmation", timeout=15000)
    expect(page.locator('h1')).to_contain_text("Thank You")

    # Take screenshot
    print("Taking screenshot...")
    page.screenshot(path="verification/checkout_success.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_checkout_flow(page)
            print("Verification successful!")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/checkout_failure.png")
        finally:
            browser.close()
