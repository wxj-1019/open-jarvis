import { describe, it, expect } from "vitest";
import { getMcpPresets, getPresetById } from "../plugins/mcp/lib/mcp-presets.js";
import { normalizeConnector } from "../plugins/mcp/lib/mcp-runtime-helpers.js";

describe("MCP Presets Integration", () => {
  it("preset can be converted to a valid connector config", () => {
    const presets = getMcpPresets();
    for (const preset of presets) {
      const connectorInput = {
        name: preset.name,
        transport: preset.transport,
        command: preset.command,
        args: preset.args,
        authType: preset.authType,
        autoStart: preset.autoStart,
      };
      const normalized = normalizeConnector(connectorInput, preset.id);
      expect(normalized).not.toBeNull();
      expect(normalized.id).toBe(preset.id);
      expect(normalized.transport).toBe(preset.transport);
    }
  });

  it("all presets use supported transports", () => {
    const presets = getMcpPresets();
    const validTransports = new Set(["stdio", "remote", "streamable-http", "sse"]);
    for (const preset of presets) {
      expect(validTransports.has(preset.transport)).toBe(true);
    }
  });

  it("all OAuth presets have oauthScopes defined", () => {
    const presets = getMcpPresets();
    for (const preset of presets) {
      if (preset.authType === "oauth") {
        expect(Array.isArray(preset.oauthScopes)).toBe(true);
        expect(preset.oauthScopes.length).toBeGreaterThan(0);
      }
    }
  });

  it("all presets have non-empty envSchema for OAuth services", () => {
    const presets = getMcpPresets();
    for (const preset of presets) {
      if (preset.authType === "oauth") {
        expect(Object.keys(preset.envSchema).length).toBeGreaterThan(0);
      }
    }
  });
});
