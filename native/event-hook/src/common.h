#ifndef EVENT_HOOK_COMMON_H
#define EVENT_HOOK_COMMON_H

#include <napi.h>
#include <string>
#include <functional>

// TODO: Define shared structures and callback types
// Platform-specific hooks will emit events through this callback
using EventCallback = std::function<void(const std::string& type, const std::string& data)>;

#endif // EVENT_HOOK_COMMON_H
