// content-script.js
/**
 * Content Script — 页面内容提取
 * 在页面上下文中运行，提取可读内容和选中文本
 */

(function () {
  "use strict";

  // 避免重复注入
  if (window.__openjarvisContentScriptInjected) return;
  window.__openjarvisContentScriptInjected = true;

  /**
   * 提取页面信息
   */
  function extractPageInfo() {
    const url = window.location.href;
    const title = document.title;
    const selection = window.getSelection()?.toString() ?? "";

    // 提取搜索查询
    let searchQuery = null;
    try {
      const urlObj = new URL(url);
      searchQuery =
        urlObj.searchParams.get("q") ??
        urlObj.searchParams.get("query") ??
        urlObj.searchParams.get("search");
    } catch {
      // ignore
    }

    // 使用 Readability 提取正文
    let article = null;
    if (window.Readability) {
      try {
        const documentClone = document.cloneNode(true);
        const reader = new window.Readability(documentClone);
        article = reader.parse();
      } catch (err) {
        console.error("[OpenJarvis] Readability failed:", err);
      }
    }

    return {
      url,
      title,
      selection: selection.slice(0, 1000), // 限制长度
      searchQuery,
      article: article
        ? {
            title: article.title,
            excerpt: article.excerpt,
            byline: article.byline,
            length: article.length,
            textContent: article.textContent?.slice(0, 5000), // 限制长度
          }
        : null,
      timestamp: Date.now(),
    };
  }

  // 监听 Background 的消息请求
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getPageInfo") {
      const info = extractPageInfo();
      sendResponse(info);
      return true; // 保持通道开放（异步）
    }

    if (request.action === "getSelection") {
      sendResponse({
        selection: window.getSelection()?.toString() ?? "",
        timestamp: Date.now(),
      });
      return true;
    }
  });

  // 页面变化时通知 background（SPA 路由变化）
  let lastUrl = location.href;
  new MutationObserver(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      chrome.runtime.sendMessage({
        action: "pageChanged",
        url: currentUrl,
        title: document.title,
      });
    }
  }).observe(document, { subtree: true, childList: true });
})();
