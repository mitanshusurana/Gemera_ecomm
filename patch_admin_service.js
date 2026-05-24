const fs = require('fs');
let content = fs.readFileSync('projects/admin/src/app/services/product.service.ts', 'utf8');

const oldMethods = `getProducts(search?: string): Observable<any> {`;
const newMethods = `getCategories(): Observable<any> {
    return this.http.get(\`\${this.apiUrl}/categories\`);
  }

  getProducts(search?: string): Observable<any> {`;

content = content.replace(oldMethods, newMethods);
fs.writeFileSync('projects/admin/src/app/services/product.service.ts', content, 'utf8');
