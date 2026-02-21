#!/usr/bin/env node

/**
 * md-link-checker - CLI tool to check for broken links in Markdown files
 */

const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options] <file>')
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    description: 'Verbose output'
  })
  .option('timeout', {
    alias: 't',
    type: 'number',
    description: 'Request timeout in milliseconds',
    default: 5000
  })
  .option('max-redirects', {
    alias: 'r',
    type: 'number',
    description: 'Maximum number of redirects',
    default: 5
  })
  .option('ignore', {
    alias: 'i',
    type: 'array',
    description: 'URL patterns to ignore (can use multiple times)'
  })
  .option('check-local', {
    alias: 'l',
    type: 'boolean',
    description: 'Check local file links',
    default: false
  })
  .help()
  .alias('help', 'h')
  .version('1.0.0')
  .alias('version', 'V')
  .example('$0 README.md', 'Check links in README.md')
  .example('$0 -i "*.example.com" *.md', 'Check all MD files, ignore example.com')
  .parseSync();

/**
 * Extract links from Markdown content using regex
 */
function extractMarkdownLinks(content) {
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links = [];
  let match;

  while ((match = linkPattern.exec(content)) !== null) {
    links.push({
      text: match[1],
      href: match[2]
    });
  }

  return links;
}

/**
 * Check if URL should be ignored
 */
function shouldIgnore(url) {
  if (!argv.ignore) return false;

  return argv.ignore.some(pattern => {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(url);
  });
}

/**
 * Check if URL is internal (same origin)
 */
function isInternalUrl(url) {
  try {
    const parsed = new URL(url);
    return !parsed.protocol.startsWith('http');
  } catch {
    return !url.startsWith('http');
  }
}

/**
 * Check if file exists locally
 */
function checkLocalFile(filePath, basePath) {
  const absolutePath = path.resolve(basePath, filePath);
  return fs.existsSync(absolutePath);
}

/**
 * Check if URL is reachable
 */
async function checkUrl(url) {
  if (shouldIgnore(url)) {
    return { url, status: 'ignored', code: null };
  }

  if (isInternalUrl(url)) {
    return { url, status: 'internal', code: null };
  }

  try {
    const response = await axios.head(url, {
      timeout: argv.timeout,
      maxRedirects: argv.maxRedirects,
      validateStatus: false
    });
    const statusCode = response.status;
    return {
      url,
      status: statusCode >= 200 && statusCode < 400 ? 'ok' : 'broken',
      code: statusCode
    };
  } catch (error) {
    const status = error.response ? error.response.status : error.code || 'network';
    return {
      url,
      status: 'broken',
      code: status
    };
  }
}

/**
 * Process Markdown file
 */
async function checkMarkdownFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const basePath = path.dirname(filePath);

  if (argv.verbose) {
    console.log(`\n📄 Checking: ${filePath}`);
  }

  // Extract links from Markdown
  const links = extractMarkdownLinks(content);

  if (links.length === 0) {
    if (argv.verbose) {
      console.log('  No links found');
    }
    return { ok: 0, broken: 0, ignored: 0, internal: 0, links: [] };
  }

  if (argv.verbose) {
    console.log(`  Found ${links.length} link(s)\n`);
  }

  // Check each link
  const results = [];
  for (const link of links) {
    const { href } = link;
    const line = content.substring(0, content.indexOf(href)).split('\n').length;
    let result;

    if (isInternalUrl(href)) {
      if (argv.checkLocal) {
        const exists = checkLocalFile(href, basePath);
        result = {
          url: href,
          line,
          status: exists ? 'ok' : 'broken',
          code: exists ? 'exists' : 'not found'
        };
      } else {
        result = {
          url: href,
          line,
          status: 'internal',
          code: null
        };
      }
    } else {
      result = await checkUrl(href);
    }

    results.push({ ...result, line });

    if (argv.verbose) {
      const statusEmoji = result.status === 'ok' ? '✅' :
                       result.status === 'broken' ? '❌' :
                       result.status === 'ignored' ? '⏭️' : '⚪️';
      console.log(`  ${statusEmoji} ${result.status} (${result.code || 'N/A'}) - ${href}`);
    }
  }

  // Count results
  const ok = results.filter(r => r.status === 'ok').length;
  const broken = results.filter(r => r.status === 'broken').length;
  const ignored = results.filter(r => r.status === 'ignored').length;
  const internal = results.filter(r => r.status === 'internal').length;

  return { ok, broken, ignored, internal, links: results };
}

/**
 * Print results
 */
function printResults(results) {
  const { ok, broken, ignored, internal, links } = results;

  console.log(`\n📊 Results: ${ok} ok, ${broken} broken, ${ignored} ignored, ${internal} internal`);

  if (broken > 0) {
    console.log(`\n❌ Broken links:`);
    links
      .filter(link => link.status === 'broken')
      .forEach(link => {
        console.log(`  Line ${link.line}: ${link.url} (${link.code})`);
      });
  }

  // Exit with error code if broken links found
  if (broken > 0) {
    console.log(`\n❌ Found ${broken} broken link(s)`);
    process.exit(1);
  }

  console.log(`\n✅ All links are valid!`);
}

// Main execution
async function main() {
  const files = argv._;

  if (files.length === 0) {
    console.error('❌ Error: No files specified\n');
    console.error('Usage: md-link-checker <file>');
    console.error('Run: md-link-checker --help for more information');
    process.exit(1);
  }

  const allResults = {
    ok: 0,
    broken: 0,
    ignored: 0,
    internal: 0,
    links: []
  };

  // Check each file
  for (const file of files) {
    const results = await checkMarkdownFile(file);
    allResults.ok += results.ok;
    allResults.broken += results.broken;
    allResults.ignored += results.ignored;
    allResults.internal += results.internal;
    allResults.links = [...allResults.links, ...results.links];
  }

  // Print results
  printResults(allResults);
}

main().catch(error => {
  console.error(`\n❌ Fatal error: ${error.message}`);
  process.exit(1);
});
