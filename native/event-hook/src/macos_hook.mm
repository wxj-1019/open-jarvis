#include "common.h"
#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

// TODO: Implement CGEventTap for mouse/keyboard events
// - NSWorkspace notifications for app activation

Napi::Object InitMacos(Napi::Env env, Napi::Object exports) {
  exports.Set("platform", Napi::String::New(env, "darwin"));
  exports.Set("status", Napi::String::New(env, "placeholder"));
  return exports;
}
