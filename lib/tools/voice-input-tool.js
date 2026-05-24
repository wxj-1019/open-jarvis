/**
 * voice-input-tool.js — voice_input Agent 工具
 *
 * 让 Agent 能主动开始语音监听，获取用户语音输入。
 * 通过 onListen 回调触发监听，由 Engine 层协调渲染进程的 STT。
 */

import { Type } from "../pi-sdk/index.js";

/**
 * @param {{ onListen: (opts: {lang?: string, timeout?: number}) => Promise<string> }} deps
 */
export function createVoiceInputTool({ onListen }) {
  return {
    name: "voice_input",
    label: "Voice Input",
    description:
      "Start listening for voice input from the user and return the recognized text. " +
      "Use this when the user wants to speak instead of type, or when you want to prompt the user for a voice response. " +
      "The tool will listen until the user stops speaking or the timeout is reached.",
    parameters: Type.Object({
      lang: Type.Optional(Type.String({
        description: "Language code for speech recognition, e.g. 'zh-CN' or 'en-US'. Defaults to 'zh-CN'.",
      })),
      timeout: Type.Optional(Type.Number({
        description: "Maximum listening time in milliseconds. Default is 10000 (10 seconds). Set to 0 for no timeout.",
      })),
    }),

    execute: async (_toolCallId, params) => {
      if (!onListen) {
        return {
          content: [{ type: "text", text: "Error: voice_input tool not initialized." }],
        };
      }

      try {
        const text = await onListen({
          lang: params.lang || "zh-CN",
          timeout: params.timeout ?? 10000,
        });

        if (!text || !text.trim()) {
          return {
            content: [{ type: "text", text: "No speech was recognized." }],
          };
        }

        return {
          content: [{ type: "text", text: `Recognized: "${text}"` }],
          details: { recognizedText: text },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Voice input failed: ${err.message}` }],
        };
      }
    },
  };
}
