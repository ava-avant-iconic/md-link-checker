const fs = require('fs').promises;
const path = require('path');

const DEFAULT_CONFIG_FILE = '.md-link-checker.json';
const ALT_CONFIG_FILES = ['.mdlinkcheckerrc', 'mdlinkcheck.json'];

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  concurrency: 10,
  timeout: 5000,
  format: 'text',
  exitCode: false,
  verbose: false,
  recursive: true,
  fix: {
    enabled: false,
    strategy: 'dead_comment',
    backup: true
  },
  cache: {
    enabled: true,
    file: '.md-link-checker-cache.json',
    ttl: 86400000 // 24 hours in milliseconds
  },
  ignore: {
    patterns: [],
    files: []
  }
};

/**
 * Load configuration from file
 */
async function loadConfig(configPath = null) {
  let filePath = configPath;

  // If no path provided, search for config file
  if (!filePath) {
    filePath = await findConfigFile();
    if (!filePath) {
      // No config file found, return defaults
      return { ...DEFAULT_CONFIG, configPath: null };
    }
  }

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const userConfig = JSON.parse(content);

    // Merge with defaults
    const config = mergeConfig(DEFAULT_CONFIG, userConfig);

    return { ...config, configPath: filePath };
  } catch (error) {
    throw new Error(`Failed to load config from ${filePath}: ${error.message}`);
  }
}

/**
 * Find config file in current or parent directories
 */
async function findConfigFile() {
  const searchPaths = ['.', '..'];

  for (const searchPath of searchPaths) {
    for (const configFile of [DEFAULT_CONFIG_FILE, ...ALT_CONFIG_FILES]) {
      const filePath = path.join(searchPath, configFile);

      try {
        await fs.access(filePath);
        return path.resolve(filePath);
      } catch {
        // File doesn't exist, try next
      }
    }
  }

  return null;
}

/**
 * Deep merge configurations
 */
function mergeConfig(base, override) {
  const result = { ...base };

  for (const key of Object.keys(override)) {
    if (typeof override[key] === 'object' && !Array.isArray(override[key])) {
      result[key] = mergeConfig(base[key] || {}, override[key]);
    } else {
      result[key] = override[key];
    }
  }

  return result;
}

/**
 * Validate configuration
 */
function validateConfig(config) {
  const errors = [];

  if (config.concurrency < 1 || config.concurrency > 100) {
    errors.push('concurrency must be between 1 and 100');
  }

  if (config.timeout < 1000 || config.timeout > 60000) {
    errors.push('timeout must be between 1000 and 60000');
  }

  if (!['text', 'json', 'markdown', 'csv', 'html'].includes(config.format)) {
    errors.push(`format must be one of: text, json, markdown, csv, html`);
  }

  const validFixStrategies = ['dead_comment', 'dead_remove', 'redirect_update', 'relative_to_absolute', 'anchor_remove', 'anchor_placeholder'];
  if (!validFixStrategies.includes(config.fix.strategy)) {
    errors.push(`fix.strategy must be one of: ${validFixStrategies.join(', ')}`);
  }

  if (config.cache.ttl < 60000) { // Minimum 1 minute
    errors.push('cache.ttl must be at least 60000 (1 minute)');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  loadConfig,
  findConfigFile,
  validateConfig,
  DEFAULT_CONFIG,
  DEFAULT_CONFIG_FILE,
  ALT_CONFIG_FILES
};
