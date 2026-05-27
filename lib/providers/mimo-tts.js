/**
 * Xiaomi MiMo TTS provider plugin
 *
 * 用于语音合成（TTS）服务
 * 支持模型：
 *   - mimo-v2.5-tts (推荐)
 *   - mimo-v2-tts
 *   - mimo-v2.5-tts-voicedesign
 *   - mimo-v2.5-tts-voiceclone
 *
 * 文档：https://dev.mi.com/mimo-open-platform
 */

/** @type {import('../../core/provider-registry.js').ProviderPlugin} */
export const mimoTtsPlugin = {
  id: "mimo-tts",
  displayName: "Xiaomi MiMo TTS",
  authType: "api-key",
  defaultBaseUrl: "https://api.xiaomimimo.com/v1",
  defaultApi: "mimo-tts",
  capabilities: {
    media: {
      tts: {
        defaultModelId: "mimo-v2.5-tts",
        models: [
          {
            id: "mimo-v2.5-tts",
            displayName: "MiMo V2.5 TTS",
            protocolId: "mimo-tts",
            inputs: ["text"],
            outputs: ["audio"],
            description: "MiMo V2.5 文本转语音模型（推荐）",
          },
          {
            id: "mimo-v2-tts",
            displayName: "MiMo V2 TTS",
            protocolId: "mimo-tts",
            inputs: ["text"],
            outputs: ["audio"],
            description: "MiMo V2 文本转语音模型",
          },
          {
            id: "mimo-v2.5-tts-voicedesign",
            displayName: "MiMo V2.5 TTS Voice Design",
            protocolId: "mimo-tts",
            inputs: ["text"],
            outputs: ["audio"],
            description: "MiMo V2.5 自定义音色设计",
          },
          {
            id: "mimo-v2.5-tts-voiceclone",
            displayName: "MiMo V2.5 TTS Voice Clone",
            protocolId: "mimo-tts",
            inputs: ["text"],
            outputs: ["audio"],
            description: "MiMo V2.5 声音克隆",
          },
        ],
      },
    },
  },
};
