const fs = require('fs');

function replaceFile(path, search, replacement) {
  let content = fs.readFileSync(path, 'utf8');
  content = content.replace(search, replacement);
  fs.writeFileSync(path, content, 'utf8');
}

replaceFile('verification/verify_ux.py',
  'page.route("**/api/v1/settings", lambda route: route.fulfill(json={"phone": "123", "email": "test@test.com", "address": "123 Main"}))',
  'page.route("**/api/v1/settings", lambda route: route.fulfill(json={"phone": "123", "email": "test@test.com", "address": "123 Main"}))\n            page.route("**/api/v1/categories", lambda route: route.fulfill(json={"categories": []}))'
);
