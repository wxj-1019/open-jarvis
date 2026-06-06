import { describe, it, expect } from "vitest";
import {
  getMcpPresets,
  getPresetById,
  getPresetsByCategory,
} from "../../plugins/mcp/lib/mcp-presets.js";

const REQUIRED_FIELDS = [
  "id",
  "name",
  "description",
  "category",
  "icon",
  "transport",
  "command",
  "args",
  "envSchema",
  "oauthScopes",
  "autoStart",
  "authType",
];

describe("mcp-presets", () => {
  describe("getMcpPresets", () => {
    it("returns non-empty array", () => {
      const presets = getMcpPresets();
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBeGreaterThan(0);
    });

    it("includes Google Calendar preset with correct properties", () => {
      const presets = getMcpPresets();
      const googleCalendar = presets.find((p) => p.id === "google-calendar");
      expect(googleCalendar).toBeDefined();
      expect(googleCalendar.name).toContain("Google Calendar");
      expect(googleCalendar.category).toBe("calendar");
      expect(googleCalendar.transport).toBe("stdio");
      expect(googleCalendar.command).toBe("npx");
      expect(googleCalendar.args).toContain("@modelcontextprotocol/server-google-calendar");
      expect(googleCalendar.authType).toBe("oauth");
    });

    it("includes Gmail preset with correct category", () => {
      const presets = getMcpPresets();
      const gmail = presets.find((p) => p.id === "gmail");
      expect(gmail).toBeDefined();
      expect(gmail.name).toContain("Gmail");
      expect(gmail.category).toBe("email");
      expect(gmail.authType).toBe("oauth");
    });
  });

  describe("getPresetById", () => {
    it("returns correct preset", () => {
      const preset = getPresetById("outlook-mail");
      expect(preset).toBeDefined();
      expect(preset.id).toBe("outlook-mail");
      expect(preset.name).toContain("Outlook");
      expect(preset.category).toBe("email");
      expect(preset.command).toBe("npx");
      expect(preset.args).toContain("@microsoft/mcp-server-mail");
    });

    it("returns null for unknown id", () => {
      const preset = getPresetById("non-existent-preset");
      expect(preset).toBeNull();
    });
  });

  describe("getPresetsByCategory", () => {
    it("returns calendar presets", () => {
      const presets = getPresetsByCategory("calendar");
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBe(2);
      expect(presets.every((p) => p.category === "calendar")).toBe(true);
    });

    it("returns email presets", () => {
      const presets = getPresetsByCategory("email");
      expect(Array.isArray(presets)).toBe(true);
      expect(presets.length).toBe(2);
      expect(presets.every((p) => p.category === "email")).toBe(true);
    });

    it("returns empty array for unknown category", () => {
      const presets = getPresetsByCategory("unknown");
      expect(presets).toEqual([]);
    });
  });

  describe("preset structure", () => {
    it("each preset has all required fields", () => {
      const presets = getMcpPresets();
      for (const preset of presets) {
        for (const field of REQUIRED_FIELDS) {
          expect(preset).toHaveProperty(field);
          expect(preset[field]).toBeDefined();
        }
      }
    });
  });

  describe("envSchema content", () => {
    it("Google presets have GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET", () => {
      const googlePresets = getMcpPresets().filter((p) => p.id.startsWith("google") || p.id === "gmail");
      for (const preset of googlePresets) {
        expect(preset.envSchema).toHaveProperty("GOOGLE_CLIENT_ID");
        expect(preset.envSchema).toHaveProperty("GOOGLE_CLIENT_SECRET");
        expect(preset.envSchema.GOOGLE_CLIENT_ID.required).toBe(true);
        expect(preset.envSchema.GOOGLE_CLIENT_SECRET.secret).toBe(true);
      }
    });

    it("Outlook presets have AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID", () => {
      const outlookPresets = getMcpPresets().filter((p) => p.id.startsWith("outlook"));
      for (const preset of outlookPresets) {
        expect(preset.envSchema).toHaveProperty("AZURE_CLIENT_ID");
        expect(preset.envSchema).toHaveProperty("AZURE_CLIENT_SECRET");
        expect(preset.envSchema).toHaveProperty("AZURE_TENANT_ID");
        expect(preset.envSchema.AZURE_CLIENT_SECRET.secret).toBe(true);
      }
    });
  });
});
