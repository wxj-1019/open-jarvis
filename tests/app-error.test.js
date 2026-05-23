import { describe, expect, it } from "vitest";
import { AppError, ERROR_DEFS, ErrorSeverity, ErrorCategory } from "../shared/errors.js";

describe("AppError", () => {
  describe("ERROR_DEFS", () => {
    it("defines all 22 error codes with required metadata", () => {
      const codes = Object.keys(ERROR_DEFS);
      expect(codes).toHaveLength(22);

      for (const code of codes) {
        const def = ERROR_DEFS[code];
        expect(def).toHaveProperty("severity");
        expect(def).toHaveProperty("category");
        expect(def).toHaveProperty("i18nKey");
        expect(typeof def.retryable).toBe("boolean");

        // severity must be a valid value
        expect(Object.values(ErrorSeverity)).toContain(def.severity);

        // category must be a valid value
        expect(Object.values(ErrorCategory)).toContain(def.category);
      }
    });

    it("has LLM_TIMEOUT as retryable with httpStatus 504", () => {
      expect(ERROR_DEFS.LLM_TIMEOUT.retryable).toBe(true);
      expect(ERROR_DEFS.LLM_TIMEOUT.httpStatus).toBe(504);
    });

    it("has LLM_CIRCUIT_OPEN as non-retryable with httpStatus 503", () => {
      expect(ERROR_DEFS.LLM_CIRCUIT_OPEN.retryable).toBe(false);
      expect(ERROR_DEFS.LLM_CIRCUIT_OPEN.httpStatus).toBe(503);
    });

    it("has FS_PERMISSION as critical severity", () => {
      expect(ERROR_DEFS.FS_PERMISSION.severity).toBe("critical");
      expect(ERROR_DEFS.FS_PERMISSION.category).toBe("filesystem");
    });

    it("has UNKNOWN as degraded / unknown / non-retryable fallback", () => {
      expect(ERROR_DEFS.UNKNOWN.severity).toBe("degraded");
      expect(ERROR_DEFS.UNKNOWN.category).toBe("unknown");
      expect(ERROR_DEFS.UNKNOWN.retryable).toBe(false);
      expect(ERROR_DEFS.UNKNOWN.httpStatus).toBe(500);
    });
  });

  describe("construction", () => {
    it("creates an AppError with correct metadata from known code", () => {
      const err = new AppError("LLM_TIMEOUT", { message: "Request timed out" });

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
      expect(err.name).toBe("AppError");
      expect(err.code).toBe("LLM_TIMEOUT");
      expect(err.message).toBe("Request timed out");
      expect(err.severity).toBe("degraded");
      expect(err.category).toBe("llm");
      expect(err.retryable).toBe(true);
      expect(err.userMessageKey).toBe("error.llmTimeout");
      expect(err.httpStatus).toBe(504);
    });

    it("falls back to UNKNOWN for unknown code", () => {
      const err = new AppError("NONEXISTENT");

      expect(err.code).toBe("NONEXISTENT");
      expect(err.severity).toBe("degraded");
      expect(err.category).toBe("unknown");
      expect(err.retryable).toBe(false);
      expect(err.userMessageKey).toBe("error.unknown");
      expect(err.httpStatus).toBe(500);
    });

    it("uses code as message when no message provided", () => {
      const err = new AppError("LLM_TIMEOUT");
      expect(err.message).toBe("LLM_TIMEOUT");
    });

    it("stores context and generates traceId", () => {
      const err = new AppError("DB_ERROR", {
        message: "DB failure",
        context: { table: "memories" },
      });

      expect(err.context).toEqual({ table: "memories" });
      expect(err.traceId).toBeTruthy();
      expect(typeof err.traceId).toBe("string");
      expect(err.traceId.length).toBeGreaterThan(0);
    });

    it("accepts custom traceId", () => {
      const err = new AppError("UNKNOWN", { traceId: "abc123" });
      expect(err.traceId).toBe("abc123");
    });

    it("stores cause if provided", () => {
      const cause = new Error("root cause");
      const err = new AppError("IPC_FAILED", { cause });
      expect(err.cause).toBe(cause);
    });

    it("has httpStatus 500 as fallback when def lacks httpStatus", () => {
      // WS_DISCONNECTED has no httpStatus in its definition
      const err = new AppError("WS_DISCONNECTED");
      expect(err.httpStatus).toBe(500);
    });
  });

  describe("toJSON", () => {
    it("returns serializable representation", () => {
      const err = new AppError("CONFIG_PARSE", {
        message: "Invalid config",
        context: { file: "config.json" },
        traceId: "test-001",
      });

      const json = err.toJSON();
      expect(json).toEqual({
        code: "CONFIG_PARSE",
        message: "Invalid config",
        context: { file: "config.json" },
        traceId: "test-001",
      });
    });
  });

  describe("fromJSON", () => {
    it("reconstructs an AppError from JSON", () => {
      const err = AppError.fromJSON({
        code: "FS_NOT_FOUND",
        message: "File not found",
        context: { path: "/tmp/foo" },
        traceId: "from-json-test",
      });

      expect(err).toBeInstanceOf(AppError);
      expect(err.code).toBe("FS_NOT_FOUND");
      expect(err.message).toBe("File not found");
      expect(err.context).toEqual({ path: "/tmp/foo" });
      expect(err.traceId).toBe("from-json-test");
      expect(err.severity).toBe("degraded"); // from error def
    });

    it("defaults to UNKNOWN when code is missing", () => {
      const err = AppError.fromJSON({ message: "no code" });
      expect(err.code).toBe("UNKNOWN");
      expect(err.message).toBe("no code");
    });
  });

  describe("wrap", () => {
    it("returns the same AppError if already wrapped", () => {
      const original = new AppError("LLM_TIMEOUT");
      const wrapped = AppError.wrap(original);
      expect(wrapped).toBe(original);
    });

    it("wraps a plain Error into AppError", () => {
      const cause = new Error("plain error");
      const wrapped = AppError.wrap(cause, "DB_ERROR");

      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.code).toBe("DB_ERROR");
      expect(wrapped.message).toBe("plain error");
      expect(wrapped.cause).toBe(cause);
    });

    it("wraps a string into AppError", () => {
      const wrapped = AppError.wrap("something broke", "UNKNOWN");
      expect(wrapped).toBeInstanceOf(AppError);
      expect(wrapped.code).toBe("UNKNOWN");
      expect(wrapped.message).toBe("something broke");
    });

    it("preserves retryable flag from plain errors", () => {
      const cause = new Error("retry me");
      cause.retryable = true;
      const wrapped = AppError.wrap(cause, "FETCH_TIMEOUT");
      expect(wrapped.retryable).toBe(true);
    });

    it("uses UNKNOWN as default fallback code", () => {
      const wrapped = AppError.wrap(new Error("oops"));
      expect(wrapped.code).toBe("UNKNOWN");
    });
  });
});
