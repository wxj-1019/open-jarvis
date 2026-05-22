import { describe, it, expect } from "vitest";
import {
  stringOrEmpty,
  normalizeStringRecord,
  normalizeTimeoutSeconds,
  requestTimeoutMs,
} from "../plugins/mcp/lib/mcp-utils.js";

describe("MCP Utils", () => {
  describe("stringOrEmpty", () => {
    it("returns trimmed string for string input", () => {
      expect(stringOrEmpty("hello")).toBe("hello");
      expect(stringOrEmpty("  hello  ")).toBe("hello");
      expect(stringOrEmpty("")).toBe("");
      expect(stringOrEmpty("   ")).toBe("");
    });

    it("returns empty string for non-string input", () => {
      expect(stringOrEmpty(null)).toBe("");
      expect(stringOrEmpty(undefined)).toBe("");
      expect(stringOrEmpty(123)).toBe("");
      expect(stringOrEmpty({})).toBe("");
      expect(stringOrEmpty([])).toBe("");
      expect(stringOrEmpty(true)).toBe("");
      expect(stringOrEmpty(false)).toBe("");
    });
  });

  describe("normalizeStringRecord", () => {
    it("returns object with string values", () => {
      const input = { a: "hello", b: "world" };
      const result = normalizeStringRecord(input);
      expect(result).toEqual({ a: "hello", b: "world" });
    });

    it("filters out non-string values", () => {
      const input = { a: "hello", b: 123, c: null, d: "world", e: undefined, f: {} };
      const result = normalizeStringRecord(input);
      expect(result).toEqual({ a: "hello", d: "world" });
    });

    it("returns empty object for null/undefined", () => {
      expect(normalizeStringRecord(null)).toEqual({});
      expect(normalizeStringRecord(undefined)).toEqual({});
    });

    it("returns empty object for arrays", () => {
      expect(normalizeStringRecord([])).toEqual({});
      expect(normalizeStringRecord(["a", "b"])).toEqual({});
    });

    it("returns empty object for non-object types", () => {
      expect(normalizeStringRecord(123)).toEqual({});
      expect(normalizeStringRecord("string")).toEqual({});
    });
  });

  describe("normalizeTimeoutSeconds", () => {
    it("returns valid positive number", () => {
      expect(normalizeTimeoutSeconds(10)).toBe(10);
      expect(normalizeTimeoutSeconds(60)).toBe(60);
      expect(normalizeTimeoutSeconds("30")).toBe(30);
    });

    it("returns default for empty or null values", () => {
      expect(normalizeTimeoutSeconds("")).toBe(0);
      expect(normalizeTimeoutSeconds(null)).toBe(0);
      expect(normalizeTimeoutSeconds(undefined)).toBe(0);
    });

    it("returns default for invalid values", () => {
      expect(normalizeTimeoutSeconds(-5)).toBe(0);
      expect(normalizeTimeoutSeconds(0)).toBe(0);
      expect(normalizeTimeoutSeconds(NaN)).toBe(0);
      expect(normalizeTimeoutSeconds("invalid")).toBe(0);
    });

    it("accepts custom default value", () => {
      expect(normalizeTimeoutSeconds("", 60)).toBe(60);
      expect(normalizeTimeoutSeconds(null, 60)).toBe(60);
      expect(normalizeTimeoutSeconds(-5, 60)).toBe(60);
      expect(normalizeTimeoutSeconds(NaN, 10)).toBe(10);
    });
  });

  describe("requestTimeoutMs", () => {
    it("returns timeout in milliseconds for valid server timeout", () => {
      expect(requestTimeoutMs({ timeout: 10 })).toBe(10_000);
      expect(requestTimeoutMs({ timeout: 30 })).toBe(30_000);
      expect(requestTimeoutMs({ timeout: 60 })).toBe(60_000);
    });

    it("returns default for invalid timeout values", () => {
      expect(requestTimeoutMs({ timeout: 0 })).toBe(30_000);
      expect(requestTimeoutMs({ timeout: -5 })).toBe(30_000);
      expect(requestTimeoutMs({ timeout: null })).toBe(30_000);
      expect(requestTimeoutMs({ timeout: undefined })).toBe(30_000);
      expect(requestTimeoutMs({ timeout: NaN })).toBe(30_000);
    });

    it("returns default for missing server or timeout property", () => {
      expect(requestTimeoutMs(null)).toBe(30_000);
      expect(requestTimeoutMs(undefined)).toBe(30_000);
      expect(requestTimeoutMs({})).toBe(30_000);
    });

    it("accepts custom default value", () => {
      expect(requestTimeoutMs({ timeout: 0 }, 60_000)).toBe(60_000);
      expect(requestTimeoutMs(null, 10_000)).toBe(10_000);
      expect(requestTimeoutMs({ timeout: 5 }, 60_000)).toBe(5_000);
    });
  });
});
