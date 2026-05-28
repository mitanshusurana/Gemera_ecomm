const fs = require('fs');
let content = fs.readFileSync('src/app/components/footer.ts', 'utf8');

// The bottom footer text has `text-ink`, change it to `text-surface` for contrast against `bg-primary`
content = content.replace(/class="border-t border-primary pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-ink"/g, 'class="border-t border-primary pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-surface"');

fs.writeFileSync('src/app/components/footer.ts', content);
