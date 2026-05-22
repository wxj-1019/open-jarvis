/**
 * #29 — 巡检默认显式关闭
 *
 * 旧配置里缺失 desk.heartbeat_enabled 时，运行时代码曾把它当成开启。
 * 现在产品默认是 opt-in：只有明确写 true 才启动巡检。
 * 迁移只补缺省 false，尊重用户已有 true / false。
 */

import path from "path";
import YAML from "js-yaml";
import { scanAgentDirs, readYAMLSafe, writeYAMLSafe, fileExists } from "./helpers.js";

export async function migrate(ctx) {
  const { agentsDir, log } = ctx;
  const dirs = await scanAgentDirs(agentsDir);

  for (const dir of dirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    if (!(await fileExists(cfgPath))) continue;
    const config = readYAMLSafe(cfgPath, YAML);
    if (!config) continue;
    if (config.desk?.heartbeat_enabled !== undefined) continue;
    writeYAMLSafe(cfgPath, { desk: { heartbeat_enabled: false } });
    log(`[migrations] #29: heartbeat defaulted to false for "${dir.name}"`);
  }
}
