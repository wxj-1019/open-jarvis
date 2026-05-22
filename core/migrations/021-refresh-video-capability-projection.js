/**
 * #21 — 视频传输能力抽象落地后的投影刷新
 *
 * 这次变更把"模型会看视频"与"provider 协议能直传视频"拆开。新增的已知
 * 视频模型仍复用 compat.hanaVideoInput 表示语义能力，传输能力由运行时根据
 * provider/api/baseUrl 推导。老用户已存在的 models.json 需要重跑一次投影修补，
 * 否则新增的 Kimi 等模型不会拿到 Hana 视频能力字段。
 */

import { repairModelsJsonPiInputSchema } from "./video-helpers.js";

export async function migrate(ctx) {
  const patched = await repairModelsJsonPiInputSchema(ctx);
  ctx.log?.(`[migrations] #21: video capability projection refreshed (patched=${patched})`);
}
