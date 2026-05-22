/**
 * #26 — Space → Studio：把已落过盘的 spaces.json 迁出为 studios.json
 */

import { ensureLocalIdentityRegistries } from "../server-identity.js";

export async function migrate(ctx) {
  const { hanakoHome, log } = ctx;
  const { created, migratedFromLegacySpaces } = ensureLocalIdentityRegistries(hanakoHome);
  log?.(`[migrations] #26: studio identity registries ready${created.length ? ` (created=${created.join(",")})` : ""}`);
  if (migratedFromLegacySpaces) log?.("[migrations] #26: legacy spaces.json mapped to studios.json");
}
