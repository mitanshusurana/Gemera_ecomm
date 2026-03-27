const fs = require('fs');
const path = require('path');

const file = path.join('dist', 'fusion-angular-tailwind-starter', 'server', 'angular-app-engine-manifest.mjs');
if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    if(!content.includes("allowedHosts")) {
       content = content.replace(/export default \{/, "export default {\n  allowedHosts: [],\n");
    }
    fs.writeFileSync(file, content);
}
