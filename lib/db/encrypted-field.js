import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

export class EncryptedField {
  /**
   * @param {Buffer} masterKey  32 字节主密钥
   */
  constructor(masterKey) {
    if (!Buffer.isBuffer(masterKey) || masterKey.length !== 32) {
      throw new Error("masterKey must be a 32-byte Buffer");
    }
    this._masterKey = masterKey;
  }

  /**
   * 加密明文
   * @param {string|null} plaintext
   * @returns {string|null} base64 编码的密文
   */
  encrypt(plaintext) {
    if (plaintext === null || plaintext === undefined) return null;
    if (typeof plaintext !== "string") {
      throw new Error("plaintext must be a string");
    }

    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);
    const key = scryptSync(this._masterKey, salt, 32);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // 存储格式: salt(32) + iv(16) + authTag(16) + ciphertext
    const result = Buffer.concat([salt, iv, authTag, encrypted]);
    return result.toString("base64");
  }

  /**
   * 解密密文
   * @param {string|null} ciphertext  base64 编码的密文
   * @returns {string|null}
   */
  decrypt(ciphertext) {
    if (ciphertext === null || ciphertext === undefined) return null;
    if (typeof ciphertext !== "string") {
      throw new Error("ciphertext must be a string");
    }

    const data = Buffer.from(ciphertext, "base64");

    if (data.length < SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error("invalid ciphertext: too short");
    }

    const salt = data.subarray(0, SALT_LENGTH);
    const iv = data.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const authTag = data.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
    );
    const encrypted = data.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

    const key = scryptSync(this._masterKey, salt, 32);
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  }
}
