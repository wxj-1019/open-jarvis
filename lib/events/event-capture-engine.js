import { EventEmitter } from "node:events";
import { EventAggregator } from "./event-aggregator.js";
import { CapabilityDetector } from "./capability-detector.js";
import { WindowsEventHook } from "./platform/windows-event-hook.js";
import { MacosEventTap } from "./platform/macos-event-tap.js";
import { LinuxEventMonitor } from "./platform/linux-event-monitor.js";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("event-capture-engine");

/**
 * @typedef {object} EngineOptions
 * @property {string} [platform=process.platform]
 * @property {boolean} [useNative=false]
 * @property {object} [aggregatorOptions]
 */

export class EventCaptureEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this._platform = options.platform ?? process.platform;
    this._useNative = options.useNative ?? false;
    this._running = false;
    this._aggregator = new EventAggregator(options.aggregatorOptions);
    this._adapter = null;
    this._capabilities = null;
  }

  async start() {
    if (this._running) return;

    // 1. ÃΩ≤‚ƒ‹¡¶
    const detector = new CapabilityDetector(this._platform);
    this._capabilities = await detector.detect();

    // 2. ¥¥Ω®∆ΩÃ®  ≈‰∆˜
    this._adapter = this._createAdapter();

    // 3.   ≈‰∆˜ °˙ æ€∫œ∆˜ °˙ “˝«Ê
    this._adapter.on("event", (rawEvent) => {
      this._aggregator.ingest(rawEvent);
    });

    this._aggregator.on("event", (aggregatedEvent) => {
      this.emit("event", aggregatedEvent);
    });

    // 4. ∆Ù∂Ø  ≈‰∆˜
    await this._adapter.start();
    this._running = true;

    log.log("started", { platform: this._platform, native: this._useNative });
  }

  async stop() {
    if (!this._running) return;

    if (this._adapter) {
      await this._adapter.stop();
      this._adapter.removeAllListeners();
      this._adapter = null;
    }

    this._aggregator.destroy();
    this._running = false;

    log.log("stopped");
  }

  isRunning() {
    return this._running;
  }

  getCapabilities() {
    return this._capabilities;
  }

  _createAdapter() {
    switch (this._platform) {
      case "win32": {
        const adapter = new WindowsEventHook();
        adapter._useNative = this._useNative;
        return adapter;
      }
      case "darwin": {
        const adapter = new MacosEventTap();
        adapter._useNative = this._useNative;
        return adapter;
      }
      case "linux":
        return new LinuxEventMonitor();
      default:
        throw new Error(`Unsupported platform: ${this._platform}`);
    }
  }
}
