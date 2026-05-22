/**
 * #19 — API-key provider 凭证真相源迁移：auth.json → added-models.yaml
 */

import { migrateLegacyApiKeyAuthToProviders } from "../provider-auth-migration.js";

export async function migrate(ctx) {
  const result = migrateLegacyApiKeyAuthToProviders(ctx);
  ctx.log?.(`[migrations] #19: legacy API-key auth migrated (${result.providers.join(", ") || "none"})`);
}
