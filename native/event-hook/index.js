import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

let addon;
try {
  addon = require("./build/Release/event_hook.node");
} catch (err) {
  addon = {
    platform: process.platform,
    status: "not-built",
    error: err.message,
  };
}

export default addon;
