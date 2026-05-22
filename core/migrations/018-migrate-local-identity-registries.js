/**
 * #18 — Studio 基础身份：为旧 HANA_HOME 补齐 server / legacy owner / default Studio registry
 */

import { ensureLocalIdentityRegistries } from "../server-identity.js";

export async function migrate(ctx) {
  const { hanakoHome, log } = ctx;
  const { created, migratedFromLegacySpaces } = ensureLocalIdentityRegistries(hanakoHome);
  log?.(`[migrations] #18: local identity registries ready${created.length ? ` (created=${created.join(",")})` : ""}`);
  if (migratedFromLegacySpaces) log?.("[migrations] #18: legacy spaces.json mapped to studios.json");
}
