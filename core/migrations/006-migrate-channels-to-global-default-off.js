/**
 * #6 — channels.enabled 统一迁移到 global preferences，尊重老用户意图
 *
 * 背景：旧版本 /channels/toggle 把 `channels.enabled` 通过 updateConfig 写入了
 * 每个被 toggle 过的 agent 的 config.yaml（因为 schema 当时没登记这是 global 字段）。
 * 现在把真相源收敛到 preferences.channels_enabled。
 *
 * 合并策略（因为老数据没时间戳，无法按"最后一次"取值）：
 *   - 任一 agent config 显式 `channels.enabled === true` → 最终保留 true（说明用户想用）
 *   - 所有显式值都是 false，或根本没人设过 → 最终 false（产品默认）
 *
 * 这样既尊重显式开过的老用户、不让他们升级后发现功能被强关，
 * 又让从没用过频道的大多数用户默认关闭（产品判断：bug 修之前 ticker 无条件跑，
 * 所以老行为里"config 显示开"并不代表用户真的想开，只有"显式设过 true"才能说明意图）。
 */
import path from "path";
import YAML from "js-yaml";
import {
  atomicWriteYAML,
  readYAMLSafe,
  scanAgentDirs,
} from "./helpers.js";

export async function migrate(ctx) {
  const { agentsDir, prefs, log } = ctx;

  const dirs = await scanAgentDirs(agentsDir);

  // ── 1. 扫描：收集老用户的显式意图 ──
  let anyEnabledTrue = false;
  let anyExplicit = false;

  for (const dir of dirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = readYAMLSafe(cfgPath, YAML);
    if (!config?.channels || typeof config.channels !== "object") continue;
    if (!("enabled" in config.channels)) continue;
    anyExplicit = true;
    if (config.channels.enabled === true) anyEnabledTrue = true;
  }

  // ── 2. 清理所有 agent config.yaml 中错位的 channels.enabled ──
  for (const dir of dirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const config = readYAMLSafe(cfgPath, YAML);
    if (!config?.channels || typeof config.channels !== "object") continue;

    let changed = false;
    if ("enabled" in config.channels) {
      delete config.channels.enabled;
      log(`[migrations] #6 ${dir.name}: 移除 agent-level channels.enabled`);
      changed = true;
    }
    if (Object.keys(config.channels).length === 0) {
      delete config.channels;
      changed = true;
    }

    if (changed) {
      await atomicWriteYAML(cfgPath, config);
    }
  }

  // ── 3. 写入 global preferences ──
  const finalValue = anyEnabledTrue;
  const preferences = prefs.getPreferences();
  preferences.channels_enabled = finalValue;
  prefs.savePreferences(preferences);

  if (anyEnabledTrue) {
    log(`[migrations] #6: preferences.channels_enabled = true（保留：检测到至少一个 agent 显式开启过）`);
  } else if (anyExplicit) {
    log(`[migrations] #6: preferences.channels_enabled = false（所有显式设置都是关闭）`);
  } else {
    log(`[migrations] #6: preferences.channels_enabled = false（无显式历史设置，按产品默认关闭）`);
  }
}
