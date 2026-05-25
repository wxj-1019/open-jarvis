/**
 * migrations 公共工具函数
 *
 * 提取自原 core/migrations.js 中的重复代码模式。
 */

import fsp from "fs/promises";
import path from "path";
import YAML from "js-yaml";
import { safeReadYAMLSync } from "../../shared/safe-fs.js";
import { saveConfig } from "../../lib/memory/config-loader.js";

// ═══════════════════════════════════════════════════════
//  异步文件 I/O 工具
// ═══════════════════════════════════════════════════════

/** 异步读取 YAML 文件，文件不存在或解析失败返回 null */
export async function readYAML(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    return YAML.load(raw) || null;
  } catch {
    return null;
  }
}

/** 异步写入 YAML 文件（同步 load 兼容 safeReadYAMLSync） */
export async function writeYAML(filePath, data, opts = {}) {
  const yamlStr = YAML.dump(data, {
    indent: 2,
    lineWidth: -1,
    sortKeys: false,
    quotingType: "\"",
    forceQuotes: false,
    ...opts,
  });
  if (opts.header) {
    return fsp.writeFile(filePath, opts.header + yamlStr, "utf-8");
  }
  return fsp.writeFile(filePath, yamlStr, "utf-8");
}

/** 异步原子写入 YAML — 写 tmp 后 rename */
export async function atomicWriteYAML(filePath, data, opts = {}) {
  const yamlStr = YAML.dump(data, {
    indent: 2,
    lineWidth: -1,
    sortKeys: false,
    quotingType: "\"",
    forceQuotes: false,
    ...opts,
  });
  const final = opts.header ? opts.header + yamlStr : yamlStr;
  const tmp = filePath + ".tmp";
  await fsp.writeFile(tmp, final, "utf-8");
  await fsp.rename(tmp, filePath);
}

/** 异步原子写入 JSON — 写 tmp 后 rename */
export async function atomicWriteJSON(filePath, data, { spaces = 2 } = {}) {
  const tmp = filePath + ".tmp";
  await fsp.writeFile(tmp, JSON.stringify(data, null, spaces) + "\n", "utf-8");
  await fsp.rename(tmp, filePath);
}

/** 异步读取 JSON 文件，文件不存在或解析失败返回 null */
export async function readJSON(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 检查文件是否存在 */
export async function fileExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** 确保目录存在 */
export async function ensureDir(dirPath) {
  await fsp.mkdir(dirPath, { recursive: true });
}

/** 同步版本：safeReadYAMLSync（桥接旧代码，仍被部分迁移使用） */
export function readYAMLSafe(filePath, YAMLLib = YAML) {
  return safeReadYAMLSync(filePath, null, YAMLLib);
}

/** 同步版本：saveConfig */
export function writeYAMLSafe(filePath, partial, { deep = true } = {}) {
  return saveConfig(filePath, partial, { deep });
}

// ═══════════════════════════════════════════════════════
//  Agent 扫描
// ═══════════════════════════════════════════════════════

/** 异步扫描 agents 目录，返回 DirectoryEntry 数组 */
export async function scanAgentDirs(agentsDir) {
  try {
    const entries = await fsp.readdir(agentsDir, { withFileTypes: true });
    return entries.filter(d => d.isDirectory());
  } catch {
    return [];
  }
}

/** 异步查找第一个包含 config.yaml 的 agent 目录名 */
export async function findAgentWithConfig(agentsDir) {
  const dirs = await scanAgentDirs(agentsDir);
  for (const d of dirs) {
    if (await fileExists(path.join(agentsDir, d.name, "config.yaml"))) {
      return d.name;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════
//  YAML Frontmatter 工具（解析 Markdown 文件元数据头）
// ═══════════════════════════════════════════════════════

/**
 * 解析 YAML frontmatter
 * @returns {{ frontmatter: Map<string,string>, fmLines: string[], bodyLines: string[] } | null}
 *   未找到 frontmatter 返回 null
 */
export function parseFrontmatter(raw) {
  const lines = raw.split("\n");
  if (!lines[0] || lines[0].trim() !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;

  const fmLines = lines.slice(1, end);
  const meta = new Map();
  for (const line of fmLines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    meta.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }
  return { frontmatter: meta, fmLines, bodyLines: lines.slice(end + 1) };
}

/** 获取原始 frontmatter 行的 key 顺序列表 */
export function frontmatterKeyOrder(fmLines) {
  const keys = [];
  for (const line of fmLines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    keys.push(line.slice(0, idx).trim());
  }
  return keys;
}

/**
 * 格式化 frontmatter 回字符串，保留原有 key 顺序，新 key 追加到末尾
 */
export function formatFrontmatter(meta, originalKeys, bodyLines) {
  const allKeys = [...originalKeys, ...[...meta.keys()].filter(k => !originalKeys.includes(k))];
  const fmLines = allKeys.map(k => `${k}: ${meta.get(k)}`);
  return ["---", ...fmLines, "---", ...bodyLines].join("\n");
}

/** 从 raw 内容中移除指定的 frontmatter key */
export function removeFrontmatterKeys(raw, keys) {
  const parsed = parseFrontmatter(raw);
  if (!parsed) return raw;

  let changed = false;
  const nextFm = [];
  for (const line of parsed.fmLines) {
    const idx = line.indexOf(":");
    const key = idx >= 0 ? line.slice(0, idx).trim() : "";
    if (key && keys.has(key)) { changed = true; continue; }
    nextFm.push(line);
  }
  if (!changed) return raw;
  return ["---", ...nextFm, "---", ...parsed.bodyLines].join("\n");
}

/**
 * 设置/更新单个 frontmatter 字段值，不改变其他字段
 * @returns {{ raw: string, changed: boolean }}
 */
export function setFrontmatterField(raw, key, value) {
  const parsed = parseFrontmatter(raw);
  if (!parsed) return { raw, changed: false };

  const str = String(value);
  if (parsed.frontmatter.get(key) === str) return { raw, changed: false };

  parsed.frontmatter.set(key, str);
  const order = frontmatterKeyOrder(parsed.fmLines);
  return { raw: formatFrontmatter(parsed.frontmatter, order, parsed.bodyLines), changed: true };
}

/** 解析 frontmatter 中的 members 数组并返回成员数 */
export function parseFrontmatterMemberCount(value) {
  if (typeof value !== "string") return 3;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return 3;
  const count = trimmed.slice(1, -1).split(",").map(p => p.trim()).filter(Boolean).length;
  return count > 0 ? count : 3;
}

// ═══════════════════════════════════════════════════════
//  JSONL 工具
// ═══════════════════════════════════════════════════════

/** 异步递归收集目录中所有 .jsonl 文件路径 */
export async function collectJsonlRecursive(dir, out = []) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectJsonlRecursive(fullPath, out);
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      out.push(fullPath);
    }
  }
  return out;
}

/** 异步读取并解析 JSONL 文件的所有行 */
export async function readJsonlLines(filePath) {
  try {
    const raw = await fsp.readFile(filePath, "utf-8");
    return raw.split("\n").filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/** 异步写入 JSONL 行 */
export async function writeJsonlLines(filePath, lines) {
  const content = lines.map(l => typeof l === "string" ? l : JSON.stringify(l)).join("\n") + "\n";
  await fsp.writeFile(filePath, content, "utf-8");
}

// ═══════════════════════════════════════════════════════
//  Model 索引
// ═══════════════════════════════════════════════════════

/**
 * 构建 id→provider 查找表
 * @returns {{ idToProvider: Map<string,string>, providerModelIds: Map<string,Set<string>> }}
 */
export function buildModelProviderIndex(providerRegistry) {
  const idToProvider = new Map();
  const providerModelIds = new Map();
  const rawProviders = providerRegistry.getAllProvidersRaw?.() || {};

  for (const [providerId, provider] of Object.entries(rawProviders || {})) {
    const ids = new Set();
    for (const m of provider?.models || []) {
      const id = typeof m === "object" ? m.id : m;
      if (!id) continue;
      ids.add(id);
      if (!idToProvider.has(id)) idToProvider.set(id, providerId);
    }
    providerModelIds.set(providerId, ids);
  }

  return { idToProvider, providerModelIds };
}

// ═══════════════════════════════════════════════════════
//  模型引用复合键迁移工具（#005 / #008 共享）
// ═══════════════════════════════════════════════════════

/**
 * 从 providerRegistry 构建 id → provider 查找表。
 * 多 provider 同 id 时取首个（added-models.yaml 顺序决定）。
 */
export function buildIdToProviderMap(providerRegistry) {
  const idToProvider = new Map();
  const rawProviders = providerRegistry.getAllProvidersRaw?.() || {};
  for (const [providerId, p] of Object.entries(rawProviders || {})) {
    for (const m of p.models || []) {
      const id = typeof m === "object" ? m.id : m;
      if (id && !idToProvider.has(id)) idToProvider.set(id, providerId);
    }
  }
  return idToProvider;
}

/**
 * 将模型引用归一化为 {id, provider} 复合键对象。
 * 支持三种输入形态：
 *   1. 裸 id 字符串 "glm-5.1"                 → 通过 idToProvider 推断 provider
 *   2. "provider/id" 字符串 "zhipu/glm-5.1"   → 拆成 {id, provider}
 *   3. {id, provider: ""} 半成品对象          → 视作裸 id 推断
 *
 * 返回 { value, changed }，value 为迁移后的值（可能不变）。
 */
export function normalizeCompositeModelRef(ref, idToProvider) {
  if (!ref) return { value: ref, changed: false };

  // {id, provider} 对象
  if (typeof ref === "object") {
    if (ref.id && ref.provider) return { value: ref, changed: false };
    if (ref.id && !ref.provider) {
      const guess = idToProvider.get(ref.id);
      if (guess) return { value: { id: ref.id, provider: guess }, changed: true };
      return { value: ref, changed: false };
    }
    return { value: ref, changed: false };
  }

  if (typeof ref !== "string") return { value: ref, changed: false };

  // "provider/id"
  const slashIdx = ref.indexOf("/");
  if (slashIdx > 0 && slashIdx < ref.length - 1) {
    return { value: { provider: ref.slice(0, slashIdx), id: ref.slice(slashIdx + 1) }, changed: true };
  }

  // 裸 id
  const guess = idToProvider.get(ref);
  if (guess) return { value: { id: ref, provider: guess }, changed: true };
  return { value: ref, changed: false };
}

/** 标准化 cron job 的 model 引用为复合键对象 */
export function normalizeCronModelRefForMigration(ref, index) {
  if (!ref) return { value: "", changed: ref !== "" };

  if (typeof ref === "object") {
    if (!ref.id) return { value: ref, changed: false };
    if (ref.provider) return { value: ref, changed: false };
    const provider = index.idToProvider.get(ref.id);
    if (provider) return { value: { id: ref.id, provider }, changed: true };
    return { value: ref, changed: false };
  }

  if (typeof ref !== "string") return { value: ref, changed: false };

  const s = ref.trim();
  if (!s) return { value: "", changed: ref !== "" };

  // 先按完整 id 查，避免把 openrouter 这类包含 "/" 的裸模型 id 误拆成 provider/id
  const exactProvider = index.idToProvider.get(s);
  if (exactProvider) return { value: { id: s, provider: exactProvider }, changed: true };

  const slashIdx = s.indexOf("/");
  if (slashIdx > 0 && slashIdx < s.length - 1) {
    const provider = s.slice(0, slashIdx);
    const id = s.slice(slashIdx + 1);
    const knownIds = index.providerModelIds.get(provider);
    if (knownIds?.has(id) || index.providerModelIds.has(provider)) {
      return { value: { id, provider }, changed: true };
    }
  }

  return { value: ref, changed: false };
}
