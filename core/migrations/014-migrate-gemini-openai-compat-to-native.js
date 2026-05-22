/**
 * #14 — Gemini 3 工具调用需要 native Google 协议保留 thoughtSignature
 *
 * 历史上 Gemini 通过 OpenAI-compatible 端点接入，模型前缀 "gemini-" 走兼容路径。
 * 但官方 SDK 在 tool call 场景依赖原生协议的 thoughtSignature 字段，
 * 兼容链路会丢失该信息导致工具调用失败。
 */
import path from "path";
import YAML from "js-yaml";
import { readYAMLSafe, atomicWriteYAML } from "./helpers.js";

const GEMINI_NATIVE_API = "google-generative-ai";
const GEMINI_OPENAI_COMPAT_API = "openai-completions";
const GEMINI_NATIVE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function classifyOfficialGeminiBaseUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.hostname.toLowerCase() !== "generativelanguage.googleapis.com") return null;
    const pathname = url.pathname.replace(/\/+$/, "");
    if (pathname === "/v1beta/openai") return "openai";
    if (pathname === "/v1beta") return "native";
  } catch {
    return null;
  }
  return null;
}

export async function migrate(ctx) {
  const { hanakoHome, log } = ctx;
  const ymlPath = path.join(hanakoHome, "added-models.yaml");
  const raw = readYAMLSafe(ymlPath, YAML);
  if (!raw?.providers || typeof raw.providers !== "object") {
    log?.("[migrations] #14: Gemini native API migration skipped (no providers)");
    return;
  }

  let patched = 0;
  for (const [providerId, provider] of Object.entries(raw.providers)) {
    if (!provider || typeof provider !== "object") continue;

    const baseKind = classifyOfficialGeminiBaseUrl(provider.base_url);
    const api = typeof provider.api === "string" ? provider.api : "";
    const apiIsOpenAIOrMissing = !api || api === GEMINI_OPENAI_COMPAT_API;
    const apiIsNative = api === GEMINI_NATIVE_API;
    const hasBaseUrl = typeof provider.base_url === "string" && provider.base_url.trim().length > 0;

    let changed = false;

    if (baseKind === "openai" && (apiIsOpenAIOrMissing || apiIsNative)) {
      if (provider.base_url !== GEMINI_NATIVE_BASE_URL) {
        provider.base_url = GEMINI_NATIVE_BASE_URL;
        changed = true;
      }
      if (provider.api !== GEMINI_NATIVE_API) {
        provider.api = GEMINI_NATIVE_API;
        changed = true;
      }
    } else if (baseKind === "native" && apiIsOpenAIOrMissing) {
      if (provider.base_url !== GEMINI_NATIVE_BASE_URL) {
        provider.base_url = GEMINI_NATIVE_BASE_URL;
        changed = true;
      }
      if (provider.api !== GEMINI_NATIVE_API) {
        provider.api = GEMINI_NATIVE_API;
        changed = true;
      }
    } else if (providerId === "gemini" && !hasBaseUrl && apiIsOpenAIOrMissing) {
      provider.base_url = GEMINI_NATIVE_BASE_URL;
      provider.api = GEMINI_NATIVE_API;
      changed = true;
    }

    if (changed) patched++;
  }

  if (patched > 0) {
    const header =
      "# Hanako 供应商配置（全局，跨 agent 共享）\n" +
      "# 由设置页面管理\n\n";
    await atomicWriteYAML(ymlPath, raw, { header });
    if (ctx.providerRegistry) {
      ctx.providerRegistry._addedModelsCache = null;
      ctx.providerRegistry._addedModelsMtime = 0;
    }
  }

  log?.(`[migrations] #14: Gemini OpenAI compatibility configs migrated to native API (${patched})`);
}
