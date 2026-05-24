/**
 * speak-tool.js — speak Agent 工具
 *
 * 让 Agent 能通过 TTS 向用户语音输出。
 * 通过 onSpeak 回调触发播放，由 Engine 层转发到渲染进程。
 */

import { Type } from "../pi-sdk/index.js";

/**
 * @param {{ onSpeak: (opts: {text: string, voice?: string, lang?: string, rate?: number, pitch?: number}) => Promise<void>|void }} deps
 */
export function createSpeakTool({ onSpeak }) {
  return {
    name: "speak",
    label: "Speak",
    description:
      "Speak text aloud to the user via text-to-speech. " +
      "Use this when the user asks you to say something out loud, or when you want to provide an audible response. " +
      "Keep spoken text concise and natural — like a real conversation.",
    parameters: Type.Object({
      text: Type.String({
        description:
          "The text to speak. Should be natural, conversational, and concise. " +
          "Avoid long paragraphs — break into multiple speak calls for longer content.",
      }),
      voice: Type.Optional(Type.String({
        description: "Preferred voice name. Use one returned by list_voices. Omit to use the default voice.",
      })),
      lang: Type.Optional(Type.String({
        description: "Language code for speech, e.g. 'zh-CN' or 'en-US'. Defaults to the user's preferred language.",
      })),
      rate: Type.Optional(Type.Number({
        description: "Speech rate multiplier (0.1-10, default 1.0).",
      })),
      pitch: Type.Optional(Type.Number({
        description: "Speech pitch (0-2, default 1.0).",
      })),
    }),

    execute: async (_toolCallId, params) => {
      const text = String(params.text || "").trim();
      if (!text) {
        return {
          content: [{ type: "text", text: "Error: text is required for speak." }],
        };
      }

      try {
        await onSpeak?.({
          text,
          voice: params.voice,
          lang: params.lang,
          rate: params.rate,
          pitch: params.pitch,
        });

        return {
          content: [{ type: "text", text: `Spoke: "${text.length > 80 ? text.slice(0, 80) + "..." : text}"` }],
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Speak failed: ${err.message}` }],
        };
      }
    },
  };
}
