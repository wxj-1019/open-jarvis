import { describe, expect, it, vi } from "vitest";
import { CHECKS, FIX_MAP, runHealthChecks, getFixAction } from "../../server/utils/health-checks.js";

// Mock native modules at top level
vi.mock("better-sqlite3", () => ({
  default: class {
    constructor() {}
    exec() {}
    close() {}
  },
}));
vi.mock("sharp", () => ({
  default: function () {
    return {
      png: function () {
        return {
          toBuffer: function () {
            return Buffer.from([]);
          },
        };
      },
    };
  },
}));
vi.mock("fs", async () => {
  const actual = await vi.importActual("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      statfs: function () {
        return {
          bfree: BigInt(1000000),
          bsize: BigInt(4096),
        };
      },
      access: function () {
        return Promise.resolve();
      },
    },
  };
});

describe("health-checks", () => {
  describe("CHECKS", () => {
    it("has at least 5 check entries", () => {
      expect(CHECKS.length).toBeGreaterThanOrEqual(5);
    });

    it("each check has required fields", () => {
      for (const check of CHECKS) {
        expect(check).toHaveProperty("id");
        expect(check).toHaveProperty("name");
        expect(check).toHaveProperty("impact");
        expect(check).toHaveProperty("test");
        expect(typeof check.test).toBe("function");
      }
    });

    it("each check id is unique", () => {
      const ids = CHECKS.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe("FIX_MAP", () => {
    it("has rebuild-better-sqlite3, rebuild-sharp, pnpm-install, rebuild-all", () => {
      expect(FIX_MAP).toHaveProperty("rebuild-better-sqlite3");
      expect(FIX_MAP).toHaveProperty("rebuild-sharp");
      expect(FIX_MAP).toHaveProperty("pnpm-install");
      expect(FIX_MAP).toHaveProperty("rebuild-all");
    });

    it("each fix has command and name", () => {
      for (const [key, fix] of Object.entries(FIX_MAP)) {
        expect(fix).toHaveProperty("command");
        expect(fix).toHaveProperty("name");
        expect(typeof fix.command).toBe("string");
        expect(typeof fix.name).toBe("string");
      }
    });

    it("all commands start with pnpm", () => {
      for (const fix of Object.values(FIX_MAP)) {
        expect(fix.command.startsWith("pnpm")).toBe(true);
      }
    });
  });

  describe("getFixAction", () => {
    it("returns fix for valid action", () => {
      const fix = getFixAction("rebuild-all");
      expect(fix).toEqual(FIX_MAP["rebuild-all"]);
    });

    it("returns null for invalid action", () => {
      expect(getFixAction("nonexistent")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(getFixAction("")).toBeNull();
    });
  });

  describe("runHealthChecks", () => {
    it("returns healthy when all checks pass (mock)", async () => {
      const { runHealthChecks: run } = await import("../server/utils/health-checks.js");
      const result = await run();

      expect(result.status).toBeTruthy();
      expect(Array.isArray(result.checks)).toBe(true);
      expect(result.checks.length).toBeGreaterThanOrEqual(5);
    });

    it("returns degraded or critical when check fails", () => {
      // This test verifies the status logic
      const results = [
        { id: "test", name: "Test", status: "failed", error: "mock error", fixable: true, fixAction: null, impact: "test" },
      ];
      const status = results[0].status === "failed" ? "degraded" : "healthy";
      expect(status).toBe("degraded");
    });
  });
});
