#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const chalk = require('chalk');
const { createObjectCsvWriter } = require('csv-writer');

const {
  processFile,
  findMarkdownFiles,
  checkLinksParallel
} = require('../src/index');

const LinkCache = require('../src/cache');
const { LinkFixer, FixStrategy } = require('../src/fixer');
const {
  loadConfig,
  validateConfig,
  DEFAULT_CONFIG_FILE
} = require('../src/config');

program
  .name('md-link-checker')
  .description('Fast CLI to check and validate markdown links in documentation')
  .version('2.0.0');

program
  .argument('[paths...]', 'Markdown files or directories to check (default: .)')
  .option('-c, --config <file>', 'Path to config file')
  .option('-r, --recursive', 'Recursively scan directories for .md files', true)
  .option('-t, --timeout <ms>', 'HTTP timeout in milliseconds', '5000')
  .option('-C, --concurrency <n>', 'Number of parallel checks', '10')
  .option('-f, --format <fmt>', 'Output format (text|json|markdown|csv|html)', 'text')
  .option('-v, --verbose', 'Show all checks including valid links', false)
  .option('--exit-code', 'Exit with non-zero if broken links found', false)
  .option('--no-cache', 'Disable caching')
  .option('--cache-file <path>', 'Custom cache file path')
  .option('--ignore <pattern>', 'Ignore URLs matching pattern (can be used multiple times)', [])
  .option('--ignore-file <file>', 'File containing ignore patterns (one per line)')
  .option('--fix', 'Automatically fix broken links')
  .option('--fix-strategy <strategy>', 'Fix strategy: dead_comment, dead_remove, redirect_update, relative_to_absolute, anchor_remove, anchor_placeholder', 'dead_comment')
  .option('--no-backup', 'Skip backup before fixing')
  .option('--base-url <url>', 'Base URL for relative-to-absolute fix strategy')
  .option('--progress', 'Show progress bar for large projects')
  .action(async (paths, options) => {
    try {
      // Load configuration
      const configResult = await loadConfig(options.config);
      const config = { ...configResult, ...options };

      // Validate configuration
      const validation = validateConfig(config);
      if (!validation.valid) {
        console.error(chalk.red('Configuration errors:'));
        for (const error of validation.errors) {
          console.error(chalk.red(`  • ${error}`));
        }
        process.exit(1);
      }

      // Merge options with config file
      const targetPaths = paths.length > 0 ? paths : ['.'];
      const timeout = parseInt(config.timeout, 10);
      const concurrency = parseInt(config.concurrency, 10);
      const verbose = config.verbose;
      const showProgress = config.progress;

      // Initialize cache
      const cache = config.noCache ? null : new LinkCache({
        cacheFile: config.cacheFile || config.cache?.file,
        ttl: config.cache?.ttl || 86400000
      });

      if (cache) {
        await cache.load();
        console.log(chalk.gray(`📦 Cache loaded: ${cache.getStats().size} entries\n`));
      }

      // Load ignore patterns
      let ignorePatterns = [...(config.ignore || [])];
      if (config.ignoreFile) {
        try {
          const ignoreContent = await require('fs').promises.readFile(config.ignoreFile, 'utf-8');
          const patterns = ignoreContent.split('\n')
            .map(line => line.trim())
            .filter(line => line && !line.startsWith('#'));
          ignorePatterns.push(...patterns);
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Failed to load ignore file: ${error.message}`));
        }
      }

      console.log(chalk.blue(`🔍 Checking markdown links...\n`));

      let allResults = [];
      let totalFiles = 0;
      let totalLinks = 0;
      let brokenLinks = 0;
      let redirects = 0;
      let cached = 0;

      for (const targetPath of targetPaths) {
        const resolvedPath = path.resolve(targetPath);
        const stat = await require('fs').promises.stat(resolvedPath);

        let filesToCheck = [];

        if (stat.isDirectory()) {
          if (config.recursive) {
            filesToCheck = await findMarkdownFiles(resolvedPath, {
              ignorePatterns
            });
          } else {
            const entries = await require('fs').promises.readdir(resolvedPath);
            filesToCheck = entries
              .filter(f => f.endsWith('.md') && !shouldIgnorePath(path.join(resolvedPath, f), ignorePatterns))
              .map(f => path.join(resolvedPath, f));
          }
        } else if (resolvedPath.endsWith('.md') && !shouldIgnorePath(resolvedPath, ignorePatterns)) {
          filesToCheck = [resolvedPath];
        }

        totalFiles += filesToCheck.length;

        for (const file of filesToCheck) {
          const results = await processFile(file, {
            timeout,
            concurrency,
            cache,
            ignorePatterns,
            showProgress
          });

          allResults.push(...results);
        }
      }

      totalLinks = allResults.length;
      brokenLinks = allResults.filter(r => !r.valid).length;
      redirects = allResults.filter(r => r.finalUrl && r.finalUrl !== r.url).length;
      cached = allResults.filter(r => r.cached).length;

      // Format and display results
      const invalidLinks = allResults.filter(r => !r.valid);

      if (config.format === 'json') {
        const output = {
          summary: {
            filesScanned: totalFiles,
            totalLinks,
            brokenLinks,
            validLinks: totalLinks - brokenLinks,
            redirects,
            cached,
            ignored: ignorePatterns.length
          },
          results: verbose ? allResults : invalidLinks
        };
        console.log(JSON.stringify(output, null, 2));
      } else if (config.format === 'csv') {
        await outputCsv(invalidLinks, verbose ? allResults : invalidLinks);
      } else if (config.format === 'html') {
        outputHtml(invalidLinks, verbose ? allResults : invalidLinks, {
          totalFiles,
          totalLinks,
          brokenLinks,
          validLinks: totalLinks - brokenLinks
        });
      } else if (config.format === 'markdown') {
        outputMarkdown(invalidLinks, verbose ? allResults : invalidLinks, {
          totalFiles,
          totalLinks,
          brokenLinks,
          validLinks: totalLinks - brokenLinks
        });
      } else {
        // Text format (default)
        outputText(invalidLinks, verbose ? allResults : invalidLinks, {
          totalFiles,
          totalLinks,
          brokenLinks,
          validLinks: totalLinks - brokenLinks,
          redirects,
          cached
        });
      }

      // Auto-fix if requested
      if (config.fix && invalidLinks.length > 0) {
        console.log(chalk.blue('\n🔧 Auto-fixing broken links...\n'));

        // Group by file
        const linksByFile = {};
        for (const link of invalidLinks) {
          if (!linksByFile[link.file]) {
            linksByFile[link.file] = [];
          }
          linksByFile[link.file].push(link);
        }

        const fixer = new LinkFixer({
          strategy: config.fixStrategy,
          baseUrl: config.baseUrl || '',
          backupSuffix: config.noBackup ? '' : '.bak'
        });

        for (const [filePath, links] of Object.entries(linksByFile)) {
          const result = await fixer.fixFile(filePath, links);
          console.log(chalk.green(`✅ Fixed ${result.fixed} links in ${path.relative(process.cwd(), filePath)}`));
          if (result.backupPath) {
            console.log(chalk.gray(`   Backup: ${result.backupPath}`));
          }
        }
      }

      // Save cache
      if (cache && cache.dirty) {
        await cache.save();
        console.log(chalk.gray(`\n📦 Cache saved: ${cache.getStats().size} entries`));
      }

      // Exit code handling
      if (config.exitCode && brokenLinks > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error.message}`));
      if (config.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

/**
 * Output results in text format
 */
function outputText(invalidLinks, allLinks, summary) {
  console.log(chalk.blue('📊 Summary:'));
  console.log(`   Files scanned: ${summary.totalFiles}`);
  console.log(`   Total links: ${summary.totalLinks}`);
  console.log(`   Broken links: ${summary.brokenLinks} ${summary.brokenLinks > 0 ? chalk.red('❌') : chalk.green('✅')}`);
  console.log(`   Valid links: ${summary.validLinks}`);
  if (summary.redirects > 0) {
    console.log(`   Redirects: ${summary.redirects}`);
  }
  if (summary.cached > 0) {
    console.log(`   Cached: ${summary.cached}`);
  }
  console.log('');

  if (invalidLinks.length > 0) {
    console.log(chalk.red('❌ Broken Links:\n'));
    invalidLinks.forEach(link => {
      const relativeFile = path.relative(process.cwd(), link.file);
      console.log(chalk.yellow(`   ${relativeFile}${link.line ? ':' + link.line : ''}`));
      console.log(`   └─ ${chalk.blue(link.url)}`);
      console.log(`      ${chalk.red(link.error || `Status: ${link.status}`)}\n`);
    });
  } else if (allLinks.length > 0 && allLinks[0].cached !== true) {
    console.log(chalk.green('✅ All links are valid!\n'));
  }
}

/**
 * Output results in Markdown format
 */
function outputMarkdown(invalidLinks, allLinks, summary) {
  console.log(`## Summary\n\n`);
  console.log(`- Files scanned: ${summary.totalFiles}`);
  console.log(`- Total links: ${summary.totalLinks}`);
  console.log(`- Broken links: ${summary.brokenLinks}`);
  console.log(`- Valid links: ${summary.validLinks}\n`);

  if (invalidLinks.length > 0) {
    console.log(`## Broken Links\n\n`);
    invalidLinks.forEach(link => {
      const relativeFile = path.relative(process.cwd(), link.file);
      console.log(`### ${relativeFile}\n`);
      console.log(`- URL: \`${link.url}\``);
      console.log(`- Status: ${link.error || link.status}\n`);
    });
  }
}

/**
 * Output results in HTML format
 */
function outputHtml(invalidLinks, allLinks, summary) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Link Check Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    table { border-collapse: collapse; width: 100%; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #4CAF50; color: white; }
    tr:nth-child(even) { background-color: #f2f2f2; }
    .broken { color: #f44336; }
    .valid { color: #4CAF50; }
  </style>
</head>
<body>
  <h1>Link Check Report</h1>
  <h2>Summary</h2>
  <ul>
    <li>Files scanned: ${summary.totalFiles}</li>
    <li>Total links: ${summary.totalLinks}</li>
    <li>Broken links: <span class="broken">${summary.brokenLinks}</span></li>
    <li>Valid links: <span class="valid">${summary.validLinks}</span></li>
  </ul>

  ${invalidLinks.length > 0 ? `
  <h2>Broken Links</h2>
  <table>
    <thead>
      <tr>
        <th>File</th>
        <th>Line</th>
        <th>URL</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${invalidLinks.map(link => `
        <tr>
          <td>${path.relative(process.cwd(), link.file)}</td>
          <td>${link.line || '-'}</td>
          <td><a href="${link.url}">${link.url.substring(0, 60)}${link.url.length > 60 ? '...' : ''}</a></td>
          <td class="broken">${link.error || link.status}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : '<p class="valid">All links are valid!</p>'}
</body>
</html>`;

  console.log(html);
}

/**
 * Output results in CSV format
 */
async function outputCsv(invalidLinks, allLinks) {
  const csvPath = 'link-check-results.csv';
  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: 'file', title: 'File' },
      { id: 'line', title: 'Line' },
      { id: 'text', title: 'Link Text' },
      { id: 'url', title: 'URL' },
      { id: 'status', title: 'Status' },
      { id: 'error', title: 'Error' }
    ]
  });

  const data = allLinks.map(link => ({
    file: path.relative(process.cwd(), link.file),
    line: link.line || '',
    text: link.text || '',
    url: link.url,
    status: link.status || '',
    error: link.error || ''
  }));

  await csvWriter.writeRecords(data);
  console.log(chalk.gray(`📊 CSV report written to: ${csvPath}\n`));
}

// Helper function for path ignoring
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

program.parse();
