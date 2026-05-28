import { BaseEventAdapter } from "./base-event-adapter.js";
import { createModuleLogger } from "../../debug-log.js";

const log = createModuleLogger("linux-event-monitor");

export class LinuxEventMonitor extends BaseEventAdapter {
  constructor() {
    super();
    this._platform = "linux";
    this._lastApp = null;
    this._pollTimer = null;
  }

  async start() {
    if (this._running) return;
    this._running = true;
    this._startPollingFallback();
    log.log("started (polling fallback)");
  }

  async stop() {
    if (!this._running) return;
    this._running = false;
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    log.log("stopped");
  }

  _startPollingFallback() {
    const poll = async () => {
      if (!this._running) return;
      try {
        const { activeWindow } = await import("get-windows");
        const window = await activeWindow();
        if (window) {
          const app = window.owner?.name ?? window.platform;
          const title = window.title ?? "";
          if (app !== this._lastApp) {
            const prevApp = this._lastApp;
            this._lastApp = app;
            this._emitNormalized("app:switch", { app, title, prevApp });
          }
        }
      } catch (err) {
        log.error(`poll failed: ${err.message}`);
      }
      this._pollTimer = setTimeout(poll, 1000);
    };
    poll();
  }
}