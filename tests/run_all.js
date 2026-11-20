'use strict';
const cp = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('========================================================');
console.log(' Running Antigravity LaTeX Enhancer Full Test Suite');
console.log('========================================================\n');

function runTest(file) {
  const p = path.join(__dirname, file);
  console.log(`>>> Running ${file}...`);
  const res = cp.spawnSync(process.execPath, [p], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });
  if (res.status !== 0) {
    console.error(`\n[FAIL] Test suite ${file} failed with exit code ${res.status}`);
    process.exit(res.status || 1);
  }
}

runTest('test_payload.js');
console.log('\n');
runTest('test_dispose_tt.js');
console.log('\n');
runTest('test_runtime_cdp.js');
console.log('\n');
runTest('test_lifecycle.js');

const hasAsar = fs.existsSync(path.resolve(__dirname, '..', 'node_modules', '@electron', 'asar'));
if (hasAsar) {
  console.log('\n');
  runTest('test_engine.js');
} else {
  console.log('\n>>> Skipping legacy test_engine.js (@electron/asar not installed)');
}

console.log('\n========================================================');
console.log(' 🎉 ALL TEST SUITES PASSED CLEANLY (100% GREEN)');
console.log('========================================================');
