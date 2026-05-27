import clipboardy from "clipboardy";
const { readSync } = clipboardy;
import { ContentAdapter } from "./base-adapter.js";

/**
 * 剪贴板适配器 — 通用回退适配器
 * 读取系统剪贴板文本内容
 */
export class ClipboardAdapter extends ContentAdapter {
  static supports(_app, _title) {
    return true; // 通用回退，始终支持
  }

  static async extract(_app, _title) {
    try {
      const text = readSync();
      return {
        type: "clipboard",
        content: text && text.trim() ? text.trim() : null,
        metadata: {},
      };
    } catch {
      return { type: "clipboard", content: null, metadata: {} };
    }
  }
}
