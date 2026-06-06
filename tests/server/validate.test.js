import { describe, expect, it, vi } from "vitest";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { validateBody } from "../../server/utils/validate.js";

// Helper: create a mock Hono context
function mockContext(body = null, rejectText = false) {
  const ctx = {
    req: {
      text: rejectText
        ? vi.fn(() => Promise.reject(new Error("stream error")))
        : vi.fn(() => Promise.resolve(body === null ? "" : JSON.stringify(body))),
    },
    json: vi.fn((data, status) => {
      const response = { ...data };
      response._status = status;
      return response;
    }),
    set: vi.fn(),
    get: vi.fn(),
  };
  return ctx;
}

const SimpleSchema = Type.Object({
  name: Type.String(),
  age: Type.Optional(Type.Number()),
});

describe("validateBody", () => {
  describe("null schema mode", () => {
    it("parses JSON without type checking", async () => {
      const c = mockContext({ any: "data", nested: { ok: true }, arr: [1, 2] });
      const next = vi.fn();
      await validateBody(null)(c, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(c.set).toHaveBeenCalledWith("validatedBody", { any: "data", nested: { ok: true }, arr: [1, 2] });
    });

    it("returns 400 for malformed JSON with null schema", async () => {
      const c = {
        req: { text: vi.fn(() => Promise.resolve("invalid")) },
        json: vi.fn((data, status) => ({ ...data, _status: status })),
        set: vi.fn(),
      };
      const next = vi.fn();
      const res = await validateBody(null)(c, next);
      expect(res.error).toBe("invalid_json");
      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 400 on stream error with null schema", async () => {
      const c = {
        req: { text: vi.fn(() => Promise.reject(new Error("stream error"))) },
        json: vi.fn((data, status) => ({ ...data, _status: status })),
        set: vi.fn(),
      };
      const next = vi.fn();
      const res = await validateBody(null)(c, next);
      expect(res.error).toBe("failed_to_read_body");
      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("valid input", () => {
    it("passes valid JSON body through", async () => {
      const c = mockContext({ name: "Alice", age: 30 });
      const next = vi.fn();

      const middleware = validateBody(SimpleSchema);
      const result = await middleware(c, next);

      expect(result).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
      expect(c.set).toHaveBeenCalledWith("validatedBody", { name: "Alice", age: 30 });
    });

    it("accepts body with only required fields", async () => {
      const c = mockContext({ name: "Bob" });
      const next = vi.fn();
      await validateBody(SimpleSchema)(c, next);
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("falls back to empty object for empty body", async () => {
      const c = mockContext(null);
      const next = vi.fn();
      await validateBody(Type.Object({}))(c, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe("invalid JSON", () => {
    it("returns 400 for malformed JSON", async () => {
      const c = {
        req: { text: vi.fn(() => Promise.resolve("not-json")) },
        json: vi.fn((data, status) => ({ ...data, _status: status })),
        set: vi.fn(),
      };
      const next = vi.fn();
      const res = await validateBody(SimpleSchema)(c, next);
      expect(res.error).toBe("invalid_json");
      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("failed_to_read_body", () => {
    it("returns 400 when reading body fails", async () => {
      const c = {
        req: { text: vi.fn(() => Promise.reject(new Error("stream error"))) },
        json: vi.fn((data, status) => ({ ...data, _status: status })),
        set: vi.fn(),
      };
      const next = vi.fn();
      const res = await validateBody(SimpleSchema)(c, next);
      expect(res.error).toBe("failed_to_read_body");
      expect(res._status).toBe(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("schema validation", () => {
    it("returns 422 when schema check fails", async () => {
      const c = mockContext({ name: 123 });
      const next = vi.fn();
      const res = await validateBody(SimpleSchema)(c, next);
      expect(res.error).toBe("validation_error");
      expect(res._status).toBe(422);
      expect(Array.isArray(res.detail)).toBe(true);
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 422 when required field is missing", async () => {
      const c = mockContext({ age: 25 });
      const next = vi.fn();
      const res = await validateBody(SimpleSchema)(c, next);
      expect(res.error).toBe("validation_error");
      expect(res._status).toBe(422);
    });
  });
});
