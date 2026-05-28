// background.js
/**
 * Background Service Worker
 * 管理 Native Messaging 连接，转发页面数据到 OpenJarvis
 */

const NATIVE_HOST_NAME = "com.openjarvis.context_bridge";

let nativePort = null;
let reconnectTimer = null;

/**
 * 连接 Native Messaging Host
 */
function connectNative() {
  if (nativePort) return;

  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener((message) => {
      console.log("[OpenJarvis] Received from native:", message);
      handleNativeMessage(message);
    });

    nativePort.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.error("[OpenJarvis] Native disconnect:", error.message);
      }
      nativePort = null;

      // 自动重连
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connectNative();
        }, 5000);
      }
    });

    console.log("[OpenJarvis] Native messaging connected");
  } catch (err) {
    console.error("[OpenJarvis] Failed to connect native:", err);
  }
}

/**
 * 处理来自 Native Host 的消息
 */
function handleNativeMessage(message) {
  if (message.action === "getActiveTab") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        sendToNative({
          action: "activeTabInfo",
          tab: {
            id: tabs[0].id,
            url: tabs[0].url,
            title: tabs[0].title,
          },
        });
      }
    });
  }
}

/**
 * 发送消息到 Native Host
 */
function sendToNative(message) {
  if (!nativePort) {
    console.warn("[OpenJarvis] Native port not available");
    return false;
  }

  try {
    nativePort.postMessage(message);
    return true;
  } catch (err) {
    console.error("[OpenJarvis] Failed to send to native:", err);
    return false;
  }
}

/**
 * 获取当前活跃标签页信息
 */
async function getActiveTabInfo() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return null;

  // 向 content script 请求页面详细信息
  try {
    const response = await chrome.tabs.sendMessage(tabs[0].id, {
      action: "getPageInfo",
    });
    return {
      tabId: tabs[0].id,
      url: tabs[0].url,
      title: tabs[0].title,
      ...response,
    };
  } catch {
    // Content script 可能未注入
    return {
      tabId: tabs[0].id,
      url: tabs[0].url,
      title: tabs[0].title,
    };
  }
}

// 标签页切换时发送数据
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const info = await getActiveTabInfo();
  if (info) {
    sendToNative({
      action: "tabActivated",
      data: info,
    });
  }
});

// 标签页更新时发送数据
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    const info = await getActiveTabInfo();
    if (info) {
      sendToNative({
        action: "tabUpdated",
        data: info,
      });
    }
  }
});

// 监听 Content Script 的页面变化通知
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "pageChanged") {
    sendToNative({
      action: "spaNavigation",
      data: {
        url: request.url,
        title: request.title,
        timestamp: Date.now(),
      },
    });
  }

  if (request.action === "getNativeStatus") {
    sendResponse({ connected: nativePort !== null });
    return true;
  }
});

// 启动时连接
connectNative();
