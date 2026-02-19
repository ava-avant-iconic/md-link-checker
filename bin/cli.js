#!/usr/bin/env node

const { program } = require('commander');
const path = require('path');
const {
  processFile,
  findMarkdownFiles
} = require('../src/index');

program
  .name('md-link-checker')
  .description('Check and validate markdown links in documentation')
  .version('1.0.0');

program
  .argument('[paths...]', 'Markdown files or directories to check (default: .)')
  .option('-r, --recursive', 'Recursively scan directories for .md files', true)
  .option('-t, --timeout <ms>', 'HTTP timeout in milliseconds', '5000')
  .option('-c, --concurrency <n>', 'Number of parallel checks', '10')
  .option('-f, --format <fmt>', 'Output format (text|json|markdown)', 'text')
  .option('-v, --verbose', 'Show all checks including valid links', false)
  .option('--exit-code', 'Exit with non-zero if broken links found', false)
  .action(async (paths, options) => {
    const targetPaths = paths.length > 0 ? paths : ['.'];
    const timeout = parseInt(options.timeout, 10);
    const concurrency = parseInt(options.concurrency, 10);
    const verbose = options.verbose;

    console.log(`🔍 Checking markdown links...\n`);

    let allResults = [];
    let totalFiles = 0;
    let totalLinks = 0;
    let brokenLinks = 0;

    for (const targetPath of targetPaths) {
      const resolvedPath = path.resolve(targetPath);
      const stat = await require('fs').promises.stat(resolvedPath);

      let filesToCheck = [];

      if (stat.isDirectory()) {
        if (options.recursive) {
          filesToCheck = await findMarkdownFiles(resolvedPath);
        } else {
          const entries = await require('fs').promises.readdir(resolvedPath);
          filesToCheck = entries
            .filter(f => f.endsWith('.md'))
            .map(f => path.join(resolvedPath, f));
        }
      } else if (resolvedPath.endsWith('.md')) {
        filesToCheck = [resolvedPath];
      }

      totalFiles += filesToCheck.length;

      for (const file of filesToCheck) {
        const results = await processFile(file, { timeout, concurrency });
        allResults.push(...results);
      }
    }

    totalLinks = allResults.length;
    brokenLinks = allResults.filter(r => !r.valid).length;

    // Format and display results
    const invalidLinks = allResults.filter(r => !r.valid);

    if (options.format === 'json') {
      const output = {
        summary: {
          filesScanned: totalFiles,
          totalLinks,
          brokenLinks,
          validLinks: totalLinks - brokenLinks
        },
        results: verbose ? allResults : invalidLinks
      };
      console.log(JSON.stringify(output, null, 2));
    } else if (options.format === 'markdown') {
      console.log(`## Summary\n\n`);
      console.log(`- Files scanned: ${totalFiles}`);
      console.log(`- Total links: ${totalLinks}`);
      console.log(`- Broken links: ${brokenLinks}`);
      console.log(`- Valid links: ${totalLinks - brokenLinks}\n`);

      if (invalidLinks.length > 0) {
        console.log(`## Broken Links\n\n`);
        invalidLinks.forEach(link => {
          console.log(`- **${link.file}**: \`${link.url}\` - ${link.error || `Status ${link.status}`}`);
        });
      }
    } else {
      // Text format (default)
      console.log(`📊 Summary:`);
      console.log(`   Files scanned: ${totalFiles}`);
      console.log(`   Total links: ${totalLinks}`);
      console.log(`   Broken links: ${brokenLinks} ${brokenLinks > 0 ? '❌' : '✅'}`);
      console.log(`   Valid links: ${totalLinks - brokenLinks}\n`);

      if (invalidLinks.length > 0) {
        console.log(`❌ Broken Links:\n`);
        invalidLinks.forEach(link => {
          const relativeFile = path.relative(process.cwd(), link.file);
          console.log(`   ${relativeFile}`);
          console.log(`   └─ ${link.url}`);
          console.log(`      ${link.error || `Status: ${link.status}`}\n`);
        });
      } else if (verbose) {
        console.log(`✅ All links are valid!\n`);
      }
    }

    // Exit code handling
    if (options.exitCode && brokenLinks > 0) {
      process.exit(1);
    }
  });

program.parse();
