/**
 * #3 — workspace 迁移 + 非主 agent 巡检默认关闭
 *
 * 两件事：
 * 1. home_folder 从全局 preferences 迁移到主 agent 的 config.yaml
 * 2. 非主 agent 的 heartbeat_enabled 设为 false（老用户预期只有主 agent 巡检）
 */
import path from "path";
import YAML from "js-yaml";
import {
  fileExists,
  findAgentWithConfig,
  readYAMLSafe,
  scanAgentDirs,
  writeYAMLSafe,
} from "./helpers.js";

export async function migrate(ctx) {
  const { agentsDir, prefs, log } = ctx;
  const preferences = prefs.getPreferences();
  const homeFolder = preferences.home_folder;
  const primaryAgentId = preferences.primaryAgent || null;

  // ── 1. 找到主 agent ──

  let targetAgentId = null;

  if (primaryAgentId) {
    const cfgPath = path.join(agentsDir, primaryAgentId, "config.yaml");
    if (await fileExists(cfgPath)) {
      targetAgentId = primaryAgentId;
    } else {
      log(`[migrations] #3: primaryAgent "${primaryAgentId}" config.yaml not found, scanning`);
    }
  }

  if (!targetAgentId) {
    targetAgentId = await findAgentWithConfig(agentsDir);
  }

  // ── 2. 迁移 home_folder ──

  if (homeFolder) {
    if (!targetAgentId) {
      throw new Error("no agent with config.yaml found, home_folder preserved in preferences");
    }

    const cfgPath = path.join(agentsDir, targetAgentId, "config.yaml");
    writeYAMLSafe(cfgPath, { desk: { home_folder: homeFolder } });

    // Verify write
    const verify = readYAMLSafe(cfgPath, YAML);
    if (verify?.desk?.home_folder !== homeFolder) {
      throw new Error(`write verification failed for agent ${targetAgentId}, home_folder preserved in preferences`);
    }

    delete preferences.home_folder;
    prefs.savePreferences(preferences);
    log(`[migrations] #3: migrated home_folder "${homeFolder}" → agent ${targetAgentId}`);
  }

  // ── 3. 非主 agent 的巡检默认关闭 ──

  try {
    const dirs = await scanAgentDirs(agentsDir);
    for (const d of dirs) {
      if (d.name === targetAgentId) continue; // 主 agent 保持原状
      const cfgPath = path.join(agentsDir, d.name, "config.yaml");
      if (!(await fileExists(cfgPath))) continue;

      const config = readYAMLSafe(cfgPath, YAML);
      if (!config) continue;
      // 只在未显式设置过时关闭（如果用户已经手动设了，尊重他的选择）
      if (config.desk?.heartbeat_enabled !== undefined) continue;

      writeYAMLSafe(cfgPath, { desk: { heartbeat_enabled: false } });
      log(`[migrations] #3: disabled heartbeat for non-primary agent "${d.name}"`);
    }
  } catch (err) {
    log(`[migrations] #3: warning — failed to disable non-primary heartbeats: ${err.message}`);
  }
}
