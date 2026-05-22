/**
 * #20 — 修复已运行过 #16 或新版本投影留下的非法 Pi input 模态
 *
 * Pi SDK models.json 的 input 是外部契约，只允许 text/image。Hana 自己的
 * video 能力必须放在 compat.hanaVideoInput，避免 ModelRegistry 因单个非法
 * 模型把整张模型表判空。
 */

import { repairModelsJsonPiInputSchema } from "./video-helpers.js";

export async function migrate(ctx) {
  const patched = await repairModelsJsonPiInputSchema(ctx);
  ctx.log?.(`[migrations] #20: Pi input schema sanitized (patched=${patched})`);
}
