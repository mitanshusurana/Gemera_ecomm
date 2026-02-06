import re
from playwright.sync_api import sync_playwright, expect

def verify_ux():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        try:
            # Mock API
            page.route("**/api/v1/auth/me", lambda route: route.fulfill(status=401)) # Not logged in
            page.route("**/api/v1/cart", lambda route: route.fulfill(json={
                "id": "guest", "items": [], "subtotal": 0, "tax": 0, "shipping": 0, "total": 0, "appliedDiscount": 0
            }))
            page.route("**/api/v1/products/categories", lambda route: route.fulfill(json={"categories": []}))
            page.route("**/api/v1/products*", lambda route: route.fulfill(json={
                "content": [{"id": "1", "name": "Diamond Ring", "price": 1000, "category": "Ring", "stock": 10}],
                "pageable": {"totalElements": 1, "totalPages": 1}
            }))
            page.route("**/api/v1/email/subscribe", lambda route: route.fulfill(status=200))

            # 1. Verify Home Page and Header
            print("Navigating to Home Page...")
            page.goto("http://localhost:4200")
            expect(page.get_by_text("GEMARA", exact=True).first).to_be_visible()

            # Verify Header Currency Selector (uses OnPush)
            currency_btn = page.locator("button:has-text('USD')").first
            expect(currency_btn).to_be_visible()

            # 2. Verify Products Page (navigation)
            print("Navigating to Products...")
            page.get_by_role("link", name="Engagement Rings").first.click()
            expect(page).to_have_url(re.compile(r".*/products.*"))
            expect(page.get_by_text("Our Collections")).to_be_visible()

            # 3. Verify Footer Subscription (uses OnPush)
            print("Verifying Footer Subscription...")
            page.goto("http://localhost:4200")
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")

            email_input = page.get_by_placeholder("Enter your email")
            expect(email_input).to_be_visible()
            email_input.fill("test@example.com")

            # Click Sign Up
            page.get_by_role("button", name="Sign Up").click()

            # Expect success toast (ToastContainer uses OnPush)
            expect(page.get_by_text("Successfully subscribed to newsletter!")).to_be_visible()

            # 4. Mobile Menu (Header OnPush check)
            print("Verifying Mobile Menu...")
            mobile_context = browser.new_context(viewport={"width": 375, "height": 667})
            mobile_page = mobile_context.new_page()
            mobile_page.goto("http://localhost:4200")

            menu_btn = mobile_page.locator("button").filter(has_text="").nth(1) # Approximate, let's use svg or better locator if possible.
            # Header has: <button class="lg:hidden..." (click)="toggleMobileMenu()">
            menu_btn = mobile_page.locator("header button.lg\\:hidden")
            expect(menu_btn).to_be_visible()
            menu_btn.click()

            # Menu should open
            expect(mobile_page.get_by_role("link", name="Home")).to_be_visible()

            # Take screenshot of mobile menu
            mobile_page.screenshot(path="verification/mobile_menu.png")
            print("Mobile menu screenshot saved.")

            # Take screenshot of desktop home with toast
            page.screenshot(path="verification/desktop_home.png")
            print("Desktop home screenshot saved.")

        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/error.png")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    verify_ux()
