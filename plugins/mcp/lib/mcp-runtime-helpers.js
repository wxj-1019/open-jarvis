import { stringOrEmpty, normalizeStringRecord, normalizeTimeoutSeconds } from "./mcp-utils.js";
import { validateUrl } from "./mcp-security.js";

const DEFAULT_CONFIG = {
  enabled: false,
  connectors: [],
  servers: [],
};

const TRANSPORTS = new Set(["stdio", "remote", "streamable-http", "sse"]);
const AUTH_TYPES = new Set(["none", "bearer", "oauth"]);
const MASKED_SECRET = "********";

export function normalizeTool(tool) {
  if (!tool || typeof tool.name !== "string" || !tool.name) return null;
  return {
    name: tool.name,
    title: typeof tool.title === "string" ? tool.title : (tool.annotations?.title || tool.name),
    description: typeof tool.description === "string" ? tool.description : "",
    inputSchema: tool.inputSchema && typeof tool.inputSchema === "object"
      ? tool.inputSchema
      : { type: "object", properties: {} },
    annotations: tool.annotations && typeof tool.annotations === "object" ? tool.annotations : undefined,
  };
}

export function sanitizeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function toMcpToolId(serverId, toolName) {
  return sanitizeId(`${serverId}_${toolName}`);
}

export function normalizeMcpConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  const rawConnectors = Array.isArray(input.connectors)
    ? input.connectors
    : (Array.isArray(input.servers) ? input.servers : []);
  const connectors = rawConnectors
    .map((connector, index) => normalizeConnector(connector, `connector_${index + 1}`))
    .filter(Boolean);
  return {
    ...DEFAULT_CONFIG,
    enabled: input.enabled === true,
    connectors,
    servers: connectors,
  };
}

export function normalizeAgentMcpConfig(agentConfig) {
  const mcp = agentConfig?.mcp && typeof agentConfig.mcp === "object" ? agentConfig.mcp : {};
  const connectors = mcp.connectors && typeof mcp.connectors === "object"
    ? mcp.connectors
    : (mcp.servers && typeof mcp.servers === "object" ? mcp.servers : {});
  return {
    ...mcp,
    connectors,
    servers: connectors,
  };
}

export function isMcpToolEnabledForAgentConfig(agentConfig, { globalEnabled, serverId, connectorId, toolName } = {}) {
  if (globalEnabled !== true) return false;
  const id = connectorId || serverId;
  const mcp = normalizeAgentMcpConfig(agentConfig);
  const connector = mcp.connectors?.[id] || mcp.servers?.[id];
  if (connector?.enabled !== true) return false;
  return connector?.tools?.[toolName] === true;
}

export function mcpToolError(text, details = {}) {
  return {
    isError: true,
    content: [{ type: "text", text }],
    details: {
      errorCode: "mcp_unavailable",
      ...details,
    },
  };
}

export function normalizeMcpToolResult(value) {
  if (value && Array.isArray(value.content)) return value;
  if (typeof value === "string") return { content: [{ type: "text", text: value }] };
  return {
    content: [{ type: "text", text: JSON.stringify(value ?? null) }],
  };
}

export function createMcpToolDefinition({
  serverId,
  connectorId = serverId,
  toolName,
  description,
  inputSchema,
  getGlobalEnabled,
  getAgentConfig,
  callTool,
}) {
  const name = toMcpToolId(connectorId, toolName);
  return {
    name,
    description: description || `MCP connector tool ${connectorId}/${toolName}`,
    parameters: inputSchema || { type: "object", properties: {} },
    metadata: { kind: "mcp", connectorId, serverId: connectorId, toolName },
    isEnabledForAgentConfig: (agentConfig) => isMcpToolEnabledForAgentConfig(agentConfig, {
      globalEnabled: getGlobalEnabled(),
      connectorId,
      serverId: connectorId,
      toolName,
    }),
    execute: async (_toolCallId, params, runtimeCtx = {}) => {
      if (getGlobalEnabled() !== true) {
        return mcpToolError("MCP is disabled globally. Enable Connectors in Settings before calling this tool.", {
          connectorId,
          serverId: connectorId,
          toolName,
        });
      }
      const agentConfig = await getAgentConfig(runtimeCtx.agentId);
      if (!isMcpToolEnabledForAgentConfig(agentConfig, {
        globalEnabled: true,
        connectorId,
        serverId: connectorId,
        toolName,
      })) {
        return mcpToolError(`MCP connector tool "${connectorId}/${toolName}" is not enabled for this agent.`, {
          connectorId,
          serverId: connectorId,
          toolName,
          agentId: runtimeCtx.agentId || null,
        });
      }
      try {
        return normalizeMcpToolResult(await callTool(connectorId, toolName, params || {}));
      } catch (err) {
        return mcpToolError(`MCP connector tool "${connectorId}/${toolName}" failed: ${err.message}`, {
          connectorId,
          serverId: connectorId,
          toolName,
        });
      }
    },
  };
}

export function normalizeConnector(connector, fallbackId = "") {
  if (!connector || typeof connector !== "object") return null;
  const id = sanitizeId(connector.id || fallbackId);
  if (!id) return null;
  const env = normalizeStringRecord(connector.env);
  const headers = normalizeStringRecord(connector.headers);
  const tools = Array.isArray(connector.tools)
    ? connector.tools.map(normalizeTool).filter(Boolean)
    : [];
  const transport = normalizeTransport(connector);
  const authorizationToken = stringOrEmpty(connector.authorizationToken || connector.authorization_token);
  const oauth = normalizeOAuthState(connector.oauth);
  const authType = normalizeAuthType(connector.authType, { authorizationToken, oauth, connector });

  return {
    id,
    name: stringOrEmpty(connector.name) || id,
    description: stringOrEmpty(connector.description),
    transport,
    url: stringOrEmpty(connector.url || connector.baseUrl),
    command: stringOrEmpty(connector.command),
    args: Array.isArray(connector.args) ? connector.args.filter((arg) => typeof arg === "string") : [],
    cwd: stringOrEmpty(connector.cwd),
    env,
    headers,
    registryUrl: stringOrEmpty(connector.registryUrl),
    timeout: normalizeTimeoutSeconds(connector.timeout),
    authType,
    authorizationToken,
    oauthClientId: stringOrEmpty(connector.oauthClientId || connector.clientId),
    oauthClientSecret: stringOrEmpty(connector.oauthClientSecret || connector.clientSecret),
    oauth,
    autoStart: connector.autoStart === true || connector.isActive === true,
    tools,
  };
}

function normalizeTransport(connector) {
  const raw = stringOrEmpty(connector.transport || connector.type);
  if (raw === "http") return "remote";
  if (raw === "streamableHttp" || raw === "streamable-http") return "streamable-http";
  if (TRANSPORTS.has(raw)) return raw;
  if (stringOrEmpty(connector.url || connector.baseUrl)) return "remote";
  return "stdio";
}

function normalizeAuthType(value, { authorizationToken, oauth, connector }) {
  const raw = stringOrEmpty(value);
  if (AUTH_TYPES.has(raw)) return raw;
  if (authorizationToken) return "bearer";
  if (oauth.accessToken || connector.oauthClientId || connector.clientId) return "oauth";
  return "none";
}

function normalizeOAuthState(value) {
  if (!value || typeof value !== "object") return {};
  return {
    accessToken: stringOrEmpty(value.accessToken),
    refreshToken: stringOrEmpty(value.refreshToken),
    tokenType: stringOrEmpty(value.tokenType) || (value.accessToken ? "Bearer" : ""),
    tokenEndpoint: stringOrEmpty(value.tokenEndpoint),
    scope: stringOrEmpty(value.scope),
    expiresIn: Number(value.expiresIn || 0) || 0,
    expiresAt: Number(value.expiresAt || 0) || 0,
    obtainedAt: Number(value.obtainedAt || 0) || 0,
  };
}

export function validateConnector(connector) {
  if (!connector) throw new Error("connector is required");
  if (connector.transport === "stdio") {
    if (!connector.command) throw new Error("command is required");
    return;
  }
  if (!connector.url) throw new Error("url is required");
  const url = new URL(connector.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("url must use http or https");
  }

  validateUrl(connector.url);
}

export function uniqueConnectorId(connectors, raw) {
  const base = sanitizeId(raw) || "connector";
  const taken = new Set(connectors.map((s) => s.id));
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

export function connectorClientFingerprint(connector) {
  return JSON.stringify({
    transport: connector.transport,
    url: connector.url,
    command: connector.command,
    args: connector.args,
    cwd: connector.cwd,
    env: connector.env,
    headers: connector.headers,
    registryUrl: connector.registryUrl,
    timeout: connector.timeout,
    authType: connector.authType,
    authorizationToken: connector.authorizationToken,
    oauthAccessToken: connector.oauth?.accessToken || "",
  });
}

export function publicConnector({ connector, status }) {
  return {
    ...connector,
    status,
    env: redactRecord(connector.env),
    headers: redactRecord(connector.headers),
    authorizationToken: connector.authorizationToken ? "********" : "",
    oauthClientSecret: connector.oauthClientSecret ? "********" : "",
    oauth: {
      connected: !!connector.oauth?.accessToken,
      scope: connector.oauth?.scope || "",
      expiresAt: connector.oauth?.expiresAt || 0,
    },
    authStatus: connectorAuthStatus(connector),
  };
}

function connectorAuthStatus(connector) {
  if (connector.authType === "none") return "none";
  if (connector.authType === "bearer") return connector.authorizationToken ? "token" : "missing";
  if (connector.authType === "oauth") return connector.oauth?.accessToken ? "connected" : "disconnected";
  return "none";
}

function redactRecord(value) {
  const record = normalizeStringRecord(value);
  return Object.fromEntries(
    Object.entries(record).map(([key, val]) => [key, val ? MASKED_SECRET : ""]),
  );
}

export function unmaskConnectorPatch(existing, patch) {
  const next = { ...patch };
  if (patch.authorizationToken === MASKED_SECRET) {
    next.authorizationToken = existing.authorizationToken || "";
  }
  if (patch.oauthClientSecret === MASKED_SECRET) {
    next.oauthClientSecret = existing.oauthClientSecret || "";
  }
  if (patch.env && typeof patch.env === "object" && !Array.isArray(patch.env)) {
    next.env = unmaskRecord(existing.env, patch.env);
  }
  if (patch.headers && typeof patch.headers === "object" && !Array.isArray(patch.headers)) {
    next.headers = unmaskRecord(existing.headers, patch.headers);
  }
  return next;
}

function unmaskRecord(existing, patch) {
  const existingRecord = normalizeStringRecord(existing);
  const patchRecord = normalizeStringRecord(patch);
  return Object.fromEntries(
    Object.entries(patchRecord).map(([key, val]) => [
      key,
      val === MASKED_SECRET && Object.hasOwn(existingRecord, key) ? existingRecord[key] : val,
    ]),
  );
}

export { DEFAULT_CONFIG, TRANSPORTS, AUTH_TYPES, MASKED_SECRET };
