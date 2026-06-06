import { describe, it, expect } from "vitest";
import { PiiGuard } from "../../lib/privacy/pii-guard.js";

describe("PiiGuard", () => {
  const guard = new PiiGuard();

  it("should redact API keys", () => {
    const result = guard.sanitize("My key is sk-abc123def456ghi789jkl012");
    expect(result.text).toContain("[API_KEY]");
    expect(result.text).not.toContain("sk-abc");
    expect(result.redactions.some((r) => r.type === "apiKey")).toBe(true);
  });

  it("should redact emails", () => {
    const result = guard.sanitize("Contact me at user@example.com");
    expect(result.text).toBe("Contact me at [EMAIL]");
  });

  it("should redact phone numbers", () => {
    const result = guard.sanitize("Call 13812345678");
    expect(result.text).toContain("[PHONE]");
  });

  it("should redact credit cards", () => {
    const result = guard.sanitize("Card: 1234-5678-9012-3456");
    expect(result.text).toContain("[CARD]");
  });

  it("should handle empty text", () => {
    const result = guard.sanitize("");
    expect(result.text).toBe("");
    expect(result.redactions).toEqual([]);
  });

  it("should respect enabledTypes option", () => {
    const limited = new PiiGuard({ enabledTypes: ["email"] });
    const result = limited.sanitize("Email: a@b.com, Key: sk-xxx");
    expect(result.text).toContain("[EMAIL]");
    expect(result.text).toContain("sk-xxx"); // API key not redacted
  });

  it("should detect PII presence", () => {
    expect(guard.containsPii("user@example.com")).toBe(true);
    expect(guard.containsPii("Hello world")).toBe(false);
  });

  it("should return supported types", () => {
    const types = guard.getSupportedTypes();
    expect(types).toContain("email");
    expect(types).toContain("apiKey");
    expect(types.length).toBeGreaterThanOrEqual(6);
  });
});
