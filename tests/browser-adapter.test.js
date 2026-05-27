import { describe, it, expect } from "vitest";
import { BrowserContentAdapter } from "../lib/context/adapters/browser-adapter.js";

describe("BrowserContentAdapter", () => {
  describe("supports", () => {
    it("识别 Chrome", () => {
      expect(BrowserContentAdapter.supports("chrome.exe", "")).toBe(true);
    });

    it("识别 Firefox", () => {
      expect(BrowserContentAdapter.supports("firefox.exe", "")).toBe(true);
    });

    it("识别 Edge", () => {
      expect(BrowserContentAdapter.supports("msedge.exe", "")).toBe(true);
    });

    it("不识别非浏览器", () => {
      expect(BrowserContentAdapter.supports("Code.exe", "")).toBe(false);
      expect(BrowserContentAdapter.supports("explorer.exe", "")).toBe(false);
    });
  });

  describe("_parseTitle", () => {
    it("去除 Chrome 品牌后缀", () => {
      const result = BrowserContentAdapter._parseTitle("GitHub - Google Chrome");
      expect(result.pageTitle).toBe("GitHub");
    });

    it("去除 Firefox 品牌后缀", () => {
      const result = BrowserContentAdapter._parseTitle("MDN Web Docs — Mozilla Firefox");
      expect(result.pageTitle).toBe("MDN Web Docs");
    });

    it("去除 Edge 品牌后缀", () => {
      const result = BrowserContentAdapter._parseTitle("Stack Overflow - Microsoft Edge");
      expect(result.pageTitle).toBe("Stack Overflow");
    });

    it("提取 Google 搜索关键词", () => {
      const result = BrowserContentAdapter._parseTitle("react hooks - Google Search");
      expect(result.searchQuery).toBe("react hooks");
      expect(result.searchEngine).toBe("google");
    });

    it("提取百度搜索关键词", () => {
      const result = BrowserContentAdapter._parseTitle("javascript教程_百度搜索");
      expect(result.searchQuery).toBe("javascript教程");
      expect(result.searchEngine).toBe("baidu");
    });

    it("提取 Bing 搜索关键词", () => {
      const result = BrowserContentAdapter._parseTitle("typescript generics - Bing");
      expect(result.searchQuery).toBe("typescript generics");
      expect(result.searchEngine).toBe("bing");
    });

    it("提取 URL", () => {
      const result = BrowserContentAdapter._parseTitle("Page https://example.com/docs - Google Chrome");
      expect(result.url).toBe("https://example.com/docs");
    });

    it("空标题返回 null", () => {
      const result = BrowserContentAdapter._parseTitle(null);
      expect(result.pageTitle).toBeNull();
      expect(result.searchQuery).toBeNull();
    });
  });

  describe("extract", () => {
    it("返回正确的结构", async () => {
      const result = await BrowserContentAdapter.extract("chrome.exe", "GitHub - Google Chrome");
      expect(result.type).toBe("browser");
      expect(result.metadata.pageTitle).toBe("GitHub");
    });

    it("搜索页面包含搜索元数据", async () => {
      const result = await BrowserContentAdapter.extract("firefox.exe", "node.js async - Google Search");
      expect(result.metadata.searchQuery).toBe("node.js async");
      expect(result.metadata.searchEngine).toBe("google");
    });
  });
});
