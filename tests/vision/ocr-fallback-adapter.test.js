import { describe, it, expect, vi } from "vitest";
import { OcrFallbackAdapter } from "../../lib/context/adapters/ocr-fallback-adapter.js";

describe("OcrFallbackAdapter", () => {
  it("should return empty result when screenshot not available", async () => {
    const adapter = new OcrFallbackAdapter();
    const result = await adapter.extract({ app: "test.exe", title: "test" });

    expect(result.text).toBe("");
    expect(result.confidence).toBe(0);
    expect(result.source).toBe("ocr");
  });

  it("should extract text from mock image data", async () => {
    const adapter = new OcrFallbackAdapter();

    // Mock Tesseract
    adapter._tesseract = {
      recognize: vi.fn().mockResolvedValue({
        data: { text: "Hello World", confidence: 95 },
      }),
    };

    const result = await adapter.extract(
      { app: "test.exe", title: "test" },
      { imageBuffer: Buffer.from("mock") },
    );

    expect(result.text).toBe("Hello World");
    expect(result.confidence).toBe(95);
  });

  it("should handle OCR failure gracefully", async () => {
    const adapter = new OcrFallbackAdapter();

    adapter._tesseract = {
      recognize: vi.fn().mockRejectedValue(new Error("OCR engine crash")),
    };

    const result = await adapter.extract(
      { app: "test.exe", title: "test" },
      { imageBuffer: Buffer.from("mock") },
    );

    expect(result.text).toBe("");
    expect(result.confidence).toBe(0);
    expect(result.error).toContain("crash");
  });
});
