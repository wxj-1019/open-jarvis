const fs = require("fs");
let c = fs.readFileSync("hub/scheduler.js", "utf8");
c = c.replace('import { createModuleLogger } from "../lib/debug-log.js";', 'import { EventCaptureEngine } from "../lib/events/event-capture-engine.js";\nimport { createModuleLogger } from "../lib/debug-log.js";');
fs.writeFileSync("hub/scheduler.js", c, "utf8");
console.log("done");