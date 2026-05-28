import { describe, it, expect, vi } from "vitest";
import { DataRetentionManager } from "../lib/privacy/data-retention-manager.js";

describe("DataRetentionManager", () => {
  it("should summarize old full data", async () => {
    const mockDb = {
      prepare: vi.fn().mockReturnValue({
        run: vi.fn().mockReturnValue({ changes: 5 }),
      }),
    };

    const manager = new DataRetentionManager({ db: mockDb });
    const result = await manager.cleanup();

    expect(result.summarized).toBe(5);
    expect(mockDb.prepare).toHaveBeenCalledTimes(2);
  });

  it("should handle missing db gracefully", async () => {
    const manager = new DataRetentionManager();
    const result = await manager.cleanup();

    expect(result.deleted).toBe(0);
    expect(result.summarized).toBe(0);
  });

  it("should start and stop cleanup timer", () => {
    const manager = new DataRetentionManager();
    manager.start(1000);
    manager.stop();
    // Should not throw
  });
});
