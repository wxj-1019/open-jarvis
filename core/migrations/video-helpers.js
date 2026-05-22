/**
 * Video capability projection helpers — shared by migrations #16, #20, #21
 *
 * Pi SDK models.json input 是外部契约，只允许 text/image。Hana 自己的
 * video 能力必须放在 compat.hanaVideoInput，避免 ModelRegistry 因单个非法
 * 模型把整张模型表判空。
 */

import fsp from "fs/promises";
import path from "path";
import { lookupKnown } from "../../shared/known-models.js";

/**
 * 异步修复 models.json 中的 Pi input schema，确保：
 *   1. input 数组只包含 text/image
 *   2. 视频能力写入 compat.hanaVideoInput
 *   3. 移除运行时 video 字段
 *
 * @returns {Promise<number>} 修复的模型数
 */
export async function repairModelsJsonPiInputSchema(ctx) {
  const modelsJsonPath = path.join(ctx.hanakoHome, "models.json");
  let raw;
  try {
    raw = JSON.parse(await fsp.readFile(modelsJsonPath, "utf-8"));
  } catch {
    return 0;
  }
  if (!raw?.providers || typeof raw.providers !== "object") return 0;

  let patched = 0;
  for (const [providerId, provider] of Object.entries(raw.providers)) {
    if (!provider || typeof provider !== "object") continue;
    if (Array.isArray(provider.models)) {
      for (const model of provider.models) {
        patched += repairPiModelInputRecord(providerId, model, model?.id);
      }
    }
    if (provider.modelOverrides && typeof provider.modelOverrides === "object" && !Array.isArray(provider.modelOverrides)) {
      for (const [modelId, override] of Object.entries(provider.modelOverrides)) {
        patched += repairPiModelInputRecord(providerId, override, modelId);
      }
    }
  }

  if (patched > 0) {
    const tmp = modelsJsonPath + ".tmp";
    await fsp.writeFile(tmp, JSON.stringify(raw, null, 4) + "\n", "utf-8");
    await fsp.rename(tmp, modelsJsonPath);
  }
  return patched;
}

/**
 * 修复单个模型的 Pi input 记录
 * @returns {number} 修复次数（0 或更多）
 */
export function repairPiModelInputRecord(providerId, record, fallbackModelId) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return 0;

  let patched = 0;
  const hadRuntimeVideoField = Object.prototype.hasOwnProperty.call(record, "video");
  const hadInputVideo = migrationInputIncludes(record.input, "video");
  const shouldEnableVideo = migrationModelHasVideoCapability(providerId, record, fallbackModelId, hadInputVideo);
  const sanitizedInput = sanitizePiInputModalities(record.input);
  if (sanitizedInput.changed) {
    record.input = sanitizedInput.input;
    patched++;
  }
  if (shouldEnableVideo && ensureHanaVideoInputCompat(record)) patched++;
  if (hadRuntimeVideoField) {
    delete record.video;
    patched++;
  }
  return patched;
}

/**
 * 判断模型是否有视频能力
 */
export function migrationModelHasVideoCapability(providerId, model, fallbackModelId, hadInputVideo = false) {
  if (model?.video === true) return true;
  if (model?.video === false) return false;
  if (hadInputVideo) return true;
  const known = lookupKnown(providerId, model?.id || fallbackModelId);
  return known?.video === true;
}

/**
 * 检查 input 数组是否包含指定模态
 */
export function migrationInputIncludes(input, modality) {
  return Array.isArray(input) && input.includes(modality);
}

/**
 * 清理 Pi input 模态，只允许 text/image
 */
export function sanitizePiInputModalities(input) {
  if (input === undefined) return { input, changed: false };

  const source = Array.isArray(input) ? input : [];
  const next = ["text"];
  if (source.includes("image")) next.push("image");

  return {
    input: next,
    changed: !Array.isArray(input)
      || input.length !== next.length
      || input.some((item, index) => item !== next[index]),
  };
}

/**
 * 确保 compat.hanaVideoInput 为 true
 */
export function ensureHanaVideoInputCompat(record) {
  const compat = record.compat && typeof record.compat === "object" && !Array.isArray(record.compat)
    ? record.compat
    : {};
  if (compat.hanaVideoInput === true && record.compat === compat) return false;
  record.compat = {
    ...compat,
    hanaVideoInput: true,
  };
  return true;
}
