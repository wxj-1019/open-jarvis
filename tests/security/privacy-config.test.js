import { describe, it, expect } from "vitest";
import { PrivacyConfig, validatePrivacyConfig } from "../../lib/privacy/privacy-config.js";

describe("PrivacyConfig", () => {
  it("should create default config", () => {
    const config = new PrivacyConfig();
    expect(config.globalLevel).toBe("standard");
    expect(config.excludedApps).toEqual([]);
    expect(config.excludedWindows).toEqual([]);
  });

  it("should validate glob patterns", () => {
    const config = new PrivacyConfig({
      excludedApps: ["1Password", "Banking*"],
      excludedWindows: ["*password*", "*credit card*"],
    });

    expect(config.isAppExcluded("1Password")).toBe(true);
    expect(config.isAppExcluded("BankingApp")).toBe(true);
    expect(config.isAppExcluded("Chrome")).toBe(false);

    expect(config.isWindowExcluded("Enter password")).toBe(true);
    expect(config.isWindowExcluded("Main Dashboard")).toBe(false);
  });

  it("should check work hours", () => {
    const config = new PrivacyConfig({
      workHoursOnly: {
        enabled: true,
        timeRange: "09:00-18:00",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      },
    });

    // Mock Monday 10:00
    const monday10am = new Date("2026-05-25T10:00:00");
    expect(config.isWithinWorkHours(monday10am)).toBe(true);

    // Mock Sunday 10:00
    const sunday10am = new Date("2026-05-24T10:00:00");
    expect(config.isWithinWorkHours(sunday10am)).toBe(false);
  });

  it("should serialize to JSON", () => {
    const config = new PrivacyConfig({ globalLevel: "minimal" });
    const json = config.toJSON();
    expect(json.globalLevel).toBe("minimal");
  });

  it("should validate config correctly", () => {
    const valid = validatePrivacyConfig({ globalLevel: "standard" });
    expect(valid.valid).toBe(true);

    const invalid = validatePrivacyConfig({ globalLevel: "invalid" });
    expect(invalid.valid).toBe(false);

    const badTime = validatePrivacyConfig({
      workHoursOnly: { timeRange: "bad-format" },
    });
    expect(badTime.valid).toBe(false);
  });
});
