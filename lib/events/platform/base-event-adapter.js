import { EventEmitter } from "node:events";
import { createModuleLogger } from "../../debug-log.js";

const log = createModuleLogger("base-event-adapter");

/**
 * 平台事件适配器基类
 * 所有平台适配器继承此类，统一接口
 */
export class BaseEventAdapter extends EventEmitter {
  constructor() {
    super();
    this._running = false;
    this._platform = "unknown";
  }

  /**
   * 启动适配器
   * @abstract
   * @returns {Promise<void>}
   */
  async start() {
    throw new Error("start() must be implemented by subclass");
  }

  /**
   * 停止适配器
   * @abstract
   * @returns {Promise<void>}
   */
  async stop() {
    throw new Error("stop() must be implemented by subclass");
  }

  /**
   * 是否正在运行
   * @returns {boolean}
   */
  isRunning() {
    return this._running;
  }

  /**
   * 获取平台标识
   * @returns {string}
   */
  getPlatform() {
    return this._platform;
  }

  /**
   * 标准化事件格式
   * @protected
   * @param {string} type  事件类型
   * @param {object} data  原始事件数据
   * @returns {object}
   */
  _normalizeEvent(type, data) {
    return {
      type,
      platform: this._platform,
      timestamp: Date.now(),
      ...data,
    };
  }

  /**
   * 发射标准化事件
   * @protected
   * @param {string} type
   * @param {object} data
   */
  _emitNormalized(type, data) {
    const event = this._normalizeEvent(type, data);
    log.log("emitting", { type, app: event.app });
    this.emit("event", event);
  }
}
