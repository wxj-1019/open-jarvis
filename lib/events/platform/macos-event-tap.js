import { BaseEventAdapter } from "./base-event-adapter.js";
import { createModuleLogger } from "../../debug-log.js";

const log = createModuleLogger("macos-event-tap");

export class MacosEventTap extends BaseEventAdapter {
  constructor() {
    super();
    this._platform = "darwin";
    this._lastApp = null;
    this._lastTitle = null;
    this._pollTimer = null;
    this._useNative = false;
  }

  async start() {
    if (this._running) return;
    this._running = true;
    if (this._useNative) {
      await this._startNative();
    } else {
      this._startPollingFallback();
    }
    log.log("started", { native: this._useNative });
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
            this._lastTitle = title;
            this._emitNormalized("app:switch", { app, title, prevApp });
          }
        }
      } catch (err) {
        log.error("poll failed", err.message);
      }
      this._pollTimer = setTimeout(poll, 500);
    };
    poll();
  }

  async _startNative() {
    log.warn("native tap not yet implemented, using polling fallback");
    this._startPollingFallback();
  }

  _simulateNativeEvent(nativeType, data) {
    switch (nativeType) {
      case "activated": {
        const app = data.app;
        const title = data.title;
        if (app !== this._lastApp) {
          const prevApp = this._lastApp;
          this._lastApp = app;
          this._lastTitle = title;
          this._emitNormalized("app:switch", { app, title, prevApp });
        }
        break;
      }
      case "mouse":
        this._emitNormalized("ui:click", { app: data.app, x: data.x, y: data.y });
        break;
      case "keyboard":
        this._emitNormalized("input:typing", { app: data.app, duration: data.duration });
        break;
      case "clipboard":
        this._emitNormalized("clipboard:copy", { app: data.app, contentHash: data.hash });
        break;
    }
  }
}