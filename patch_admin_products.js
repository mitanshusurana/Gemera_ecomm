const fs = require('fs');
let content = fs.readFileSync('projects/admin/src/app/pages/product-add/product-add.component.ts', 'utf8');

const oldSub = `this.productService.getCategories().subscribe(res => {`;
const newSub = `this.productService.getCategories().subscribe((res: any) => {`;
content = content.replace(oldSub, newSub);

fs.writeFileSync('projects/admin/src/app/pages/product-add/product-add.component.ts', content, 'utf8');
