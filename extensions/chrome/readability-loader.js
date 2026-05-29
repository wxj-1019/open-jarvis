// readability-loader.js
// 动态加载 Readability.js（从扩展本地资源）
(async function loadReadability() {
  if (window.__openjarvisReadabilityLoaded) return;

  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("lib/Readability.js");
  script.onload = () => {
    window.__openjarvisReadabilityLoaded = true;
  };
  document.head.appendChild(script);
})();
