/**
 * lib/memory/index.js — 记忆系统模块统一出口
 *
 * 分层结构:
 *   store/     → 数据存储 (FactStore, VectorSearchEngine)
 *   compile/   → 编译管线 (compile*.js, compile-retry.js, compile-quality.js)
 *   search/    → 搜索增强 (fts5-query-builder.js)
 *   quality/   → 质量评估 (quality-scorer.js, quality-monitor.js)
 *   decay/     → 遗忘归档 (forgetting-curve.js, memory-archive.js)
 *   session/   → 会话摘要 (session-summary.js)
 *   embedding/ → 嵌入模型 (embedding-model.js)
 *   utils/     → 工具辅助 (time-context.js, timezone-utils.js)
 *   ticker/    → 调度器 (memory-ticker.js)
 */

// ── 数据存储 ──
export { FactStore, loadBetterSqliteDatabase, buildFactSearchText } from "./fact-store.js";
export { VectorSearchEngine } from "./vector-search.js";
export { MemoryArchiveManager } from "./memory-archive.js";

// ── 编译管线 ──
export {
  compileToday,
  compileWeek,
  compileLongterm,
  compileFacts,
  assemble,
  circuitBreaker,
  getEmptyMemory,
} from "./compile.js";
export {
  createCompileRetryManager,
  createCircuitBreaker,
  createCompileStatePersistence,
  isResponseValid,
  validateResponseQuality,
} from "./compile-retry.js";
export { createCompileQualityEvaluator } from "./compile-quality.js";
export {
  COMPILED_MEMORY_BLOCKS,
  readCompiledMemorySnapshot,
  writeCompiledMemorySnapshot,
} from "./compiled-memory-snapshot.js";

// ── 会话摘要 ──
export { SessionSummaryManager } from "./session-summary.js";

// ── 深度记忆 ──
export { processDirtySessions } from "./deep-memory.js";

// ── 调度器 ──
export { createMemoryTicker } from "./memory-ticker.js";

// ── 搜索 ──
export { createMemorySearchTool } from "./memory-search.js";
export { Fts5Optimizer, levenshteinDistance as fts5Levenshtein } from "./fts5-optimizer.js";
export {
  buildFts5Query,
  buildLikePattern,
  rerankResults,
  cjkNgrams,
  expandSynonyms,
} from "./fts5-query-builder.js";

// ── 质量评估 ──
export {
  scoreSpecificity,
  scoreRecency,
  scoreRelevance,
  scoreConsistency,
  scoreUsage,
  computeCompositeScore,
  createQualityScorer,
} from "./quality-scorer.js";
export { createQualityMonitor } from "./quality-monitor.js";
export { createQualityRepair } from "./quality-repair.js";

// ── 遗忘曲线 ──
export { ForgettingCurveEngine, DEFAULT_FORGETTING_SCHEDULE } from "./forgetting-curve.js";

// ── 矛盾检测 ──
export { ContradictionDetector } from "./contradiction-detector.js";

// ── 嵌入模型 ──
export { EmbeddingModelManager } from "./embedding-model.js";

// ── 配置 ──
export { loadConfig, clearConfigCache } from "./config-loader.js";

// ── 时间工具 ──
export {
  resolveMemoryTimeZone,
  buildSourceTimeRange,
  buildFactTimeContext,
  normalizeFactTime,
} from "./time-context.js";
export {
  setUserTimezone,
  getUserTimezone,
  resetUserTimezone,
  formatMemoryTime,
} from "./timezone-utils.js";

// ── 监控 ──
export { createPerformanceMonitor } from "./performance-monitor.js";
