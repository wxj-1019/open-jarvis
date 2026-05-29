import { describe, it, expect } from "vitest";
import { PrivacyGuard } from "../lib/privacy/privacy-guard.js";

describe("PrivacyGuard", () => {
  it("should filter excluded app events", () => {
    const guard = new PrivacyGuard({
      excludedApps: ["1Password"],
    });

    const event = { type: "app:switch", app: "1Password", title: "Vault" };
    const result = guard.filterEvent(event);

    expect(result).toBeNull();
  });

  it("should allow non-excluded app events", () => {
    const guard = new PrivacyGuard();
    const event = { type: "app:switch", app: "Code.exe", title: "main.js" };

    const result = guard.filterEvent(event);
    expect(result).toEqual(event);
  });

  it("should redact PII in window content", () => {
    const guard = new PrivacyGuard();
    const content = {
      app: "chrome.exe",
      elements: [{ text: "Contact admin@company.com" }],
    };

    const result = guard.filterContent(content);
    expect(result.elements[0].text).toContain("[EMAIL]");
    expect(result.elements[0].text).not.toContain("admin@company.com");
  });

  it("should block content outside work hours", () => {
    const guard = new PrivacyGuard({
      workHoursOnly: {
        enabled: true,
        timeRange: "09:00-18:00",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
      },
    });

    // Mock Sunday
    const sunday = new Date("2026-05-24T10:00:00");
    const event = { type: "app:switch", app: "Code.exe" };

    const result = guard.filterEvent(event, sunday);
    expect(result).toBeNull();
  });

  it("should support config hot update", () => {
    const guard = new PrivacyGuard();

    // Initially allows all
    const event = { type: "app:switch", app: "Slack.exe", title: "Chat" };
    expect(guard.filterEvent(event)).toEqual(event);

    // Update config to exclude Slack
    guard.updateConfig({ excludedApps: ["Slack*"] });
    expect(guard.filterEvent(event)).toBeNull();
  });

  it("should filter events in batch", () => {
    const guard = new PrivacyGuard({ excludedApps: ["1Password"] });
    const events = [
      { type: "app:switch", app: "Code.exe", title: "main.js" },
      { type: "app:switch", app: "1Password", title: "Vault" },
      { type: "app:switch", app: "Chrome.exe", title: "Google" },
    ];

    const filtered = guard.filterEvents(events);
    expect(filtered).toHaveLength(2);
  });
});
