import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ForgettingCurveEngine, DEFAULT_FORGETTING_SCHEDULE } from "../../lib/memory/forgetting-curve.js";

describe("ForgettingCurveEngine", () => {
  let tmpDir;
  let dbPath;
  let engine;

  const defaultConfig = {
    enabled: true,
    schedule: DEFAULT_FORGETTING_SCHEDULE,
    archiveThreshold: 0.25,
    protectedTags: ["important", "core_identity"],
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-forgetting-curve-"));
    dbPath = path.join(tmpDir, "facts.db");
    engine = new ForgettingCurveEngine(dbPath, defaultConfig);
  });

  afterEach(() => {
    engine?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedFacts(facts) {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    const stmt = db.prepare(
      `INSERT INTO facts (fact, search_text, tags, time, session_id, created_at, hit_count, last_accessed_at, importance, last_decay_check)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const run = db.transaction(() => {
      for (const f of facts) {
        stmt.run(
          f.fact,
          f.fact,
          JSON.stringify(f.tags || []),
          f.time || new Date().toISOString(),
          f.session_id || null,
          f.created_at || new Date().toISOString(),
          f.hit_count ?? 0,
          f.last_accessed_at || null,
          f.importance || 0,
          f.last_decay_check || null,
        );
      }
    });
    run();
    db.close();
  }

  describe("decay calculation", () => {
    it("calculates correct retention based on default schedule for 1 day old memory", () => {
      const retention = engine.calculateRetention(1);
      expect(retention).toBe(0.5);
    });

    it("calculates correct retention for 3 day old memory", () => {
      const retention = engine.calculateRetention(3);
      expect(retention).toBe(0.3);
    });

    it("calculates correct retention for 7 day old memory", () => {
      const retention = engine.calculateRetention(7);
      expect(retention).toBe(0.2);
    });

    it("calculates correct retention for 30 day old memory", () => {
      const retention = engine.calculateRetention(30);
      expect(retention).toBe(0.1);
    });

    it("calculates retention for age between schedule points (interpolation)", () => {
      const retention = engine.calculateRetention(2);
      expect(retention).toBeGreaterThan(0.3);
      expect(retention).toBeLessThan(0.5);
    });

    it("returns 1.0 for brand new memories (0 days)", () => {
      const retention = engine.calculateRetention(0);
      expect(retention).toBe(1.0);
    });

    it("returns minimum retention for very old memories (beyond last schedule point)", () => {
      const retention = engine.calculateRetention(100);
      expect(retention).toBeLessThanOrEqual(0.1);
    });
  });

  describe("custom schedule configuration", () => {
    it("uses custom schedule when provided", () => {
      const customSchedule = [
        { days: 2, retentionRate: 0.8 },
        { days: 5, retentionRate: 0.4 },
        { days: 15, retentionRate: 0.15 },
      ];
      const customEngine = new ForgettingCurveEngine(dbPath, {
        ...defaultConfig,
        schedule: customSchedule,
      });

      const retention2 = customEngine.calculateRetention(2);
      expect(retention2).toBe(0.8);

      const retention5 = customEngine.calculateRetention(5);
      expect(retention5).toBe(0.4);

      customEngine.close();
    });

    it("interpolates between custom schedule points", () => {
      const customSchedule = [
        { days: 1, retentionRate: 0.9 },
        { days: 3, retentionRate: 0.5 },
      ];
      const customEngine = new ForgettingCurveEngine(dbPath, {
        ...defaultConfig,
        schedule: customSchedule,
      });

      const retention = customEngine.calculateRetention(2);
      expect(retention).toBeCloseTo(0.7, 1);

      customEngine.close();
    });
  });

  describe("importance reinforcement", () => {
    it("boosts retention for high-importance memories", () => {
      const baseRetention = engine.calculateRetention(7);
      const boostedRetention = engine.calculateRetentionWithImportance(7, 0.9);

      expect(boostedRetention).toBeGreaterThan(baseRetention);
      expect(boostedRetention).toBeLessThanOrEqual(1.0);
    });

    it("does not boost retention for zero-importance memories", () => {
      const baseRetention = engine.calculateRetention(7);
      const retention = engine.calculateRetentionWithImportance(7, 0);

      expect(retention).toBe(baseRetention);
    });

    it("caps retention at 1.0 even with high importance", () => {
      const retention = engine.calculateRetentionWithImportance(0, 1.0);
      expect(retention).toBeLessThanOrEqual(1.0);
    });
  });

  describe("hit count reinforcement", () => {
    it("boosts retention for frequently accessed memories", () => {
      const baseRetention = engine.calculateRetention(7);
      const boostedRetention = engine.calculateRetentionWithHits(7, 50);

      expect(boostedRetention).toBeGreaterThan(baseRetention);
    });

    it("does not boost retention for zero-hit memories", () => {
      const baseRetention = engine.calculateRetention(7);
      const retention = engine.calculateRetentionWithHits(7, 0);

      expect(retention).toBe(baseRetention);
    });

    it("caps retention at 1.0 with high hit count", () => {
      const retention = engine.calculateRetentionWithHits(0, 1000);
      expect(retention).toBeLessThanOrEqual(1.0);
    });

    it("applies diminishing returns for very high hit counts", () => {
      const r10 = engine.calculateRetentionWithHits(7, 10);
      const r50 = engine.calculateRetentionWithHits(7, 50);
      const r500 = engine.calculateRetentionWithHits(7, 500);

      expect(r50).toBeGreaterThan(r10);
      expect(r500).toBeGreaterThan(r50);
      const gain1 = r50 - r10;
      const gain2 = r500 - r50;
      expect(gain2).toBeLessThan(gain1);
    });
  });

  describe("combined reinforcement (importance + hits)", () => {
    it("combines both reinforcement factors", () => {
      const baseRetention = engine.calculateRetention(7);
      const combinedRetention = engine.calculateRetentionWithReinforcement(7, 0.8, 20);

      expect(combinedRetention).toBeGreaterThan(baseRetention);
    });
  });

  describe("protected tags", () => {
    it("identifies protected memories by tags", () => {
      const isProtected = engine.isMemoryProtected(["important", "user_preference"]);
      expect(isProtected).toBe(true);
    });

    it("does not protect memories without protected tags", () => {
      const isProtected = engine.isMemoryProtected(["temporary", "context"]);
      expect(isProtected).toBe(false);
    });

    it("does not protect memories with empty tags", () => {
      const isProtected = engine.isMemoryProtected([]);
      expect(isProtected).toBe(false);
    });

    it("is case-sensitive for tag matching", () => {
      const isProtected = engine.isMemoryProtected(["Important"]);
      expect(isProtected).toBe(false);
    });
  });

  describe("evaluate forgetting", () => {
    it("archives memories below threshold", () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      seedFacts([
        { fact: "old memory 1", tags: ["temp"], time: oldDate, created_at: oldDate },
      ]);

      const result = engine.evaluateForgetting();
      expect(result.toArchive.length).toBe(1);
      expect(result.toArchive[0].fact).toBe("old memory 1");
    });

    it("does not archive protected memories", () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      seedFacts([
        { fact: "protected old", tags: ["important"], time: oldDate, created_at: oldDate },
      ]);

      const result = engine.evaluateForgetting();
      expect(result.toArchive.length).toBe(0);
      expect(result.protected.length).toBe(1);
    });

    it("does not archive recent memories", () => {
      const now = new Date().toISOString();
      seedFacts([
        { fact: "recent memory", tags: ["temp"], time: now, created_at: now },
      ]);

      const result = engine.evaluateForgetting();
      expect(result.toArchive.length).toBe(0);
    });

    it("does not archive memories with high hit count", () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      seedFacts([
        { fact: "popular old", tags: ["temp"], time: oldDate, created_at: oldDate, hit_count: 100, last_accessed_at: oldDate },
      ]);

      const result = engine.evaluateForgetting();
      expect(result.toArchive.length).toBe(0);
    });

    it("does not archive memories with high importance", () => {
      const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
      seedFacts([
        { fact: "important old", tags: ["temp"], time: oldDate, created_at: oldDate, importance: 0.95 },
      ]);

      const result = engine.evaluateForgetting();
      expect(result.toArchive.length).toBe(0);
    });

    it("returns all facts when forgetting curve is disabled", () => {
      const disabledEngine = new ForgettingCurveEngine(dbPath, {
        ...defaultConfig,
        enabled: false,
      });

      seedFacts([
        { fact: "old memory", tags: ["temp"], time: new Date(Date.now() - 30 * 86400000).toISOString() },
      ]);

      const result = disabledEngine.evaluateForgetting();
      expect(result.toArchive.length).toBe(0);
      expect(result.healthy.length).toBe(1);

      disabledEngine.close();
    });

    it("updates last_decay_check timestamp for evaluated facts", () => {
      const oldDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      seedFacts([
        { fact: "check decay", tags: ["temp"], time: oldDate, created_at: oldDate },
      ]);

      engine.evaluateForgetting();

      const Database = require("better-sqlite3");
      const db = new Database(dbPath);
      const row = db.prepare("SELECT last_decay_check FROM facts WHERE fact = ?").get("check decay");
      db.close();

      expect(row.last_decay_check).not.toBe(null);
    });
  });

  describe("record access", () => {
    it("increments hit_count and updates last_accessed_at", () => {
      seedFacts([
        { fact: "accessed fact", tags: [], time: new Date().toISOString() },
      ]);

      engine.recordAccess(1);

      const Database = require("better-sqlite3");
      const db = new Database(dbPath);
      const row = db.prepare("SELECT hit_count, last_accessed_at FROM facts WHERE id = 1").get();
      db.close();

      expect(row.hit_count).toBe(1);
      expect(row.last_accessed_at).not.toBe(null);
    });

    it("accumulates hit_count on multiple accesses", () => {
      seedFacts([
        { fact: "multi access", tags: [], time: new Date().toISOString() },
      ]);

      engine.recordAccess(1);
      engine.recordAccess(1);
      engine.recordAccess(1);

      const Database = require("better-sqlite3");
      const db = new Database(dbPath);
      const row = db.prepare("SELECT hit_count FROM facts WHERE id = 1").get();
      db.close();

      expect(row.hit_count).toBe(3);
    });
  });

  describe("set importance", () => {
    it("sets importance value for a fact", () => {
      seedFacts([
        { fact: "important fact", tags: [], time: new Date().toISOString() },
      ]);

      engine.setImportance(1, 0.9);

      const Database = require("better-sqlite3");
      const db = new Database(dbPath);
      const row = db.prepare("SELECT importance FROM facts WHERE id = 1").get();
      db.close();

      expect(row.importance).toBe(0.9);
    });

    it("resets importance to 0", () => {
      seedFacts([
        { fact: "reset fact", tags: [], time: new Date().toISOString(), importance: 0.8 },
      ]);

      engine.setImportance(1, 0);

      const Database = require("better-sqlite3");
      const db = new Database(dbPath);
      const row = db.prepare("SELECT importance FROM facts WHERE id = 1").get();
      db.close();

      expect(row.importance).toBe(0);
    });
  });
});

describe("DEFAULT_FORGETTING_SCHEDULE", () => {
  it("has the expected default schedule points", () => {
    expect(DEFAULT_FORGETTING_SCHEDULE).toEqual([
      { days: 1, retentionRate: 0.5 },
      { days: 3, retentionRate: 0.3 },
      { days: 7, retentionRate: 0.2 },
      { days: 30, retentionRate: 0.1 },
    ]);
  });
});
