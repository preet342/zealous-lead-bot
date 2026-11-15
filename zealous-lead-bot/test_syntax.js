const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function checkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      checkDir(full);
    } else if (f.endsWith('.js')) {
      try {
        execSync(`node --check "${full}"`);
        console.log(`✅ SYNTAX PASS: ${path.relative(__dirname, full)}`);
      } catch (e) {
        console.error(`❌ SYNTAX FAIL: ${path.relative(__dirname, full)} - ${e.message}`);
        process.exit(1);
      }
    }
  }
}

checkDir(path.join(__dirname, 'src'));
console.log('🎉 ALL PROJECT JS FILES PASSED SYNTAX CHECK 100%!');
