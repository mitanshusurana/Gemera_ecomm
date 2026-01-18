from playwright.sync_api import sync_playwright

def verify_features():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Mock Auth User (Logged in)
        page.route("**/api/v1/users/me", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"id":"u1", "firstName":"Test", "lastName":"User", "email":"test@example.com"}'
        ))

        # Mock APIs for Track Order
        page.route("**/api/v1/orders/ORD-123", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"id":"1", "orderNumber":"ORD-123", "status":"SHIPPED", "total":5000, "estimatedDelivery": "2024-01-01T00:00:00Z", "items": [{"product": {"name":"Diamond Ring", "price": 5000}, "quantity": 1, "price": 5000}]}'
        ))

        # Mock Cart with Wishlist
        page.route("**/api/v1/cart", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body='{"id":"c1", "items":[], "wishlist": [{"id":"p1", "name":"Wishlist Ring", "price":2000, "category":"Ring", "imageUrl":"", "stock": 10}]}'
        ))

        # 1. Verify Track Order
        print("Verifying Track Order...")
        page.goto("http://localhost:4200/track-order?id=ORD-123")
        page.wait_for_timeout(3000)
        page.screenshot(path="verification/track_order_verified.png")
        print("Track Order screenshot captured.")

        # 2. Verify Wishlist
        print("Verifying Wishlist...")
        page.goto("http://localhost:4200/")
        # Inject token to simulate login
        page.evaluate("localStorage.setItem('authToken', 'mock-jwt-token')")
        # Reload to trigger AuthService init
        page.reload()
        page.wait_for_timeout(2000)

        page.goto("http://localhost:4200/wishlist")
        page.wait_for_timeout(3000)
        page.screenshot(path="verification/wishlist_verified.png")
        print("Wishlist screenshot captured.")

        browser.close()

if __name__ == "__main__":
    verify_features()
