/**
 * Tests for md-link-checker CLI
 */

const { execSync } = require('child_process');

function runCmd(cmd) {
  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    return { success: true, output };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

console.log('Testing md-link-checker CLI...\n');

// Test 1: Check sample file
console.log('Test 1: Check sample file');
const test1 = runCmd('node cli.js test-sample.md');
console.log('Expected: Detect broken links\n');

// Test 2: Verbose mode
console.log('Test 2: Verbose mode');
const test2 = runCmd('node cli.js -v test-sample.md');
console.log('Expected: Detailed output with status\n');

// Test 3: Ignore patterns
console.log('Test 3: Ignore broken link pattern');
const test3 = runCmd('node cli.js -i "*broken*" test-sample.md');
console.log('Expected: Broken links ignored\n');

// Test 4: Check non-existent file
console.log('Test 4: Non-existent file');
const test4 = runCmd('node cli.js nonexistent.md 2>&1');
console.log('Expected: Error message\n');

// Test 5: No links file
console.log('Test 5: Create file with no links');
const test5 = runCmd('echo "# No Links" > no-links.md && node cli.js no-links.md && rm no-links.md');
console.log('Expected: All links valid\n');

console.log('\nAll tests completed!');
console.log('\nManual usage:');
console.log('  node cli.js README.md');
console.log('  node cli.js -v README.md');
console.log('  node cli.js -i "*.example.com" README.md');
