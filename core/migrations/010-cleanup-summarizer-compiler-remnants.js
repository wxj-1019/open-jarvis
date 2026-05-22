/**
 * #10 — 清除 summarizer / compiler 残留字段
 *
 * 这两个角色在 v0.55 架构重构时被列入 schema，但业务路径从未接通过任何调用，
 * 此次连同 ROLE_TO_PREF_KEY / SHARED_MODEL_KEYS / config.example.yaml 一起清理。
 * 用户机器上可能有以下残留，全部 delete key（不是写 null）：
 *   - preferences.json 的 summarizer_model / compiler_model
 *   - 每个 agent config.yaml 的 models.summarizer / models.compiler
 *
 * 幂等：缺失字段直接跳过；不抛错，避免拦住启动。
 */
import path from "path";
import YAML from "js-yaml";
import { scanAgentDirs, readYAMLSafe, atomicWriteYAML } from "./helpers.js";

export async function migrate(ctx) {
  const { agentsDir, prefs, log } = ctx;

  // ── preferences ──
  const preferences = prefs.getPreferences();
  let prefsChanged = false;
  for (const key of ["summarizer_model", "compiler_model"]) {
    if (Object.prototype.hasOwnProperty.call(preferences, key)) {
      delete preferences[key];
      prefsChanged = true;
      log(`[migrations] #10: removed preferences.${key}`);
    }
  }
  if (prefsChanged) prefs.savePreferences(preferences);

  // ── agent config.yaml ──
  const agentDirs = await scanAgentDirs(agentsDir);

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = readYAMLSafe(cfgPath, YAML);
    if (!config?.models || typeof config.models !== "object") continue;

    let changed = false;
    for (const role of ["summarizer", "compiler"]) {
      if (Object.prototype.hasOwnProperty.call(config.models, role)) {
        delete config.models[role];
        changed = true;
        log(`[migrations] #10 ${dir.name}: removed models.${role}`);
      }
    }

    if (changed) {
      await atomicWriteYAML(cfgPath, config);
    }
  }
}
