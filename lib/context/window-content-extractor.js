import { createModuleLogger } from "../debug-log.js";
import { ContentQualityAssessor } from "./content-quality-assessor.js";

const log = createModuleLogger("window-content-extractor");

/**
 * WindowContentExtractor - unified extraction interface
 * Coordinates a11y + OCR dual-channel with quality assessment
 */
export class WindowContentExtractor {
  constructor({ platform, adapters }) {
    this._platform = platform;
    this._adapters = adapters || {};
    this._assessor = new ContentQualityAssessor();
    this._ocrAdapter = null;
  }

  async extract({ app, title }) {
    const a11yResult = await this._extractA11y({ app, title });
    const a11yText = a11yResult.elements.map((e) => e.text || "").join(" ").trim();
    const assessment = this._assessor.assess(a11yText, { app });

    let ocrResult = null;
    if (assessment.strategy === "ocr-only" || assessment.strategy === "hybrid") {
      ocrResult = await this._extractOcr({ app, title });
    }

    return this._mergeResults(a11yResult, ocrResult, assessment);
  }

  async _extractA11y({ app, title }) {
    const adapter = this._adapters[this._platform];
    if (!adapter) {
      return { elements: [], focusedElement: null, browserUrl: null, timestamp: Date.now() };
    }
    try {
      return await adapter.extract({ app, title });
    } catch (err) {
      log.warn("a11y extraction failed: " + err.message);
      return { elements: [], focusedElement: null, browserUrl: null, timestamp: Date.now() };
    }
  }

  async _extractOcr({ app, title }) {
    if (!this._ocrAdapter) {
      try {
        const mod = await import("./adapters/ocr-fallback-adapter.js");
        this._ocrAdapter = new mod.OcrFallbackAdapter();
      } catch (err) {
        log.warn("OCR adapter not available: " + err.message);
        return null;
      }
    }
    try {
      return await this._ocrAdapter.extract({ app, title });
    } catch (err) {
      log.warn("OCR extraction failed: " + err.message);
      return null;
    }
  }

  _mergeResults(a11yResult, ocrResult, assessment) {
    if (assessment.strategy === "skip") {
      return {
        elements: [],
        focusedElement: null,
        browserUrl: a11yResult.browserUrl ?? null,
        _source: "none",
        _strategy: "skip",
      };
    }

    if (assessment.strategy === "a11y-only") {
      return {
        elements: a11yResult.elements,
        focusedElement: a11yResult.focusedElement,
        browserUrl: a11yResult.browserUrl ?? null,
        _source: "a11y",
        _strategy: "a11y-only",
      };
    }

    if (assessment.strategy === "ocr-only") {
      return {
        elements: ocrResult?.elements ?? [],
        focusedElement: null,
        browserUrl: null,
        _source: "ocr",
        _strategy: "ocr-only",
      };
    }

    // hybrid
    const merged = [...a11yResult.elements];
    if (ocrResult?.elements) {
      const a11yTexts = new Set(merged.map((e) => (e.text || "").trim().toLowerCase()));
      for (const el of ocrResult.elements) {
        const text = (el.text || "").trim().toLowerCase();
        if (text && !a11yTexts.has(text)) {
          merged.push({ ...el, _from: "ocr" });
        }
      }
    }

    return {
      elements: merged,
      focusedElement: a11yResult.focusedElement,
      browserUrl: a11yResult.browserUrl ?? null,
      _source: "hybrid",
      _strategy: "hybrid",
    };
  }
}
