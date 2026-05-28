#ifndef A11Y_TREE_COMMON_H
#define A11Y_TREE_COMMON_H

#include <napi.h>
#include <string>
#include <vector>

struct A11yElement {
  std::string type;
  std::string text;
  std::string role;
};

struct A11yResult {
  std::string title;
  std::string app;
  std::vector<A11yElement> elements;
  A11yElement* focusedElement = nullptr;
  std::string browserUrl;
  uint64_t timestamp;
};

// 将 A11yResult 转为 Napi::Object
inline Napi::Object A11yResultToObject(Napi::Env env, const A11yResult& result) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("title", result.title);
  obj.Set("app", result.app);

  Napi::Array elements = Napi::Array::New(env, result.elements.size());
  for (size_t i = 0; i < result.elements.size(); i++) {
    Napi::Object el = Napi::Object::New(env);
    el.Set("type", result.elements[i].type);
    el.Set("text", result.elements[i].text);
    el.Set("role", result.elements[i].role);
    elements.Set(i, el);
  }
  obj.Set("elements", elements);

  if (result.focusedElement) {
    Napi::Object fe = Napi::Object::New(env);
    fe.Set("type", result.focusedElement->type);
    fe.Set("text", result.focusedElement->text);
    obj.Set("focusedElement", fe);
  } else {
    obj.Set("focusedElement", env.Null());
  }

  obj.Set("browserUrl", result.browserUrl.empty() ? env.Null() : Napi::String::New(env, result.browserUrl));
  obj.Set("timestamp", Napi::Number::New(env, static_cast<double>(result.timestamp)));

  return obj;
}

#endif
