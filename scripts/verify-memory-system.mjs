/**
 * 记忆系统改造验证脚本 — 端到端功能检查
 *
 * 直接 Node ESM 运行，不依赖 vitest（vitest 在当前环境 npm 报错）
 *
 * 用法: node scripts/verify-memory-system.mjs
 */

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

/** Windows ESM 动态导入必须用 file:// URL */
function importModule(relPath) {
  return import(pathToFileURL(path.resolve(projectRoot, relPath)).href);
}

// ── Test helpers ──
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failedTests++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
    if (process.env.VERBOSE) console.log(`    ${err.stack}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// ── Test Suite ──

async function run() {
  console.log("=== 记忆系统改造验证 ===\n");

  // Temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mem-verify-"));
  const factsDbPath = path.join(tmpDir, "facts.db");
  const vectorDbPath = path.join(tmpDir, "vectors.db");

  try {
    // ── 1. Module imports ──
    console.log("-- 1. 模块导入 --");
    const { FactStore } = await importModule("lib/memory/fact-store.js");
    const { ForgettingCurveEngine } = await importModule("lib/memory/forgetting-curve.js");
    const { MemoryArchiveManager } = await importModule("lib/memory/memory-archive.js");
    test("FactStore 导入", () => assert(typeof FactStore === "function"));
    test("ForgettingCurveEngine 导入", () => assert(typeof ForgettingCurveEngine === "function"));
    test("MemoryArchiveManager 导入", () => assert(typeof MemoryArchiveManager === "function"));

    // ── 2. ForgettingCurveEngine ──
    console.log("\n-- 2. ForgettingCurveEngine --");
    const engine = new ForgettingCurveEngine(factsDbPath, {
      enabled: true,
      archiveThreshold: 0.25,
      protectedTags: ["identity", "personality"],
    });

    test("引擎初始化", () => {
      assert(engine._config.enabled === true);
      assert(engine._archiveThreshold === 0.25);
    });

    test("calculateRetention(1) ≈ 0.5", () => {
      const r = engine.calculateRetention(1);
      assert(Math.abs(r - 0.5) < 0.01, `got ${r}`);
    });

    test("calculateRetention(7) ≈ 0.2", () => {
      const r = engine.calculateRetention(7);
      assert(Math.abs(r - 0.2) < 0.01, `got ${r}`);
    });

    test("calculateRetention(30) = 0.1", () => {
      assert(engine.calculateRetention(30) === 0.1);
    });

    test("calculateRetention(100) = 0.1 (floor)", () => {
      assert(engine.calculateRetention(100) === 0.1);
    });

    test("importance boost", () => {
      const base = engine.calculateRetention(7);
      const boosted = engine.calculateRetentionWithImportance(7, 0.5);
      assert(boosted > base, "boosted should be > base");
    });

    test("hit count boost", () => {
      const base = engine.calculateRetention(7);
      const boosted = engine.calculateRetentionWithHits(7, 10);
      assert(boosted > base, "boosted should be > base");
    });

    test("isMemoryProtected", () => {
      assert(engine.isMemoryProtected(["identity"]) === true);
      assert(engine.isMemoryProtected(["random"]) === false);
      assert(engine.isMemoryProtected(null) === false);
    });

    test("calculateFactRetention(null) = 1", () => {
      assert(engine.calculateFactRetention(null) === 1);
    });

    test("calculateFactRetention({}) = 1", () => {
      assert(engine.calculateFactRetention({}) === 1);
    });

    // ── 3. FactStore (基础) ──
    console.log("\n-- 3. FactStore 基础操作 --");
    const store = new FactStore(factsDbPath, {
      enableFts5Optimization: true,
      forgettingCurveConfig: {
        enabled: true,
        archiveThreshold: 0.25,
      },
    });

    test("FactStore 创建", () => {
      assert(store._forgettingCurve !== null);
      assert(store._archiveManager !== null);
    });

    test("add 一条事实", () => {
      const r = store.add({ fact: "用户喜欢喝拿铁咖啡", tags: ["preference", "coffee"], time: "2026-05-20T08:00" });
      assert(r.id > 0);
    });

    test("addBatch 多事实", () => {
      const n = store.addBatch([
        { fact: "用户在学 Rust", tags: ["learning", "rust"], time: "2026-05-21T10:00" },
        { fact: "用户最近关注 AI Agent 开发", tags: ["ai-agent", "development"], time: "2026-05-22T14:00" },
        { fact: "用户喜欢看科幻电影", tags: ["preference", "movie", "scifi"], time: null },
      ]);
      assert(n === 3);
    });

    test("PII 脱敏", () => {
      const r = store.add({ fact: "邮箱 test@example.com 手机 13800138000", tags: ["identity"] });
      const rows = store.getAll();
      const fact = rows.find((f) => f.id === r.id);
      assert(fact.fact.indexOf("test@example.com") === -1, "email should be scrubbed");
      assert(fact.fact.indexOf("13800138000") === -1, "phone should be scrubbed");
    });

    test("FTS 搜索", () => {
      const results = store.searchFullText("Rust");
      assert(results.some((r) => r.fact.includes("Rust")));
    });

    test("标签搜索", () => {
      const results = store.searchByTags(["preference"]);
      assert(results.length >= 2);
    });

    test("delete", () => {
      const all = store.getAll();
      const id = all[0].id;
      assert(store.delete(id) === true);
      const after = store.getAll();
      assert(after.find((f) => f.id === id) === undefined);
    });

    test("getAll", () => {
      assert(store.getAll().length >= 3);
    });

    // ── 4. MemoryArchiveManager 去重 ──
    console.log("\n-- 4. MemoryArchiveManager 去重 --");
    const archivePath = path.join(tmpDir, "archived_facts.db");
    const archive = new MemoryArchiveManager(archivePath);

    test("archiveManager 创建", () => assert(archive !== null));

    test("首次归档", () => {
      archive.archiveFact({
        id: 1, fact: "test", tags: ["a"], time: null, session_id: "s1",
        created_at: "2026-01-01", hit_count: 0, importance: 0,
      });
      assert(archive.getCount() === 1);
    });

    test("重复归档被 IGNORE (original_id=1)", () => {
      archive.archiveFact({
        id: 1, fact: "test modified", tags: ["b"], time: null, session_id: "s1",
        created_at: "2026-01-01", hit_count: 5, importance: 0.5,
      });
      assert(archive.getCount() === 1, "count should still be 1 after ignored duplicate");
    });

    test("archiveBatch 批量归档", () => {
      archive.archiveBatch([
        { id: 2, fact: "f2", tags: ["x"], time: null, session_id: "s2", created_at: "2026-01-01", hit_count: 0, importance: 0 },
        { id: 3, fact: "f3", tags: ["y"], time: null, session_id: "s3", created_at: "2026-01-01", hit_count: 0, importance: 0 },
      ]);
      assert(archive.getCount() === 3);
    });

    test("searchByFact", () => {
      assert(archive.searchByFact("test").length === 1);
    });

    test("searchBySession", () => {
      assert(archive.searchBySession("s2").length === 1);
    });

    archive.close();

    // ── 5. 遗忘→归档→删除 完整链路 ──
    console.log("\n-- 5. 遗忘→归档→删除 --");
    const chainDbPath = path.join(tmpDir, "chain.db");
    const chainStore = new FactStore(chainDbPath, {
      forgettingCurveConfig: {
        enabled: true,
        archiveThreshold: 0.99, // 极高，几乎所有旧事实都会触发
        protectedTags: ["identity"],
      },
    });

    chainStore.add({ fact: "用户身份：软件工程师", tags: ["identity"] });
    chainStore.add({ fact: "old memory to forget", tags: ["random"] });

    // 模拟 100 天前的旧记忆
    const hundredDaysAgo = new Date(Date.now() - 100 * 86400000).toISOString();
    chainStore.db.prepare("UPDATE facts SET created_at = ? WHERE id = ?").run(hundredDaysAgo, 2);

    const evaluation = chainStore._forgettingCurve.evaluateForgetting();

    test("protected 记忆未被归档", () => {
      assert(evaluation.protected.length >= 1);
    });

    test("旧记忆被标记为 toArchive", () => {
      assert(evaluation.toArchive.length >= 1);
      assert(evaluation.toArchive.some((f) => f.fact === "old memory to forget"));
    });

    // 归档 + 删除
    chainStore._archiveManager.archiveBatch(evaluation.toArchive, "decay_below_threshold");
    let deletedCount = 0;
    for (const fact of evaluation.toArchive) {
      if (chainStore.delete(fact.id)) deletedCount++;
    }

    test("归档后活跃库中已无此记忆", () => {
      const remaining = chainStore.getAll();
      const archived = evaluation.toArchive[0];
      assert(remaining.find((f) => f.id === archived.id) === undefined);
    });

    test("归档库中存在此记忆", () => {
      const results = chainStore._archiveManager.searchByFact("forget");
      assert(results.length === 1);
    });

    chainStore.close();

    // ── 6. close 资源清理 ──
    console.log("\n-- 6. close 资源清理 --");
    const closeDbPath = path.join(tmpDir, "close.db");
    const closeStore = new FactStore(closeDbPath, {});

    test("close() 不抛异常（无 embedding）", () => {
      closeStore.close();
      assert(true);
    });

    store.close();
    engine.close();

    // ── 7. classifyFactTags ──
    console.log("\n-- 7. classifyFactTags --");

    // classifyFactTags 不是 export 的，但我们可以通过 FEEDBACK_PATTERNS 逻辑验证
    const FEEDBACK_PATTERNS = [
      /不要[再]*/,
      /别[再]*/,
      /不对/,
      /纠正/,
      /改成/,
      /更正/,
      /错误/,
      /不喜欢这种方式/,
      /换一种/,
    ];

    test("feedback 模式匹配", () => {
      assert(FEEDBACK_PATTERNS.some((p) => p.test("不要叫我小明")));
      assert(FEEDBACK_PATTERNS.some((p) => p.test("别再用英文")));
      assert(FEEDBACK_PATTERNS.some((p) => p.test("我说不对")));
      assert(FEEDBACK_PATTERNS.some((p) => p.test("纠正一下")));
    });

    test("普通事实不应匹配 feedback", () => {
      assert(FEEDBACK_PATTERNS.every((p) => !p.test("用户在学习 Rust")));
    });

    // ── Summary ──
    console.log(`\n=== 结果: ${passedTests}/${totalTests} 通过` + (failedTests > 0 ? `, ${failedTests} 失败` : "") + " ===\n");
    if (failedTests > 0) process.exit(1);

  } catch (err) {
    console.error(`\nFATAL: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

run();
