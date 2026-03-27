const fs = require('fs');
const path = require('path');

function processDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDir(fullPath);
        } else if (file.endsWith('.mjs') || file.endsWith('.js')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;

            if (content.match(/var df;function [a-zA-Z0-9_]+\(\)\{if\(!df\)throw new Error\("Angular app engine manifest is not set[^\"]+"\);return df\}/)) {
                content = content.replace(/var df;function l2\(\)\{if\(!df\)throw new Error\("Angular app engine manifest is not set[^\"]+"\);return df\}/g,
                "import dfMod from './angular-app-engine-manifest.mjs'; var df = dfMod; function l2(){ return df; }");
                modified = true;
            }

            if (content.match(/var mu;function sm\(t\)\{mu=t\}function Sf\(\)\{if\(!mu\)throw new Error\("Angular app manifest is not set[^\"]+"\);return mu\}/)) {
                content = content.replace(/var mu;function sm\(t\)\{mu=t\}function Sf\(\)\{if\(!mu\)throw new Error\("Angular app manifest is not set[^\"]+"\);return mu\}/g,
                "import muMod from './angular-app-manifest.mjs'; var mu = muMod; function sm(t){mu=t} function Sf(){ return mu; }");
                modified = true;
            }

            if (modified) {
                console.log('Patched', fullPath);
                fs.writeFileSync(fullPath, content);
            }
        }
    }
}

processDir(path.join('dist', 'fusion-angular-tailwind-starter', 'server'));
