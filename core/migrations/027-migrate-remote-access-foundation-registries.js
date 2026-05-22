/**
 * #27 — 远程访问 UI 前地基：补齐设备、网络和挂载空 registry
 */

import { ensureRemoteAccessFoundationRegistries } from "../server-identity.js";

export async function migrate(ctx) {
  const { hanakoHome, log } = ctx;
  const { created } = ensureRemoteAccessFoundationRegistries(hanakoHome);
  log?.(`[migrations] #27: remote access foundation registries ready${created.length ? ` (created=${created.join(",")})` : ""}`);
}
