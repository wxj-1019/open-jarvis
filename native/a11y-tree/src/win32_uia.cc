// win32_uia.cc — Windows UI Automation accessibility tree extraction
// TODO: Phase 2 后续迭代 - 实现 UIA API 调用
// 当前为骨架文件

#include "common.h"
#include <napi.h>

Napi::Value ExtractWindowContent(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsObject()) {
    Napi::TypeError::New(env, "Expected window info object").ThrowAsJavaScriptException();
    return env.Null();
  }

  // TODO: Implement UI Automation tree traversal
  // - Get foreground window handle
  // - Create IUIAutomation instance
  // - Traverse element tree
  // - Extract name, role, value properties

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
