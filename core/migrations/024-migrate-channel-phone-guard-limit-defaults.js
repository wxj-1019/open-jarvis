/**
 * #24 — 频道 phone 轮次 guard limit 显式化，默认按成员数 × 12
 */

import fsp from "fs/promises";
import path from "path";
import { parseFrontmatter, formatFrontmatter, frontmatterKeyOrder, parseFrontmatterMemberCount } from "./helpers.js";

/**
 * 修补频道的 guard limit frontmatter，若缺失或不合法则按成员数 × 12 设置
 * @returns {string} 修改后的内容，未修改返回原值
 */
function patchChannelGuardLimitFrontmatter(raw) {
  const parsed = parseFrontmatter(raw);
  if (!parsed) return raw;

  const { frontmatter: meta, fmLines, bodyLines } = parsed;

  const current = Number(meta.get("agentPhoneGuardLimit"));
  if (Number.isFinite(current) && current > 0) return raw;

  const memberCount = parseFrontmatterMemberCount(meta.get("members"));
  meta.set("agentPhoneGuardLimit", String(memberCount * 12));

  const order = frontmatterKeyOrder(fmLines);
  return formatFrontmatter(meta, order, bodyLines);
}

export async function migrate(ctx) {
  const { hanakoHome, log } = ctx;
  const channelsDir = path.join(hanakoHome, "channels");

  let entries;
  try {
    entries = await fsp.readdir(channelsDir, { withFileTypes: true });
  } catch {
    log?.("[migrations] #24: no channels dir");
    return;
  }

  let patched = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(channelsDir, entry.name);
    const raw = await fsp.readFile(filePath, "utf-8");
    const next = patchChannelGuardLimitFrontmatter(raw);
    if (next === raw) continue;
    const tmp = `${filePath}.tmp`;
    await fsp.writeFile(tmp, next, "utf-8");
    await fsp.rename(tmp, filePath);
    patched++;
  }

  log?.(`[migrations] #24: channel phone guard limits patched (${patched})`);
}
