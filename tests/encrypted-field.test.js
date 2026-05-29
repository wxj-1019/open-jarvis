import { describe, it, expect } from "vitest";
import { EncryptedField } from "../lib/db/encrypted-field.js";

describe("EncryptedField", () => {
  const masterKey = Buffer.alloc(32, "test-key-12345678901234567890");
  const field = new EncryptedField(masterKey);

  it("should encrypt and decrypt text", () => {
    const plaintext = "Hello, sensitive world!";
    const encrypted = field.encrypt(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(typeof encrypted).toBe("string"); // base64

    const decrypted = field.decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("should return null for null input", () => {
    expect(field.encrypt(null)).toBeNull();
    expect(field.decrypt(null)).toBeNull();
  });

  it("should produce different ciphertexts for same plaintext", () => {
    const plaintext = "same text";
    const encrypted1 = field.encrypt(plaintext);
    const encrypted2 = field.encrypt(plaintext);

    expect(encrypted1).not.toBe(encrypted2); // different IV/salt
  });

  it("should fail to decrypt with wrong key", () => {
    const plaintext = "secret";
    const encrypted = field.encrypt(plaintext);

    const wrongKey = Buffer.alloc(32, "wrong-key-1234567890123456789");
    const wrongField = new EncryptedField(wrongKey);

    expect(() => wrongField.decrypt(encrypted)).toThrow();
  });

  it("should reject invalid masterKey", () => {
    expect(() => new EncryptedField("short")).toThrow("32-byte Buffer");
    expect(() => new EncryptedField(Buffer.alloc(16))).toThrow("32-byte Buffer");
  });
});
