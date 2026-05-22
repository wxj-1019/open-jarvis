import { describe, expect, it } from "vitest";
import { isPrivateIp, validateUrl, sanitizeConnectorConfig } from "../plugins/mcp/lib/mcp-security.js";

describe("MCP Security", () => {
  describe("isPrivateIp", () => {
    it("detects loopback addresses", () => {
      expect(isPrivateIp("127.0.0.1")).toBe(true);
      expect(isPrivateIp("127.0.0.255")).toBe(true);
      expect(isPrivateIp("localhost")).toBe(true);
    });

    it("detects private class A (10.x.x.x)", () => {
      expect(isPrivateIp("10.0.0.1")).toBe(true);
      expect(isPrivateIp("10.255.255.255")).toBe(true);
    });

    it("detects private class B (172.16-31.x.x)", () => {
      expect(isPrivateIp("172.16.0.1")).toBe(true);
      expect(isPrivateIp("172.20.0.1")).toBe(true);
      expect(isPrivateIp("172.31.255.255")).toBe(true);
      expect(isPrivateIp("172.15.0.1")).toBe(false);
      expect(isPrivateIp("172.32.0.1")).toBe(false);
    });

    it("detects private class C (192.168.x.x)", () => {
      expect(isPrivateIp("192.168.0.1")).toBe(true);
      expect(isPrivateIp("192.168.255.255")).toBe(true);
      expect(isPrivateIp("192.167.0.1")).toBe(false);
    });

    it("detects link-local addresses (169.254.x.x)", () => {
      expect(isPrivateIp("169.254.0.1")).toBe(true);
      expect(isPrivateIp("169.254.255.255")).toBe(true);
    });

    it("allows public IP addresses", () => {
      expect(isPrivateIp("8.8.8.8")).toBe(false);
      expect(isPrivateIp("1.1.1.1")).toBe(false);
      expect(isPrivateIp("104.16.132.229")).toBe(false);
    });
  });

  describe("validateUrl", () => {
    it("allows valid public HTTPS URLs", () => {
      const result = validateUrl("https://api.example.com/v1");
      expect(result.protocol).toBe("https:");
      expect(result.hostname).toBe("api.example.com");
    });

    it("allows valid public HTTP URLs", () => {
      const result = validateUrl("http://example.com");
      expect(result.protocol).toBe("http:");
    });

    it("rejects private IP addresses", () => {
      expect(() => validateUrl("http://127.0.0.1:8080")).toThrow("Private IP address not allowed");
      expect(() => validateUrl("http://192.168.1.1")).toThrow("Private IP address not allowed");
      expect(() => validateUrl("http://10.0.0.1:3000")).toThrow("Private IP address not allowed");
    });

    it("rejects localhost", () => {
      expect(() => validateUrl("http://localhost:8080")).toThrow("Localhost not allowed");
      expect(() => validateUrl("http://0.0.0.0:3000")).toThrow("Localhost not allowed");
    });

    it("rejects non-HTTP protocols", () => {
      expect(() => validateUrl("file:///etc/passwd")).toThrow("Protocol not allowed");
      expect(() => validateUrl("ftp://example.com")).toThrow("Protocol not allowed");
      expect(() => validateUrl("gopher://example.com")).toThrow("Protocol not allowed");
    });

    it("rejects invalid URLs", () => {
      expect(() => validateUrl("not-a-url")).toThrow("Invalid URL");
      expect(() => validateUrl("")).toThrow("URL is required");
      expect(() => validateUrl(null)).toThrow("URL is required");
    });
  });

  describe("sanitizeConnectorConfig", () => {
    it("sanitizes URL in connector config", () => {
      const config = { url: "https://api.example.com" };
      const result = sanitizeConnectorConfig(config);
      expect(result.url).toBe("https://api.example.com");
    });

    it("rejects private IP in connector config", () => {
      const config = { url: "http://127.0.0.1:8080" };
      expect(() => sanitizeConnectorConfig(config)).toThrow("Private IP address not allowed");
    });

    it("allows safe commands", () => {
      const config = { command: "npx" };
      const result = sanitizeConnectorConfig(config);
      expect(result.command).toBe("npx");
    });

    it("rejects unsafe commands", () => {
      const config = { command: "rm" };
      expect(() => sanitizeConnectorConfig(config)).toThrow("Command not allowed");
    });

    it("rejects commands with injection", () => {
      const config = { command: "npx && rm -rf /" };
      expect(() => sanitizeConnectorConfig(config)).toThrow("Command not allowed");
    });
  });
});
