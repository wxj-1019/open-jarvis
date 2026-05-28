#include "common.h"

// TODO: Implement AT-SPI2 / evdev based monitoring
// - atspi_register_keystroke_listener (requires accessibility)
// - evdev for raw input (requires root or input group)

Napi::Object InitLinux(Napi::Env env, Napi::Object exports) {
  exports.Set("platform", Napi::String::New(env, "linux"));
  exports.Set("status", Napi::String::New(env, "placeholder"));
  return exports;
}
