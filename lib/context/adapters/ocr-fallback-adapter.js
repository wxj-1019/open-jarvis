import { createModuleLogger } from "../../debug-log.js";

const log = createModuleLogger("ocr-fallback");

/**
 * @typedef {object} OcrResult
 * @property {string} text
 * @property {number} confidence  0-100
 * @property {string} source  "ocr"
 * @property {number} timestamp
 */

export class OcrFallbackAdapter {
  constructor() {
    this._tesseract = null;
    this._initialized = false;
  }

  /**
   * 从屏幕截图提取文本
   * @param {object} windowInfo
   * @param {string} windowInfo.app
   * @param {string} windowInfo.title
   * @param {object} [options]
   * @param {Buffer} [options.imageBuffer]  截图数据（如不提供则返回空）
   * @returns {Promise<OcrResult>}
   */
  async extract(windowInfo, options = {}) {
    if (!options.imageBuffer) {
      return {
        text: "",
        confidence: 0,
        source: "ocr",
        timestamp: Date.now(),
      };
    }

    try {
      const tesseract = await this._getTesseract();
      const result = await tesseract.recognize(options.imageBuffer);

      const text = result.data.text?.trim() ?? "";
      const confidence = result.data.confidence ?? 0;

      log.log("OCR extracted", {
        app: windowInfo.app,
        textLength: text.length,
        confidence,
      });

      return {
        text,
        confidence,
        source: "ocr",
        timestamp: Date.now(),
      };
    } catch (err) {
      log.error(`OCR failed: ${err.message}`);
      return {
        text: "",
        confidence: 0,
        source: "ocr",
        timestamp: Date.now(),
        error: err.message,
      };
    }
  }

  /**
   * 懒加载 Tesseract
   * @private
   */
  async _getTesseract() {
    if (this._tesseract) return this._tesseract;

    try {
      // 动态导入，避免启动时加载大依赖
      const { createWorker } = await import("tesseract.js");
      this._tesseract = await createWorker("eng+chi_sim");
      this._initialized = true;
      log.log("Tesseract initialized");
    } catch (err) {
      log.error(`Failed to initialize Tesseract: ${err.message}`);
      // 返回 mock 实现
      this._tesseract = {
        recognize: async () => ({ data: { text: "", confidence: 0 } }),
      };
    }

    return this._tesseract;
  }

  /**
   * 终止 OCR worker
   */
  async terminate() {
    if (this._tesseract && this._initialized) {
      try {
        await this._tesseract.terminate();
      } catch (err) {
        log.error(`Failed to terminate Tesseract: ${err.message}`);
      }
      this._tesseract = null;
      this._initialized = false;
    }
  }
}
