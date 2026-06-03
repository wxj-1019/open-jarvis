/**
 * tts-cache.test.js — TTSCache unit tests
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TTSCache } from "../../lib/speech/tts-cache.js";

describe("TTSCache", () => {
  let cache;
  let currentTime;
  let nowFn;

  beforeEach(() => {
    currentTime = 1000000; // Start at a known time
    nowFn = () => currentTime;
    cache = new TTSCache({ maxSize: 3, ttlMs: 60_000, _now: nowFn });
  });

  afterEach(() => {
    cache?.destroy();
  });

  // ── makeKey ──

  describe("makeKey", () => {
    it("generates consistent cache key from text and params", () => {
      const key1 = TTSCache.makeKey("hello", "voice1", 1.0, 1.0);
      const key2 = TTSCache.makeKey("hello", "voice1", 1.0, 1.0);
      expect(key1).toBe(key2);
    });

    it("produces different keys for different text", () => {
      const key1 = TTSCache.makeKey("hello", "voice1", 1.0, 1.0);
      const key2 = TTSCache.makeKey("world", "voice1", 1.0, 1.0);
      expect(key1).not.toBe(key2);
    });

    it("produces different keys for different voice", () => {
      const key1 = TTSCache.makeKey("hello", "voice1", 1.0, 1.0);
      const key2 = TTSCache.makeKey("hello", "voice2", 1.0, 1.0);
      expect(key1).not.toBe(key2);
    });

    it("produces different keys for different rate", () => {
      const key1 = TTSCache.makeKey("hello", "voice1", 1.0, 1.0);
      const key2 = TTSCache.makeKey("hello", "voice1", 2.0, 1.0);
      expect(key1).not.toBe(key2);
    });

    it("produces different keys for different pitch", () => {
      const key1 = TTSCache.makeKey("hello", "voice1", 1.0, 1.0);
      const key2 = TTSCache.makeKey("hello", "voice1", 1.0, 1.5);
      expect(key1).not.toBe(key2);
    });

    it("uses defaults for undefined params", () => {
      const key = TTSCache.makeKey("hello", undefined, undefined, undefined);
      expect(key).toBe("hello||1|1");
    });
  });

  // ── Store and retrieve ──

  describe("set and get", () => {
    it("stores and retrieves audio", () => {
      const key = TTSCache.makeKey("hello", "v1", 1.0, 1.0);
      const audio = new Uint8Array([1, 2, 3]);
      cache.set(key, "hello", audio);

      const result = cache.get(key);
      expect(result).toBe(audio);
    });

    it("returns null for missing key", () => {
      const result = cache.get("nonexistent-key");
      expect(result).toBeNull();
    });

    it("returns null after entry is deleted", () => {
      const key = TTSCache.makeKey("hello", "v1", 1.0, 1.0);
      cache.set(key, "hello", "audio-data");
      cache.clear();

      expect(cache.get(key)).toBeNull();
    });

    it("updates existing entry without increasing size", () => {
      const key = TTSCache.makeKey("hello", "v1", 1.0, 1.0);
      cache.set(key, "hello", "audio-v1");
      cache.set(key, "hello", "audio-v2");

      expect(cache.get(key)).toBe("audio-v2");
      expect(cache.getStats().size).toBe(1);
    });
  });

  // ── LRU eviction ──

  describe("LRU eviction", () => {
    it("evicts least recently used entry when cache is full", () => {
      const k1 = TTSCache.makeKey("text1", "v1", 1.0, 1.0);
      const k2 = TTSCache.makeKey("text2", "v1", 1.0, 1.0);
      const k3 = TTSCache.makeKey("text3", "v1", 1.0, 1.0);
      const k4 = TTSCache.makeKey("text4", "v1", 1.0, 1.0);

      cache.set(k1, "text1", "audio1");
      currentTime += 1;
      cache.set(k2, "text2", "audio2");
      currentTime += 1;
      cache.set(k3, "text3", "audio3");

      // Access k1 to make it recently used
      currentTime += 1;
      cache.get(k1);

      // Add k4, should evict k2 (LRU)
      cache.set(k4, "text4", "audio4");

      expect(cache.get(k1)).toBe("audio1"); // accessed recently, kept
      expect(cache.get(k2)).toBeNull(); // LRU, evicted
      expect(cache.get(k3)).toBe("audio3"); // kept
      expect(cache.get(k4)).toBe("audio4"); // just added
    });

    it("maintains correct size after eviction", () => {
      for (let i = 0; i < 10; i++) {
        const key = TTSCache.makeKey(`text${i}`, "v1", 1.0, 1.0);
        cache.set(key, `text${i}`, `audio${i}`);
      }

      expect(cache.getStats().size).toBe(3); // maxSize is 3
    });

    it("evicts based on lastAccessed, not createdAt", () => {
      const k1 = TTSCache.makeKey("a", "v1", 1.0, 1.0);
      const k2 = TTSCache.makeKey("b", "v1", 1.0, 1.0);
      const k3 = TTSCache.makeKey("c", "v1", 1.0, 1.0);
      const k4 = TTSCache.makeKey("d", "v1", 1.0, 1.0);

      cache.set(k1, "a", "audio1");
      currentTime += 10;
      cache.set(k2, "b", "audio2");
      currentTime += 10;
      cache.set(k3, "c", "audio3");

      // Access k1 to refresh its lastAccessed
      currentTime += 10;
      cache.get(k1);

      // Add k4 - should evict k2 (oldest lastAccessed)
      cache.set(k4, "d", "audio4");

      expect(cache.get(k2)).toBeNull();
      expect(cache.get(k1)).toBe("audio1");
    });
  });

  // ── TTL expiration ──

  describe("TTL expiration", () => {
    it("returns null for expired entry", () => {
      const key = TTSCache.makeKey("hello", "v1", 1.0, 1.0);
      cache.set(key, "hello", "audio");

      // Advance past TTL (60_000 ms)
      currentTime += 60_001;

      expect(cache.get(key)).toBeNull();
    });

    it("removes expired entry from store on get", () => {
      const key = TTSCache.makeKey("hello", "v1", 1.0, 1.0);
      cache.set(key, "hello", "audio");

      currentTime += 60_001;
      cache.get(key); // triggers deletion

      expect(cache.getStats().size).toBe(0);
    });

    it("prune removes all expired entries", () => {
      const k1 = TTSCache.makeKey("a", "v1", 1.0, 1.0);
      const k2 = TTSCache.makeKey("b", "v1", 1.0, 1.0);
      cache.set(k1, "a", "audio1");
      cache.set(k2, "b", "audio2");

      currentTime += 60_001;

      const removed = cache.prune();
      expect(removed).toBe(2);
      expect(cache.getStats().size).toBe(0);
    });

    it("prune keeps non-expired entries", () => {
      const k1 = TTSCache.makeKey("a", "v1", 1.0, 1.0);
      const k2 = TTSCache.makeKey("b", "v1", 1.0, 1.0);
      cache.set(k1, "a", "audio1");
      currentTime += 30_000;
      cache.set(k2, "b", "audio2");

      // Only k1 is expired
      currentTime += 30_001;

      const removed = cache.prune();
      expect(removed).toBe(1);
      expect(cache.getStats().size).toBe(1);
      expect(cache.get(k2)).toBe("audio2");
    });
  });

  // ── Statistics ──

  describe("getStats", () => {
    it("tracks hit count", () => {
      const key = TTSCache.makeKey("hello", "v1", 1.0, 1.0);
      cache.set(key, "hello", "audio");

      cache.get(key);
      cache.get(key);

      const stats = cache.getStats();
      expect(stats.hitCount).toBe(2);
    });

    it("tracks miss count", () => {
      cache.get("missing1");
      cache.get("missing2");
      cache.get("missing3");

      const stats = cache.getStats();
      expect(stats.missCount).toBe(3);
    });

    it("calculates hit rate correctly", () => {
      const key = TTSCache.makeKey("hello", "v1", 1.0, 1.0);
      cache.set(key, "hello", "audio");

      cache.get(key); // hit
      cache.get(key); // hit
      cache.get("missing"); // miss

      const stats = cache.getStats();
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it("reports zero hit rate when no accesses", () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });

    it("reports correct size and maxSize", () => {
      const key = TTSCache.makeKey("hello", "v1", 1.0, 1.0);
      cache.set(key, "hello", "audio");

      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(3);
    });
  });

  // ── Clear ──

  describe("clear", () => {
    it("removes all entries", () => {
      cache.set(TTSCache.makeKey("a", "v1", 1.0, 1.0), "a", "audio1");
      cache.set(TTSCache.makeKey("b", "v1", 1.0, 1.0), "b", "audio2");
      cache.set(TTSCache.makeKey("c", "v1", 1.0, 1.0), "c", "audio3");

      cache.clear();

      expect(cache.getStats().size).toBe(0);
    });

    it("resets hit/miss counters", () => {
      const key = TTSCache.makeKey("hello", "v1", 1.0, 1.0);
      cache.set(key, "hello", "audio");
      cache.get(key);
      cache.get("missing");

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
    });
  });

  // ── Destroy ──

  describe("destroy", () => {
    it("clears all entries", () => {
      const key = TTSCache.makeKey("hello", "v1", 1.0, 1.0);
      cache.set(key, "hello", "audio");
      cache.destroy();

      expect(cache.getStats().size).toBe(0);
    });

    it("can be called multiple times without error", () => {
      cache.destroy();
      cache.destroy(); // should not throw
    });
  });

  // ── Default options ──

  describe("default options", () => {
    it("uses default maxSize of 100", () => {
      const defaultCache = new TTSCache({ _now: nowFn });
      expect(defaultCache.getStats().maxSize).toBe(100);
      defaultCache.destroy();
    });

    it("uses default ttlMs of 24 hours", () => {
      const defaultCache = new TTSCache({ _now: nowFn });
      const key = TTSCache.makeKey("hello", "v1", 1.0, 1.0);
      defaultCache.set(key, "hello", "audio");

      // Should still be valid after 23 hours
      currentTime += 23 * 60 * 60 * 1000;
      expect(defaultCache.get(key)).toBe("audio");

      // Should be expired after 24 hours
      currentTime += 1 * 60 * 60 * 1000 + 1;
      expect(defaultCache.get(key)).toBeNull();

      defaultCache.destroy();
    });
  });
});
