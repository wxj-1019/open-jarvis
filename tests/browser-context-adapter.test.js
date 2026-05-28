import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BrowserContextAdapter } from "../lib/context/browser-context-adapter.js";

describe("BrowserContextAdapter", () => {
  it("should process browser messages and emit context events", () => {
    const adapter = new BrowserContextAdapter();
    const events = [];
    adapter.on("context", (e) => events.push(e));

    adapter.processMessage({
      action: "tabActivated",
      data: {
        url: "https://github.com/liliMozi/open-jarvis",
        title: "open-jarvis - GitHub",
        searchQuery: null,
      },
    });

    expect(events.length).toBe(1);
    expect(events[0].type).toBe("browser:context");
    expect(events[0].url).toContain("github.com");
    expect(events[0].title).toBe("open-jarvis - GitHub");
  });

  it("should extract searchQuery from browser data", () => {
    const adapter = new BrowserContextAdapter();
    const events = [];
    adapter.on("context", (e) => events.push(e));

    adapter.processMessage({
      action: "tabUpdated",
      data: {
        url: "https://www.google.com/search?q=openjarvis",
        title: "openjarvis - Google Search",
        searchQuery: "openjarvis",
      },
    });

    expect(events[0].searchQuery).toBe("openjarvis");
  });

  it("should handle article content from Readability", () => {
    const adapter = new BrowserContextAdapter();
    const events = [];
    adapter.on("context", (e) => events.push(e));

    adapter.processMessage({
      action: "tabActivated",
      data: {
        url: "https://example.com/article",
        title: "Example Article",
        article: {
          title: "Example Article",
          excerpt: "A great article",
          textContent: "Full text content here...",
          length: 24,
        },
      },
    });

    expect(events[0].article).toBeDefined();
    expect(events[0].article.textContent).toBe("Full text content here...");
  });

  it("should handle selection text", () => {
    const adapter = new BrowserContextAdapter();
    const events = [];
    adapter.on("context", (e) => events.push(e));

    adapter.processMessage({
      action: "tabActivated",
      data: {
        url: "https://example.com",
        title: "Example",
        selection: "selected text from page",
      },
    });

    expect(events[0].selection).toBe("selected text from page");
  });

  it("should ignore messages without data", () => {
    const adapter = new BrowserContextAdapter();
    const events = [];
    adapter.on("context", (e) => events.push(e));

    adapter.processMessage({ action: "ping" });
    adapter.processMessage({ action: "tabActivated", data: null });

    expect(events.length).toBe(0);
  });

  it("should normalize missing fields to defaults", () => {
    const adapter = new BrowserContextAdapter();
    const events = [];
    adapter.on("context", (e) => events.push(e));

    adapter.processMessage({
      action: "tabActivated",
      data: {},
    });

    expect(events[0].url).toBe("");
    expect(events[0].title).toBe("");
    expect(events[0].searchQuery).toBeNull();
    expect(events[0].selection).toBeNull();
    expect(events[0].article).toBeNull();
    expect(events[0].timestamp).toBeTypeOf("number");
  });

  it("should poll messages from fallback file", async () => {
    const tmpDir = `/tmp/oj-test-browser-${Date.now()}`;
    const adapter = new BrowserContextAdapter({ fallbackDir: tmpDir });

    // 写入测试数据到降级文件
    const fs = await import("node:fs");
    const path = await import("node:path");
    fs.mkdirSync(tmpDir, { recursive: true });
    const filePath = path.join(tmpDir, "messages.jsonl");
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        action: "tabActivated",
        data: { url: "https://github.com", title: "GitHub" },
      }) + "\n",
    );

    const messages = await adapter.pollMessages();
    expect(messages.length).toBe(1);
    expect(messages[0].data.url).toBe("https://github.com");

    // 文件应被清空
    expect(fs.existsSync(filePath)).toBe(false);

    // 清理
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should start and stop polling", () => {
    const adapter = new BrowserContextAdapter({ pollIntervalMs: 100 });
    adapter.start();
    expect(adapter._running).toBe(true);

    adapter.stop();
    expect(adapter._running).toBe(false);
  });

  it("should filter events in batch via filterEvents", () => {
    const adapter = new BrowserContextAdapter();
    const events = [];
    adapter.on("context", (e) => events.push(e));

    const messages = [
      { action: "tabActivated", data: { url: "https://a.com", title: "A" } },
      { action: "ping" }, // no data, should be ignored
      { action: "tabUpdated", data: { url: "https://b.com", title: "B" } },
    ];

    const results = adapter.processMessages(messages);
    expect(results.length).toBe(2); // only 2 had data
    expect(events.length).toBe(2);
  });

  it("should handle SPA navigation events", () => {
    const adapter = new BrowserContextAdapter();
    const events = [];
    adapter.on("context", (e) => events.push(e));

    adapter.processMessage({
      action: "spaNavigation",
      data: {
        url: "https://app.example.com/dashboard",
        title: "Dashboard",
        timestamp: Date.now(),
      },
    });

    expect(events[0].url).toBe("https://app.example.com/dashboard");
  });
});
