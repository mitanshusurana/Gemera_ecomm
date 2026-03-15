const fs = require('fs');

function replaceFile(path, search, replacement) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(search, replacement);
  fs.writeFileSync(path, content, 'utf8');
}

replaceFile('verification/verify_ux.py',
  'expect(page.get_by_text("GEMARA", exact=True).first).to_be_visible()',
  'expect(page.get_by_text("CARATLOOP", exact=True).first).to_be_visible()'
);

replaceFile('verification/verify_ux.py',
  'page.route("**/api/v1/products/categories", lambda route: route.fulfill(json={"categories": []}))',
  'page.route("**/api/v1/products/categories", lambda route: route.fulfill(json={"categories": []}))\n            page.route("**/api/v1/settings", lambda route: route.fulfill(json={"phone": "123", "email": "test@test.com", "address": "123 Main"}))'
);
