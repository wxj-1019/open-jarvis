/**
 * #11 — cron job 的 model 字段迁移为复合键对象
 *
 * v0.11x 的模型复合键重构要求运行期模型引用必须带 provider，但 cron 任务
 * 仍把 UI 选择的模型保存为裸 id，导致后台执行时偶发 "找不到模型"。
 */
import path from "path";
import {
  scanAgentDirs,
  fileExists,
  readJSON,
  atomicWriteJSON,
  buildModelProviderIndex,
  normalizeCronModelRefForMigration,
} from "./helpers.js";

export async function migrate(ctx) {
  const { agentsDir, providerRegistry, log } = ctx;
  const index = buildModelProviderIndex(providerRegistry);

  const agentDirs = await scanAgentDirs(agentsDir);

  let patched = 0;
  for (const dir of agentDirs) {
    const jobsPath = path.join(agentsDir, dir.name, "desk", "cron-jobs.json");
    if (!(await fileExists(jobsPath))) continue;

    const data = await readJSON(jobsPath);
    if (!data || !Array.isArray(data.jobs)) continue;

    let changed = false;
    for (const job of data.jobs) {
      const { value, changed: modelChanged } = normalizeCronModelRefForMigration(job.model, index);
      if (!modelChanged) continue;
      job.model = value;
      changed = true;
      patched++;
    }

    if (changed) {
      await atomicWriteJSON(jobsPath, data);
      log(`[migrations] #11 ${dir.name}: repaired cron model refs`);
    }
  }

  log(`[migrations] #11: cron model refs repaired (${patched})`);
}
