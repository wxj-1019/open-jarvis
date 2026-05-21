import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpTokenRefresher } from "../plugins/mcp/lib/mcp-token-refresh.js";

function createMockConnector(overrides = {}) {
  const now = Date.now();
  const oauthOverrides = overrides.oauth || {};
  const { oauth, ...restOverrides } = overrides;

  return {
    id: "test-connector",
    url: "https://mcp.example.com/mcp",
    oauthClientId: "client-id",
    oauthClientSecret: "client-secret",
    oauth: Object.assign({
      accessToken: "access-token-123",
      refreshToken: "refresh-token-123",
      tokenType: "Bearer",
      tokenEndpoint: "https://auth.example.com/token",
      expiresIn: 3600,
      obtainedAt: now,
      expiresAt: now + 3600 * 1000,
    }, oauthOverrides),
    ...restOverrides,
  };
}

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

describe("McpTokenRefresher", () => {
  let tokenRefresher;
  let mockLog;

  beforeEach(() => {
    mockLog = {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };
    tokenRefresher = new McpTokenRefresher({ log: mockLog });
  });

  describe("isTokenExpiring", () => {
    it("returns false when connector has no oauth state", () => {
      const connector = createMockConnector({ oauth: null });
      expect(tokenRefresher.isTokenExpiring(connector)).toBe(false);
    });

    it("returns false when connector has no refreshToken", () => {
      const connector = createMockConnector({
        oauth: { refreshToken: "", accessToken: "token" },
      });
      expect(tokenRefresher.isTokenExpiring(connector)).toBe(false);
    });

    it("returns false when token expires in more than 5 minutes", () => {
      const connector = createMockConnector({
        oauth: {
          expiresAt: Date.now() + 10 * 60 * 1000,
        },
      });
      expect(tokenRefresher.isTokenExpiring(connector)).toBe(false);
    });

    it("returns true when token expires within 5 minutes", () => {
      const connector = createMockConnector({
        oauth: {
          expiresAt: Date.now() + 3 * 60 * 1000,
        },
      });
      expect(tokenRefresher.isTokenExpiring(connector)).toBe(true);
    });

    it("returns true when token expires within 1 minute", () => {
      const connector = createMockConnector({
        oauth: {
          expiresAt: Date.now() + 1 * 60 * 1000,
        },
      });
      expect(tokenRefresher.isTokenExpiring(connector)).toBe(true);
    });

    it("returns true when token has already expired", () => {
      const connector = createMockConnector({
        oauth: {
          expiresAt: Date.now() - 1000,
        },
      });
      expect(tokenRefresher.isTokenExpiring(connector)).toBe(true);
    });

    it("returns false when expiresAt is 0 (no expiry)", () => {
      const connector = createMockConnector({
        oauth: {
          expiresAt: 0,
          refreshToken: "refresh-token",
        },
      });
      expect(tokenRefresher.isTokenExpiring(connector)).toBe(false);
    });

    it("uses default threshold of 5 minutes", () => {
      const connector = createMockConnector({
        oauth: {
          expiresAt: Date.now() + 5 * 60 * 1000 - 1000,
        },
      });
      expect(tokenRefresher.isTokenExpiring(connector)).toBe(true);

      const connector2 = createMockConnector({
        oauth: {
          expiresAt: Date.now() + 5 * 60 * 1000 + 1000,
        },
      });
      expect(tokenRefresher.isTokenExpiring(connector2)).toBe(false);
    });
  });

  describe("refreshToken", () => {
    it("throws error when connector has no oauth state", async () => {
      const connector = createMockConnector();
      connector.oauth = null;
      await expect(tokenRefresher.refreshToken(connector)).rejects.toThrow(
        "Cannot refresh token: connector 'test-connector' has no OAuth state"
      );
    });

    it("throws error when connector has no refreshToken", async () => {
      const connector = createMockConnector({
        oauth: { refreshToken: "" },
      });
      await expect(tokenRefresher.refreshToken(connector)).rejects.toThrow(
        "Cannot refresh token: connector 'test-connector' has no refresh_token"
      );
    });

    it("successfully refreshes token with refresh_token grant type", async () => {
      const mockFetch = vi.fn(async (url, init) => {
        expect(String(url)).toBe("https://auth.example.com/token");
        expect(init.method).toBe("POST");

        const body = new URLSearchParams(String(init.body));
        expect(body.get("grant_type")).toBe("refresh_token");
        expect(body.get("refresh_token")).toBe("refresh-token-123");
        expect(body.get("client_id")).toBe("client-id");
        expect(body.get("client_secret")).toBe("client-secret");

        return jsonResponse({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 7200,
          scope: "files:read",
          token_type: "Bearer",
        });
      });

      const connector = createMockConnector();
      const result = await tokenRefresher.refreshToken(connector, {
        fetchImpl: mockFetch,
      });

      expect(result).toMatchObject({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresIn: 7200,
        scope: "files:read",
        tokenType: "Bearer",
      });
      expect(result.obtainedAt).toBeDefined();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("refreshes token without client_secret when not provided", async () => {
      const mockFetch = vi.fn(async (url, init) => {
        const body = new URLSearchParams(String(init.body));
        expect(body.get("client_secret")).toBeNull();

        return jsonResponse({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
        });
      });

      const connector = createMockConnector({
        oauthClientSecret: "",
      });
      const result = await tokenRefresher.refreshToken(connector, {
        fetchImpl: mockFetch,
      });

      expect(result.accessToken).toBe("new-access-token");
    });

    it("handles failed token refresh with error", async () => {
      const mockFetch = vi.fn(async () => {
        return new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Refresh token has expired",
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      });

      const connector = createMockConnector();
      await expect(
        tokenRefresher.refreshToken(connector, { fetchImpl: mockFetch })
      ).rejects.toThrow("Refresh token has expired");

      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining("[mcp:test-connector] token refresh failed")
      );
    });

    it("handles network errors gracefully", async () => {
      const mockFetch = vi.fn(async () => {
        throw new Error("Network error");
      });

      const connector = createMockConnector();
      await expect(
        tokenRefresher.refreshToken(connector, { fetchImpl: mockFetch })
      ).rejects.toThrow("Network error");

      expect(mockLog.warn).toHaveBeenCalledWith(
        expect.stringContaining("[mcp:test-connector] token refresh failed")
      );
    });

    it("logs successful token refresh", async () => {
      const mockFetch = vi.fn(async () => {
        return jsonResponse({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
        });
      });

      const connector = createMockConnector();
      await tokenRefresher.refreshToken(connector, { fetchImpl: mockFetch });

      expect(mockLog.info).toHaveBeenCalledWith(
        expect.stringContaining("[mcp:test-connector] token refreshed successfully")
      );
    });
  });

  describe("concurrent refresh prevention", () => {
    it("prevents concurrent refresh attempts for the same connector", async () => {
      let resolveFirst = null;
      const mockFetch = vi.fn(async () => {
        return new Promise((resolve) => {
          resolveFirst = () =>
            resolve(
              jsonResponse({
                access_token: "new-access-token",
                refresh_token: "new-refresh-token",
                expires_in: 3600,
              })
            );
        });
      });

      const connector = createMockConnector();

      const firstRefresh = tokenRefresher.refreshToken(connector, {
        fetchImpl: mockFetch,
      });

      const secondRefresh = tokenRefresher.refreshToken(connector, {
        fetchImpl: mockFetch,
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      resolveFirst();
      const [result1, result2] = await Promise.all([
        firstRefresh,
        secondRefresh,
      ]);

      expect(result1).toBe(result2);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("allows refresh for different connectors concurrently", async () => {
      const mockFetch = vi.fn(async () => {
        return jsonResponse({
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_in: 3600,
        });
      });

      const connector1 = createMockConnector({ id: "connector-1" });
      const connector2 = createMockConnector({ id: "connector-2" });

      const [result1, result2] = await Promise.all([
        tokenRefresher.refreshToken(connector1, { fetchImpl: mockFetch }),
        tokenRefresher.refreshToken(connector2, { fetchImpl: mockFetch }),
      ]);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    it("clears pending refresh after failure to allow retry", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce(
          jsonResponse({
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expires_in: 3600,
          })
        );

      const connector = createMockConnector();

      await expect(
        tokenRefresher.refreshToken(connector, { fetchImpl: mockFetch })
      ).rejects.toThrow("Network error");

      const result = await tokenRefresher.refreshToken(connector, {
        fetchImpl: mockFetch,
      });

      expect(result.accessToken).toBe("new-access-token");
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("shouldRefresh", () => {
    it("returns true when token is expiring", () => {
      const connector = createMockConnector({
        oauth: {
          expiresAt: Date.now() + 2 * 60 * 1000,
        },
      });
      expect(tokenRefresher.shouldRefresh(connector)).toBe(true);
    });

    it("returns false when token is not expiring", () => {
      const connector = createMockConnector({
        oauth: {
          expiresAt: Date.now() + 30 * 60 * 1000,
        },
      });
      expect(tokenRefresher.shouldRefresh(connector)).toBe(false);
    });

    it("returns false when connector has no oauth", () => {
      const connector = createMockConnector({ oauth: null });
      expect(tokenRefresher.shouldRefresh(connector)).toBe(false);
    });
  });
});
