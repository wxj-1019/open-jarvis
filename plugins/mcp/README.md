# MCP (Model Context Protocol) Plugin

## Overview

The MCP Plugin provides an industrial-grade Model Context Protocol implementation for connecting AI agents to external tools and services. It supports multiple transport protocols, OAuth 2.0 authentication with automatic token refresh, fault tolerance with retry mechanisms, and comprehensive performance metrics collection.

## Features

- **Multi-transport support**: stdio, streamable-http, legacy SSE, and auto-detection
- **OAuth 2.0 PKCE authentication**: Full OAuth flow with automatic discovery
- **Token auto-refresh**: Refreshes tokens 5 minutes before expiry without user intervention
- **Request retry with exponential backoff**: Automatic retry for network failures (max 3 attempts)
- **Concurrent request limiting**: Queue-based concurrency control (default: 10)
- **Performance metrics collection**: Per-connector request statistics and tool call success rates
- **Multi-level permission control**: Global and per-agent tool enablement
- **Automatic session recovery**: Re-initializes expired sessions transparently
- **Sensitive data redaction**: Automatic masking of tokens and secrets in public responses

## Quick Start

### Adding a Connector

#### HTTP Connector

```bash
curl -X POST http://localhost:3000/api/plugins/mcp/connectors \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-http-server",
    "name": "My HTTP Server",
    "url": "https://mcp.example.com/mcp",
    "transport": "streamable-http",
    "authType": "none"
  }'
```

#### stdio Connector

```bash
curl -X POST http://localhost:3000/api/plugins/mcp/connectors \
  -H "Content-Type: application/json" \
  -d '{
    "id": "my-stdio-server",
    "name": "My stdio Server",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
    "transport": "stdio"
  }'
```

### OAuth Authentication

#### Starting OAuth Flow

```bash
curl -X POST http://localhost:3000/api/plugins/mcp/connectors/my-server/oauth/start \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "sessionId": "abc123...",
  "url": "https://auth.example.com/authorize?response_type=code&client_id=..."
}
```

#### Checking OAuth Status

```bash
curl http://localhost:3000/api/plugins/mcp/oauth/poll/{sessionId}
```

## Configuration Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Yes | Unique connector identifier (auto-generated if omitted) |
| `name` | string | No | Human-readable name (defaults to `id`) |
| `description` | string | No | Connector description |
| `transport` | string | Yes | Transport type: `stdio`, `remote`, `streamable-http`, `sse` |
| `url` | string | Conditional | Required for HTTP transports (must be http/https) |
| `command` | string | Conditional | Required for stdio transport (executable path) |
| `args` | string[] | No | Command-line arguments for stdio transport |
| `cwd` | string | No | Working directory for stdio process |
| `env` | object | No | Environment variables for stdio process |
| `headers` | object | No | Custom HTTP headers |
| `registryUrl` | string | No | Package registry URL (for npx/uv commands) |
| `timeout` | number | No | Request timeout in seconds (default: 30) |
| `authType` | string | No | Authentication type: `none`, `bearer`, `oauth` |
| `authorizationToken` | string | Conditional | Bearer token for `bearer` auth |
| `oauthClientId` | string | Conditional | OAuth client ID for `oauth` auth |
| `oauthClientSecret` | string | No | OAuth client secret |
| `oauth` | object | No | OAuth token state (managed automatically) |
| `autoStart` | boolean | No | Auto-start connector on load (default: false) |
| `tools` | array | No | Cached tool definitions (auto-populated) |

## API Endpoints

### Global Settings

#### Get State

```
GET /api/plugins/mcp/state
```

Response:
```json
{
  "enabled": true,
  "connectors": [
    {
      "id": "my-server",
      "name": "My Server",
      "status": "running",
      "authStatus": "connected"
    }
  ]
}
```

#### Enable/Disable MCP

```
PUT /api/plugins/mcp/settings/enabled
Content-Type: application/json

{ "enabled": true }
```

### Connector Management

#### Add Connector

```
POST /api/plugins/mcp/connectors
Content-Type: application/json

{
  "id": "my-server",
  "url": "https://mcp.example.com/mcp",
  "transport": "streamable-http"
}
```

#### Update Connector

```
PUT /api/plugins/mcp/connectors/:id
Content-Type: application/json

{ "name": "Updated Name", "timeout": 60 }
```

#### Remove Connector

```
DELETE /api/plugins/mcp/connectors/:id
```

#### Start Connector

```
POST /api/plugins/mcp/connectors/:id/start
```

#### Stop Connector

```
POST /api/plugins/mcp/connectors/:id/stop
```

#### Refresh Tools

```
POST /api/plugins/mcp/connectors/:id/refresh-tools
```

Response:
```json
{
  "tools": [
    {
      "name": "read_file",
      "title": "Read File",
      "description": "Read contents of a file",
      "inputSchema": { "type": "object", "properties": { "path": { "type": "string" } } }
    }
  ]
}
```

### OAuth Endpoints

#### Start OAuth Flow

```
POST /api/plugins/mcp/connectors/:id/oauth/start
```

#### Logout OAuth

```
POST /api/plugins/mcp/connectors/:id/oauth/logout
```

#### OAuth Callback

```
GET /api/plugins/mcp/oauth/callback?code=AUTH_CODE&state=STATE
```

Returns an HTML page confirming OAuth completion.

#### Poll OAuth Status

```
GET /api/plugins/mcp/oauth/poll/:sessionId
```

### Agent-Specific Endpoints

#### Update Agent Connector

```
PUT /api/plugins/mcp/agents/:agentId/connectors/:id
Content-Type: application/json

{
  "enabled": true,
  "tools": { "read_file": true, "write_file": false }
}
```

### Metrics Endpoints

#### Get All Metrics

```
GET /api/plugins/mcp/metrics
```

Response:
```json
{
  "metrics": [
    {
      "connectorId": "my-server",
      "totalRequests": 150,
      "successCount": 145,
      "failureCount": 5,
      "successRate": 0.967,
      "avgLatencyMs": 234,
      "tools": {
        "read_file": {
          "totalCalls": 100,
          "successRate": 0.99,
          "avgLatencyMs": 180
        }
      }
    }
  ]
}
```

#### Get Connector Metrics

```
GET /api/plugins/mcp/metrics/:connectorId
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        McpRuntime                               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Connector   │  │ OAuth        │  │ Token Refresher       │  │
│  │ Management  │  │ Sessions     │  │ (5min threshold)      │  │
│  └──────┬──────┘  └──────┬───────┘  └───────────┬───────────┘  │
│         │                │                       │              │
│  ┌──────┴────────────────┴───────────────────────┴───────────┐  │
│  │                  Client Factory                            │  │
│  └──────────────────────────┬────────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                    Transport Layer                               │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ McpStdio     │  │ McpStreamable    │  │ McpLegacySse     │  │
│  │ Client       │  │ HttpClient       │  │ Client           │  │
│  │ (stdio)      │  │ (streamable-http)│  │ (legacy SSE)     │  │
│  └──────────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│                             │                      │            │
│                    ┌────────┴──────────┐           │            │
│                    │ McpAutoHttpClient │           │            │
│                    │ (auto-detect)     │───────────┘            │
│                    └───────────────────┘                        │
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────┼───────────────────────────────────┐
│                 Enhancement Layer                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Retry Handler    │  │ Concurrency      │  │ Metrics       │ │
│  │ (exponential     │  │ Controller       │  │ Collector     │ │
│  │  backoff + jitter)│  │ (queue-based,   │  │ (per-connector│ │
│  │ max 3 attempts)  │  │  limit: 10)      │  │  + per-tool)  │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
plugins/mcp/
├── index.js                    # Plugin entry point
├── manifest.json               # Plugin manifest
├── routes/
│   └── api.js                  # HTTP API route definitions
└── lib/
    ├── mcp-runtime.js          # Core orchestration layer
    ├── mcp-http-client.js      # HTTP transport clients (streamable, SSE, auto)
    ├── mcp-stdio-client.js     # stdio transport client
    ├── mcp-oauth.js            # OAuth 2.0 PKCE implementation
    ├── mcp-token-refresh.js    # Automatic token refresh logic
    ├── mcp-retry.js            # Retry with exponential backoff
    ├── mcp-metrics.js          # Performance metrics collection
    └── mcp-protocol-version.js # MCP protocol version handling
```

## Industrial-Grade Features

### Token Management

The MCP plugin automatically manages OAuth tokens to prevent authentication failures:

- **Auto-detection**: Checks if tokens will expire within 5 minutes before each tool call
- **Automatic refresh**: Uses refresh tokens to obtain new access tokens without user intervention
- **Concurrent refresh prevention**: Deduplicates concurrent refresh requests for the same connector
- **Graceful degradation**: Proceeds with existing token if refresh fails (unless already expired)

```javascript
// Token refresh happens automatically in callTool:
// 1. Check if token is expiring (within 5min threshold)
// 2. If expiring, refresh token before making the tool call
// 3. Update client with new token or restart connector
```

### Fault Tolerance

Network failures are handled automatically with intelligent retry:

- **Max 3 retry attempts** for retryable errors
- **Exponential backoff**: 1s, 2s, 4s base delays
- **10% random jitter**: Prevents retry storms (e.g., 1s becomes 1.0s-1.1s)
- **Non-retryable statuses**: 400, 401, 403, 404, 422 are not retried
- **Retryable errors**: 5xx server errors, connection refused, timeouts

```javascript
// Retry configuration (from mcp-retry.js)
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY = 1000;    // 1 second
const DEFAULT_MAX_DELAY = 30000;    // 30 seconds cap
const NON_RETRYABLE_STATUSES = new Set([400, 401, 403, 404, 422]);
```

### Performance Monitoring

Comprehensive metrics collection for monitoring and debugging:

- **Per-connector request statistics**: Total requests, success/failure counts, success rate
- **Per-tool call statistics**: Individual tool performance tracking
- **Average response latency**: Rounded to milliseconds
- **Real-time collection**: Metrics recorded on every request

```bash
# View metrics for all connectors
curl http://localhost:3000/api/plugins/mcp/metrics

# View metrics for specific connector
curl http://localhost:3000/api/plugins/mcp/metrics/my-server
```

### Concurrency Control

Queue-based request limiting prevents server overload:

- **Configurable limit**: Default 10 concurrent requests per connector
- **Queue-based**: Excess requests are queued and processed in order
- **Automatic processing**: Queue advances as active requests complete

```javascript
// Concurrency configuration (from http clients)
this._concurrencyLimit = concurrencyLimit || 10;
this._activeRequests = 0;
this._requestQueue = [];
```

### Security

Built-in security features protect sensitive data:

- **OAuth 2.0 PKCE flow**: Code verifier/challenge with SHA-256
- **Automatic sensitive data redaction**: Tokens masked as `********` in public responses
- **URL validation**: HTTP/HTTPS protocol enforcement
- **Command validation**: stdio command validation for security
- **Mask preservation**: Masked values in updates preserve existing secrets

## Testing

### Running Tests

Check for test files in the project test directories:

```bash
# Look for MCP-related tests
find . -path "*/test/*mcp*" -o -path "*/tests/*mcp*"

# Run tests (if available)
npm test -- --grep "mcp"
```

### Manual Testing

1. **Add a connector**:
   ```bash
   curl -X POST http://localhost:3000/api/plugins/mcp/connectors \
     -H "Content-Type: application/json" \
     -d '{"id":"test","url":"http://localhost:8080/mcp","transport":"streamable-http"}'
   ```

2. **Start the connector**:
   ```bash
   curl -X POST http://localhost:3000/api/plugins/mcp/connectors/test/start
   ```

3. **Check state**:
   ```bash
   curl http://localhost:3000/api/plugins/mcp/state
   ```

4. **View metrics**:
   ```bash
   curl http://localhost:3000/api/plugins/mcp/metrics
   ```

## Files Structure

```
plugins/mcp/
├── index.js                    # Plugin entry point, creates McpRuntime instance
├── manifest.json               # Plugin metadata and settings configuration
├── routes/
│   └── api.js                  # REST API endpoint definitions
└── lib/
    ├── mcp-runtime.js          # Core runtime: connector lifecycle, tool registration
    ├── mcp-http-client.js      # HTTP transport implementations
    │   ├── McpStreamableHttpClient   # Modern streamable-http transport
    │   ├── McpLegacySseClient        # Legacy SSE transport
    │   └── McpAutoHttpClient         # Auto-detection (tries streamable, falls back to SSE)
    ├── mcp-stdio-client.js     # Standard I/O transport for local processes
    ├── mcp-oauth.js            # OAuth 2.0 PKCE flow and token exchange
    ├── mcp-token-refresh.js    # Automatic token refresh before expiry
    ├── mcp-retry.js            # Exponential backoff retry logic
    ├── mcp-metrics.js          # Request and tool call metrics collection
    └── mcp-protocol-version.js # MCP protocol version constants and headers
```

## Key Concepts

### Connector Lifecycle

1. **Add**: Create connector configuration via API
2. **Start**: Initialize transport and discover tools
3. **Use**: Call tools through the agent system
4. **Stop**: Clean up resources and close connections
5. **Remove**: Delete connector configuration

### Tool Registration

Tools are automatically registered as agent tools when:
- MCP is enabled globally
- Connector is running
- Tools are discovered via `tools/list`

Each tool is namespaced as `{connectorId}_{toolName}` and respects per-agent enablement settings.

### Authentication Flow

1. **No Auth**: Direct connection (authType: `none`)
2. **Bearer Token**: Static token in Authorization header (authType: `bearer`)
3. **OAuth 2.0 PKCE**: Full OAuth flow with automatic token refresh (authType: `oauth`)

### Transport Auto-Detection

When transport is set to `remote` or not specified, the `McpAutoHttpClient`:
1. Attempts `streamable-http` connection first
2. Falls back to `legacy SSE` on 400/404/405 errors
3. Propagates other errors immediately
