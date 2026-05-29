// native/a11y-tree/index.js — JS entry for a11y-tree native addon
// Falls back to a no-op implementation if native build is unavailable

let native = null;

try {
  native = require("../build/Release/a11y_tree.node");
} catch {
  try {
    native = require("../build/Debug/a11y_tree.node");
  } catch {
    // Native addon not available - use JS fallback
    native = {
      extractWindowContent() {
        return {
          title: "unknown",
          app: "unknown",
          elements: [],
          focusedElement: null,
          browserUrl: null,
          timestamp: Date.now(),
        };
      },
    };
  }
}

module.exports = native;
