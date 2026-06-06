import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryArchiveManager } from "../../lib/memory/memory-archive.js";

describe("MemoryArchiveManager", () => {
  let tmpDir;
  let archivePath;
  let manager;

  const sampleArchiveFacts = [
    {
      original_id: 1,
      fact: "archived fact 1",
      tags: ["temp", "context"],
      time: "2026-01-01T10:00:00.000Z",
      session_id: "session-001",
      created_at: "2026-01-01T10:00:00.000Z",
      archived_at: "2026-01-10T12:00:00.000Z",
      reason: "decay_below_threshold",
      hit_count: 2,
      importance: 0.1,
    },
    {
      original_id: 2,
      fact: "archived fact 2",
      tags: ["old_memory"],
      time: "2025-12-15T08:00:00.000Z",
      session_id: "session-002",
      created_at: "2025-12-15T08:00:00.000Z",
      archived_at: "2026-01-10T12:00:00.000Z",
      reason: "decay_below_threshold",
      hit_count: 0,
      importance: 0,
    },
  ];

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-memory-archive-"));
    archivePath = path.join(tmpDir, "archived_facts.db");
    manager = new MemoryArchiveManager(archivePath);
  });

  afterEach(() => {
    manager?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedArchive(facts) {
    const stmt = manager._stmts.insert;
    for (const f of facts) {
      stmt.run({
        originalId: f.original_id,
        fact: f.fact,
        tags: JSON.stringify(f.tags),
        time: f.time,
        sessionId: f.session_id,
        createdAt: f.created_at,
        archivedAt: f.archived_at,
        reason: f.reason,
        hitCount: f.hit_count,
        importance: f.importance,
      });
    }
  }

  describe("archiving facts", () => {
    it("archives a single fact", () => {
      const fact = {
        id: 42,
        fact: "test archived fact",
        tags: ["temp"],
        time: "2026-01-01T10:00:00.000Z",
        session_id: "session-001",
        created_at: "2026-01-01T10:00:00.000Z",
        hit_count: 3,
        importance: 0.2,
      };

      manager.archiveFact(fact, "decay_below_threshold");

      const archived = manager.getAll();
      expect(archived.length).toBe(1);
      expect(archived[0].original_id).toBe(42);
      expect(archived[0].fact).toBe("test archived fact");
      expect(archived[0].reason).toBe("decay_below_threshold");
    });

    it("archives multiple facts in a batch", () => {
      const facts = [
        { id: 1, fact: "fact 1", tags: [], time: "2026-01-01", created_at: "2026-01-01", hit_count: 0, importance: 0 },
        { id: 2, fact: "fact 2", tags: ["temp"], time: "2026-01-02", created_at: "2026-01-02", hit_count: 1, importance: 0.1 },
        { id: 3, fact: "fact 3", tags: ["old"], time: "2026-01-03", created_at: "2026-01-03", hit_count: 0, importance: 0 },
      ];

      manager.archiveBatch(facts, "decay_below_threshold");

      const archived = manager.getAll();
      expect(archived.length).toBe(3);
    });

    it("preserves all fact metadata when archiving", () => {
      const fact = {
        id: 99,
        fact: "metadata test",
        tags: ["tag1", "tag2"],
        time: "2025-06-15T14:30:00.000Z",
        session_id: "session-abc",
        created_at: "2025-06-15T14:30:00.000Z",
        hit_count: 15,
        importance: 0.5,
      };

      manager.archiveFact(fact, "decay_below_threshold");

      const archived = manager.getAll()[0];
      expect(archived.tags).toEqual(["tag1", "tag2"]);
      expect(archived.time).toBe("2025-06-15T14:30:00.000Z");
      expect(archived.session_id).toBe("session-abc");
      expect(archived.hit_count).toBe(15);
      expect(archived.importance).toBe(0.5);
    });

    it("records the archive timestamp", () => {
      const fact = {
        id: 10,
        fact: "timestamp test",
        tags: [],
        time: "2026-01-01",
        created_at: "2026-01-01",
        hit_count: 0,
        importance: 0,
      };

      manager.archiveFact(fact, "decay_below_threshold");

      const archived = manager.getAll()[0];
      expect(archived.archived_at).not.toBe(null);
      const archiveDate = new Date(archived.archived_at);
      const now = new Date();
      const diffMs = Math.abs(now.getTime() - archiveDate.getTime());
      expect(diffMs).toBeLessThan(5000);
    });
  });

  describe("retrieving archived facts", () => {
    it("returns all archived facts", () => {
      seedArchive(sampleArchiveFacts);

      const archived = manager.getAll();
      expect(archived.length).toBe(2);
    });

    it("returns archived facts sorted by archived_at descending", () => {
      seedArchive(sampleArchiveFacts);

      const archived = manager.getAll();
      expect(archived[0].original_id).toBe(1);
    });

    it("returns empty array when no facts archived", () => {
      const archived = manager.getAll();
      expect(archived).toEqual([]);
    });

    it("returns archived count", () => {
      seedArchive(sampleArchiveFacts);
      expect(manager.getCount()).toBe(2);
    });

    it("returns 0 count when empty", () => {
      expect(manager.getCount()).toBe(0);
    });
  });

  describe("searching archived facts", () => {
    it("searches by fact content", () => {
      seedArchive(sampleArchiveFacts);

      const results = manager.searchByFact("fact 1");
      expect(results.length).toBe(1);
      expect(results[0].fact).toBe("archived fact 1");
    });

    it("searches by tag", () => {
      seedArchive(sampleArchiveFacts);

      const results = manager.searchByTags(["temp"]);
      expect(results.length).toBe(1);
      expect(results[0].fact).toBe("archived fact 1");
    });

    it("searches by session_id", () => {
      seedArchive(sampleArchiveFacts);

      const results = manager.searchBySession("session-001");
      expect(results.length).toBe(1);
      expect(results[0].session_id).toBe("session-001");
    });

    it("returns empty array when no matches", () => {
      seedArchive(sampleArchiveFacts);

      const results = manager.searchByFact("nonexistent");
      expect(results).toEqual([]);
    });
  });

  describe("restoring archived facts", () => {
    it("restores a fact and returns its data", () => {
      seedArchive(sampleArchiveFacts);

      const restored = manager.restoreFact(1);
      expect(restored).not.toBe(null);
      expect(restored.fact).toBe("archived fact 1");
      expect(restored.tags).toEqual(["temp", "context"]);
    });

    it("removes the restored fact from archive", () => {
      seedArchive(sampleArchiveFacts);

      manager.restoreFact(1);
      const remaining = manager.getAll();
      expect(remaining.length).toBe(1);
      expect(remaining[0].original_id).toBe(2);
    });

    it("returns null for non-existent fact", () => {
      seedArchive(sampleArchiveFacts);

      const restored = manager.restoreFact(999);
      expect(restored).toBe(null);
    });

    it("restores batch of facts", () => {
      seedArchive(sampleArchiveFacts);

      const restored = manager.restoreBatch([1, 2]);
      expect(restored.length).toBe(2);
      expect(manager.getCount()).toBe(0);
    });

    it("skips non-existent ids in batch restore", () => {
      seedArchive(sampleArchiveFacts);

      const restored = manager.restoreBatch([1, 999]);
      expect(restored.length).toBe(1);
      expect(manager.getCount()).toBe(1);
    });
  });

  describe("exporting archived facts", () => {
    it("exports all archived facts as JSON", () => {
      seedArchive(sampleArchiveFacts);

      const exported = manager.exportAll();
      const parsed = JSON.parse(exported);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0].fact).toBe("archived fact 1");
    });

    it("exports empty array when no facts", () => {
      const exported = manager.exportAll();
      const parsed = JSON.parse(exported);
      expect(parsed).toEqual([]);
    });
  });

  describe("importing archived facts", () => {
    it("imports facts from JSON", () => {
      const jsonData = JSON.stringify([
        {
          original_id: 100,
          fact: "imported fact",
          tags: ["imported"],
          time: "2026-02-01T10:00:00.000Z",
          session_id: "session-import",
          created_at: "2026-02-01T10:00:00.000Z",
          archived_at: "2026-02-10T10:00:00.000Z",
          reason: "manual_export",
          hit_count: 5,
          importance: 0.3,
        },
      ]);

      manager.importAll(jsonData);

      const archived = manager.getAll();
      expect(archived.length).toBe(1);
      expect(archived[0].fact).toBe("imported fact");
    });

    it("imports multiple facts", () => {
      const facts = [
        { original_id: 1, fact: "import 1", tags: [], time: "2026-01-01", created_at: "2026-01-01", archived_at: "2026-01-10", reason: "manual", hit_count: 0, importance: 0 },
        { original_id: 2, fact: "import 2", tags: ["test"], time: "2026-01-02", created_at: "2026-01-02", archived_at: "2026-01-10", reason: "manual", hit_count: 1, importance: 0.1 },
      ];

      manager.importAll(JSON.stringify(facts));

      expect(manager.getCount()).toBe(2);
    });

    it("handles invalid JSON gracefully", () => {
      expect(() => manager.importAll("invalid json")).not.toThrow();
      expect(manager.getCount()).toBe(0);
    });

    it("handles empty JSON array", () => {
      manager.importAll("[]");
      expect(manager.getCount()).toBe(0);
    });
  });

  describe("cleanup old archives", () => {
    it("removes facts older than specified days", () => {
      const oldDate = "2025-01-01T00:00:00.000Z";
      const recentDate = new Date(Date.now() - 10 * 86400000).toISOString();

      seedArchive([
        { ...sampleArchiveFacts[0], archived_at: oldDate, original_id: 1 },
        { ...sampleArchiveFacts[1], archived_at: recentDate, original_id: 2 },
      ]);

      const removed = manager.cleanupOldArchives(30);
      expect(removed).toBe(1);
      expect(manager.getCount()).toBe(1);
    });

    it("returns 0 when no old facts to remove", () => {
      seedArchive(sampleArchiveFacts);

      const removed = manager.cleanupOldArchives(365);
      expect(removed).toBe(0);
      expect(manager.getCount()).toBe(2);
    });
  });

  describe("delete archived facts", () => {
    it("deletes a single archived fact by original_id", () => {
      seedArchive(sampleArchiveFacts);

      const deleted = manager.deleteFact(1);
      expect(deleted).toBe(true);
      expect(manager.getCount()).toBe(1);
    });

    it("returns false for non-existent fact", () => {
      seedArchive(sampleArchiveFacts);

      const deleted = manager.deleteFact(999);
      expect(deleted).toBe(false);
    });

    it("clears all archived facts", () => {
      seedArchive(sampleArchiveFacts);

      manager.clearAll();
      expect(manager.getCount()).toBe(0);
    });
  });
});
