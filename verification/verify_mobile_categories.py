from playwright.sync_api import sync_playwright

def verify_mobile_categories():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Test iPhone 12 Pro dimensions
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1'
        )
        page = context.new_page()

        print("Navigating to home page...")
        page.goto("http://localhost:4200")
        page.wait_for_load_state('networkidle')

        # 1. Screenshot Header again to confirm spacing fix
        page.screenshot(path="verification/mobile_header_fix.png")
        print("Header fix screenshot captured.")

        # 2. Scroll to Categories
        # Look for "Shop by Category" heading
        category_heading = page.get_by_text("Shop by Category")
        category_heading.scroll_into_view_if_needed()

        # Wait a bit for smooth scroll/layout
        page.wait_for_timeout(500)

        # Screenshot Categories Section
        page.screenshot(path="verification/mobile_categories_fix.png")
        print("Categories fix screenshot captured.")

        browser.close()

if __name__ == "__main__":
    verify_mobile_categories()
