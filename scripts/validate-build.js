const fs = require('fs');
const path = require('path');

console.log('🔍 Validating Angular SSR build output...\n');

const buildPath = path.join(__dirname, '../dist/fusion-angular-tailwind-starter');
const serverPath = path.join(buildPath, 'server');
const browserPath = path.join(buildPath, 'browser');

const requiredFiles = [
  { path: serverPath, file: 'server.mjs', type: 'Server entry point' },
  { path: serverPath, file: 'angular-app-engine-manifest.mjs', type: 'App Engine Manifest' },
  { path: browserPath, file: 'index.csr.html', type: 'Browser index (CSR)', alternate: 'index.html' },
];

let hasErrors = false;

// Check directory structure
if (!fs.existsSync(buildPath)) {
  console.error(`❌ Build directory not found: ${buildPath}`);
  process.exit(1);
}

console.log(`✓ Build directory found: ${buildPath}\n`);

if (!fs.existsSync(serverPath)) {
  console.error(`❌ Server directory not found: ${serverPath}`);
  console.error('   This indicates SSR build was not generated!');
  hasErrors = true;
} else {
  console.log(`✓ Server directory found\n`);
}

if (!fs.existsSync(browserPath)) {
  console.error(`❌ Browser directory not found: ${browserPath}`);
  hasErrors = true;
} else {
  console.log(`✓ Browser directory found\n`);
}

// Check required files
console.log('Checking required files:\n');
requiredFiles.forEach(({ path: dirPath, file, type, alternate }) => {
  const filePath = path.join(dirPath, file);
  const alternatePath = alternate ? path.join(dirPath, alternate) : null;
  
  if (fs.existsSync(filePath)) {
    const size = (fs.statSync(filePath).size / 1024).toFixed(2);
    console.log(`  ✓ ${type}: ${file} (${size}KB)`);
  } else if (alternatePath && fs.existsSync(alternatePath)) {
    const size = (fs.statSync(alternatePath).size / 1024).toFixed(2);
    console.log(`  ✓ ${type}: ${alternate} (${size}KB)`);
  } else {
    console.error(`  ❌ ${type}: ${file} NOT FOUND at ${dirPath}`);
    if (alternatePath) console.error(`     (Also checked for: ${alternate})`);
    hasErrors = true;
  }
});

// List actual server directory contents if it exists
if (fs.existsSync(serverPath)) {
  console.log(`\nServer directory contents:`);
  fs.readdirSync(serverPath).forEach(file => {
    const stat = fs.statSync(path.join(serverPath, file));
    const size = (stat.size / 1024).toFixed(2);
    console.log(`  - ${file} (${size}KB)`);
  });
}

console.log('\n');

if (hasErrors) {
  console.error('❌ Build validation FAILED!');
  console.error('\nPossible solutions:');
  console.error('1. Ensure "@angular/build:application" builder is used in angular.json');
  console.error('2. Check that "ssr" configuration is present in angular.json build options');
  console.error('3. Verify that src/server.ts exists');
  console.error('4. Check for build errors in the Angular CLI output above');
  process.exit(1);
} else {
  console.log('✅ Build validation PASSED!');
  console.log('Angular SSR build is correctly configured.\n');
}
