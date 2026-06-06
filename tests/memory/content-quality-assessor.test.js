import { describe, it, expect } from "vitest";
import { ContentQualityAssessor } from "../../lib/context/content-quality-assessor.js";

describe("ContentQualityAssessor", () => {
  const assessor = new ContentQualityAssessor();

  it("should classify rich text (>100 chars) as a11y-only", () => {
    const text = "a".repeat(150);
    const result = assessor.assess(text);
    expect(result.strategy).toBe("a11y-only");
    expect(result.quality).toBe("rich");
  });

  it("should classify sparse text (10-100 chars) as hybrid", () => {
    const text = "a".repeat(50);
    const result = assessor.assess(text);
    expect(result.strategy).toBe("hybrid");
    expect(result.quality).toBe("sparse");
  });

  it("should classify empty text as ocr-only", () => {
    const result = assessor.assess("");
    expect(result.strategy).toBe("ocr-only");
    expect(result.quality).toBe("none");
  });

  it("should classify short text (<10 chars) as ocr-only", () => {
    const result = assessor.assess("hello");
    expect(result.strategy).toBe("ocr-only");
    expect(result.quality).toBe("none");
  });

  it("should detect terminal app and suggest OCR", () => {
    const result = assessor.assess("", { app: "WindowsTerminal.exe" });
    expect(result.strategy).toBe("ocr-only");
    expect(result.reason).toContain("terminal");
  });

  it("should detect browser app and suggest hybrid", () => {
    const result = assessor.assess("GitHub Repository Search Results", { app: "chrome.exe" });
    expect(result.strategy).toBe("hybrid");
    expect(result.reason).toContain("browser");
  });

  it("should skip video/game apps", () => {
    const result = assessor.assess("", { app: "vlc.exe" });
    expect(result.strategy).toBe("skip");
  });

  it("should assess batch of windows", () => {
    const results = assessor.assessBatch([
      { app: "Code.exe", a11yText: "a".repeat(200) },
      { app: "chrome.exe", a11yText: "short" },
      { app: "vlc.exe", a11yText: "" },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].strategy).toBe("a11y-only");
    expect(results[1].strategy).toBe("ocr-only");
    expect(results[2].strategy).toBe("skip");
  });
});
