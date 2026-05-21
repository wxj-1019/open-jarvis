# MCP 原生支持 — 详细执行方案

> 目标：将 MCP 从「Bridge 插件包装」升级为「一等公民原生能力」，使 Agent 零摩擦接入 MCP 社区 400+ Server。

---

## 一、现状与差距总览

### 1.1 当前实现（`plugins/mcp/`）

| 能力 | 状态 | 详情 |
|------|------|------|
| stdio 传输 | 已实现 | `McpStdioClient`，190 行 |
| Streamable HTTP 传输 | 已实现 | `McpStreamableHttpClient`，160 行 |
| Legacy SSE 传输 | 已实现 | `McpLegacySseClient`，215 行 |
| 自动传输检测 | 已实现 | `McpAutoHttpClient`：先试 Streamable，400/404/405 降级 Legacy SSE |
| OAuth 认证 | 已实现 | PKCE 流程，`mcp-oauth.js` 256 行 |
| `initialize` / `initialized` | 已实现 | 三个 client 均有 |
| `tools/list` | 已实现 | 支持分页 cursor |
| `tools/call` | 已实现 | 含 isError 结果处理 |
| 通知处理 | **已实现** | 7 种通知类型分发（tools/resources/prompts/progress/cancelled/message） |
| `resources/*` | **已实现** | list/read/subscribe/templates，注入 Agent 系统提示 |
| `prompts/*` | **已实现** | list/get，注册为可调用工具 |
| `sampling/createMessage` | **已实现** | server→client LLM 调用，通过 EventBus 桥接 |
| `completions/complete` | **已实现** | 参数自动补全 |
| `logging/setLevel` | **已实现** | 日志级别控制 |
| `roots/list` | **已实现** | 返回当前 workspace 路径 |
| `ping` | **已实现** | 启动后自动 ping 验证连接 |
| workspace `mcp.json` | **已实现** | `.jarvis/mcp.json` 自动加载，支持 `${env:VAR}` 替换 |
| client identity | **已修复** | 更新为 `"jarvis"` |
| OAuth token 刷新 | **已实现** | 401 自动刷新 + 重试，`refreshMcpOAuthToken` |
| 工具命名 | **已优化** | 使用 `[ServerName] description` 格式，LLM 友好 |
| MCP Server 注册表 | **已实现** | 15 个内置 server + 远程 API fallback，一键安装 |
| Settings UI | **已增强** | 连接详情展开（tools/resources/prompts）、能力徽章、注册表浏览器 |

### 1.2 MCP 协议完整方法清单（2025-03-26）

| 方法 | 方向 | 当前状态 |
|------|------|---------|
| `initialize` | client→server | 已实现 |
| `notifications/initialized` | client→server | 已实现 |
| `ping` | 双向 | 未实现 |
| `tools/list` | client→server | 已实现 |
| `tools/call` | client→server | 已实现 |
| `resources/list` | client→server | 未实现 |
| `resources/templates/list` | client→server | 未实现 |
| `resources/read` | client→server | 未实现 |
| `resources/subscribe` | client→server | 未实现 |
| `resources/unsubscribe` | client→server | 未实现 |
| `prompts/list` | client→server | 未实现 |
| `prompts/get` | client→server | 未实现 |
| `completions/complete` | client→server | 未实现 |
| `logging/setLevel` | client→server | 未实现 |
| `roots/list` | server→client | 未实现 |
| `sampling/createMessage` | server→client | 未实现 |
| `notifications/cancelled` | 双向 | 未实现 |
| `notifications/progress` | 双向 | 未实现 |
| `notifications/tools/list_changed` | server→client | 未实现 |
| `notifications/resources/list_changed` | server→client | 未实现 |
| `notifications/resources/updated` | server→client | 未实现 |
| `notifications/prompts/list_changed` | server→client | 未实现 |
| `notifications/roots/list_changed` | client→server | 未实现 |
| `notifications/message` | server→client | 未实现 |

---

## 二、实施阶段划分

分为 5 个 Phase，按依赖关系排序。每个 Phase 可独立交付、独立测试。

```
Phase 1: 基础修复（无依赖）
  ↓
Phase 2: 通知与事件（依赖 Phase 1）
  ↓
Phase 3: Resources + Prompts（依赖 Phase 2）
  ↓
Phase 4: 高级能力（依赖 Phase 3）
  ↓
Phase 5: 生态体验（依赖 Phase 1，可与 Phase 3/4 并行）
```

---

## 三、Phase 1：基础修复

> 目标：修复已知问题，为后续扩展打下基础。**无外部依赖，可立即开始。**

### 3.1 任务清单

| # | 任务 | 文件 | 改动量 |
|---|------|------|--------|
| 1.1 | 修复 client identity | 3 个 client 文件 | 小 |
| 1.2 | 修复工具命名双前缀 | `mcp-runtime.js` + `plugin-manager.js` | 中 |
| 1.3 | 添加 `ping` 支持 | 3 个 client 文件 | 小 |
| 1.4 | 添加协议版本协商 | 3 个 client 文件 | 小 |
| 1.5 | OAuth token 自动刷新 | `mcp-runtime.js` + `mcp-oauth.js` | 中 |

### 3.2 具体实现

#### 3.2.1 修复 client identity

**问题**：三个 client 硬编码 `clientInfo: {name: "hana", title: "Hana", version: "0.1.0"}`。

**改动**：

`plugins/mcp/lib/mcp-stdio-client.js` line 60-63：
```js
// Before
clientInfo: { name: "hana", title: "Hana", version: "0.1.0" }

// After
clientInfo: { name: "jarvis", title: "Jarvis", version: "0.222.29" }
```

`plugins/mcp/lib/mcp-http-client.js`：
- `McpStreamableHttpClient.initialize()` line 151：同上
- `McpLegacySseClient.initialize()` line 311：同上

**测试**：启动任意 MCP Server，检查 stderr 日志中 client 名称显示为 "jarvis"。

#### 3.2.2 修复工具命名双前缀

**问题**：`mcp-runtime.js:toMcpToolId()` 生成 `{connectorId}_{toolName}`，`plugin-manager.js:addTool()` 再加 `{pluginId}_` 前缀，最终工具名变为 `mcp_{connectorId}_{toolName}`。connectorId 本身可能含下划线，导致名称难以解析。

**方案**：在 `mcp-runtime.js` 的 `createMcpToolDefinition()` 中，将原始 MCP tool name 存入 `metadata.originalName`，同时将 `name` 字段改为只用 toolName（不加 connectorId 前缀），由 `plugin-manager.js` 统一加 `mcp_` 前缀。

**改动**：

`plugins/mcp/lib/mcp-runtime.js` line 81-83：
```js
// Before
export function toMcpToolId(serverId, toolName) {
  return sanitizeId(`${serverId}_${toolName}`);
}

// After — 保留原函数用于内部去重，但工具注册时用原始名
export function toMcpToolId(serverId, toolName) {
  return sanitizeId(`${serverId}__${toolName}`);  // 双下划线分隔符，避免歧义
}
```

`plugins/mcp/lib/mcp-runtime.js` line 141-196 `createMcpToolDefinition()`：
```js
// 在 metadata 中保留原始信息
metadata: {
  kind: "mcp",
  connectorId,
  serverId: connectorId,
  originalToolName: toolName,  // 原始 MCP 工具名
}
```

**兼容性**：已有 Agent config 中的 `mcp.connectors[id].tools[toolName]` 映射不受影响，因为 per-agent gating 用的是原始 toolName。

#### 3.2.3 添加 ping 支持

**改动**：三个 client 各添加 `ping()` 方法。

`plugins/mcp/lib/mcp-stdio-client.js`：
```js
// 在 listTools() 方法后添加
async ping() {
  return this.request("ping");
}
```

`plugins/mcp/lib/mcp-http-client.js`：两个 client 类同理。

`plugins/mcp/lib/mcp-runtime.js`：`startConnector()` 中 `initialize()` 后调用 `ping()` 验证连接存活。

#### 3.2.4 协议版本协商改进

**现状**：`mcp-stdio-client.js` 使用 `"2025-11-25"`，HTTP client 使用 `"2025-03-26"`，不一致。

**改动**：统一到 `mcp-protocol-version.js` 中的常量，三个 client 均引用该常量。`initialize()` 响应中取 `result.protocolVersion` 作为实际协商版本。

#### 3.2.5 OAuth token 自动刷新

**问题**：OAuth token 过期后 connector 静默失败。

**改动**：

`plugins/mcp/lib/mcp-runtime.js`：
- `callTool()`（line 372-378）：捕获 401 错误 → 检查是否有 `refreshToken` → 调用 `mcp-oauth.js:exchangeMcpOAuthCode()` 刷新 → 重试原请求
- 新增 `refreshOAuthToken(connectorId)` 方法

`plugins/mcp/lib/mcp-oauth.js`：
- `exchangeMcpOAuthCode()` 已支持 refreshToken 传入，无需改动

---

## 四、Phase 2：通知与事件系统

> 目标：让 MCP client 能接收并响应 server 推送的通知，实现实时工具更新。
>
> **依赖 Phase 1（client identity 修复）。**

### 4.1 任务清单

| # | 任务 | 文件 | 改动量 |
|---|------|------|--------|
| 2.1 | 重构消息分发：通知 vs 响应 | 3 个 client 文件 | 中 |
| 2.2 | 处理 `notifications/tools/list_changed` | `mcp-runtime.js` | 中 |
| 2.3 | 处理 `notifications/resources/list_changed` | `mcp-runtime.js` | 小（Phase 3 启用） |
| 2.4 | 处理 `notifications/prompts/list_changed` | `mcp-runtime.js` | 小（Phase 3 启用） |
| 2.5 | 处理 `notifications/progress` | 3 个 client 文件 | 中 |
| 2.6 | 处理 `notifications/cancelled` | 3 个 client 文件 | 小 |
| 2.7 | 处理 `notifications/message`（日志） | 3 个 client 文件 | 小 |
| 2.8 | 注册 EventBus 事件类型 | `mcp-runtime.js` | 中 |

### 4.2 具体实现

#### 4.2.1 重构消息分发（核心改动）

**问题**：当前 `_handleMessage` 只处理有 `id` 的响应，丢弃所有通知。

**改动**：

`plugins/mcp/lib/mcp-stdio-client.js` line 132-161，重写 `_onStdout` 和 `_handleMessage`：

```js
// line 151-161 重写
_handleMessage(message) {
  // 响应：有 id，匹配 pending
  if (message?.id != null) {
    const pending = this._pending.get(message.id);
    if (pending) {
      this._pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || "MCP error"));
      } else {
        pending.resolve(message.result);
      }
    }
    return;
  }

  // 通知：有 method，无 id
  if (message?.method) {
    this._onNotification(message.method, message.params);
    return;
  }
}

// 新增通知分发
_onNotification(method, params) {
  if (this._notificationHandler) {
    this._notificationHandler(method, params);
  }
}
```

`plugins/mcp/lib/mcp-http-client.js`：
- `McpStreamableHttpClient._postJsonRpc()` line 257-264：SSE 解析时，非匹配 id 的事件调用 `_onNotification()`
- `McpLegacySseClient._handleSseEvent()` line 435-461：非响应的 JSON-RPC 消息调用 `_onNotification()`

**三个 client 统一接口**：
```js
// 构造函数新增 options 参数
constructor(server, { log, onNotification } = {})
this._notificationHandler = onNotification;
```

#### 4.2.2 处理 tools/list_changed

`plugins/mcp/lib/mcp-runtime.js`：

在 `startConnector()`（line 323-341）中，创建 client 时传入通知处理器：

```js
const client = clientFactory(connector, {
  log: this.ctx.log,
  onNotification: (method, params) => this._handleNotification(id, method, params)
});
```

新增 `_handleNotification()` 方法：

```js
_handleNotification(connectorId, method, params) {
  switch (method) {
    case "notifications/tools/list_changed":
      this._onToolsChanged(connectorId);
      break;
    case "notifications/resources/list_changed":
      this._onResourcesChanged(connectorId);
      break;
    case "notifications/prompts/list_changed":
      this._onPromptsChanged(connectorId);
      break;
    case "notifications/progress":
      this._onProgress(connectorId, params);
      break;
    case "notifications/cancelled":
      this._onCancelled(connectorId, params);
      break;
    case "notifications/message":
      this._onLogMessage(connectorId, params);
      break;
  }
}

async _onToolsChanged(connectorId) {
  this.ctx.log.info(`MCP connector "${connectorId}" tools changed, refreshing...`);
  try {
    await this.refreshTools(connectorId);
  } catch (err) {
    this.ctx.log.error(`Failed to refresh tools for "${connectorId}":`, err);
  }
}
```

`refreshTools()`（line 359-370）已有完整实现，直接复用。

#### 4.2.3 处理 notifications/progress

```js
_onProgress(connectorId, params) {
  // 通过 EventBus 广播进度，UI 可订阅
  if (this.ctx.bus) {
    this.ctx.bus.emit("mcp:progress", {
      connectorId,
      progressToken: params.progressToken,
      progress: params.progress,
      total: params.total,
      message: params.message
    });
  }
}
```

#### 4.2.4 处理 notifications/cancelled

```js
_onCancelled(connectorId, params) {
  const client = this._clients.get(connectorId);
  if (client && params.requestId != null) {
    // 从 client 的 pending map 中移除对应请求
    client.rejectPending(params.requestId, new Error(params.reason || "Cancelled"));
  }
}
```

需要在三个 client 中添加 `rejectPending(id, error)` 公开方法。

#### 4.2.5 处理 notifications/message（日志）

```js
_onLogMessage(connectorId, params) {
  const level = params.level || "info";
  const logger = params.logger || connectorId;
  const data = params.data;
  this.ctx.log[level] || this.ctx.log.info;
  this.ctx.log[level](`[MCP:${logger}]`, typeof data === "string" ? data : JSON.stringify(data));
}
```

#### 4.2.6 EventBus 事件注册

`plugins/mcp/lib/mcp-runtime.js` `load()` 方法中注册 EventBus capabilities：

```js
if (this.ctx.bus?.registerCapability) {
  this.ctx.bus.registerCapability("mcp:progress", { type: "event" });
  this.ctx.bus.registerCapability("mcp:tools-changed", { type: "event" });
  this.ctx.bus.registerCapability("mcp:resources-changed", { type: "event" });
  this.ctx.bus.registerCapability("mcp:prompts-changed", { type: "event" });
}
```

### 4.3 测试

| 测试用例 | 验证点 |
|---------|--------|
| stdio server 发送 `notifications/tools/list_changed` | client 自动调用 `refreshTools()`，新工具出现在 Agent 工具列表 |
| HTTP server 发送 SSE 通知事件 | 同上 |
| server 发送 `notifications/progress` | EventBus 收到 `mcp:progress` 事件 |
| server 发送 `notifications/message` level=warning | 日志输出对应警告 |
| server 发送 `notifications/cancelled` | 对应 pending 请求被 reject |

---

## 五、Phase 3：Resources 与 Prompts

> 目标：让 MCP server 能向 Agent 注入上下文（Resources）和提示模板（Prompts）。
>
> **依赖 Phase 2（通知系统）。**

### 5.1 任务清单

| # | 任务 | 文件 | 改动量 |
|---|------|------|--------|
| 3.1 | 新增 Resources 能力 | `mcp-runtime.js` | 大 |
| 3.2 | 新增 Resource Templates 能力 | `mcp-runtime.js` | 中 |
| 3.3 | 新增 Prompts 能力 | `mcp-runtime.js` | 中 |
| 3.4 | Resources 注入 Agent 上下文 | `mcp-runtime.js` + `core/agent.js` | 中 |
| 3.5 | Prompts 注册为可调用模板 | `mcp-runtime.js` | 中 |
| 3.6 | UI：Resources/Prompts 管理 | Desktop 前端 | 大 |

### 5.2 具体实现

#### 5.2.1 三个 client 各添加 Resources/Prompts 方法

`plugins/mcp/lib/mcp-stdio-client.js` 新增：
```js
async listResources(cursor) {
  const params = cursor ? { cursor } : {};
  const result = await this.request("resources/list", params);
  return result || { resources: [] };
}

async listResourceTemplates(cursor) {
  const params = cursor ? { cursor } : {};
  const result = await this.request("resources/templates/list", params);
  return result || { resourceTemplates: [] };
}

async readResource(uri) {
  return this.request("resources/read", { uri });
}

async subscribeResource(uri) {
  return this.request("resources/subscribe", { uri });
}

async unsubscribeResource(uri) {
  return this.request("resources/unsubscribe", { uri });
}

async listPrompts(cursor) {
  const params = cursor ? { cursor } : {};
  const result = await this.request("prompts/list", params);
  return result || { prompts: [] };
}

async getPrompt(name, arguments_) {
  return this.request("prompts/get", { name, arguments: arguments_ });
}
```

HTTP client 两个类同理添加。

#### 5.2.2 McpRuntime 新增 Resources 管理

`plugins/mcp/lib/mcp-runtime.js` 新增方法：

```js
// 列出某个 connector 的所有 resources
async listConnectorResources(connectorId) {
  const client = this._clients.get(connectorId);
  if (!client?.running) throw new Error(`Connector "${connectorId}" is not running`);

  const allResources = [];
  let cursor = undefined;
  do {
    const result = await client.listResources(cursor);
    allResources.push(...(result.resources || []));
    cursor = result.nextCursor;
  } while (cursor);

  return allResources;
}

// 读取某个 resource
async readConnectorResource(connectorId, uri) {
  const client = this._clients.get(connectorId);
  if (!client?.running) throw new Error(`Connector "${connectorId}" is not running`);
  return client.readResource(uri);
}

// 列出 resource templates
async listConnectorResourceTemplates(connectorId) {
  const client = this._clients.get(connectorId);
  if (!client?.running) throw new Error(`Connector "${connectorId}" is not running`);
  return client.listResourceTemplates();
}

// subscribe resource 变更通知
async subscribeConnectorResource(connectorId, uri) {
  const client = this._clients.get(connectorId);
  if (!client?.running) throw new Error(`Connector "${connectorId}" is not running`);
  return client.subscribeResource(uri);
}
```

#### 5.2.3 McpRuntime 新增 Prompts 管理

```js
async listConnectorPrompts(connectorId) {
  const client = this._clients.get(connectorId);
  if (!client?.running) throw new Error(`Connector "${connectorId}" is not running`);
  return client.listPrompts();
}

async getConnectorPrompt(connectorId, name, args) {
  const client = this._clients.get(connectorId);
  if (!client?.running) throw new Error(`Connector "${connectorId}" is not running`);
  return client.getPrompt(name, args);
}
```

#### 5.2.4 Resources 注入 Agent 上下文

**方案**：在 `McpRuntime` 中，当 connector 有 Resources 能力时，自动将高优先级 resource 注入 Agent 系统提示。

`plugins/mcp/lib/mcp-runtime.js` 新增：

```js
// 获取所有 connector 的 resources 上下文（供 Agent 系统提示使用）
async getAgentContextResources() {
  const contexts = [];
  for (const [id, client] of this._clients) {
    if (!client.running) continue;
    try {
      const caps = client.serverCapabilities;
      if (!caps?.resources) continue;

      const resources = await this.listConnectorResources(id);
      for (const r of resources) {
        // 只注入 audience 包含 "assistant" 的 resource
        const audience = r.annotations?.audience;
        if (audience && !audience.includes("assistant")) continue;

        try {
          const content = await this.readConnectorResource(id, r.uri);
          const text = content.contents?.[0]?.text;
          if (text) {
            contexts.push({
              source: id,
              name: r.name || r.uri,
              description: r.description,
              text,
              priority: r.annotations?.priority || 0.5
            });
          }
        } catch (e) {
          this.ctx.log.warn(`Failed to read MCP resource ${r.uri}:`, e.message);
        }
      }
    } catch (e) {
      this.ctx.log.warn(`Failed to list resources for "${id}":`, e.message);
    }
  }

  // 按优先级排序
  contexts.sort((a, b) => b.priority - a.priority);
  return contexts;
}
```

**集成到 Agent 系统提示**：

`core/agent.js` `buildSystemPrompt()`（~line 848-1222）中，在记忆注入后添加：

```js
// MCP Resources 上下文
if (this._pluginManager) {
  const mcpRuntime = this._pluginManager.ctx?._mcpRuntime;
  if (mcpRuntime) {
    try {
      const resources = await mcpRuntime.getAgentContextResources();
      if (resources.length > 0) {
        const resourceBlock = resources.map(r =>
          `[${r.source}:${r.name}]\n${r.text}`
        ).join("\n\n---\n\n");
        sections.push(`## MCP Resources\n\n${resourceBlock}`);
      }
    } catch (e) {
      // 静默失败，不影响系统提示构建
    }
  }
}
```

#### 5.2.5 Prompts 注册为可调用模板

**方案**：将 MCP Prompts 注册为 Agent 可调用的 slash 命令或工具。

`plugins/mcp/lib/mcp-runtime.js` `refreshTools()` 扩展：

```js
async refreshTools(connectorId) {
  // ... 现有 tools 刷新逻辑 ...

  // 新增：刷新 prompts
  const client = this._clients.get(connectorId);
  if (client?.running) {
    try {
      const caps = client.serverCapabilities;
      if (caps?.prompts) {
        const { prompts } = await client.listPrompts();
        this._registerPrompts(connectorId, prompts);
      }
    } catch (e) {
      this.ctx.log.warn(`Failed to refresh prompts for "${connectorId}":`, e.message);
    }
  }
}

_registerPrompts(connectorId, prompts) {
  // 清理旧的 prompt 注册
  const oldDisposer = this._promptDisposers.get(connectorId);
  if (oldDisposer) oldDisposer();

  const disposers = [];
  for (const prompt of prompts) {
    const toolName = toMcpToolId(connectorId, `prompt_${prompt.name}`);
    const disposer = this.ctx.registerTool({
      name: toolName,
      description: `[MCP Prompt] ${prompt.description || prompt.name}`,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          (prompt.arguments || []).map(a => [a.name, {
            type: "string",
            description: a.description || ""
          }])
        ),
        required: (prompt.arguments || []).filter(a => a.required).map(a => a.name)
      },
      metadata: { kind: "mcp-prompt", connectorId, promptName: prompt.name },
      execute: async (_toolCallId, args) => {
        const result = await this.getConnectorPrompt(connectorId, prompt.name, args);
        // 将 prompt messages 转为工具结果
        const text = (result.messages || [])
          .map(m => `[${m.role}] ${m.content?.text || JSON.stringify(m.content)}`)
          .join("\n\n");
        return { content: [{ type: "text", text }] };
      }
    });
    disposers.push(disposer);
  }
  this._promptDisposers.set(connectorId, () => disposers.forEach(d => d()));
}
```

#### 5.2.6 通知联动

Phase 2 的 `_onResourcesChanged` 和 `_onPromptsChanged` 补充实现：

```js
async _onResourcesChanged(connectorId) {
  this.ctx.log.info(`MCP connector "${connectorId}" resources changed`);
  if (this.ctx.bus) {
    this.ctx.bus.emit("mcp:resources-changed", { connectorId });
  }
}

async _onPromptsChanged(connectorId) {
  this.ctx.log.info(`MCP connector "${connectorId}" prompts changed, refreshing...`);
  try {
    const client = this._clients.get(connectorId);
    if (client?.running) {
      const { prompts } = await client.listPrompts();
      this._registerPrompts(connectorId, prompts);
    }
  } catch (err) {
    this.ctx.log.error(`Failed to refresh prompts for "${connectorId}":`, err);
  }
}
```

### 5.3 测试

| 测试用例 | 验证点 |
|---------|--------|
| connector 有 Resources 能力 | `listConnectorResources()` 返回资源列表 |
| `resources/read` 指定 URI | 返回内容正确 |
| resource 注解 `audience: ["assistant"]` | 注入 Agent 系统提示 |
| resource 注解 `audience: ["user"]` | 不注入系统提示 |
| resource 优先级排序 | 高优先级排在前面 |
| connector 有 Prompts 能力 | `listConnectorPrompts()` 返回提示列表 |
| 调用 prompt 工具 | `prompts/get` 正确执行，返回 messages |
| server 发送 `notifications/resources/list_changed` | 资源列表自动刷新 |
| server 发送 `notifications/prompts/list_changed` | prompts 自动重新注册 |

---

## 六、Phase 4：高级能力

> 目标：实现 Sampling、Roots、Completions 等高级 MCP 能力。
>
> **依赖 Phase 3（Resources/Prompts 基础设施）。**

### 6.1 任务清单

| # | 任务 | 文件 | 改动量 |
|---|------|------|--------|
| 4.1 | Sampling 支持 | `mcp-runtime.js` + 3 个 client | 大 |
| 4.2 | Roots 支持 | `mcp-runtime.js` + 3 个 client | 中 |
| 4.3 | Completions 支持 | `mcp-runtime.js` + 3 个 client | 中 |
| 4.4 | Logging 支持 | 3 个 client | 小 |

### 6.2 具体实现

#### 6.2.1 Sampling 支持

Sampling 让 MCP server 能请求 client 的 LLM 生成消息（server→client 请求）。

**三个 client 添加 `onRequest` 处理器**：

```js
// mcp-stdio-client.js _handleMessage 扩展
_handleMessage(message) {
  // 响应
  if (message?.id != null && !message.method) {
    // ... 现有 pending 匹配逻辑 ...
    return;
  }

  // 请求（server→client，有 id + method）
  if (message?.id != null && message.method) {
    this._onRequest(message.id, message.method, message.params);
    return;
  }

  // 通知（无 id，有 method）
  if (message?.method) {
    this._onNotification(message.method, message.params);
  }
}

async _onRequest(id, method, params) {
  if (this._requestHandler) {
    try {
      const result = await this._requestHandler(method, params);
      this._send({ jsonrpc: "2.0", id, result });
    } catch (err) {
      this._send({ jsonrpc: "2.0", id, error: { code: -32603, message: err.message } });
    }
  } else {
    this._send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
  }
}
```

**McpRuntime 注册 sampling 处理器**：

```js
// startConnector() 中
const client = clientFactory(connector, {
  log: this.ctx.log,
  onNotification: (method, params) => this._handleNotification(id, method, params),
  onRequest: (method, params) => this._handleServerRequest(id, method, params)
});

async _handleServerRequest(connectorId, method, params) {
  switch (method) {
    case "sampling/createMessage":
      return this._handleSamplingRequest(connectorId, params);
    case "roots/list":
      return this._handleRootsList(connectorId);
    default:
      throw new Error(`Unsupported server request: ${method}`);
  }
}

async _handleSamplingRequest(connectorId, params) {
  // 通过 Engine 发起 LLM 调用
  const result = await this.ctx.bus.request("llm:complete", {
    messages: params.messages,
    systemPrompt: params.systemPrompt,
    maxTokens: params.maxTokens || 1024,
    temperature: params.temperature,
    model: params.modelPreferences?.hints?.[0]?.name
  });

  return {
    model: result.model,
    role: "assistant",
    content: { type: "text", text: result.text },
    stopReason: result.stopReason || "endTurn"
  };
}
```

**initialize 时声明 sampling 能力**：

```js
// mcp-stdio-client.js initialize() line 55-67
// Before: capabilities: {}
// After:
capabilities: {
  sampling: {}
}
```

**注意**：Sampling 调用需要用户审批。在 UI 层增加审批弹窗（可配置自动批准/始终询问/拒绝）。

#### 6.2.2 Roots 支持

Roots 让 server 知道用户的 workspace 上下文。

```js
// initialize 时声明 roots 能力
capabilities: {
  sampling: {},
  roots: { listChanged: true }
}

// 处理 roots/list 请求
_handleRootsList(connectorId) {
  const roots = [];
  // 当前 Agent 的工作目录
  const cwd = this.ctx.getCurrentWorkspace?.();
  if (cwd) {
    roots.push({ uri: `file://${cwd}`, name: "Workspace" });
  }
  return { roots };
}
```

#### 6.2.3 Completions 支持

Completions 让 client 为 prompt/resource 参数获取自动补全建议。

```js
// 三个 client 新增
async complete(ref, argument) {
  return this.request("completions/complete", { ref, argument });
}
```

McpRuntime 暴露给 UI：当用户在 Prompts 参数输入框中输入时，调用 `complete()` 获取建议。

#### 6.2.4 Logging 支持

```js
// 三个 client 新增
async setLogLevel(level) {
  return this.request("logging/setLevel", { level });
}
```

McpRuntime：connector 启动后，根据用户配置的日志级别调用 `setLogLevel()`。

---

## 七、Phase 5：生态体验

> 目目标：让 MCP 的使用体验从"开发者工具"变为"普通用户也能用"。
>
> **依赖 Phase 1，可与 Phase 3/4 并行开发。**

### 7.1 任务清单

| # | 任务 | 文件 | 改动量 |
|---|------|------|--------|
| 5.1 | workspace `mcp.json` 支持 | `mcp-runtime.js` | 中 |
| 5.2 | MCP Server 注册表（一键安装） | `mcp-runtime.js` + UI | 大 |
| 5.3 | Settings UI 增强 | Desktop 前端 | 大 |
| 5.4 | 连接状态诊断 | `mcp-runtime.js` + UI | 中 |
| 5.5 | 工具命名优化（LLM 友好） | `mcp-runtime.js` | 中 |

### 7.2 具体实现

#### 7.2.1 Workspace mcp.json

在 workspace root 下支持 `.jarvis/mcp.json`（类似 VS Code 的 `.vscode/mcp.json`）：

```json
{
  "connectors": [
    {
      "id": "my-github",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${env:GITHUB_TOKEN}" }
    }
  ]
}
```

`plugins/mcp/lib/mcp-runtime.js` `load()` 扩展：

```js
async load() {
  // ... 现有逻辑 ...

  // 加载 workspace mcp.json
  await this._loadWorkspaceConfig();
}

async _loadWorkspaceConfig() {
  const cwd = this.ctx.getCurrentWorkspace?.();
  if (!cwd) return;

  const configPath = path.join(cwd, ".jarvis", "mcp.json");
  try {
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);

    // 支持环境变量替换 ${env:VAR_NAME}
    for (const connector of config.connectors || []) {
      if (connector.env) {
        for (const [key, val] of Object.entries(connector.env)) {
          if (typeof val === "string" && val.startsWith("${env:")) {
            connector.env[key] = process.env[val.slice(6, -1)] || "";
          }
        }
      }

      // 合并到全局配置（workspace 优先，不覆盖已有的）
      const existing = this.getConnector(connector.id);
      if (!existing) {
        await this.addConnector(connector);
      }
    }
  } catch (e) {
    if (e.code !== "ENOENT") {
      this.ctx.log.warn("Failed to load workspace mcp.json:", e.message);
    }
  }
}
```

#### 7.2.2 MCP Server 注册表

从 MCP 官方 registry（或社区 npm registry）获取可用 server 列表，支持一键安装。

`plugins/mcp/lib/mcp-registry.js`（新文件）：

```js
const REGISTRY_URL = "https://registry.modelcontextprotocol.io";

export async function searchServers(query) {
  const resp = await fetch(`${REGISTRY_URL}/search?q=${encodeURIComponent(query)}`);
  return resp.json();
}

export async function getServerDetail(serverId) {
  const resp = await fetch(`${REGISTRY_URL}/servers/${serverId}`);
  return resp.json();
}
```

`plugins/mcp/routes/api.js` 新增路由：

```js
// GET /registry/search?q=xxx
// GET /registry/servers/:id
```

Settings UI：Connectors 页面新增"浏览注册表"标签页，搜索 → 查看详情 → 一键安装。

#### 7.2.3 Settings UI 增强

当前 Connectors 设置页已有基础功能。需要增强：

1. **连接状态面板**：每个 connector 显示 running/stopped/error 状态、uptime、最后心跳时间
2. **工具列表预览**：展开 connector 查看已注册的 tools/resources/prompts
3. **per-agent 工具开关**：已有，但 UI 需要更直观（树形结构：connector → tools）
4. **Resource 浏览器**：查看 connector 的 resources 列表，点击预览内容
5. **Prompt 浏览器**：查看 connector 的 prompts 列表，点击测试执行
6. **日志查看器**：显示 connector 的 stderr 输出和 `notifications/message` 日志

#### 7.2.4 连接状态诊断

`plugins/mcp/lib/mcp-runtime.js` 扩展 `getState()`：

```js
getState() {
  const connectors = this.getConfig().connectors.map(c => {
    const client = this._clients.get(c.id);
    return {
      ...c,
      // 掩码敏感字段
      authorizationToken: c.authorizationToken ? "***" : undefined,
      oauth: c.oauth ? { ...c.oauth, accessToken: "***", refreshToken: "***" } : undefined,
      // 运行状态
      running: client?.running || false,
      serverCapabilities: client?.serverCapabilities || null,
      uptime: client?.startTime ? Date.now() - client.startTime : 0,
      toolCount: c.tools?.length || 0
    };
  });
  return { enabled: this.getConfig().enabled, connectors };
}
```

#### 7.2.5 工具命名优化

**问题**：当前 LLM 看到的工具名是 `mcp_myserver_search`，不够直观。

**方案**：在 `createMcpToolDefinition()` 中，使用 MCP server 的 `serverInfo.name` + tool 的 `annotations.title` 生成更友好的描述。

```js
// createMcpToolDefinition() 中
const friendlyName = tool.annotations?.title || toolName;
const serverLabel = connector._serverInfo?.name || connectorId;
description = `[${serverLabel}] ${tool.description || friendlyName}`;
```

---

## 八、后端 API 扩展汇总

`plugins/mcp/routes/api.js` 需要新增的路由：

| 方法 | 路径 | 说明 | Phase |
|------|------|------|-------|
| GET | `/connectors/:id/resources` | 列出 connector 的 resources | 3 |
| POST | `/connectors/:id/resources/read` | 读取指定 resource | 3 |
| GET | `/connectors/:id/prompts` | 列出 connector 的 prompts | 3 |
| POST | `/connectors/:id/prompts/:name` | 执行指定 prompt | 3 |
| POST | `/connectors/:id/ping` | ping connector | 1 |
| POST | `/connectors/:id/log-level` | 设置日志级别 | 4 |
| GET | `/registry/search` | 搜索 MCP server 注册表 | 5 |
| GET | `/registry/servers/:id` | 获取 server 详情 | 5 |

现有 `/state` 路由扩展返回值：增加 `running`, `serverCapabilities`, `uptime`, `toolCount`, `resourceCount`, `promptCount` 字段。

---

## 九、配置存储扩展

当前配置格式（`ctx.config.get("mcp")`）：

```json
{
  "enabled": true,
  "connectors": [{ "id": "...", "tools": [...] }]
}
```

扩展为：

```json
{
  "enabled": true,
  "connectors": [{
    "id": "...",
    "tools": [...],
    "resources": [...],
    "prompts": [...],
    "serverCapabilities": { "tools": {}, "resources": {}, "prompts": {} },
    "serverInfo": { "name": "...", "version": "..." }
  }],
  "settings": {
    "samplingPolicy": "ask",        // "ask" | "auto-approve" | "reject"
    "logLevel": "warning",          // 默认日志级别
    "resourceInjectEnabled": true,  // 是否注入 resources 到 Agent 上下文
    "resourceInjectMaxChars": 10000 // 单个 resource 最大注入字符数
  }
}
```

---

## 十、测试策略

### 10.1 单元测试

| 测试文件 | 覆盖范围 |
|---------|---------|
| `mcp-stdio-client.test.js` | 通知分发、请求处理、ping、错误处理 |
| `mcp-http-client.test.js` | Streamable HTTP + Legacy SSE 通知、session 恢复 |
| `mcp-runtime.test.js` | 工具注册/注销、Resources/Prompts 管理、配置持久化 |
| `mcp-oauth.test.js` | token 刷新、PKCE 流程 |

### 10.2 集成测试

使用 mock MCP server（stdio 模式）验证端到端流程：

```
1. 启动 mock server → initialize 握手 → 验证 clientInfo.name = "jarvis"
2. tools/list → 注册到 Agent → 验证工具可用
3. server 发送 tools/list_changed → client 自动 refresh → 验证新工具出现
4. resources/list + resources/read → 验证注入 Agent 系统提示
5. prompts/list + prompts/get → 验证 prompt 工具可调用
6. sampling/createMessage → 验证 LLM 调用链路
7. OAuth token 过期 → 自动刷新 → 验证请求继续
```

### 10.3 兼容性测试

| 场景 | 验证点 |
|------|--------|
| 已有 connector 配置迁移 | 旧配置自动正常化，工具名兼容 |
| MCP server 不支持 Resources | `resources/list` 返回错误 → 静默跳过 |
| MCP server 不支持 Prompts | 同上 |
| MCP server 不支持 Sampling | client 不声明 sampling 能力 → server 不发 sampling 请求 |
| 多 connector 并发 | 各 connector 独立运行，通知互不干扰 |

---

## 十一、向后兼容与迁移

### 11.1 配置迁移

现有 `config.json` 中的 connector 配置无需迁移——`normalizeConnector()` 已处理所有遗留字段名。

### 11.2 工具名兼容

工具名从 `mcp_{connectorId}_{toolName}` 改为 `mcp_{connectorId}__{toolName}`（双下划线）。

**迁移方案**：在 `mcp-runtime.js` 的 `registerCachedTools()` 中，同时注册新旧两个名称的工具，旧名标记为 deprecated。下一个大版本移除旧名。

### 11.3 API 兼容

`/connectors/*` 和 `/servers/*` 双路由继续保留。新增路由不影响已有路由。

---

## 十二、时间线估算

| Phase | 内容 | 预估工作量 | 状态 |
|-------|------|-----------|------|
| **Phase 1** | 基础修复（identity、命名、ping、OAuth 刷新） | 1 周 | **已完成** |
| **Phase 2** | 通知与事件系统 | 1.5 周 | **已完成** |
| **Phase 3** | Resources + Prompts | 2.5 周 | **已完成** |
| **Phase 4** | Sampling + Roots + Completions | 2 周 | **已完成** |
| **Phase 5** | 生态体验（注册表、UI、workspace config） | 2 周 | **已完成** |
| **总计** | | | **全部完成** |

**关键路径**：Phase 1 → Phase 2 → Phase 3 → Phase 4（7 周）

**Phase 5 可并行**：在 Phase 3/4 开发期间，同步进行 UI 和注册表开发。

---

## 十三、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| MCP 协议版本更新 | 新方法/字段不兼容 | `initialize` 时协商版本，按实际版本裁剪功能 |
| 社区 MCP server 质量参差 | 工具描述不清、参数错误 | 添加工具描述质量评分，低质量工具标记警告 |
| Sampling 安全风险 | server 可能滥用 LLM 调用 | 默认 `ask` 策略，每次 sampling 需用户确认 |
| Resources 上下文过大 | Agent 系统提示超长 | `resourceInjectMaxChars` 限制，超出截断 |
| OAuth token 刷新竞态 | 多请求并发刷新 | 加锁（`_refreshingToken` promise），其他请求等待 |
| stdio server 崩溃 | pending 请求挂起 | process exit 事件中 reject 所有 pending（已有） |

---

> 生成日期：2026-05-21
> 基于：MCP 协议规范 2025-03-26 + 项目源码逐行分析（plugins/mcp/ 全部 9 个文件、core/plugin-manager.js、core/engine.js）
