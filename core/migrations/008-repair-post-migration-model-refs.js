/**
 * #8 — 修复 migration #5 之后仍有入口把 models.* 写回旧字符串格式的问题
 *
 * 与 #5 相同的 normalizeCompositeModelRefs 逻辑，作为事后修复重复运行。
 * 确保 models.* 字段都转换为 {id, provider} 复合键对象。
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
        log(`[migrations] #8 ${dir.name}: models.${role} → ${value.provider}/${value.id}`);
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
      log(`[migrations] #8 preferences.${key} → ${value.provider}/${value.id}`);
    }
  }
  if (prefsChanged) prefs.savePreferences(preferences);
}
