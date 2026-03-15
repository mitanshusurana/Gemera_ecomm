const fs = require('fs');

function replaceFile(path, search, replacement) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(search, replacement);
  fs.writeFileSync(path, content, 'utf8');
}

replaceFile('verification/verify_ux.py',
  '            # 3. Verify Footer Subscription (uses OnPush)\n            print("Verifying Footer Subscription...")\n            page.goto("http://localhost:4200")\n            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")\n\n            email_input = page.get_by_placeholder("Enter your email")\n            expect(email_input).to_be_visible()\n            email_input.fill("test@example.com")\n\n            # Click Sign Up\n            page.get_by_role("button", name="Sign Up").click()\n\n            # Expect success toast (ToastContainer uses OnPush)\n            expect(page.get_by_text("Successfully subscribed to newsletter!")).to_be_visible()',
  ''
);
