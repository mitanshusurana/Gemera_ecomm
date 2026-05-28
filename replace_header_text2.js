const fs = require('fs');
let content = fs.readFileSync('src/app/components/header.ts', 'utf8');

// Also update `hover:bg-primary` on line 105 to include hover:text-surface
content = content.replace(/class="block px-4 py-2 hover:bg-primary flex items-center gap-3 transition-colors"/g, 'class="block px-4 py-2 hover:bg-primary hover:text-surface flex items-center gap-3 transition-colors"');

fs.writeFileSync('src/app/components/header.ts', content);
