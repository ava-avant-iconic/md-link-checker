const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');
const { PBar } = require('p-progress');

/**
 * Extract all links from markdown content
 */
function extractLinks(markdown) {
  const links = new Map();

  // Regular expression for markdown links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;

  while ((match = linkRegex.exec(markdown)) !== null) {
    const url = match[2].trim();
    if (!links.has(url)) {
      links.set(url, {
        text: match[1],
        url: url,
        type: 'markdown'
      });
    }
  }

  // Regular expression for standalone URLs (not in markdown syntax)
  const urlRegex = /(?!\[.*?\]\()https?:\/\/[^\s\)]+/g;
  while ((match = urlRegex.exec(markdown)) !== null) {
    const url = match[0];
    if (!links.has(url)) {
      links.set(url, {
        text: url,
        url: url,
        type: 'raw'
      });
    }
  }

  // Regular expression for relative links: [text](path/to/file.md)
  const relativeRegex = /\[([^\]]+)\]\(([^:)]+\.(md|txt|html?)?)\)/g;
  while ((match = relativeRegex.exec(markdown)) !== null) {
    const url = match[2].trim();
    if (!links.has(url)) {
      links.set(url, {
        text: match[1],
        url: url,
        type: 'relative'
      });
    }
  }

  return Array.from(links.values());
}

/**
 * Check if a URL matches any ignore pattern
 */
function shouldIgnoreUrl(url, patterns) {
  if (!patterns || patterns.length === 0) return false;

  for (const pattern of patterns) {
    try {
      const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      if (regex.test(url)) {
        return true;
      }
    } catch {
      // Invalid regex, skip
    }
  }

  return false;
}

/**
 * Check if a URL is valid (with caching support)
 */
async function checkUrl(url, timeout = 5000, cache = null) {
  // Check cache first
  if (cache) {
    const cached = cache.get(url);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const response = await axios.head(url, {
        timeout,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent': 'md-link-checker/1.0.0'
        }
      });

      const result = {
        valid: response.status >= 200 && response.status < 400,
        status: response.status,
        error: null,
        finalUrl: response.request?.res?.responseUrl || url
      };

      // Cache the result
      if (cache) {
        cache.set(url, result);
      }

      return result;
    } catch (error) {
      const result = {
        valid: false,
        status: null,
        error: error.code === 'ECONNABORTED' ? 'Timeout' : error.message,
        finalUrl: null
      };

      // Cache error results too
      if (cache) {
        cache.set(url, result);
      }

      return result;
    }
  }

  return {
    valid: true,
    status: null,
    error: 'Not an HTTP(S) URL',
    finalUrl: null
  };
}

/**
 * Check if a relative file path exists
 */
async function checkRelativePath(filePath, baseDir) {
  const fullPath = path.resolve(baseDir, filePath);
  try {
    await fs.access(fullPath);
    return {
      valid: true,
      error: null,
      finalUrl: fullPath
    };
  } catch (error) {
    return {
      valid: false,
      error: 'File not found',
      finalUrl: null
    };
  }
}

/**
 * Check multiple links in parallel with progress bar
 */
async function checkLinksParallel(links, options = {}) {
  const {
    timeout = 5000,
    concurrency = 10,
    cache = null,
    ignorePatterns = [],
    showProgress = false
  } = options;

  // Filter out ignored links
  const linksToCheck = links.filter(link => !shouldIgnoreUrl(link.url, ignorePatterns));

  if (linksToCheck.length === 0) {
    return [];
  }

  // Progress bar
  let progressBar = null;
  if (showProgress && linksToCheck.length > 10) {
    progressBar = new PBar({
      total: linksToCheck.length,
      label: 'Checking links',
      width: 40
    });
    progressBar.start();
  }

  const results = [];
  const batches = [];

  // Process in parallel batches
  for (let i = 0; i < linksToCheck.length; i += concurrency) {
    const batch = linksToCheck.slice(i, Math.min(i + concurrency, linksToCheck.length));
    batches.push(batch);
  }

  // Process batches concurrently
  for (const batch of batches) {
    const checks = await Promise.all(
      batch.map(async (link) => {
        let check;
        if (link.type === 'relative' || (!link.url.startsWith('http://') && !link.url.startsWith('https://'))) {
          check = await checkRelativePath(link.url, options.baseDir);
        } else {
          check = await checkUrl(link.url, timeout, cache);
        }

        // Update progress
        if (progressBar) {
          progressBar.tick();
        }

        return {
          ...link,
          ...check
        };
      })
    );

    results.push(...checks);
  }

  // Stop progress bar
  if (progressBar) {
    progressBar.stop();
  }

  return results;
}

/**
 * Process a single markdown file with parallel checking
 */
async function processFile(filePath, options = {}) {
  const content = await fs.readFile(filePath, 'utf-8');
  const baseDir = path.dirname(filePath);
  const links = extractLinks(content);

  const results = await checkLinksParallel(links, {
    ...options,
    baseDir
  });

  // Add file info to results
  return results.map(r => ({
    ...r,
    file: filePath,
    line: findLineNumber(content, r.url)
  }));
}

/**
 * Find line number where URL appears in content
 */
function findLineNumber(content, url) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(url)) {
      return i + 1;
    }
  }
  return null;
}

/**
 * Recursively find all markdown files with ignore patterns
 */
async function findMarkdownFiles(dir, options = {}) {
  const ignorePatterns = options.ignorePatterns || [];

  const files = await fs.readdir(dir, { withFileTypes: true });
  const markdownFiles = [];

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

    // Skip ignored files/directories
    if (shouldIgnorePath(fullPath, ignorePatterns)) {
      continue;
    }

    if (file.isDirectory()) {
      // Skip hidden directories and node_modules
      if (!file.name.startsWith('.') && file.name !== 'node_modules') {
        const subFiles = await findMarkdownFiles(fullPath, options);
        markdownFiles.push(...subFiles);
      }
    } else if (file.name.endsWith('.md')) {
      markdownFiles.push(fullPath);
    }
  }

  return markdownFiles;
}

/**
 * Check if a path should be ignored
 */
function shouldIgnorePath(filePath, patterns) {
  const fileName = path.basename(filePath);

  for (const pattern of patterns) {
    try {
      const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);
      if (regex.test(filePath) || regex.test(fileName)) {
        return true;
      }
    } catch {
      // Invalid regex, skip
    }
  }

  return false;
}

module.exports = {
  extractLinks,
  checkUrl,
  checkRelativePath,
  checkLinksParallel,
  processFile,
  findMarkdownFiles,
  shouldIgnoreUrl,
  shouldIgnorePath
};
