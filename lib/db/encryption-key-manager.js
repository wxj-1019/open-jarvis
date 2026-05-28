import { randomBytes, scryptSync } from "node:crypto";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("encryption-key-manager");

/**
 * 加密密钥管理器
 * 负责从系统密钥环获取或创建主密钥
 */
export class EncryptionKeyManager {
  constructor() {
    this._key = null;
    this._serviceName = "openjarvis";
    this._accountName = "context-data-master-key";
  }

  /**
   * 获取或创建主密钥
   * @returns {Promise<Buffer>} 32 字节密钥
   */
  async getOrCreateKey() {
    if (this._key) return this._key;

    try {
      // 尝试从系统密钥环读取
      const keytar = await import("keytar");
      const existing = await keytar.getPassword(this._serviceName, this._accountName);

      if (existing) {
        this._key = Buffer.from(existing, "base64");
        log.log("loaded existing key from keyring");
        return this._key;
      }

      // 创建新密钥并存储
      this._key = randomBytes(32);
      await keytar.setPassword(
        this._serviceName,
        this._accountName,
        this._key.toString("base64")
      );
      log.log("created and stored new key in keyring");
      return this._key;
    } catch (err) {
      log.log(`keyring access failed: ${err.message}`);
      // 降级：使用派生密钥
      return this._deriveFallbackKey();
    }
  }

  /**
   * 降级密钥派生（仅当密钥环不可用时）
   * @private
   */
  _deriveFallbackKey() {
    try {
      const { machineIdSync } = require("node-machine-id");
      const machineId = machineIdSync();
      this._key = scryptSync(machineId, "openjarvis-salt", 32);
      log.log("derived fallback key from machine id");
      return this._key;
    } catch {
      // 最后降级：随机生成（每次重启会丢失历史数据）
      log.log("using ephemeral key - data will not persist across restarts");
      this._key = randomBytes(32);
      return this._key;
    }
  }

  /**
   * 清除缓存的密钥
   */
  clearCache() {
    this._key = null;
  }
}
