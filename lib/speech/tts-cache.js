/**
 * tts-cache.js — LRU cache for TTS audio results
 *
 * Caches synthesized audio keyed by text + synthesis parameters.
 * Reduces API calls and latency for repeated phrases.
 */

import { createModuleLogger } from "../debug-log.js";

const moduleLog = createModuleLogger("tts-cache");

const DEFAULT_MAX_SIZE = 100;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PRUNE_INTERVAL_MS = 60 * 1000; // 60 seconds

/**
 * @typedef {object} TTSCacheOptions
 * @property {number} [maxSize] - Maximum number of entries (default 100)
 * @property {number} [ttlMs] - Time-to-live in milliseconds (default 24 hours)
 * @property {function(): number} [_now] - Time provider for testing (default: Date.now)
 */

export class TTSCache {
  /**
   * @param {TTSCacheOptions} [opts]
   */
  constructor(opts = {}) {
    this._maxSize = opts.maxSize ?? DEFAULT_MAX_SIZE;
    this._ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
    this._now = opts._now ?? (() => Date.now());

    /** @type {Map<string, {text: string, audio: *, createdAt: number, lastAccessed: number}>} */
    this._store = new Map();

    this._hitCount = 0;
    this._missCount = 0;

    this._pruneTimer = setInterval(() => this.prune(), PRUNE_INTERVAL_MS);
    // Allow Node.js to exit even if timer is active
    if (typeof this._pruneTimer.unref === "function") {
      this._pruneTimer.unref();
    }

    moduleLog?.info?.(`TTSCache initialized (maxSize=${this._maxSize}, ttlMs=${this._ttlMs})`);
  }

  // ── Static ──

  /**
   * Generate a deterministic cache key from text and synthesis params.
   *
   * @param {string} text
   * @param {string} [voice]
   * @param {number} [rate]
   * @param {number} [pitch]
   * @returns {string}
   */
  static makeKey(text, voice, rate, pitch) {
    const parts = [
      String(text || ""),
      String(voice || ""),
      String(rate ?? 1.0),
      String(pitch ?? 1.0),
    ];
    return parts.join("|");
  }

  // ── Public API ──

  /**
   * Get cached audio by key. Returns null on miss.
   * Updates lastAccessed time and tracks hit/miss stats.
   *
   * @param {string} key
   * @returns {*|null} cached audio or null
   */
  get(key) {
    const entry = this._store.get(key);

    if (!entry) {
      this._missCount++;
      return null;
    }

    // Check TTL
    if (this._now() - entry.createdAt >= this._ttlMs) {
      this._store.delete(key);
      this._missCount++;
      return null;
    }

    entry.lastAccessed = this._now();
    this._hitCount++;
    return entry.audio;
  }

  /**
   * Store audio in cache. Evicts LRU entry if at capacity.
   *
   * @param {string} key
   * @param {string} text - Original text (for debugging/logging)
   * @param {*} audio - Synthesized audio (ArrayBuffer, Blob, base64, etc.)
   */
  set(key, text, audio) {
    // If key already exists, just update it
    if (this._store.has(key)) {
      this._store.set(key, {
        text,
        audio,
        createdAt: this._now(),
        lastAccessed: this._now(),
      });
      return;
    }

    // Evict LRU if full
    while (this._store.size >= this._maxSize) {
      this._evictLRU();
    }

    this._store.set(key, {
      text,
      audio,
      createdAt: this._now(),
      lastAccessed: this._now(),
    });
  }

  /**
   * Remove expired entries from the cache.
   * @returns {number} number of entries removed
   */
  prune() {
    const now = this._now();
    let removed = 0;

    for (const [key, entry] of this._store) {
      if (now - entry.createdAt >= this._ttlMs) {
        this._store.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      moduleLog?.debug?.(`Pruned ${removed} expired entries`);
    }
    return removed;
  }

  /**
   * Get cache statistics.
   *
   * @returns {{size: number, maxSize: number, hitCount: number, missCount: number, hitRate: number}}
   */
  getStats() {
    const total = this._hitCount + this._missCount;
    return {
      size: this._store.size,
      maxSize: this._maxSize,
      hitCount: this._hitCount,
      missCount: this._missCount,
      hitRate: total > 0 ? this._hitCount / total : 0,
    };
  }

  /**
   * Clear all cached entries and reset stats.
   */
  clear() {
    this._store.clear();
    this._hitCount = 0;
    this._missCount = 0;
    moduleLog?.debug?.("Cache cleared");
  }

  /**
   * Destroy the cache, clearing all entries and stopping the prune timer.
   */
  destroy() {
    if (this._pruneTimer) {
      clearInterval(this._pruneTimer);
      this._pruneTimer = null;
    }
    this._store.clear();
    moduleLog?.info?.("TTSCache destroyed");
  }

  // ── Internal ──

  /**
   * Evict the least recently used entry.
   */
  _evictLRU() {
    if (this._store.size === 0) return;

    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this._store) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey !== null) {
      this._store.delete(oldestKey);
      moduleLog?.debug?.(`Evicted LRU entry: ${oldestKey.slice(0, 50)}...`);
    }
  }
}
