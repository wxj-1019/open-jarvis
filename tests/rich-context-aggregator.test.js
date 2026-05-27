import { describe, it, expect } from "vitest";
import { RichContextAggregator } from "../lib/context/rich-context-aggregator.js";

describe("RichContextAggregator.aggregate", () => {
  it("合并 L1/L2 数据", () => {
    const l1 = { app: "Code.exe", title: "test.js", platform: "win32" };
    const l2 = {
      type: "ide",
      content: "const x = 1;",
      metadata: { filePath: "/src/test.js", language: "javascript" },
    };

    const result = RichContextAggregator.aggregate(l1, l2, null);

    expect(result.l1).toEqual(l1);
    expect(result.l2.filePath).toBe("/src/test.js");
    expect(result.l2.fileContent).toBe("const x = 1;");
    expect(result.l2.language).toBe("javascript");
    expect(result.l2.sourceType).toBe("ide");
    expect(result.l2.clipboard).toBeNull();
    expect(result.l3).toBeNull();
    expect(result.timestamp).toBeGreaterThan(0);
  });

  it("L2 为 null 时 l2 字段为 null", () => {
    const l1 = { app: "chrome.exe", title: "Google", platform: "win32" };
    const result = RichContextAggregator.aggregate(l1, null, null);
    expect(result.l2).toBeNull();
  });

  it("L3 数据包含 screenshot 和 visualDescription", () => {
    const l1 = { app: "Code.exe", title: "test.js", platform: "win32" };
    const l3 = { screenshot: "base64abc", visualDescription: "User editing code" };

    const result = RichContextAggregator.aggregate(l1, null, l3);

    expect(result.l3.screenshot).toBe("base64abc");
    expect(result.l3.visualDescription).toBe("User editing code");
  });

  it("L1 为 null 时 l1 字段为 null", () => {
    const result = RichContextAggregator.aggregate(null, null, null);
    expect(result.l1).toBeNull();
    expect(result.l2).toBeNull();
    expect(result.l3).toBeNull();
  });
});

describe("RichContextAggregator._normalizeL2", () => {
  it("IDE 类型的 L2 正确归一化", () => {
    const l2 = {
      type: "ide",
      content: "import fs from 'fs';",
      metadata: { filePath: "/app/main.js", language: "javascript" },
    };

    const result = RichContextAggregator._normalizeL2(l2);

    expect(result.filePath).toBe("/app/main.js");
    expect(result.fileContent).toBe("import fs from 'fs';");
    expect(result.language).toBe("javascript");
    expect(result.sourceType).toBe("ide");
    expect(result.clipboard).toBeNull();
  });

  it("clipboard 类型的 L2 正确归一化", () => {
    const l2 = {
      type: "clipboard",
      content: "copied text",
      metadata: {},
    };

    const result = RichContextAggregator._normalizeL2(l2);

    expect(result.clipboard).toBe("copied text");
    expect(result.sourceType).toBe("clipboard");
    expect(result.filePath).toBeNull();
  });

  it("缺少 metadata 时使用默认值", () => {
    const l2 = { type: "unknown", content: "some content" };

    const result = RichContextAggregator._normalizeL2(l2);

    expect(result.filePath).toBeNull();
    expect(result.language).toBeNull();
    expect(result.sourceType).toBe("unknown");
  });

  it("browser 类型 L2 归一化", () => {
    const l2 = {
      type: "browser",
      content: "GitHub",
      metadata: { pageTitle: "GitHub", searchQuery: null, searchEngine: null, url: null },
    };

    const result = RichContextAggregator._normalizeL2(l2);

    expect(result.sourceType).toBe("browser");
    expect(result.pageTitle).toBe("GitHub");
    expect(result.searchQuery).toBeNull();
    expect(result.fileContent).toBe("GitHub");
  });

  it("browser 类型带搜索信息", () => {
    const l2 = {
      type: "browser",
      content: "react hooks",
      metadata: { pageTitle: "react hooks - Google Search", searchQuery: "react hooks", searchEngine: "google", url: null },
    };

    const result = RichContextAggregator._normalizeL2(l2);

    expect(result.searchQuery).toBe("react hooks");
    expect(result.searchEngine).toBe("google");
  });

  it("terminal 类型 L2 归一化", () => {
    const l2 = {
      type: "terminal",
      content: "C:\\Users\\test\\project",
      metadata: { workingDir: "C:\\Users\\test\\project", shellType: "powershell", isSsh: false },
    };

    const result = RichContextAggregator._normalizeL2(l2);

    expect(result.sourceType).toBe("terminal");
    expect(result.workingDir).toBe("C:\\Users\\test\\project");
    expect(result.shellType).toBe("powershell");
    expect(result.isSsh).toBe(false);
    expect(result.fileContent).toBe("C:\\Users\\test\\project");
  });
});
