const fs = require('fs');
let content = fs.readFileSync('src/app/components/header.ts', 'utf8');

// The hover:bg-primary elements with hover:text-ink will have bad contrast (navy with dark ink). Change to hover:text-surface
content = content.replace(/hover:bg-primary hover:text-ink/g, 'hover:bg-primary hover:text-surface');

fs.writeFileSync('src/app/components/header.ts', content);
