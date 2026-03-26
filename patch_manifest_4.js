const fs = require('fs');
const path = require('path');
const file = path.join('dist', 'fusion-angular-tailwind-starter', 'server', 'angular-app-engine-manifest.mjs');
let content = fs.readFileSync(file, 'utf8');

// I might have replaced `l2` and `Sf` incorrectly. Let's just mock `l2` to return the manifest.
// Let's first read the file, and then find where they are defined.
if(!content.includes("allowedHosts")) {
   content = content.replace(/export default \{/, "export default {\n  allowedHosts: [],\n");
}
fs.writeFileSync(file, content);
