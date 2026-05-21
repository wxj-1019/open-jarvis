import { exchangeMcpOAuthCode } from "./mcp-oauth.js";

const DEFAULT_THRESHOLD_MS = 5 * 60 * 1000;

export class McpTokenRefresher {
  constructor({ log = console, thresholdMs = DEFAULT_THRESHOLD_MS } = {}) {
    this.log = log;
    this.thresholdMs = thresholdMs;
    this.pendingRefreshes = new Map();
  }

  isTokenExpiring(connector) {
    const oauth = connector?.oauth;
    if (!oauth || typeof oauth !== "object") return false;
    if (!oauth.refreshToken) return false;
    if (!oauth.expiresAt || oauth.expiresAt === 0) return false;

    const timeUntilExpiry = oauth.expiresAt - Date.now();
    return timeUntilExpiry <= this.thresholdMs;
  }

  shouldRefresh(connector) {
    return this.isTokenExpiring(connector);
  }

  async refreshToken(connector, { fetchImpl = globalThis.fetch } = {}) {
    const oauth = connector?.oauth;
    if (!oauth || typeof oauth !== "object") {
      throw new Error(`Cannot refresh token: connector '${connector?.id || "unknown"}' has no OAuth state`);
    }
    if (!oauth.refreshToken) {
      throw new Error(`Cannot refresh token: connector '${connector.id}' has no refresh_token`);
    }

    const connectorId = connector.id;

    if (this.pendingRefreshes.has(connectorId)) {
      this.log.debug?.(`[mcp:${connectorId}] token refresh already in progress, waiting`);
      return this.pendingRefreshes.get(connectorId);
    }

    const refreshPromise = this._doRefresh(connector, { fetchImpl });
    this.pendingRefreshes.set(connectorId, refreshPromise);

    try {
      const result = await refreshPromise;
      return result;
    } finally {
      this.pendingRefreshes.delete(connectorId);
    }
  }

  async _doRefresh(connector, { fetchImpl }) {
    const connectorId = connector.id;
    const oauth = connector.oauth;

    try {
      this.log.info?.(`[mcp:${connectorId}] refreshing OAuth token`);

      const result = await exchangeMcpOAuthCode({
        tokenEndpoint: oauth.tokenEndpoint,
        grantType: "refresh_token",
        clientId: connector.oauthClientId || connector.clientId,
        clientSecret: connector.oauthClientSecret || connector.clientSecret || "",
        refreshToken: oauth.refreshToken,
        resource: connector.url,
        fetchImpl,
      });

      this.log.info?.(`[mcp:${connectorId}] token refreshed successfully`);
      return result;
    } catch (err) {
      this.log.warn?.(`[mcp:${connectorId}] token refresh failed: ${err.message}`);
      throw err;
    }
  }
}
