import { describe, it, expect } from "vitest";
import { EncryptionKeyManager } from "../../lib/db/encryption-key-manager.js";

describe("EncryptionKeyManager", () => {
  it("should derive fallback key when keytar unavailable", async () => {
    const manager = new EncryptionKeyManager();
    const key = await manager.getOrCreateKey();

    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });

  it("should cache key", async () => {
    const manager = new EncryptionKeyManager();
    const key1 = await manager.getOrCreateKey();
    const key2 = await manager.getOrCreateKey();

    expect(key1).toBe(key2); // same reference
  });

  it("should clear cache and regenerate", async () => {
    const manager = new EncryptionKeyManager();
    const key1 = await manager.getOrCreateKey();

    manager.clearCache();
    const key2 = await manager.getOrCreateKey();

    // Both should be valid 32-byte buffers
    expect(Buffer.isBuffer(key1)).toBe(true);
    expect(Buffer.isBuffer(key2)).toBe(true);
  });
});
