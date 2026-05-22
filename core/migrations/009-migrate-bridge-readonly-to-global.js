/**
 * #9 — bridge.readOnly 从 per-agent 收敛到 global preferences
 *
 * 历史上 readOnly 被放在 agent.config.bridge.readOnly，但页面语义后来演进为
 * 总开关。这里收敛到 preferences.bridge.readOnly，并清理所有 agent-level
 * 残留字段。
 *
 * 冲突策略：任一 agent 显式 true → 全局 true，保证更保守的权限边界。
 * 若 preferences 已有 bridge.readOnly，则以 preferences 为准，只做清理。
 */
import path from "path";
import YAML from "js-yaml";
import { scanAgentDirs, readYAMLSafe, atomicWriteYAML } from "./helpers.js";

export async function migrate(ctx) {
  const { agentsDir, prefs, log } = ctx;

  const agentDirs = await scanAgentDirs(agentsDir);

  let anyReadOnlyTrue = false;
  let anyExplicit = false;

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = readYAMLSafe(cfgPath, YAML);
    if (!config?.bridge || typeof config.bridge !== "object") continue;
    if (!("readOnly" in config.bridge)) continue;
    anyExplicit = true;
    if (config.bridge.readOnly === true) anyReadOnlyTrue = true;
  }

  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = readYAMLSafe(cfgPath, YAML);
    if (!config?.bridge || typeof config.bridge !== "object") continue;
    if (!("readOnly" in config.bridge)) continue;

    delete config.bridge.readOnly;
    if (Object.keys(config.bridge).length === 0) delete config.bridge;

    await atomicWriteYAML(cfgPath, config);
    log(`[migrations] #9 ${dir.name}: 移除 agent-level bridge.readOnly`);
  }

  const preferences = prefs.getPreferences();
  const hadPrefsValue = typeof preferences.bridge?.readOnly === "boolean";
  const finalValue = hadPrefsValue
    ? preferences.bridge.readOnly
    : anyReadOnlyTrue;
  const bridgePrefs = { ...(preferences.bridge || {}) };
  if (finalValue) bridgePrefs.readOnly = true;
  else delete bridgePrefs.readOnly;
  if (Object.keys(bridgePrefs).length === 0) delete preferences.bridge;
  else preferences.bridge = bridgePrefs;
  prefs.savePreferences(preferences);

  if (hadPrefsValue && !anyExplicit) {
    log(`[migrations] #9: preferences.bridge.readOnly 保持现值 ${finalValue}`);
  } else if (anyReadOnlyTrue) {
    log(`[migrations] #9: preferences.bridge.readOnly = true（检测到至少一个 agent 显式开启）`);
  } else if (anyExplicit) {
    log(`[migrations] #9: preferences.bridge.readOnly = false（所有显式设置都是关闭）`);
  } else {
    log(`[migrations] #9: preferences.bridge.readOnly = false（无显式历史设置，按产品默认关闭）`);
  }
}
