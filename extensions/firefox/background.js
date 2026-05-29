// background.js
// Firefox 使用 browser.* API（Promise-based）
// 大部分逻辑与 Chrome 相同，API 调用略有不同

const NATIVE_HOST_NAME = "com.openjarvis.context_bridge";

let nativePort = null;
let reconnectTimer = null;

function connectNative() {
  if (nativePort) return;

  try {
    nativePort = browser.runtime.connectNative(NATIVE_HOST_NAME);

    nativePort.onMessage.addListener((message) => {
      console.log("[OpenJarvis] Received from native:", message);
    });

    nativePort.onDisconnect.addListener(() => {
      const errorMsg = nativePort.error?.message || "unknown";
      console.error("[OpenJarvis] Native disconnect:", errorMsg);
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
    console.error("[OpenJarvis] Failed to connect:", err);
  }
}

function sendToNative(message) {
  if (!nativePort) return false;
  try {
    nativePort.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

// Firefox 使用 browser.tabs.onActivated（Promise-based）
browser.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await browser.tabs.get(activeInfo.tabId);
  sendToNative({
    action: "tabActivated",
    data: {
      tabId: tab.id,
      url: tab.url,
      title: tab.title,
    },
  });
});

// 标签页更新时发送数据
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    sendToNative({
      action: "tabUpdated",
      data: {
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
      },
    });
  }
});

// 监听 Content Script 的页面变化通知
browser.runtime.onMessage.addListener((request, sender) => {
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
});

connectNative();
