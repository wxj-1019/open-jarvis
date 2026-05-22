/**
 * 迁移 runner — 异步版本
 *
 * preferences.json._dataVersion 记录已执行到的版本号（整数），
 * 启动时只跑 > _dataVersion 的条目。
 *
 * 添加新迁移：在 migrations 对象末尾加一条，key 为递增整数。
 */

import { createModuleLogger } from "../../lib/debug-log.js";
import { migrate as _001 } from "./001-clean-dangling-provider-refs.js";
import { migrate as _002 } from "./002-migrate-bridge-to-per-agent.js";
import { migrate as _003 } from "./003-migrate-workspace-to-per-agent.js";
import { migrate as _004 } from "./004-migrate-subagent-executor-metadata.js";
import { migrate as _005 } from "./005-migrate-model-refs-to-composite-key.js";
import { migrate as _006 } from "./006-migrate-channels-to-global-default-off.js";
import { migrate as _007 } from "./007-migrate-vision-to-image.js";
import { migrate as _008 } from "./008-repair-post-migration-model-refs.js";
import { migrate as _009 } from "./009-migrate-bridge-readonly-to-global.js";
import { migrate as _010 } from "./010-cleanup-summarizer-compiler-remnants.js";
import { migrate as _011 } from "./011-repair-cron-job-model-refs.js";
import { migrate as _012 } from "./012-backfill-legacy-session-files.js";
import { migrate as _013 } from "./013-normalize-recent-legacy-compatibility-state.js";
import { migrate as _014 } from "./014-migrate-gemini-openai-compat-to-native.js";
import { migrate as _015 } from "./015-repair-legacy-session-sidecar-thinking-levels.js";
import { migrate as _016 } from "./016-migrate-video-capability-projection.js";
import { migrate as _017 } from "./017-migrate-bridge-session-keys-to-agent-scoped.js";
import { migrate as _018 } from "./018-migrate-local-identity-registries.js";
import { migrate as _019 } from "./019-migrate-legacy-apikey-auth-to-providers.js";
import { migrate as _020 } from "./020-migrate-pi-input-schema-video-compat.js";
import { migrate as _021 } from "./021-refresh-video-capability-projection.js";
import { migrate as _022 } from "./022-migrate-channel-phone-settings-defaults.js";
import { migrate as _023 } from "./023-remove-agent-phone-reply-instructions.js";
import { migrate as _024 } from "./024-migrate-channel-phone-guard-limit-defaults.js";
import { migrate as _025 } from "./025-migrate-channel-phone-proactive-defaults.js";
import { migrate as _026 } from "./026-migrate-studio-identity-registries.js";
import { migrate as _027 } from "./027-migrate-remote-access-foundation-registries.js";
import { migrate as _028 } from "./028-migrate-durable-subagent-run-registry.js";
import { migrate as _029 } from "./029-migrate-heartbeat-default-explicit-off.js";

const moduleLog = createModuleLogger("migrations");

// ── 迁移表 ──────────────────────────────────────────────────────────────────

const migrations = {
  1: _001,
  2: _002,
  3: _003,
  4: _004,
  5: _005,
  6: _006,
  7: _007,
  8: _008,
  9: _009,
  10: _010,
  11: _011,
  12: _012,
  13: _013,
  14: _014,
  15: _015,
  16: _016,
  17: _017,
  18: _018,
  19: _019,
  20: _020,
  21: _021,
  22: _022,
  23: _023,
  24: _024,
  25: _025,
  26: _026,
  27: _027,
  28: _028,
  29: _029,
};

// ── Runner ──────────────────────────────────────────────────────────────────

/**
 * @param {object} ctx
 * @param {string}   ctx.hanakoHome
 * @param {string}   ctx.agentsDir
 * @param {import('../../preferences-manager.js').PreferencesManager} ctx.prefs
 * @param {import('../../provider-registry.js').ProviderRegistry}     ctx.providerRegistry
 * @param {Function} ctx.log
 */
export async function runMigrations(ctx) {
  const { prefs, log } = ctx;
  const preferences = prefs.getPreferences();
  const currentVersion = preferences._dataVersion || 0;

  const pending = Object.keys(migrations)
    .map(Number)
    .filter(v => v > currentVersion)
    .sort((a, b) => a - b);

  if (!pending.length) return;

  log(`[migrations] _dataVersion=${currentVersion}，待执行 ${pending.length} 条迁移`);

  for (const v of pending) {
    try {
      await migrations[v](ctx);
      log(`[migrations] #${v} 完成`);
    } catch (err) {
      moduleLog.error(`#${v} 失败: ${err.message}`);
      // 失败则停在当前版本，不继续后续迁移
      break;
    }
    // 每跑完一条就持久化版本号，防止中途崩溃导致重跑已成功的迁移
    const fresh = prefs.getPreferences();
    fresh._dataVersion = v;
    prefs.savePreferences(fresh);
  }
}
