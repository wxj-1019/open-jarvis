/**
 * #7 — 模型能力字段 vision → image 全量重命名
 *
 * 历史包袱：项目早期在 Pi SDK Model 对象上挂了一份自定义的 vision:boolean 字段，
 * 与 Pi SDK 标准字段 input 数组重复。本次统一到 Pi SDK 标准，
 * 把用户意图层（added-models.yaml + agent config.yaml）的 vision 重命名为 image，
 * 运行时层只保留 input 数组。
 *
 * 覆盖位置：
 *   1. ~/.hanako/added-models.yaml 的 providers.*.models[] 数组（用户主战场）
 *   2. ~/.hanako/agents/*\/config.yaml 的 models.overrides（历史残留兜底）
 *
 * 幂等：只在发现 vision 字段时改写；image 已存在时保留不覆盖。
 * 配合读时兼容（model-sync.js、provider-registry.js）形成双保险。
 */
import path from "path";
import YAML from "js-yaml";
import {
  atomicWriteYAML,
  readYAMLSafe,
  scanAgentDirs,
} from "./helpers.js";

export async function migrate(ctx) {
  const { hanakoHome, agentsDir, log } = ctx;
  let ymlCount = 0;
  let overrideCount = 0;

  // ── 1. added-models.yaml ──
  const ymlPath = path.join(hanakoHome, "added-models.yaml");
  const raw = readYAMLSafe(ymlPath, YAML);
  if (raw?.providers && typeof raw.providers === "object") {
    let changed = false;
    for (const prov of Object.values(raw.providers)) {
      if (!prov || !Array.isArray(prov.models)) continue;
      for (const m of prov.models) {
        if (!m || typeof m !== "object") continue;
        if (!Object.prototype.hasOwnProperty.call(m, "vision")) continue;
        if (m.image === undefined) m.image = m.vision;
        delete m.vision;
        changed = true;
        ymlCount++;
      }
    }
    if (changed) {
      const header =
        "# Hanako 供应商配置（全局，跨 agent 共享）\n" +
        "# 由设置页面管理\n\n";
      await atomicWriteYAML(ymlPath, raw, { header });
    }
  }

  // ── 2. agent/*/config.yaml 的 models.overrides（兜底残留）──
  const dirs = await scanAgentDirs(agentsDir);

  for (const dir of dirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const cfg = readYAMLSafe(cfgPath, YAML);
    if (!cfg?.models?.overrides || typeof cfg.models.overrides !== "object") continue;

    let changed = false;
    for (const ov of Object.values(cfg.models.overrides)) {
      if (!ov || typeof ov !== "object") continue;
      if (!Object.prototype.hasOwnProperty.call(ov, "vision")) continue;
      if (ov.image === undefined) ov.image = ov.vision;
      delete ov.vision;
      changed = true;
      overrideCount++;
    }
    if (changed) {
      await atomicWriteYAML(cfgPath, cfg);
    }
  }

  log(`[migrations] #7: vision→image renamed (added-models.yaml=${ymlCount}, agent overrides=${overrideCount})`);
}
