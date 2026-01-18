from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Enable console logging
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        print("Navigating to Account...")
        page.goto("http://localhost:4200/account?tab=addresses")

        if "login" in page.url:
            print("Logging in...")
            page.get_by_placeholder("you@example.com").fill("john@example.com")
            page.get_by_placeholder("••••••••").fill("password")
            page.get_by_role("button", name="Sign In").click()
            page.wait_for_url("**/account?tab=addresses")

        print("Waiting for page load...")
        page.wait_for_timeout(2000) # Wait for hydration/data load

        print("Current URL:", page.url)
        print("Page Title:", page.title())

        # Check if tab is active
        # activeTab matches [ngClass] logic in component
        # We can just check if "Add New Address" button is visible
        if page.get_by_text("Add New Address").is_visible():
            print("Address tab is active.")
        else:
            print("Address tab is NOT active.")

        # Check for 123 Mock Street
        if page.get_by_text("123 Mock Street").is_visible():
            print("FOUND: 123 Mock Street")
        else:
            print("NOT FOUND: 123 Mock Street")

        # Dump HTML
        print("HTML Content:")
        print(page.content())

        browser.close()

if __name__ == "__main__":
    run()
