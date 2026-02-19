# md-link-checker

Fast CLI to check and validate markdown links in documentation.

## Features

- ✅ HTTP/HTTPS link validation with configurable timeout
- 📁 Local file path resolution (relative links)
- 🔍 Recursive directory scanning for .md files
- ⚡ Configurable concurrency for parallel checks
- 📊 Multiple output formats: text, JSON, markdown
- 🚀 Zero dependencies on complex parsers (uses cheerio)

## Installation

```bash
npm install -g md-link-checker
```

Or use directly with npx:

```bash
npx md-link-checker ./docs
```

## Usage

### Basic Usage

Check all markdown files in current directory:

```bash
md-link-checker
```

Check specific file:

```bash
md-link-checker README.md
```

Check specific directory:

```bash
md-link-checker ./docs
```

### Options

```bash
md-link-checker [paths...] [options]

Options:
  -r, --recursive          Recursively scan directories for .md files (default: true)
  -t, --timeout <ms>       HTTP timeout in milliseconds (default: 5000)
  -c, --concurrency <n>    Number of parallel checks (default: 10)
  -f, --format <fmt>       Output format: text|json|markdown (default: text)
  -v, --verbose            Show all checks including valid links
  --exit-code             Exit with non-zero if broken links found
  -h, --help              Display help
  --version               Display version
```

### Examples

**Show only broken links (default):**

```bash
md-link-checker ./docs
```

**Show all links including valid ones:**

```bash
md-link-checker ./docs --verbose
```

**Output as JSON:**

```bash
md-link-checker ./docs --format json > results.json
```

**Output as markdown:**

```bash
md-link-checker ./docs --format markdown
```

**Use in CI/CD pipelines:**

```bash
md-link-checker ./docs --exit-code
```

**Custom timeout and concurrency:**

```bash
md-link-checker ./docs --timeout 10000 --concurrency 20
```

### CI/CD Integration

**GitHub Actions:**

```yaml
name: Check Markdown Links

on: [push, pull_request]

jobs:
  link-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npx md-link-checker ./docs --exit-code
```

**GitLab CI:**

```yaml
link-check:
  stage: test
  image: node:18
  script:
    - npx md-link-checker ./docs --exit-code
```

## Link Types Supported

1. **Markdown links**: `[text](url)`
2. **Raw URLs**: `https://example.com`
3. **Relative file paths**: `[text](./file.md)`
4. **Mixed formats**: All in one file

## Output Formats

### Text (default)

```
🔍 Checking markdown links...

📊 Summary:
   Files scanned: 5
   Total links: 42
   Broken links: 2 ❌
   Valid links: 40

❌ Broken Links:

   docs/guide.md
   └─ https://broken-link.example.com
      Status: 404
```

### JSON

```json
{
  "summary": {
    "filesScanned": 5,
    "totalLinks": 42,
    "brokenLinks": 2,
    "validLinks": 40
  },
  "results": [...]
}
```

### Markdown

```markdown
## Summary

- Files scanned: 5
- Total links: 42
- Broken links: 2
- Valid links: 40

## Broken Links

- **docs/guide.md**: `https://broken-link.example.com` - Status 404
```

## Exit Codes

- `0` - All links valid
- `1` - Broken links found (only when `--exit-code` is used)

## Performance

- Default concurrency: 10 parallel checks
- Default HTTP timeout: 5 seconds
- Optimized for large documentation sets

## Requirements

- Node.js >= 18.0.0

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
