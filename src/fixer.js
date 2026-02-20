const path = require('path');
const fs = require('fs').promises;

/**
 * Auto-fix strategies for broken links
 */
const FixStrategy = {
  DEAD_COMMENT: 'dead_comment', // Add [dead] comment
  DEAD_REMOVE: 'dead_remove', // Remove the link
  REDIRECT_UPDATE: 'redirect_update', // Update to final URL
  RELATIVE_TO_ABSOLUTE: 'relative_to_absolute', // Convert relative to absolute
  ANCHOR_REMOVE: 'anchor_remove', // Remove anchor
  ANCHOR_PLACEHOLDER: 'anchor_placeholder' // Add placeholder text
};

/**
 * Auto-fixer for broken markdown links
 */
class LinkFixer {
  constructor(options = {}) {
    this.strategy = options.strategy || FixStrategy.DEAD_COMMENT;
    this.baseUrl = options.baseUrl || '';
    this.backupSuffix = options.backupSuffix || '.bak';
    this.backupCreated = false;
  }

  /**
   * Create a backup of the file before fixing
   */
  async createBackup(filePath) {
    if (this.backupCreated) return;

    try {
      const backupPath = filePath + this.backupSuffix;
      await fs.copyFile(filePath, backupPath);
      this.backupCreated = true;
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Fix a broken link in the content
   */
  async fixLink(content, link, fixResult) {
    switch (this.strategy) {
      case FixStrategy.DEAD_COMMENT:
        return this.fixDeadComment(content, link, fixResult);

      case FixStrategy.DEAD_REMOVE:
        return this.fixDeadRemove(content, link, fixResult);

      case FixStrategy.REDIRECT_UPDATE:
        return this.fixRedirectUpdate(content, link, fixResult);

      case FixStrategy.RELATIVE_TO_ABSOLUTE:
        return this.fixRelativeToAbsolute(content, link, fixResult);

      case FixStrategy.ANCHOR_REMOVE:
        return this.fixAnchorRemove(content, link, fixResult);

      case FixStrategy.ANCHOR_PLACEHOLDER:
        return this.fixAnchorPlaceholder(content, link, fixResult);

      default:
        return content;
    }
  }

  /**
   * Fix: Add [dead] comment next to broken links
   */
  fixDeadComment(content, link, fixResult) {
    const comment = ` [dead: ${fixResult.error || 'link broken'}]`;
    const markdownLinkRegex = new RegExp(
      `\\[${this.escapeRegex(link.text)}\\]\\(${this.escapeRegex(link.url)}\\)`,
      'g'
    );

    return content.replace(markdownLinkRegex, (match) => match + comment);
  }

  /**
   * Fix: Remove broken links completely
   */
  fixDeadRemove(content, link, fixResult) {
    const markdownLinkRegex = new RegExp(
      `\\[${this.escapeRegex(link.text)}\\]\\(${this.escapeRegex(link.url)}\\)`,
      'g'
    );

    // Replace with just the text
    return content.replace(markdownLinkRegex, link.text);
  }

  /**
   * Fix: Update redirect URLs to final destination
   */
  fixRedirectUpdate(content, link, fixResult) {
    if (!fixResult.finalUrl) {
      // No redirect information, can't fix
      return content;
    }

    const markdownLinkRegex = new RegExp(
      `\\[${this.escapeRegex(link.text)}\\]\\(${this.escapeRegex(link.url)}\\)`,
      'g'
    );

    const newMarkdown = `[${link.text}](${fixResult.finalUrl})`;
    return content.replace(markdownLinkRegex, newMarkdown);
  }

  /**
   * Fix: Convert relative links to absolute
   */
  fixRelativeToAbsolute(content, link, fixResult) {
    if (link.type !== 'relative') {
      return content;
    }

    const markdownLinkRegex = new RegExp(
      `\\[${this.escapeRegex(link.text)}\\]\\(${this.escapeRegex(link.url)}\\)`,
      'g'
    );

    const absoluteUrl = this.baseUrl + link.url;
    const newMarkdown = `[${link.text}](${absoluteUrl})`;
    return content.replace(markdownLinkRegex, newMarkdown);
  }

  /**
   * Fix: Remove anchor from broken links
   */
  fixAnchorRemove(content, link, fixResult) {
    if (!link.url.includes('#')) {
      return content;
    }

    const urlWithoutAnchor = link.url.split('#')[0];
    const markdownLinkRegex = new RegExp(
      `\\[${this.escapeRegex(link.text)}\\]\\(${this.escapeRegex(link.url)}\\)`,
      'g'
    );

    const newMarkdown = `[${link.text}](${urlWithoutAnchor})`;
    return content.replace(markdownLinkRegex, newMarkdown);
  }

  /**
   * Fix: Add placeholder for broken anchors
   */
  fixAnchorPlaceholder(content, link, fixResult) {
    if (!link.url.includes('#')) {
      return content;
    }

    const placeholder = ' [section not found]';
    const markdownLinkRegex = new RegExp(
      `\\[${this.escapeRegex(link.text)}\\]\\(${this.escapeRegex(link.url)}\\)`,
      'g'
    );

    return content.replace(markdownLinkRegex, (match) => match + placeholder);
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Apply fixes to a file
   */
  async fixFile(filePath, brokenLinks) {
    let content = await fs.readFile(filePath, 'utf-8');
    let fixesApplied = 0;

    // Create backup before fixing
    const backupPath = await this.createBackup(filePath);

    // Sort links by position in reverse order to avoid offset issues
    const sortedLinks = [...brokenLinks].reverse();

    for (const link of sortedLinks) {
      const fixResult = {
        error: link.error || `Status ${link.status}`,
        finalUrl: link.finalUrl || null
      };

      const newContent = await this.fixLink(content, link, fixResult);

      if (newContent !== content) {
        content = newContent;
        fixesApplied++;
      }
    }

    // Write fixed content
    if (fixesApplied > 0) {
      await fs.writeFile(filePath, content, 'utf-8');
    }

    return {
      fixed: fixesApplied,
      backupPath,
      content
    };
  }
}

module.exports = {
  LinkFixer,
  FixStrategy
};
