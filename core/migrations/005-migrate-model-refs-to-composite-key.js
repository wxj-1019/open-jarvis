/**
 * #5 — models.* 字段全量迁移到 {id, provider} 复合键对象
 *
 * 目标：运行时（非 UI 层）模型引用只有一种合法形态——{id, provider} 对象。
 * 之前历史数据里混存了三种：
 *   1. 裸 id 字符串 "glm-5.1"                 → 通过 added-models.yaml 推断 provider
 *   2. "provider/id" 字符串 "zhipu/glm-5.1"   → 拆成 {id, provider}
 *   3. {id, provider: ""} 半成品对象          → 视作裸 id 推断
 *
 * 作用范围：
 *   - 每个 agent 目录下 config.yaml 里的 models.{chat,utility,utility_large}
 *     （embedding 角色不在复合键范围内——走 embedding_api 独立配置）
 *   - preferences.json 的 {utility,utility_large}_model
 *
 * 推断规则：
 *   - "provider/id" → {provider, id}（直接拆）
 *   - 裸 id 或半成品对象：遍历 added-models.yaml 里每个 provider 的 models，
 *     取首个命中。多 provider 同 id 时取 added-models.yaml 第一个（已有行为不变）。
 *     找不到保留原值（避免热删有效配置，/providers 设置页重启会自愈）。
 */
import path from "path";
import YAML from "js-yaml";
import {
  buildIdToProviderMap,
  normalizeCompositeModelRef,
  readYAMLSafe,
  scanAgentDirs,
  writeYAMLSafe,
} from "./helpers.js";

export async function migrate(ctx) {
  const { agentsDir, prefs, providerRegistry, log } = ctx;

  const idToProvider = buildIdToProviderMap(providerRegistry);
  const ROLES = ["chat", "utility", "utility_large"];

  // ── agent config.yaml ──
  const dirs = await scanAgentDirs(agentsDir);

  for (const dir of dirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = readYAMLSafe(cfgPath, YAML);
    if (!config?.models) continue;

    let changed = false;
    const next = { ...config.models };
    for (const role of ROLES) {
      const { value, changed: ch } = normalizeCompositeModelRef(config.models[role], idToProvider);
      if (ch) {
        next[role] = value;
        changed = true;
        log(`[migrations] #5 ${dir.name}: models.${role} → ${value.provider}/${value.id}`);
      }
    }

    if (changed) {
      writeYAMLSafe(cfgPath, { models: next });
    }
  }

  // ── preferences.json (shared models) ──
  const preferences = prefs.getPreferences();
  let prefsChanged = false;
  const prefKeys = ["utility_model", "utility_large_model"];
  for (const key of prefKeys) {
    const { value, changed } = normalizeCompositeModelRef(preferences[key], idToProvider);
    if (changed) {
      preferences[key] = value;
      prefsChanged = true;
      log(`[migrations] #5 preferences.${key} → ${value.provider}/${value.id}`);
    }
  }
  if (prefsChanged) prefs.savePreferences(preferences);
}
