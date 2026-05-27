import { ContentAdapter } from "./base-adapter.js";

/**
 * 浏览器内容适配器
 * 从浏览器窗口标题解析页面标题和 URL
 *
 * 常见浏览器标题格式：
 * - Chrome: "Page Title - Google Chrome"
 * - Firefox: "Page Title — Mozilla Firefox"
 * - Edge: "Page Title - Microsoft Edge"
 * - Safari: "Page Title - Safari"（macOS）
 */
export class BrowserContentAdapter extends ContentAdapter {
  static BROWSER_PATTERNS = [
    /Chrome/i,
    /Firefox/i,
    /Edge/i,
    /Safari/i,
    /Opera/i,
    /Brave/i,
    /Vivaldi/i,
  ];

  // 浏览器标题中的常见后缀（用于去除浏览器品牌名，提取纯页面标题）
  static TITLE_SUFFIXES = [
    / - Google Chrome$/i,
    / - Mozilla Firefox$/i,
    / - Microsoft Edge$/i,
    / - Safari$/i,
    / - Opera$/i,
    / - Brave$/i,
    / - Vivaldi$/i,
    / — Mozilla Firefox$/i,
  ];

  static supports(app, _title) {
    return this.BROWSER_PATTERNS.some((re) => re.test(app));
  }

  static async extract(_app, title) {
    const parsed = this._parseTitle(title);

    return {
      type: "browser",
      content: parsed.pageTitle,
      metadata: {
        pageTitle: parsed.pageTitle,
        searchQuery: parsed.searchQuery,
        searchEngine: parsed.searchEngine,
        url: parsed.url,
      },
    };
  }

  /**
   * 解析浏览器窗口标题
   * @param {string} title
   * @returns {{ pageTitle: string|null, searchQuery: string|null, searchEngine: string|null, url: string|null }}
   */
  static _parseTitle(title) {
    if (!title) return { pageTitle: null, searchQuery: null, searchEngine: null, url: null };

    // 去除浏览器品牌后缀，提取纯页面标题
    let pageTitle = title;
    for (const suffix of this.TITLE_SUFFIXES) {
      pageTitle = pageTitle.replace(suffix, "").trim();
    }

    // 尝试提取搜索关键词（常见搜索引擎格式）
    const searchInfo = this._extractSearchInfo(pageTitle);
    if (searchInfo) {
      return {
        pageTitle,
        searchQuery: searchInfo.query,
        searchEngine: searchInfo.engine,
        url: null,
      };
    }

    // 尝试提取 URL（如果标题中包含）
    const urlMatch = pageTitle.match(/(https?:\/\/[^\s]+)/);
    const url = urlMatch ? urlMatch[1] : null;

    return { pageTitle, searchQuery: null, searchEngine: null, url };
  }

  /**
   * 从页面标题中提取搜索信息
   * 常见格式：
   * - Google: "search query - Google Search"
   * - Bing: "search query - Bing"
   * - Baidu: "search query_百度搜索"
   * - DuckDuckGo: "search query at DuckDuckGo"
   */
  static _extractSearchInfo(pageTitle) {
    const patterns = [
      { regex: /^(.+?) - Google Search$/i, engine: "google" },
      { regex: /^(.+?) - Bing$/i, engine: "bing" },
      { regex: /^(.+?)_百度搜索$/i, engine: "baidu" },
      { regex: /^(.+?) at DuckDuckGo$/i, engine: "duckduckgo" },
      { regex: /^(.+?) - 搜索$/i, engine: "unknown" },
    ];

    for (const { regex, engine } of patterns) {
      const match = pageTitle.match(regex);
      if (match) {
        return { query: match[1].trim(), engine };
      }
    }
    return null;
  }
}
