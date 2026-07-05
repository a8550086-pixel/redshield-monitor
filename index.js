const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * File-backed "seen event IDs" set.
 * Keeps memory + disk in sync, trims to maxSize (oldest-first) to avoid
 * unbounded growth over long-running deployments.
 */
class DedupeStore {
  constructor({ filePath, maxSize = 5000 }) {
    this.filePath = filePath;
    this.maxSize = maxSize;
    this.order = []; // insertion order, oldest first
    this.set = new Set();
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          this.order = arr;
          this.set = new Set(arr);
          logger.info(`Loaded ${this.set.size} previously-seen event IDs from ${this.filePath}`);
        }
      } else {
        logger.info(`No existing dedupe file at ${this.filePath}, starting fresh.`);
      }
    } catch (err) {
      logger.warn(`Failed to load dedupe store (${this.filePath}), starting fresh:`, err.message);
      this.order = [];
      this.set = new Set();
    }
  }

  _persist() {
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.order));
      fs.renameSync(tmp, this.filePath); // atomic-ish replace
    } catch (err) {
      logger.error(`Failed to persist dedupe store to ${this.filePath}:`, err.message);
    }
  }

  has(id) {
    return this.set.has(id);
  }

  add(id) {
    if (this.set.has(id)) return;
    this.set.add(id);
    this.order.push(id);
    while (this.order.length > this.maxSize) {
      const oldest = this.order.shift();
      this.set.delete(oldest);
    }
    this._persist();
  }

  size() {
    return this.set.size;
  }
}

module.exports = DedupeStore;
