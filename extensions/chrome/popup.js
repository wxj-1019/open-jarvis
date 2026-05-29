/**
 * popup.js — Chrome 扩展 Popup 状态页
 */
(function () {
  const dot = document.getElementById("dot");
  const statusText = document.getElementById("statusText");
  const info = document.getElementById("info");

  function updateStatus(connected) {
    dot.className = "dot " + (connected ? "connected" : "disconnected");
    statusText.textContent = connected ? "Connected to OpenJarvis" : "Disconnected";
  }

  function updateInfo() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        info.textContent = `Tab: ${tabs[0].title || "N/A"}\nURL: ${tabs[0].url || "N/A"}`;
      }
    });
  }

  // 检查 Native Messaging 连接状态
  chrome.runtime.sendMessage({ action: "getNativeStatus" }, (response) => {
    if (chrome.runtime.lastError) {
      updateStatus(false);
      return;
    }
    updateStatus(response?.connected ?? false);
  });

  updateInfo();
})();
