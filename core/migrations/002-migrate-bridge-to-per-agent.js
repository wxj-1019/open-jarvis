/**
 * #2 — bridge 配置从全局 preferences 迁移到 per-agent config.yaml
 *
 * preferences.json 中的 bridge.telegram / feishu / qq / wechat / whatsapp
 * 各自可能带 agentId 字段指定归属 agent。迁移后每个 platform config
 * 写入对应 agent 的 config.yaml，owner 信息一并合入。
 * bridge.readOnly / receiptEnabled 保留为全局偏好。
 */
import path from "path";
import YAML from "js-yaml";
import {
  fileExists,
  findAgentWithConfig,
  writeYAMLSafe,
} from "./helpers.js";

export async function migrate(ctx) {
  const { agentsDir, prefs, log } = ctx;
  const preferences = prefs.getPreferences();
  const bridge = preferences.bridge;
  if (!bridge) return; // nothing to migrate

  const primaryAgentId = preferences.primaryAgent || null;
  const ownerDict = bridge.owner || {};
  const readOnly = bridge.readOnly === true;
  const receiptEnabled = bridge.receiptEnabled === false ? false : undefined;

  const PLATFORMS = ["telegram", "feishu", "qq", "wechat", "whatsapp"];
  const agentConfigs = new Map(); // agentId → { platform: config }

  // Find fallback agent: primary if it exists, otherwise first available
  let fallbackAgentId = null;
  if (primaryAgentId) {
    const primaryDir = path.join(agentsDir, primaryAgentId);
    if (await fileExists(path.join(primaryDir, "config.yaml"))) {
      fallbackAgentId = primaryAgentId;
    } else {
      log(`[migrations] primaryAgent "${primaryAgentId}" dir/config.yaml not found, scanning for fallback`);
    }
  }
  if (!fallbackAgentId) {
    fallbackAgentId = await findAgentWithConfig(agentsDir);
  }

  for (const platform of PLATFORMS) {
    const cfg = bridge[platform];
    if (!cfg) continue;

    // Determine target agent
    let targetAgentId = cfg.agentId || null;
    if (targetAgentId) {
      const agentCfg = path.join(agentsDir, targetAgentId, "config.yaml");
      if (!(await fileExists(agentCfg))) {
        log(`[migrations] bridge.${platform}.agentId "${targetAgentId}" not found, using fallback`);
        targetAgentId = null;
      }
    }
    if (!targetAgentId) targetAgentId = fallbackAgentId;
    if (!targetAgentId) {
      log(`[migrations] no agent available for bridge.${platform}, skipping`);
      continue;
    }

    if (!agentConfigs.has(targetAgentId)) agentConfigs.set(targetAgentId, {});
    const ac = agentConfigs.get(targetAgentId);

    // Clean config: strip agentId field (now implicit by location)
    const cleanCfg = { ...cfg };
    delete cleanCfg.agentId;

    // Resolve owner: composite key "platform:agentId" > legacy "platform"
    const compositeKey = `${platform}:${targetAgentId}`;
    const owner = ownerDict[compositeKey] || ownerDict[platform] || null;
    if (owner) cleanCfg.owner = owner;

    ac[platform] = cleanCfg;
  }

  // Write to each agent's config.yaml
  for (const [agentId, bridgeConfig] of agentConfigs) {
    const cfgPath = path.join(agentsDir, agentId, "config.yaml");
    if (!(await fileExists(cfgPath))) {
      log(`[migrations] agent ${agentId} config.yaml not found, skipping`);
      continue;
    }
    writeYAMLSafe(cfgPath, { bridge: { ...bridgeConfig } });
    log(`[migrations] migrated bridge config → agent ${agentId} (${Object.keys(bridgeConfig).join(", ")})`);
  }

  // 清理旧的 platform / owner 键，只保留新的全局偏好键
  const nextBridgePrefs = {};
  if (readOnly) nextBridgePrefs.readOnly = true;
  if (receiptEnabled === false) nextBridgePrefs.receiptEnabled = false;
  if (Object.keys(nextBridgePrefs).length > 0) preferences.bridge = nextBridgePrefs;
  else delete preferences.bridge;
  prefs.savePreferences(preferences);
  log(`[migrations] migrated prefs.bridge platform config to agents`);
}
