import { EventEmitter } from "node:events";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("idle-fallback-monitor");

/**
 * @typedef {object} IdleMonitorOptions
 * @property {number} [idleThresholdMs=60000]  空闲阈值
 * @property {number} [checkIntervalMs=10000]   检查间隔
 */

export class IdleFallbackMonitor extends EventEmitter {
  /**
   * @param {IdleMonitorOptions} [options]
   */
  constructor(options = {}) {
    super();
    this._idleThresholdMs = options.idleThresholdMs ?? 60000;
    this._checkIntervalMs = options.checkIntervalMs ?? 10000;
    this._running = false;
    this._timer = null;
    this._lastActivityTime = Date.now();
  }

  async start() {
    if (this._running) return;
    this._running = true;
    this._lastActivityTime = Date.now();
    this._scheduleCheck();
    log.log("started", { threshold: this._idleThresholdMs });
  }

  async stop() {
    if (!this._running) return;
    this._running = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    log.log("stopped");
  }

  recordActivity() {
    this._lastActivityTime = Date.now();
  }

  _scheduleCheck() {
    if (!this._running) return;
    this._timer = setTimeout(() => {
      this._checkIdle();
      this._scheduleCheck();
    }, this._checkIntervalMs);
  }

  _checkIdle() {
    const idleTime = Date.now() - this._lastActivityTime;
    if (idleTime >= this._idleThresholdMs) {
      log.log("idle detected", { idleTime });
      this.emit("idle", {
        type: "idle:fallback",
        idleTimeMs: idleTime,
        timestamp: Date.now(),
      });
    }
  }

  isRunning() {
    return this._running;
  }
}
