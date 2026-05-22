import {
  createMcpOAuthAuthorization,
  exchangeMcpOAuthCode,
  refreshMcpOAuthToken,
} from "./mcp-oauth.js";

export class OAuthManager {
  constructor(connectorManager) {
    this.manager = connectorManager;
  }

  async startOAuth(connectorId, redirectUri) {
    const connector = this.manager.getConfig().connectors.find((item) => item.id === connectorId);
    if (!connector) throw new Error(`MCP connector "${connectorId}" not found`);
    const { url, session } = await createMcpOAuthAuthorization({
      connector,
      redirectUri,
      fetchImpl: this.manager.fetchImpl,
    });
    this.manager.oauthSessions.set(session.state, { status: "pending", ...session });
    return { sessionId: session.state, url };
  }

  async completeOAuth({ state, code, error }) {
    const session = this.manager.oauthSessions.get(state);
    if (!session) throw new Error("OAuth session not found");
    if (error) {
      session.status = "error";
      session.error = error;
      return session;
    }
    try {
      const token = await exchangeMcpOAuthCode({
        tokenEndpoint: session.tokenEndpoint,
        code,
        redirectUri: session.redirectUri,
        clientId: session.clientId,
        clientSecret: session.clientSecret,
        codeVerifier: session.codeVerifier,
        resource: session.resource,
        fetchImpl: this.manager.fetchImpl,
      });
      await this.manager.saveConnectorOAuth(session.connectorId, token);
      session.status = "done";
      session.result = { connectorId: session.connectorId };
      return session;
    } catch (err) {
      session.status = "error";
      session.error = err.message;
      throw err;
    }
  }

  getOAuthStatus(sessionId) {
    const session = this.manager.oauthSessions.get(sessionId);
    if (!session) return { status: "missing" };
    if (session.status === "done") {
      const result = { status: "done", result: session.result || null };
      setTimeout(() => this.manager.oauthSessions.delete(sessionId), 60_000);
      return result;
    }
    if (session.status === "error") {
      const result = { status: "error", error: session.error || "OAuth failed" };
      setTimeout(() => this.manager.oauthSessions.delete(sessionId), 60_000);
      return result;
    }
    return { status: "pending" };
  }

  async saveConnectorOAuth(connectorId, token) {
    const config = this.manager.getConfig();
    const connector = config.connectors.find((item) => item.id === connectorId);
    if (!connector) throw new Error(`MCP connector "${connectorId}" not found`);
    connector.authType = "oauth";
    connector.authorizationToken = "";
    connector.oauth = {
      ...token,
      expiresAt: token.expiresIn ? token.obtainedAt + token.expiresIn * 1000 : 0,
    };
    const saved = this.manager.saveConfig(config);
    await this.manager.stopConnector(connectorId);
    return saved.connectors.find((item) => item.id === connectorId);
  }

  async logoutOAuth(connectorId) {
    const config = this.manager.getConfig();
    const connector = config.connectors.find((item) => item.id === connectorId);
    if (!connector) throw new Error(`MCP connector "${connectorId}" not found`);
    connector.oauth = {};
    connector.authorizationToken = "";
    const saved = this.manager.saveConfig(config);
    await this.manager.stopConnector(connectorId);
    return saved.connectors.find((item) => item.id === connectorId);
  }

  async _refreshOAuthToken(connectorId) {
    if (this.manager._refreshingTokens.has(connectorId)) {
      return this.manager._refreshingTokens.get(connectorId);
    }

    const promise = (async () => {
      const config = this.manager.getConfig();
      const connector = config.connectors.find((c) => c.id === connectorId);
      if (!connector?.oauth?.refreshToken) {
        throw new Error(`No refresh token available for connector "${connectorId}"`);
      }
      if (!connector.oauth.tokenEndpoint) {
        throw new Error(`No token endpoint for connector "${connectorId}"`);
      }

      const token = await refreshMcpOAuthToken({
        tokenEndpoint: connector.oauth.tokenEndpoint,
        refreshToken: connector.oauth.refreshToken,
        clientId: connector.oauthClientId,
        clientSecret: connector.oauthClientSecret,
        fetchImpl: this.manager.fetchImpl,
      });

      await this.manager.saveConnectorOAuth(connectorId, token);
      await this.manager.startConnector(connectorId);
      this.manager.ctx.log.info(`[mcp:${connectorId}] OAuth token refreshed and connector restarted`);
      return token;
    })();

    this.manager._refreshingTokens.set(connectorId, promise);
    try {
      return await promise;
    } finally {
      this.manager._refreshingTokens.delete(connectorId);
    }
  }
}
