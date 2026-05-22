/**
 * #22 — 频道 phone 设置显式化：主动提醒默认 31 分钟，模型覆写默认关闭
 */

import fsp from "fs/promises";
import path from "path";
import { parseFrontmatter, formatFrontmatter, frontmatterKeyOrder } from "./helpers.js";

/**
 * 修补频道的 phone 设置 frontmatter 默认值
 * @returns {string} 修改后的内容，未修改返回原值
 */
function patchChannelPhoneSettingsFrontmatter(raw) {
  const parsed = parseFrontmatter(raw);
  if (!parsed) return raw;

  const { frontmatter: meta, fmLines, bodyLines } = parsed;
  let changed = false;
  const setKey = (key, value) => {
    const str = String(value);
    if (meta.get(key) === str) return;
    meta.set(key, str);
    changed = true;
  };

  const interval = Number(meta.get("agentPhoneReminderIntervalMinutes"));
  if (!Number.isFinite(interval) || interval <= 0) {
    setKey("agentPhoneReminderIntervalMinutes", "31");
  }
  if (!["true", "false"].includes(meta.get("agentPhoneProactiveEnabled"))) {
    setKey("agentPhoneProactiveEnabled", "true");
  }

  const overrideEnabled = meta.get("agentPhoneModelOverrideEnabled") === "true";
  const overrideId = meta.get("agentPhoneModelOverrideId") || "";
  const overrideProvider = meta.get("agentPhoneModelOverrideProvider") || "";
  if (!meta.has("agentPhoneModelOverrideEnabled")) {
    setKey("agentPhoneModelOverrideEnabled", "false");
  }
  if (overrideEnabled && (!overrideId || !overrideProvider)) {
    setKey("agentPhoneModelOverrideEnabled", "false");
    setKey("agentPhoneModelOverrideId", "");
    setKey("agentPhoneModelOverrideProvider", "");
  }

  if (!changed) return raw;

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
    log?.("[migrations] #22: no channels dir");
    return;
  }

  let patched = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const filePath = path.join(channelsDir, entry.name);
    const raw = await fsp.readFile(filePath, "utf-8");
    const next = patchChannelPhoneSettingsFrontmatter(raw);
    if (next === raw) continue;
    const tmp = `${filePath}.tmp`;
    await fsp.writeFile(tmp, next, "utf-8");
    await fsp.rename(tmp, filePath);
    patched++;
  }

  log?.(`[migrations] #22: channel phone settings defaults patched (${patched})`);
}
