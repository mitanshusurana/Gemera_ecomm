const fs = require('fs');
const path = require('path');
const file = path.join('dist', 'fusion-angular-tailwind-starter', 'server', 'chunk-ECMJSL6R.mjs');
let content = fs.readFileSync(file, 'utf8');

// I might have replaced `l2` and `Sf` incorrectly. Let's just mock `l2` to return the manifest.
// Let's first read the file, and then find where they are defined.

content = content.replace(/function l2\(\)\{if\(!df\)throw new Error\("Angular app engine manifest is not set[^\"]+"\);return df\}/g,
"function l2(){ return require('./angular-app-engine-manifest.mjs').default; }");

content = content.replace(/function Sf\(\)\{if\(!mu\)throw new Error\("Angular app manifest is not set[^\"]+"\);return mu\}/g,
"function Sf(){ return require('./angular-app-manifest.mjs').default; }");

fs.writeFileSync(file, content);
