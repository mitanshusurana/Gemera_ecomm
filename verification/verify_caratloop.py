from playwright.sync_api import sync_playwright

def verify_brand(page):
    # Home Page
    page.goto("http://localhost:4200/")
    page.wait_for_load_state("networkidle")

    # Check for "Caratloop" text
    caratloop_text = page.get_by_text("Caratloop", exact=False).first
    if caratloop_text.is_visible():
        print("✅ Caratloop branding found on Home Page")
    else:
        print("❌ Caratloop branding NOT found on Home Page")

    # Take Home Screenshot
    page.screenshot(path="verification/home_page.png", full_page=True)
    print("📸 Home Page screenshot saved to verification/home_page.png")

    # Navigate to Product Page
    # Click "Shop Now" or first product
    page.click("text=Shop Collection")
    page.wait_for_load_state("networkidle")

    # Click on first product in list
    page.locator(".card, .group").first.click()
    page.wait_for_load_state("networkidle")

    # Product Detail Page
    page.screenshot(path="verification/product_page.png", full_page=True)
    print("📸 Product Page screenshot saved to verification/product_page.png")

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
