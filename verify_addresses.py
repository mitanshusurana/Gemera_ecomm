from playwright.sync_api import sync_playwright, expect
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("Navigating to Account (Login)...")
        page.goto("http://localhost:4200/account?tab=addresses")

        # Check if we are on login page by content
        # "Welcome Back" is on the login page
        try:
            page.wait_for_selector("text=Welcome Back", timeout=3000)
            is_login_page = True
        except:
            is_login_page = False

        if is_login_page:
            print("Detected Login Page by content.")
            print("Logging in...")
            page.get_by_placeholder("you@example.com").fill("john@example.com")
            page.get_by_placeholder("••••••••").fill("password")
            page.get_by_role("button", name="Sign In").click()

            # Wait for navigation back to account
            print("Waiting for redirect to account...")
            page.wait_for_url("**/account?tab=addresses", timeout=10000)
        else:
            print(f"Login page not detected. Assuming already logged in or on Account page. URL: {page.url}")

        # Verify Saved Addresses
        print("Verifying saved addresses...")
        # Check for default address "123 Mock Street" (from MockBackend)
        try:
            expect(page.get_by_text("123 Mock Street")).to_be_visible(timeout=5000)
            print("Default address visible.")
        except AssertionError:
            print("Failed to find '123 Mock Street'. Dumping page text...")
            print(page.inner_text("body"))
            raise

        # Verify Add New Address Modal
        print("Testing Add Address modal...")
        page.get_by_role("button", name="Add New Address").click()
        expect(page.get_by_role("heading", name="Add New Address")).to_be_visible()

        # Close modal
        page.get_by_role("button", name="Cancel").click()

        # Verify Checkout Address Selection
        print("Navigating to Checkout...")
        # Add item to cart first to ensure checkout is accessible
        page.goto("http://localhost:4200/products/1")
        # Wait for product page
        expect(page.get_by_text("Add to Cart")).to_be_visible()
        page.get_by_role("button", name="Add to Cart").click()

        # Wait for cart update (toast or counter)
        time.sleep(1)

        page.goto("http://localhost:4200/checkout")

        # Should show Saved Addresses section
        expect(page.get_by_text("Saved Addresses")).to_be_visible()
        # Should show the saved address card
        expect(page.locator("text=123 Mock Street")).to_be_visible()
        # Should show Use New Address option
        expect(page.get_by_text("Use New Address")).to_be_visible()

        print("Verification complete.")
        browser.close()

if __name__ == "__main__":
    run()
