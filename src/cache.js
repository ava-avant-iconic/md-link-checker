const fs = require('fs').promises;
const path = require('path');

const DEFAULT_CACHE_FILE = '.md-link-checker-cache.json';
const DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Cache for link check results to speed up repeated checks
 */
class LinkCache {
  constructor(options = {}) {
    this.cacheFile = options.cacheFile || DEFAULT_CACHE_FILE;
    this.ttl = options.ttl || DEFAULT_TTL;
    this.cache = new Map();
    this.dirty = false;
    this.enabled = true;
  }

  /**
   * Load cache from disk
   */
  async load() {
    if (!this.enabled) return;

    try {
      const content = await fs.readFile(this.cacheFile, 'utf-8');
      const data = JSON.parse(content);

      // Clean expired entries
      const now = Date.now();
      for (const [key, value] of Object.entries(data)) {
        if (value.timestamp && (now - value.timestamp) < this.ttl) {
          this.cache.set(key, value);
        }
      }

      return true;
    } catch (error) {
      // Cache file doesn't exist or is invalid - that's ok
      return false;
    }
  }

  /**
   * Save cache to disk
   */
  async save() {
    if (!this.enabled || !this.dirty) return;

    try {
      const data = {};
      for (const [key, value] of this.cache.entries()) {
        data[key] = value;
      }

      await fs.writeFile(this.cacheFile, JSON.stringify(data, null, 2), 'utf-8');
      this.dirty = false;
      return true;
    } catch (error) {
      console.warn(`Failed to save cache: ${error.message}`);
      return false;
    }
  }

  /**
   * Get cached result for a URL
   */
  get(url) {
    if (!this.enabled) return null;

    const entry = this.cache.get(url);
    if (!entry) return null;

    const now = Date.now();
    if (!entry.timestamp || (now - entry.timestamp) > this.ttl) {
      // Cache expired
      this.cache.delete(url);
      this.dirty = true;
      return null;
    }

    return entry;
  }

  /**
   * Set cached result for a URL
   */
  set(url, result) {
    if (!this.enabled) return;

    this.cache.set(url, {
      ...result,
      timestamp: Date.now()
    });
    this.dirty = true;
  }

  /**
   * Clear the cache
   */
  clear() {
    this.cache.clear();
    this.dirty = true;
  }

  /**
   * Disable caching
   */
  disable() {
    this.enabled = false;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      enabled: this.enabled,
      ttl: this.ttl
    };
  }
}

module.exports = LinkCache;
