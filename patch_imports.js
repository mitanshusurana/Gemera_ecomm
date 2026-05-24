const fs = require('fs');
let code = fs.readFileSync('src/app/pages/products.ts', 'utf8');

code = code.replace(
  /import \{ OCCASIONS_LIST, STYLES_LIST \} from '\.\.\/core\/constants';/,
  `import { OCCASIONS_LIST, STYLES_LIST, SUB_CATEGORIES_MAP, ProductCategory } from '../core/constants';`
);

fs.writeFileSync('src/app/pages/products.ts', code);
