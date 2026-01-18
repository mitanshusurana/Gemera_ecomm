from playwright.sync_api import sync_playwright

def verify_mobile_layout():
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch(headless=True)

        # Test iPhone 12 Pro dimensions (390x844)
        context = browser.new_context(
            viewport={'width': 390, 'height': 844},
            user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1'
        )
        page = context.new_page()

        # 1. Verify Header
        print("Navigating to home page...")
        page.goto("http://localhost:4200")
        page.wait_for_load_state('networkidle')

        # Screenshot Header
        page.screenshot(path="verification/mobile_header.png")
        print("Header screenshot captured.")

        # 2. Verify Account Sidebar
        print("Navigating to account page...")
        # Since auth is mocked, we might need to simulate login or just hit the route if guarded
        # Assuming mock backend allows access or redirects to login.
        # Let's try to access account directly, if redirected to login, we login.
        page.goto("http://localhost:4200/account")

        if "login" in page.url:
            print("Redirected to login, performing login...")
            page.fill("input[type='email']", "test@example.com")
            page.fill("input[type='password']", "password")
            page.click("button[type='submit']")
            page.wait_for_url("**/account")

        page.wait_for_load_state('networkidle')

        # Screenshot Account Page (Sidebar Area)
        # We want to see the horizontal scrollable tabs
        page.screenshot(path="verification/mobile_account_tabs.png")
        print("Account tabs screenshot captured.")

        browser.close()

if __name__ == "__main__":
    verify_mobile_layout()
