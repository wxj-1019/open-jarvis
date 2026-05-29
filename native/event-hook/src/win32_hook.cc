#include "common.h"
#include <windows.h>
#include <napi.h>

// TODO: Implement SetWinEventHook for foreground window changes
// - EVENT_SYSTEM_FOREGROUND
// - EVENT_OBJECT_NAMECHANGE

Napi::Object InitWin32(Napi::Env env, Napi::Object exports) {
  exports.Set("platform", Napi::String::New(env, "win32"));
  exports.Set("status", Napi::String::New(env, "placeholder"));
  return exports;
}
