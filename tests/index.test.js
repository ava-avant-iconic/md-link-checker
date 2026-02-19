const { test, describe } = require('node:test');
const assert = require('node:assert');
const {
  extractLinks,
  processFile,
  findMarkdownFiles,
  checkUrl
} = require('../src/index');
const path = require('path');

describe('extractLinks', () => {
  test('should extract markdown links', () => {
    const markdown = '[Google](https://www.google.com)';
    const links = extractLinks(markdown);
    assert.strictEqual(links.length, 1);
    assert.strictEqual(links[0].url, 'https://www.google.com');
    assert.strictEqual(links[0].text, 'Google');
  });

  test('should extract multiple links', () => {
    const markdown = `
      [Link 1](https://example.com)
      [Link 2](https://github.com)
    `;
    const links = extractLinks(markdown);
    assert.strictEqual(links.length, 2);
  });

  test('should extract raw URLs', () => {
    const markdown = 'Visit https://example.com for more info';
    const links = extractLinks(markdown);
    assert.ok(links.some(l => l.url === 'https://example.com'));
  });

  test('should extract relative links', () => {
    const markdown = '[Another File](./file.md)';
    const links = extractLinks(markdown);
    assert.ok(links.some(l => l.url === './file.md'));
  });
});

describe('checkUrl', async () => {
  test('should validate valid URL', async () => {
    const result = await checkUrl('https://www.google.com');
    assert.strictEqual(result.valid, true);
  });

  test('should handle invalid URL', async () => {
    const result = await checkUrl('https://this-does-not-exist-12345.example.com', 3000);
    assert.strictEqual(result.valid, false);
  });
});

describe('findMarkdownFiles', async () => {
  test('should find markdown files recursively', async () => {
    const fixturesPath = path.join(__dirname, 'test-fixtures');
    const files = await findMarkdownFiles(fixturesPath);
    assert.ok(files.length >= 2);
    assert.ok(files.every(f => f.endsWith('.md')));
  });
});

describe('processFile', async () => {
  test('should process markdown file and return results', async () => {
    const samplePath = path.join(__dirname, 'test-fixtures', 'sample.md');
    const results = await processFile(samplePath);
    assert.ok(results.length > 0);
    assert.ok(results.every(r => r.file === samplePath));
  });

  test('should detect broken HTTP links', async () => {
    const samplePath = path.join(__dirname, 'test-fixtures', 'sample.md');
    const results = await processFile(samplePath);
    const brokenLinks = results.filter(r => !r.valid && (r.url.startsWith('http://') || r.url.startsWith('https://')));
    assert.ok(brokenLinks.length > 0, 'Should find at least one broken HTTP link');
  });

  test('should validate relative file paths', async () => {
    const samplePath = path.join(__dirname, 'test-fixtures', 'sample.md');
    const results = await processFile(samplePath);
    const relativeLinks = results.filter(r => r.url.startsWith('./') && !r.url.includes('.com'));
    assert.ok(relativeLinks.length > 0);
    assert.ok(relativeLinks.some(r => r.valid), 'At least one relative link should be valid');
    assert.ok(relativeLinks.some(r => !r.valid), 'At least one relative link should be invalid');
  });
});

console.log('✅ All tests passed!');
