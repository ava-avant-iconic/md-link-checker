# md-link-checker

A CLI tool to check for broken links in Markdown files. Validate external URLs, local file links, and ensure documentation quality.

## Features

- ✅ Check external URLs for broken links
- ✅ Validate local file references (optional)
- ✅ Ignore specific URL patterns
- ✅ Verbose output for debugging
- ✅ Configurable timeout and redirects
- ✅ Support for multiple files
- ✅ Exit code 1 on broken links (CI/CD friendly)
- ✅ Detailed error reporting with line numbers

## Installation

### Global Installation

```bash
npm install -g md-link-checker
```

### Local Installation

```bash
npm install md-link-checker
```

### From Source

```bash
git clone <repository-url>
cd md-link-checker
npm install
npm install -g .
```

## Usage

### Basic Usage

Check links in a Markdown file:

```bash
md-link-checker README.md
```

### Verbose Mode

Show detailed output for each link:

```bash
md-link-checker -v README.md
```

### Ignore Patterns

Ignore specific URL patterns:

```bash
md-link-checker -i "*.example.com" README.md
```

Multiple ignore patterns:

```bash
md-link-checker -i "*.example.com" -i "*broken*" README.md
```

### Check Local Files

Validate local file references:

```bash
md-link-checker -l README.md
```

### Multiple Files

Check multiple Markdown files:

```bash
md-link-checker *.md
md-link-checker README.md CONTRIBUTING.md docs/*.md
```

## Options

| Option | Alias | Type | Description | Default |
|--------|--------|-------|-------------|----------|
| `--verbose` | `-v` | boolean | Verbose output | `false` |
| `--timeout` | `-t` | number | Request timeout (ms) | `5000` |
| `--max-redirects` | `-r` | number | Maximum redirects | `5` |
| `--ignore` | `-i` | array | URL patterns to ignore | - |
| `--check-local` | `-l` | boolean | Check local file links | `false` |
| `--help` | `-h` | - | Show help | - |
| `--version` | `-V` | - | Show version | - |

## Examples

### Basic Check

```bash
md-link-checker README.md
```

**Output:**
```
📊 Results: 5 ok, 1 broken, 0 ignored, 2 internal

❌ Broken links:
  Line 24: https://this-domain-does-not-exist-12345.com (404)

❌ Found 1 broken link(s)
```

### Verbose Mode

```bash
md-link-checker -v README.md
```

**Output:**
```
📄 Checking: README.md
  Found 8 link(s)

  ✅ ok (200) - https://github.com
  ✅ ok (200) - https://docs.openclaw.ai
  ✅ ok (200) - https://nodejs.org/
  ✅ ok (exists) - #introduction
  ✅ ok (exists) - #features
  ✅ ok (200) - https://via.placeholder.com/150
  ❌ broken (404) - https://this-domain-does-not-exist-12345.com
  ⚪️ internal (N/A) - https://example.com

📊 Results: 6 ok, 1 broken, 0 ignored, 1 internal

❌ Broken links:
  Line 24: https://this-domain-does-not-exist-12345.com (404)

❌ Found 1 broken link(s)
```

### Ignore Patterns

Ignore example.com domains:

```bash
md-link-checker -i "*.example.com" README.md
```

Ignore multiple patterns:

```bash
md-link-checker -i "*.example.com" -i "*broken*" -i "*localhost*" README.md
```

### Check Multiple Files

Check all Markdown files:

```bash
md-link-checker *.md
```

Check specific documentation files:

```bash
md-link-checker docs/README.md docs/API.md docs/GUIDE.md
```

### Check Local Files

Validate local file references:

```bash
md-link-checker -l README.md
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All links valid |
| `1` | Broken links found or file not found |

## Use Cases

### 1. Pre-commit Validation

Check for broken links before committing:

```bash
# package.json
{
  "scripts": {
    "check-links": "md-link-checker README.md CONTRIBUTING.md",
    "precommit": "npm run check-links"
  }
}
```

### 2. CI/CD Pipeline

Integrate into CI/CD:

```yaml
# .github/workflows/ci.yml
name: CI

on: [push]

jobs:
  check-links:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Check broken links
        run: |
          npm install -g md-link-checker
          md-link-checker README.md docs/*.md
```

### 3. Documentation Review

Regularly check documentation:

```bash
# Check all documentation
md-link-checker docs/**/*.md

# Verbose mode for detailed output
md-link-checker -v docs/**/*.md
```

### 4. Ignore Temporary Links

Ignore demo/example links:

```bash
md-link-checker -i "demo.example.com" -i "staging.*.com" README.md
```

### 5. Multi-File Project

Check entire project:

```bash
# Check all Markdown files
md-link-checker $(find . -name "*.md" -not -path "*/node_modules/*")
```

## Link Types Supported

### External URLs

- HTTP/HTTPS URLs
- Follows redirects
- Customizable timeout

### Internal Links

- Anchor links (#section)
- File references (./file.md)
- Directory references (./docs/)

### Local Files

- Local file paths (optional check)
- Resolves relative paths
- Checks file existence

## Troubleshooting

### Timeout Errors

Increase timeout for slow servers:

```bash
md-link-checker -t 10000 README.md
```

### False Positives

Ignore known working but slow links:

```bash
md-link-checker -i "*.internal.com" README.md
```

### Rate Limiting

Add delays between checks:

```bash
# Future feature: Add --delay option
```

### Network Issues

Check network connectivity:

```bash
curl -I https://github.com
```

## Tips

### Batch Checking

Check multiple files efficiently:

```bash
# Find and check all MD files
find docs -name "*.md" -exec md-link-checker {} \;
```

### Regular Validation

Schedule regular checks:

```bash
# Weekly cron job
0 2 * * 0 cd /project && md-link-checker README.md
```

### CI/CD Best Practices

```bash
# Fast check for PRs
md-link-checker --timeout 3000 README.md

# Thorough check for main branch
md-link-checker --timeout 10000 README.md docs/*.md
```

## Performance

- Check speed: ~1-2 links per second (depends on network)
- Memory usage: <50MB
- No external dependencies for link extraction

## Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Submit a pull request

## License

MIT License - See [LICENSE](LICENSE) file for details.

## Author

OpenClaw

## Links

- [GitHub Repository](https://github.com/your-org/md-link-checker)
- [npm Package](https://www.npmjs.com/package/md-link-checker)

---

**Version:** 1.0.0
**Node:** >=14.0.0
