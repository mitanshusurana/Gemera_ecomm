const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Find all affected files
const files = execSync('grep -rlE "(bg|border|ring|text|from|to|via)-primary-[0-9]{2,3}" src/ projects/admin/src/').toString().trim().split('\n');

for (const file of files) {
  if (!file) continue;
  let content = fs.readFileSync(file, 'utf8');

  // Replace the regex matches with the base primary class
  content = content.replace(/(bg|border|ring|text|from|to|via)-primary-[0-9]{2,3}/g, '$1-primary');

  fs.writeFileSync(file, content);
  console.log(`Updated ${file}`);
}
