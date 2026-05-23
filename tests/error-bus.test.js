import { describe, expect, it, vi, beforeEach } from "vitest";
import { ErrorBus } from "../shared/error-bus.js";
import { AppError } from "../shared/errors.js";

describe("ErrorBus", () => {
  let bus;

  beforeEach(() => {
    bus = new ErrorBus();
    // Suppress console output during tests
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("report", () => {
    it("notifies listeners with AppError and route", () => {
      const listener = vi.fn();
      bus.subscribe(listener);

      const err = new AppError("LLM_TIMEOUT", { message: "timeout" });
      bus.report(err);

      expect(listener).toHaveBeenCalledTimes(1);
      const [entry, route] = listener.mock.calls[0];
      expect(entry.error).toBeInstanceOf(AppError);
      expect(entry.error.code).toBe("LLM_TIMEOUT");
      expect(entry.timestamp).toBeGreaterThan(0);
      expect(entry.breadcrumbs).toEqual([]);
      expect(route).toBe("toast"); // degraded → toast
    });

    it("deduplicates errors with same code within 5s window", () => {
      const listener = vi.fn();
      bus.subscribe(listener);

      bus.report(new AppError("LLM_TIMEOUT"));
      bus.report(new AppError("LLM_TIMEOUT"));
      bus.report(new AppError("LLM_TIMEOUT"));

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("does not deduplicate errors with different codes", () => {
      const listener = vi.fn();
      bus.subscribe(listener);

      bus.report(new AppError("LLM_TIMEOUT"));
      bus.report(new AppError("DB_ERROR"));
      bus.report(new AppError("FS_NOT_FOUND"));

      expect(listener).toHaveBeenCalledTimes(3);
    });

    it("wraps plain Error into AppError", () => {
      const listener = vi.fn();
      bus.subscribe(listener);

      bus.report(new Error("raw error"));

      expect(listener).toHaveBeenCalledTimes(1);
      const entry = listener.mock.calls[0][0];
      expect(entry.error).toBeInstanceOf(AppError);
      expect(entry.error.code).toBe("UNKNOWN");
    });

    it("merges extra context into error context", () => {
      const listener = vi.fn();
      bus.subscribe(listener);

      const err = new AppError("UNKNOWN", { context: { a: 1 } });
      bus.report(err, { context: { b: 2 } });

      expect(err.context).toMatchObject({ a: 1, b: 2 });
    });

    it("uses dedupeKey for deduplication when provided", () => {
      const listener = vi.fn();
      bus.subscribe(listener);

      bus.report(new AppError("UNKNOWN", { context: { id: "A" } }), { dedupeKey: "widget-A" });
      bus.report(new AppError("UNKNOWN", { context: { id: "B" } }), { dedupeKey: "widget-A" });

      // Same dedupeKey → only 1 report
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("cleans up stale fingerprints when map exceeds 200 entries", () => {
      const listener = vi.fn();
      bus.subscribe(listener);

      // Fill up with 201 unique dedupeKeys that simulate expired entries
      // (we set the timestamp far in the past)
      for (let i = 0; i < 201; i++) {
        // Directly manipulate internal map to simulate old entries
        bus._recentFingerprints.set(`stale-${i}`, Date.now() - 10000);
      }
      // The next report should trigger cleanup
      bus.report(new AppError("LLM_TIMEOUT"));
      expect(bus._recentFingerprints.size).toBeLessThan(200);
    });
  });

  describe("breadcrumbs", () => {
    it("adds breadcrumbs with timestamp", () => {
      bus.addBreadcrumb({ action: "click" });
      bus.addBreadcrumb({ action: "navigate" });

      expect(bus._breadcrumbs).toHaveLength(2);
      expect(bus._breadcrumbs[0].action).toBe("click");
      expect(bus._breadcrumbs[0].timestamp).toBeGreaterThan(0);
    });

    it("caps breadcrumbs at 50", () => {
      for (let i = 0; i < 60; i++) {
        bus.addBreadcrumb({ index: i });
      }

      expect(bus._breadcrumbs).toHaveLength(50);
      // First 10 should have been shifted out
      expect(bus._breadcrumbs[0].index).toBe(10);
      expect(bus._breadcrumbs[49].index).toBe(59);
    });

    it("copies breadcrumbs into report entries", () => {
      bus.addBreadcrumb({ step: "login" });
      bus.addBreadcrumb({ step: "navigate" });

      const listener = vi.fn();
      bus.subscribe(listener);
      bus.report(new AppError("UNKNOWN"));

      const entry = listener.mock.calls[0][0];
      expect(entry.breadcrumbs).toHaveLength(2);
      expect(entry.breadcrumbs[0].step).toBe("login");
    });
  });

  describe("subscribe / unsubscribe", () => {
    it("returns unsubscribe function", () => {
      const listener = vi.fn();
      const unsubscribe = bus.subscribe(listener);

      bus.report(new AppError("UNKNOWN"));
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      bus.report(new AppError("DB_ERROR"));
      expect(listener).toHaveBeenCalledTimes(1); // still 1, not called after unsubscribe
    });

    it("does not crash when no listeners are registered", () => {
      expect(() => bus.report(new AppError("UNKNOWN"))).not.toThrow();
    });

    it("handles listener that throws gracefully", () => {
      const badListener = vi.fn(() => { throw new Error("listener crash"); });
      const goodListener = vi.fn();

      bus.subscribe(badListener);
      bus.subscribe(goodListener);

      expect(() => bus.report(new AppError("UNKNOWN"))).not.toThrow();
      expect(goodListener).toHaveBeenCalledTimes(1);
    });
  });

  describe("_autoRoute", () => {
    it("routes WS_DISCONNECTED to statusbar", () => {
      const err = new AppError("WS_DISCONNECTED");
      expect(bus._autoRoute(err)).toBe("statusbar");
    });

    it("routes critical errors to boundary", () => {
      const err = new AppError("FS_PERMISSION");
      expect(bus._autoRoute(err)).toBe("boundary");
    });

    it("routes degraded errors to toast", () => {
      const err = new AppError("LLM_TIMEOUT");
      expect(bus._autoRoute(err)).toBe("toast");
    });

    it("routes cosmetic errors to toast", () => {
      const err = new AppError("LLM_SLOW_RESPONSE");
      expect(bus._autoRoute(err)).toBe("toast");
    });
  });
});
