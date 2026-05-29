{
  "targets": [
    {
      "target_name": "a11y_tree",
      "sources": [
        "src/common.h"
      ],
      "include_dirs": [
        "<!@(node -p `\"require('node-addon-api').include\"`)"
      ],
      "dependencies": [
        "<!(node -p `\"require('node-addon-api').gyp\"`)"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ["OS=='win'", {
          "sources": [ "src/win32_uia.cc" ],
          "libraries": [ "-luiautomation" ]
        }],
        ["OS=='mac'", {
          "sources": [ "src/macos_ax.mm" ],
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
          "sources": [ "src/linux_atspi.cc" ],
          "cflags": [
            "<!@(pkg-config --cflags atspi-2)"
          ],
          "libraries": [
            "<!@(pkg-config --libs atspi-2)"
          ]
        }]
      ]
    }
  ]
}
