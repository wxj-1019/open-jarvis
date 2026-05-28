{
  "targets": [
    {
      "target_name": "event_hook",
      "sources": [
        "src/common.h"
      ],
      "include_dirs": [
        "<!@(node -p `"require('node-addon-api').include`")"
      ],
      "dependencies": [
        "<!(node -p `"require('node-addon-api').gyp`")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ["OS=='win'", {
          "sources": [ "src/win32_hook.cc" ],
          "libraries": [ "-luser32", "-lole32" ]
        }],
        ["OS=='mac'", {
          "sources": [ "src/macos_hook.mm" ],
          "libraries": [
            "-framework Cocoa",
            "-framework ApplicationServices"
          ],
          "xcode_settings": {
            "OTHER_CPLUSPLUSFLAGS": [ "-std=c++17", "-stdlib=libc++" ],
            "MACOSX_DEPLOYMENT_TARGET": "10.14"
          }
        }],
        ["OS=='linux'", {
          "sources": [ "src/linux_hook.cc" ],
          "cflags": [
            "<!@(pkg-config --cflags dbus-1 glib-2.0 atspi-2)"
          ],
          "libraries": [
            "<!@(pkg-config --libs dbus-1 glib-2.0 atspi-2)"
          ]
        }]
      ]
    }
  ]
}
