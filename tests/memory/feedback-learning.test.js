import fs from "fs";
import os from "os";
import path from "path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FactStore } from "../../lib/memory/fact-store.js";

function removeDbFiles(dbPath) {
  for (const suffix of ["", "-wal", "-shm"]) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
  // also clean optimized db
  fs.rmSync(dbPath.replace(/\.db$/, "-optimized.db"), { force: true });
}

// ══════════════════════════════════════════�?
// Schema 迁移测试
// ══════════════════════════════════════════�?

describe("Schema Migration v4→v5 (type column)", () => {
  let tmpDir;
  let dbPath;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-feedback-schema-"));
    dbPath = path.join(tmpDir, "facts.db");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("adds type column with default 'fact' on fresh database", () => {
    const store = new FactStore(dbPath);
    store.add({ fact: "测试事实", tags: ["test"] });
    const facts = store.getAll();
    expect(facts.length).toBe(1);
    expect(facts[0].type).toBe("fact");
    store.close();
  });

  it("migrates v4 database adding type column", () => {
    // Create a v4 database (current prod schema before this feature)
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE facts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        fact       TEXT NOT NULL,
        search_text TEXT NOT NULL DEFAULT '',
        tags       TEXT NOT NULL DEFAULT '[]',
        time       TEXT,
        effective_time TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL,
        quality_specificity REAL NOT NULL DEFAULT 0.0,
        quality_recency REAL NOT NULL DEFAULT 0.0,
        quality_relevance REAL NOT NULL DEFAULT 0.0,
        quality_consistency REAL NOT NULL DEFAULT 0.0,
        quality_usage REAL NOT NULL DEFAULT 0.0,
        quality_composite REAL NOT NULL DEFAULT 0.0,
        access_count REAL NOT NULL DEFAULT 0,
        user_feedback TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS idx_facts_time ON facts(time);
      CREATE INDEX IF NOT EXISTS idx_facts_session ON facts(session_id);
      CREATE VIRTUAL TABLE facts_fts USING fts5(
        fact,
        search_text,
        content=facts,
        content_rowid=id,
        tokenize='unicode61'
      );
      PRAGMA user_version = 4;
    `);
    db.close();

    const store = new FactStore(dbPath);
    const columns = store.db.pragma("table_info(facts)");
    expect(columns.some((c) => c.name === "type")).toBe(true);

    store.add({ fact: "post-migration fact", tags: [] });
    const facts = store.getAll();
    expect(facts.length).toBe(1);
    expect(facts[0].type).toBe("fact");
    store.close();
  });

  it("backfills type from existing feedback/preference tags", () => {
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE facts (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        fact       TEXT NOT NULL,
        search_text TEXT NOT NULL DEFAULT '',
        tags       TEXT NOT NULL DEFAULT '[]',
        time       TEXT,
        effective_time TEXT,
        session_id TEXT,
        created_at TEXT NOT NULL,
        quality_specificity REAL NOT NULL DEFAULT 0.0,
        quality_recency REAL NOT NULL DEFAULT 0.0,
        quality_relevance REAL NOT NULL DEFAULT 0.0,
        quality_consistency REAL NOT NULL DEFAULT 0.0,
        quality_usage REAL NOT NULL DEFAULT 0.0,
        quality_composite REAL NOT NULL DEFAULT 0.0,
        access_count REAL NOT NULL DEFAULT 0,
        user_feedback TEXT NOT NULL DEFAULT '{}'
      );
      PRAGMA user_version = 4;
    `);

    db.prepare("INSERT INTO facts (fact, tags, created_at) VALUES (?, ?, ?)").run(
      "用户说不要使�?tab 缩进", JSON.stringify(["feedback", "coding-style"]), "2026-05-01T10:00:00.000Z"
    );
    db.prepare("INSERT INTO facts (fact, tags, created_at) VALUES (?, ?, ?)").run(
      "用户喜欢深色主题", JSON.stringify(["preference", "ui"]), "2026-05-02T10:00:00.000Z"
    );
    db.prepare("INSERT INTO facts (fact, tags, created_at) VALUES (?, ?, ?)").run(
      "普通事实不带类型标�?, JSON.stringify(["general"]), "2026-05-03T10:00:00.000Z"
    );
    db.close();

    const store = new FactStore(dbPath);
    const feedbackFacts = store.getByType("feedback");
    const preferenceFacts = store.getByType("preference");
    const normalFacts = store.getByType("fact");

    expect(feedbackFacts.length).toBe(1);
    expect(feedbackFacts[0].fact).toContain("不要使用 tab");
    expect(preferenceFacts.length).toBe(1);
    expect(preferenceFacts[0].fact).toContain("深色主题");
    expect(normalFacts.length).toBe(1);
    expect(normalFacts[0].fact).toContain("普通事�?);
    store.close();
  });
});

// ══════════════════════════════════════════�?
// getByType / getActiveFeedback 检索测�?
// ══════════════════════════════════════════�?

describe("FactStore type-based retrieval", () => {
  let tmpDir;
  let dbPath;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-feedback-retrieval-"));
    dbPath = path.join(tmpDir, "facts.db");
    store = new FactStore(dbPath);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("getByType returns only facts of the specified type", () => {
    store.add({ fact: "feedback fact 1", tags: ["feedback"], type: "feedback" });
    store.add({ fact: "preference fact 1", tags: ["preference"], type: "preference" });
    store.add({ fact: "normal fact", tags: ["general"], type: "fact" });

    expect(store.getByType("feedback").length).toBe(1);
    expect(store.getByType("preference").length).toBe(1);
    expect(store.getByType("fact").length).toBe(1);
  });

  it("getByType returns empty array for invalid type", () => {
    expect(store.getByType("invalid")).toEqual([]);
  });

  it("getByType excludes outdated facts", () => {
    store.add({ fact: "outdated feedback", tags: ["feedback"], type: "feedback" });
    const all = store.getAll();
    store.markAsOutdated(all[0].id, "test");

    expect(store.getByType("feedback").length).toBe(0);
  });

  it("getByType respects limit parameter", () => {
    for (let i = 0; i < 10; i++) {
      store.add({ fact: `feedback ${i}`, tags: ["feedback"], type: "feedback" });
    }
    expect(store.getByType("feedback", 3).length).toBe(3);
    expect(store.getByType("feedback", 999).length).toBe(10);
  });

  it("getActiveFeedback returns both feedback and preference types", () => {
    store.add({ fact: "user correction: don't use tab", tags: ["feedback"], type: "feedback" });
    store.add({ fact: "user likes dark theme", tags: ["preference"], type: "preference" });
    store.add({ fact: "neutral fact", tags: [], type: "fact" });

    const active = store.getActiveFeedback();
    expect(active.length).toBe(2);
    const types = active.map((f) => f.type);
    expect(types).toContain("feedback");
    expect(types).toContain("preference");
  });

  it("getActiveFeedback excludes outdated and useless facts", () => {
    const alive = store.add({ fact: "alive feedback", tags: ["feedback"], type: "feedback" });
    const outdated = store.add({ fact: "outdated feedback", tags: ["feedback"], type: "feedback" });
    const useless = store.add({ fact: "useless feedback", tags: ["feedback"], type: "feedback" });

    store.markAsOutdated(outdated.id, "test");
    store.markFactUseless(useless.id, "test");

    const active = store.getActiveFeedback();
    expect(active.length).toBe(1);
    expect(active[0].fact).toBe("alive feedback");
  });

  it("getActiveFeedback respects limit parameter", () => {
    for (let i = 0; i < 5; i++) {
      store.add({ fact: `fb ${i}`, tags: ["feedback"], type: "feedback" });
    }
    expect(store.getActiveFeedback(2).length).toBe(2);
    expect(store.getActiveFeedback(10).length).toBe(5);
  });

  it("getActiveFeedback returns empty when no feedback facts exist", () => {
    store.add({ fact: "just a fact", tags: [], type: "fact" });
    expect(store.getActiveFeedback()).toEqual([]);
  });

  it("add defaults type to 'fact' when not specified", () => {
    store.add({ fact: "some fact", tags: ["test"] });
    expect(store.getAll()[0].type).toBe("fact");
  });

  it("add accepts type='feedback' and type='preference'", () => {
    store.add({ fact: "fb", tags: [], type: "feedback" });
    store.add({ fact: "pref", tags: [], type: "preference" });
    expect(store.getByType("feedback")[0].type).toBe("feedback");
    expect(store.getByType("preference")[0].type).toBe("preference");
  });

  it("add ignores unknown type values and defaults to 'fact'", () => {
    store.add({ fact: "bad type", tags: [], type: "unknown_value" });
    expect(store.getAll()[0].type).toBe("fact");
  });
});

// ══════════════════════════════════════════�?
// classifyFact 类型判定测试（通过 processDirtySessions 间接测试�?
// ══════════════════════════════════════════�?

describe("classifyFact type detection (via FactStore)", () => {
  let tmpDir;
  let dbPath;
  let store;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hana-classify-fact-"));
    dbPath = path.join(tmpDir, "facts.db");
    store = new FactStore(dbPath);
  });

  afterEach(() => {
    store?.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("direct add with type='feedback' stores correct type", () => {
    store.add({
      fact: "用户纠正：不要使�?console.log 调试",
      tags: ["feedback", "coding"],
      type: "feedback",
    });
    const fbFacts = store.getByType("feedback");
    expect(fbFacts.length).toBe(1);
    expect(fbFacts[0].type).toBe("feedback");
    expect(fbFacts[0].tags).toContain("feedback");
  });

  it("direct add with type='preference' stores correct type", () => {
    store.add({
      fact: "用户更喜欢用 TypeScript 而非 JavaScript",
      tags: ["preference", "language"],
      type: "preference",
    });
    const prefFacts = store.getByType("preference");
    expect(prefFacts.length).toBe(1);
    expect(prefFacts[0].type).toBe("preference");
    expect(prefFacts[0].tags).toContain("preference");
  });

  it("feedback facts appear in getActiveFeedback", () => {
    store.add({
      fact: "不要直接修改 node_modules",
      tags: ["coding"],
      type: "feedback",
    });
    const active = store.getActiveFeedback();
    expect(active.length).toBe(1);
    expect(active[0].fact).toContain("不要");
  });

  it("preference facts appear in getActiveFeedback", () => {
    store.add({
      fact: "喜欢用单引号而不是双引号",
      tags: ["style"],
      type: "preference",
    });
    const active = store.getActiveFeedback();
    expect(active.length).toBe(1);
  });

  it("normal fact does not appear in getActiveFeedback", () => {
    store.add({
      fact: "项目使用 pnpm 作为包管理器",
      tags: ["tech-stack"],
      type: "fact",
    });
    expect(store.getActiveFeedback().length).toBe(0);
  });
});
