/**
 * #23 — 删除本轮开发期间加入但已废弃的自由文本回复范围设置
 */

import fsp from "fs/promises";
import path from "path";
import { removeFrontmatterKeys, fileExists } from "./helpers.js";

/**
 * 从 Markdown 文件 frontmatter 中移除指定 key，并原子写回
 * @returns {Promise<boolean>} 是否实际修改
 */
async function patchFile(filePath, keys) {
  const raw = await fsp.readFile(filePath, "utf-8");
  const next = removeFrontmatterKeys(raw, keys);
  if (next === raw) return false;
  const tmp = `${filePath}.tmp`;
  await fsp.writeFile(tmp, next, "utf-8");
  await fsp.rename(tmp, filePath);
  return true;
}

export async function migrate(ctx) {
  const { hanakoHome, agentsDir, log } = ctx;
  let channelPatched = 0;
  let projectionPatched = 0;

  // ── 1. 频道配置：移除 agentPhoneReplyInstructions ──
  const channelsDir = path.join(hanakoHome, "channels");
  if (await fileExists(channelsDir)) {
    const entries = await fsp.readdir(channelsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      if (await patchFile(path.join(channelsDir, entry.name), new Set(["agentPhoneReplyInstructions"]))) {
        channelPatched++;
      }
    }
  }

  // ── 2. Agent 电话投影：移除 replyInstructions ──
  if (await fileExists(agentsDir)) {
    const agentEntries = await fsp.readdir(agentsDir, { withFileTypes: true });
    for (const agentEntry of agentEntries) {
      if (!agentEntry.isDirectory()) continue;
      const conversationsDir = path.join(agentsDir, agentEntry.name, "phone", "conversations");
      if (!(await fileExists(conversationsDir))) continue;
      const entries = await fsp.readdir(conversationsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
        if (await patchFile(path.join(conversationsDir, entry.name), new Set(["replyInstructions"]))) {
          projectionPatched++;
        }
      }
    }
  }

  log?.(`[migrations] #23: deprecated reply-scope settings removed (channels=${channelPatched}, projections=${projectionPatched})`);
}
