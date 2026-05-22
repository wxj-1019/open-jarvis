/**
 * #16 — 视频输入能力投影的老数据修补
 *
 * 覆盖两类旧状态：
 *   1. models.json 是投影文件，老版本里已存在的已知视频模型可能只有 ["text","image"]；
 *   2. 少量手写 agent config.models.overrides 可能已经带 video，需要提升到 added-models.yaml。
 *
 * 幂等：视频能力写入 Hana compat，Pi-facing input 只保留 text/image；运行期模型对象不保留 video 字段。
 */
import fsp from "fs/promises";
import path from "path";
import YAML from "js-yaml";
import { lookupKnown } from "../../shared/known-models.js";
import { scanAgentDirs, readYAMLSafe, atomicWriteYAML, fileExists } from "./helpers.js";

export async function migrate(ctx) {
  const modelsPatched = await repairModelsJsonPiInputSchema(ctx);
  const overridesPatched = await promoteAgentVideoOverrides(ctx);
  ctx.log?.(`[migrations] #16: video capability projected (models=${modelsPatched}, overrides=${overridesPatched})`);
}

// ── models.json Pi input schema 修补 ──────────────────────────────────────────────

async function repairModelsJsonPiInputSchema(ctx) {
  const modelsJsonPath = path.join(ctx.hanakoHome, "models.json");
  let raw;
  try {
    const content = await fsp.readFile(modelsJsonPath, "utf-8");
    raw = JSON.parse(content);
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

// ── 模型记录修复逻辑 ──────────────────────────────────────────────────────────────

function repairPiModelInputRecord(providerId, record, fallbackModelId) {
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

function migrationModelHasVideoCapability(providerId, model, fallbackModelId, hadInputVideo = false) {
  if (model?.video === true) return true;
  if (model?.video === false) return false;
  if (hadInputVideo) return true;
  const known = lookupKnown(providerId, model?.id || fallbackModelId);
  return known?.video === true;
}

function migrationInputIncludes(input, modality) {
  return Array.isArray(input) && input.includes(modality);
}

function sanitizePiInputModalities(input) {
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

function ensureHanaVideoInputCompat(record) {
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

// ── Agent 视频 override 提升 ──────────────────────────────────────────────────────

async function promoteAgentVideoOverrides(ctx) {
  const { hanakoHome, agentsDir } = ctx;
  const ymlPath = path.join(hanakoHome, "added-models.yaml");
  const raw = readYAMLSafe(ymlPath, YAML);
  if (!raw?.providers || typeof raw.providers !== "object") return 0;

  const agentDirs = await scanAgentDirs(agentsDir);

  let patched = 0;
  let addedModelsChanged = false;
  for (const dir of agentDirs) {
    const cfgPath = path.join(agentsDir, dir.name, "config.yaml");
    const cfg = readYAMLSafe(cfgPath, YAML);
    if (!cfg?.models?.overrides || typeof cfg.models.overrides !== "object") continue;

    let cfgChanged = false;
    for (const [modelId, override] of Object.entries(cfg.models.overrides)) {
      if (!override || typeof override !== "object") continue;
      if (!Object.prototype.hasOwnProperty.call(override, "video")) continue;

      const promoted = promoteVideoOverrideIntoAddedModels(raw.providers, modelId, override.video);
      if (promoted) {
        delete override.video;
        patched++;
        cfgChanged = true;
        addedModelsChanged = true;
      }
    }

    if (cfgChanged) {
      for (const [modelId, override] of Object.entries(cfg.models.overrides)) {
        if (override && typeof override === "object" && Object.keys(override).length === 0) {
          delete cfg.models.overrides[modelId];
        }
      }
      if (Object.keys(cfg.models.overrides).length === 0) {
        delete cfg.models.overrides;
      }
      await atomicWriteYAML(cfgPath, cfg);
    }
  }

  if (addedModelsChanged) {
    const header =
      "# Hanako 供应商配置（全局，跨 agent 共享）\n" +
      "# 由设置页面管理\n\n";
    await atomicWriteYAML(ymlPath, raw, { header });
  }

  return patched;
}

function promoteVideoOverrideIntoAddedModels(providers, modelId, video) {
  for (const provider of Object.values(providers)) {
    if (!provider || !Array.isArray(provider.models)) continue;
    const idx = provider.models.findIndex((entry) => {
      if (typeof entry === "string") return entry === modelId;
      return entry && typeof entry === "object" && entry.id === modelId;
    });
    if (idx < 0) continue;

    const existing = typeof provider.models[idx] === "object"
      ? provider.models[idx]
      : { id: modelId };
    provider.models[idx] = { ...existing, video };
    return true;
  }
  return false;
}
