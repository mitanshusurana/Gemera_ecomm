import time
import os
from playwright.sync_api import sync_playwright

def verify_admin_app():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Set viewport to desktop size
        page = browser.new_page(viewport={'width': 1280, 'height': 720})

        page.on("console", lambda msg: print(f"Browser Console: {msg.text}"))

        print("Navigating to Admin App...")
        try:
            page.goto("http://localhost:4300/login")
        except Exception as e:
            print(f"Failed to load page: {e}")
            return

        print("Logging in...")
        admin_email = os.environ.get("ADMIN_EMAIL", "admin@gemara.com")
        admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
        page.fill("input[formControlName='email']", admin_email)
        page.fill("input[formControlName='password']", admin_password)
        page.click("button[type='submit']")

        # Wait for navigation to dashboard
        page.wait_for_url("http://localhost:4300/dashboard")
        print("Logged in successfully.")


        # Add a Product
        print("Adding a new product...")
        page.goto("http://localhost:4300/products/new")

        page.fill("input[formControlName='name']", "Test Product 123")
        page.fill("textarea[formControlName='description']", "This is a test product description.")
        page.fill("input[formControlName='price']", "199.99")
        page.fill("input[formControlName='stock']", "10")
        page.wait_for_timeout(1000)
        page.select_option("select[formControlName='category']", value="Engagement Ring")

        page.click("button[type='submit']")

        # Should redirect back to product list
        page.wait_for_url("http://localhost:4300/products")
        print("Product added successfully.")

        # Wait a bit for backend to process and frontend to reload (if it does)
        # Actually page.wait_for_url implies navigation finished, so component re-initialized and fetched data.
        # But let's give it a second just in case of async weirdness.
        time.sleep(2)

        # Verify the new product is in the list
        page.reload()
        page.wait_for_selector("table") # Wait for table to render again
        content = page.content()
        if "Test Product 123" in content:
            print("Verified: New product appears in the list.")
        else:
            print("Error: New product NOT found in the list.")

        # Check Orders
        print("Checking Orders...")
        # Since we set viewport, the sidebar should be visible
        page.click("a[href='/orders']")
        page.wait_for_url("http://localhost:4300/orders")
        page.wait_for_selector("table")
        order_rows = page.query_selector_all("tbody tr")
        print(f"Found {len(order_rows)} orders.")

        if len(order_rows) > 0:
            # View Order Detail
            print("Viewing first order...")
            first_view_link = page.query_selector("tbody tr a")
            if first_view_link:
                first_view_link.click()
                # Wait for detail page (regex for /orders/ID)
                page.wait_for_url(lambda url: "/orders/" in url and url != "http://localhost:4300/orders")
                print("Order Detail page loaded.")

                # Check for order info
                if page.is_visible("text=Order Information"):
                    print("Verified: Order Information visible.")
                else:
                    print("Error: Order Information NOT visible.")
            else:
                print("No view link found.")
        else:
            print("No orders found to verify detail view.")

        browser.close()

if __name__ == "__main__":
    verify_admin_app()
