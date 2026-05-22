/**
 * #13 — 最近兼容状态显式化
 *
 * v0.142.x 连续收紧了两个运行时契约：
 *   1. 官方 DeepSeek provider 不能把 provider id "deepseek" 当作模型 id；
 *   2. v0.142.x 时新建 agent 的 memory.enabled 曾改为默认关闭。
 *
 * 老数据里这两处都可能靠"隐式旧语义"存活：DeepSeek 旧列表可能含非法 id；
 * 老 agent 缺 memory.enabled 时，旧运行时一直按开启处理。迁移只修磁盘真相源，
 * 不把兼容判断散落到同步模型、Agent 初始化或前端读配置路径里。
 * 当前版本的新写入路径重新默认开启，迁移仍不覆盖已有显式用户选择。
 */
import path from "path";
import YAML from "js-yaml";
import { getInvalidProviderModelIds } from "../../shared/provider-model-validation.js";
import { scanAgentDirs, readYAMLSafe, atomicWriteYAML } from "./helpers.js";

export async function migrate(ctx) {
  const deepseekPatched = await repairLegacyDeepSeekProviderModelIds(ctx);
  const memoryPatched = await normalizeLegacyMemoryMasterDefaults(ctx);
  ctx.log?.(`[migrations] #13: recent compatibility normalized (deepseek=${deepseekPatched}, memory=${memoryPatched})`);
}

// ── DeepSeek 模型 id 修复 ──────────────────────────────────────────────────────────

async function repairLegacyDeepSeekProviderModelIds(ctx) {
  const { hanakoHome, log } = ctx;
  const ymlPath = path.join(hanakoHome, "added-models.yaml");
  const raw = readYAMLSafe(ymlPath, YAML);
  if (!raw?.providers || typeof raw.providers !== "object") return 0;

  let patched = 0;
  for (const [providerId, provider] of Object.entries(raw.providers)) {
    if (!provider || !Array.isArray(provider.models)) continue;

    const invalid = new Set(
      getInvalidProviderModelIds(providerId, provider.models, { baseUrl: provider.base_url })
        .map((id) => String(id).trim().toLowerCase()),
    );
    if (invalid.size === 0) continue;

    const nextModels = provider.models.filter((entry) => {
      const id = modelIdOfMigrationEntry(entry).trim().toLowerCase();
      return id && !invalid.has(id);
    });

    // TODO(remove after v0.150.0): 兼容 v0.142.3 及更早版本可能把
    // DeepSeek provider id "deepseek" 误写进 models[] 的旧数据。
    provider.models = nextModels.length > 0
      ? nextModels
      : defaultDeepSeekModelsForMigration(ctx, providerId);
    patched++;
    log?.(`[migrations] #13 ${providerId}: removed reserved DeepSeek model id(s) ${[...invalid].join(", ")}`);
  }

  if (patched > 0) {
    const header =
      "# Hanako 供应商配置（全局，跨 agent 共享）\n" +
      "# 由设置页面管理\n\n";
    await atomicWriteYAML(ymlPath, raw, { header });
  }

  return patched;
}

// ── Memory 默认值修复 ──────────────────────────────────────────────────────────────

async function normalizeLegacyMemoryMasterDefaults(ctx) {
  const { agentsDir, log } = ctx;
  const agentDirs = await scanAgentDirs(agentsDir);

  let patched = 0;
  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const cfg = readYAMLSafe(cfgPath, YAML);
    if (!cfg || typeof cfg !== "object") continue;

    const memoryIsObject = cfg.memory && typeof cfg.memory === "object" && !Array.isArray(cfg.memory);
    if (memoryIsObject && Object.prototype.hasOwnProperty.call(cfg.memory, "enabled")) continue;

    // TODO(remove after v0.150.0): 兼容 v0.142.3 及更早版本的老 agent。
    // 当时缺 memory.enabled 的运行时语义是开启，这里把隐式旧语义写成显式值。
    cfg.memory = memoryIsObject
      ? { ...cfg.memory, enabled: true }
      : { enabled: true };

    await atomicWriteYAML(cfgPath, cfg);
    patched++;
    log?.(`[migrations] #13 ${dir.name}: memory.enabled set to true for legacy implicit default`);
  }

  return patched;
}

// ── 纯逻辑工具 ────────────────────────────────────────────────────────────────────

function modelIdOfMigrationEntry(entry) {
  if (typeof entry === "object" && entry !== null) return typeof entry.id === "string" ? entry.id : "";
  return typeof entry === "string" ? entry : "";
}

function defaultDeepSeekModelsForMigration(ctx, providerId) {
  const direct = ctx.providerRegistry?.getDefaultModels?.(providerId);
  if (Array.isArray(direct) && direct.length > 0) return [...direct];
  const official = ctx.providerRegistry?.getDefaultModels?.("deepseek");
  if (Array.isArray(official) && official.length > 0) return [...official];
  return ["deepseek-v4-pro", "deepseek-v4-flash"];
}
