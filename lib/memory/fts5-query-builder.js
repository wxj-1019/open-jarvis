/**
 * fts5-query-builder.js — 查询时 FTS5 增强
 *
 * 将原本依赖独立数据库的 Fts5Optimizer 功能移到查询端：
 * - CJK 2/3-gram 分词 → 在查询时动态生成，不依赖额外 DB
 * - 同义词查询扩展 → 在构建 FTS 查询串时内联展开
 * - 模糊匹配回退 → LIKE + 编辑距离
 * - 结果重排序 → 内存中按新近度 + 标签相关性加权
 */

import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("fts5-query-builder");

const CJK_RUN_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;

// ── 同义词表（可扩展） ──
const SYNONYM_MAP = {
  "记忆": ["memory", "回忆", "memories", "长期记忆", "短期记忆"],
  "用户": ["user", "使用者", "人类", "person", "个人"],
  "代码": ["code", "编程", "coding", "程序", "开发", "development"],
  "工作": ["work", "job", "career", "职业"],
  "学习": ["study", "learn", "learning", "知识", "knowledge"],
  "偏好": ["preference", "喜欢", "喜好", "讨厌", "dislike"],
  "健康": ["health", "身体", "医疗", "medical"],
  "家庭": ["family", "家人", "亲属", "关系"],
  "项目": ["project", "工程", "任务", "task"],
  "音乐": ["music", "歌曲", "song", "播放"],
  "照片": ["photo", "picture", "图片", "image", "图像", "截图"],
  "工具": ["tool", "utility", "插件", "plugin", "扩展"],
  "技能": ["skill", "能力", "capability", "掌握", "熟练"],
  "配置": ["config", "setting", "设置", "选项", "option"],
};

function normalize(text) {
  return String(text || "").normalize("NFKC").trim();
}

// ── CJK N-gram 分词 ──

export function cjkNgrams(text, gramSizes = [2, 3]) {
  const tokens = [];
  const normalized = normalize(text);
  if (!normalized) return tokens;

  CJK_RUN_RE.lastIndex = 0;
  for (const match of normalized.matchAll(CJK_RUN_RE)) {
    const chars = Array.from(match[0]);
    for (const size of gramSizes) {
      if (chars.length < size) continue;
      for (let i = 0; i <= chars.length - size; i++) {
        tokens.push(chars.slice(i, i + size).join(""));
      }
    }
  }
  return [...new Set(tokens)];
}

// ── 同义词查询扩展 ──

export function expandSynonyms(query) {
  if (!query) return query;

  const lower = normalize(query).toLowerCase();
  const parts = [];

  for (const [term, synonyms] of Object.entries(SYNONYM_MAP)) {
    const termLower = normalize(term).toLowerCase();
    if (lower.includes(termLower)) {
      parts.push(...synonyms.map(s => normalize(s)));
    } else {
      for (const syn of synonyms) {
        const synLower = normalize(syn).toLowerCase();
        if (synLower.length > 1 && lower.includes(synLower)) {
          parts.push(term);
          parts.push(...synonyms.filter(s => normalize(s).toLowerCase() !== synLower));
          break;
        }
      }
    }
  }

  if (parts.length > 0) {
    const expanded = new Set(parts.map(p => normalize(p).toLowerCase()));
    return `${query} ${[...expanded].join(" ")}`;
  }
  return query;
}

// ── 构建增强 FTS5 查询 ──

export function buildFts5Query(queryText) {
  if (!queryText || !queryText.trim()) return "";

  const expanded = expandSynonyms(queryText);
  const terms = expanded.split(/\s+/).filter(Boolean);
  const phrases = [];

  for (const term of terms) {
    // CJK 字符 → ngram 分词后用 OR 连接
    if (CJK_RUN_RE.test(term)) {
      CJK_RUN_RE.lastIndex = 0;
      const ngrams = cjkNgrams(term);
      if (ngrams.length > 0) {
        // FTS5 中双引号表示短语精确匹配，单独词用 NEAR 或直接 OR
        phrases.push(`(${ngrams.map(n => `"${n}"`).join(" OR ")})`);
      }
    } else {
      // 非 CJK: 直接匹配，去掉太短的词
      if (term.length >= 2) {
        phrases.push(term);
      }
    }
  }

  return phrases.length > 0 ? phrases.join(" AND ") : "";
}

// ── 编辑距离 ──

export function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array(n + 1).fill(0);
  let curr = Array(n + 1).fill(0);

  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

// ── 结果重排序 ──

/**
 * 对搜索结果进行重排序（新近度 + 关键词匹配）
 * @param {Array<object>} results - 搜索结果数组，每项需含 { id, fact, time, ftsScore }
 * @param {string} queryText - 原始查询文本
 * @param {object} [opts]
 * @param {number} [opts.recencyHalfLifeDays=7] - 新近度半衰期（天）
 * @param {number} [opts.ftsWeight=0.5] - FTS 分数权重
 * @param {number} [opts.keywordWeight=0.3] - 关键词匹配权重
 * @param {number} [opts.recencyWeight=0.2] - 新近度权重
 * @returns {Array<object>}
 */
export function rerankResults(results, queryText, opts = {}) {
  if (!results || results.length === 0) return [];

  const ftsWeight = opts.ftsWeight ?? 0.5;
  const keywordWeight = opts.keywordWeight ?? 0.3;
  const recencyWeight = opts.recencyWeight ?? 0.2;
  const recencyHalfLifeMs = (opts.recencyHalfLifeDays ?? 7) * 86400000;
  const now = Date.now();
  const queryLower = normalize(queryText).toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter(w => w.length >= 2);

  const scored = results.map((r) => {
    const factLower = normalize(r.fact || "").toLowerCase();

    // 关键词匹配分
    let keywordScore = 0;
    for (const w of queryWords) {
      if (factLower.includes(w)) keywordScore += 1;
    }
    keywordScore = queryWords.length > 0
      ? Math.min(1, keywordScore / queryWords.length)
      : 0;

    // 新近度分（指数衰减）
    let recencyScore = 0;
    if (r.time) {
      const age = Math.max(0, now - new Date(r.time).getTime());
      recencyScore = Math.exp(-age / recencyHalfLifeMs);
    }

    return {
      ...r,
      finalScore: (r.ftsScore || 0) * ftsWeight
        + keywordScore * keywordWeight
        + recencyScore * recencyWeight,
    };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);
  return scored;
}

// ── LIKE 回退查询 ──

/**
 * 为 LIKE 回退构建查询词
 */
export function buildLikePattern(queryText) {
  return `%${normalize(queryText)}%`;
}
