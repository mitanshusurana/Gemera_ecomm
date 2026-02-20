from playwright.sync_api import sync_playwright
import json

def verify_brand(page):
    try:
        # Mock Backend API
        print("Mocking Backend API...")

        mock_detail = {
            "id": "prod1",
            "name": "Test Emerald Ring",
            "sku": "SKU-TEST-001",
            "description": "A beautiful ring",
            "price": 50000,
            "originalPrice": 60000,
            "discountPercentage": 10,
            "rating": 4.5,
            "reviewCount": 10,
            "stock": 10,
            "images": ["https://via.placeholder.com/300"],
            "category": "GEMSTONE",
            "specifications": {
                "productDetails": {"sku": "SKU-TEST-001"},
                "metalDetails": [],
                "diamondDetails": []
            },
            "customizationOptions": []
        }

        mock_products = {
            "content": [mock_detail],
            "pageable": {
                "pageNumber": 0,
                "pageSize": 10,
                "totalElements": 1,
                "totalPages": 1
            }
        }

        def handle_products(route):
            url = route.request.url
            print(f"Intercepted: {url}")

            if "products/prod1" in url:
                print("Serving Detail Response")
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(mock_detail)
                )
            elif "products?" in url or url.endswith("products"):
                print("Serving List Response")
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(mock_products)
                )
            else:
                # Fallback for other IDs or unexpected paths
                print(f"Serving Fallback for {url}")
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(mock_detail)
                )

        page.route("**/api/v1/products**", handle_products)

        # Mock Categories
        page.route("**/api/v1/categories", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"categories": [{"id": "cat1", "name": "GEMSTONE", "displayName": "Gemstone", "description": "Test Cat"}]})
        ))

        # Home Page
        print("Navigating to Home Page...")
        page.goto("http://localhost:4200/")
        page.wait_for_load_state("networkidle")

        # Check for "Caratloop" text
        if page.get_by_text("Caratloop", exact=False).first.is_visible():
            print("✅ Caratloop branding found on Home Page")
        else:
            print("❌ Caratloop branding NOT found on Home Page")

        # Take Home Screenshot
        page.screenshot(path="verification/home_page.png", full_page=True)
        print("📸 Home Page screenshot saved to verification/home_page.png")

        # Navigate to Product Page via Shop Collection
        print("Navigating to Product List...")
        shop_btn = page.get_by_text("Shop Collection").first
        if shop_btn.is_visible():
            shop_btn.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000) # Wait for products to load
        else:
            print("❌ 'Shop Collection' button not found")
            return

        # Click on first product in list
        print("Clicking first product...")

        product_links = page.locator("a[href^='/products/prod1']")
        if product_links.count() > 0:
            product_links.first.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)
            print("✅ Navigated to Product Detail Page")

            # Check for WhatsApp Link with correct number
            # Verify floating button
            floating_wa = page.locator("app-whatsapp-button a[href*='917976091951']")
            if floating_wa.count() > 0:
                 print("✅ Floating WhatsApp button with correct number found")
            else:
                 print(f"❌ Floating WhatsApp button with correct number NOT found.")

            # Verify product page button
            wa_btn = page.get_by_text("Chat on WhatsApp")
            if wa_btn.is_visible():
                print("✅ 'Chat on WhatsApp' button found on product page")
            else:
                print("❌ 'Chat on WhatsApp' button NOT found on product page")
                with open("verification/product_detail_debug.html", "w") as f:
                     f.write(page.content())

            # Product Detail Page Screenshot
            page.screenshot(path="verification/product_page.png", full_page=True)
            print("📸 Product Page screenshot saved to verification/product_page.png")

        else:
            print("❌ No product links found on listing page")
            page.screenshot(path="verification/listing_page_debug.png", full_page=True)
            with open("verification/listing_debug.html", "w") as f:
                 f.write(page.content())

    except Exception as e:
        print(f"❌ Error during verification: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_brand(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
