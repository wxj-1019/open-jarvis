import { EventEmitter } from "events";
import { createModuleLogger } from "../debug-log.js";

const moduleLog = createModuleLogger("barge-in-detector");

/**
 * BargeInDetector — 在 TTS 播放期间检测用户语音打断。
 *
 * 工作原理：
 *   1. 监听 VAD 的 speechstart 事件
 *   2. 如果连续语音达到 thresholdMs 时长，判定为打断
 *   3. 触发 interrupt 事件
 */
export class BargeInDetector extends EventEmitter {
  /**
   * @param {import('./vad-service.js').VADService} vadService
   * @param {object} [opts]
   * @param {number} [opts.thresholdMs=300] - 连续语音达到此时长才判定为打断
   */
  constructor(vadService, opts = {}) {
    super();
    this.setMaxListeners(10);
    this._vad = vadService;
    this._thresholdMs = opts.thresholdMs ?? 300;
    this._speechTimer = null;
    this._active = false;
    this._onSpeechStart = null;
  }

  start() {
    if (this._active) return;
    this._active = true;

    this._onSpeechStart = () => {
      if (!this._active) return;
      this._speechTimer = setTimeout(() => {
        if (this._active) {
          moduleLog?.info?.("Barge-in detected");
          this.emit("interrupt");
        }
      }, this._thresholdMs);
    };

    this._vad.on("speechstart", this._onSpeechStart);
    moduleLog?.info?.("BargeInDetector started");
  }

  stop() {
    this._active = false;
    if (this._speechTimer) {
      clearTimeout(this._speechTimer);
      this._speechTimer = null;
    }
    if (this._onSpeechStart) {
      this._vad.removeListener("speechstart", this._onSpeechStart);
      this._onSpeechStart = null;
    }
    moduleLog?.info?.("BargeInDetector stopped");
  }
}
