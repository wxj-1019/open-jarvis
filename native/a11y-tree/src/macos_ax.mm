// macos_ax.mm — macOS Accessibility API extraction
// TODO: Phase 2 后续迭代 - 实现 AX API 调用
// 当前为骨架文件

#include "common.h"
#include <napi.h>

Napi::Value ExtractWindowContent(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Expected window info object").ThrowAsJavaScriptException();
    return env.Null();
  }

  // TODO: Implement AXUIElement tree traversal
  // - Get focused app via AXUIElementCreateApplication
  // - Traverse AXChildren
  // - Extract AXTitle, AXRole, AXValue

  A11yResult result;
  result.app = "unknown";
  result.title = "unknown";
  result.timestamp = 0;

  return A11yResultToObject(env, result);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("extractWindowContent", Napi::Function::New(env, ExtractWindowContent));
  return exports;
}

NODE_API_MODULE(a11y_tree, Init)
