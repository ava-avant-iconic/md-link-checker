const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const cheerio = require('cheerio');

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
 * Check if a URL is valid
 */
async function checkUrl(url, timeout = 5000) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const response = await axios.head(url, {
        timeout,
        maxRedirects: 5,
        validateStatus: () => true
      });
      return {
        valid: response.status >= 200 && response.status < 400,
        status: response.status,
        error: null
      };
    } catch (error) {
      return {
        valid: false,
        status: null,
        error: error.code === 'ECONNABORTED' ? 'Timeout' : error.message
      };
    }
  }
  return {
    valid: true,
    status: null,
    error: 'Not an HTTP(S) URL'
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
      error: null
    };
  } catch (error) {
    return {
      valid: false,
      error: 'File not found'
    };
  }
}

/**
 * Process a single markdown file
 */
async function processFile(filePath, options = {}) {
  const content = await fs.readFile(filePath, 'utf-8');
  const baseDir = path.dirname(filePath);
  const links = extractLinks(content);

  const results = [];
  const concurrency = options.concurrency || 10;

  // Process links in batches
  for (let i = 0; i < links.length; i += concurrency) {
    const batch = links.slice(i, i + concurrency);
    const checks = await Promise.all(
      batch.map(async (link) => {
        let check;
        if (link.type === 'relative' || (!link.url.startsWith('http://') && !link.url.startsWith('https://'))) {
          check = await checkRelativePath(link.url, baseDir);
        } else {
          check = await checkUrl(link.url, options.timeout || 5000);
        }
        return {
          ...link,
          ...check,
          file: filePath
        };
      })
    );
    results.push(...checks);
  }

  return results;
}

/**
 * Recursively find all markdown files
 */
async function findMarkdownFiles(dir, options = {}) {
  const files = await fs.readdir(dir, { withFileTypes: true });
  const markdownFiles = [];

  for (const file of files) {
    const fullPath = path.join(dir, file.name);

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

module.exports = {
  extractLinks,
  checkUrl,
  checkRelativePath,
  processFile,
  findMarkdownFiles
};
