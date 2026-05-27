# Skill & MCP 展示方案设计文档

> **生成日期**: 2026-05-28
> **项目**: OpenJarvis (open-jarvis)
> **目标**: 将已集成的 Skill 和 MCP 模块在前端页面中完整展示给用户

---

## 一、现状分析

### 1.1 Skill 模块 — 已完全集成并展示

| 层级 | 文件路径 | 状态 |
|------|----------|------|
| 后端核心 | `core/skill-manager.js` | 完整，含 Skill 加载、过滤、per-agent 隔离、文件监听 |
| API 路由 | `server/routes/skills.js` | 完整，CRUD + Bundle + 外部路径 + 翻译 |
| Skill 元数据 | `lib/skills/skill-metadata.js` | 完整 |
| Skill 安装工具 | `lib/tools/install-skill.js` | 完整 |
| Skill Bundle 存储 | `lib/skill-bundles/store.js` | 完整 |
| 前端页面 | `desktop/src/react/settings/tabs/SkillsTab.tsx` | 完整 |
| 子组件 | `SkillRow.tsx`, `SkillBundleTree.tsx`, `SkillCapabilities.tsx`, `LearnedSkillsBlock.tsx`, `CompatPathDrawer.tsx` | 完整 |
| 导航入口 | `SettingsNav.tsx` 中 `id: 'skills'`, Wrench 图标 | 已注册 |
| 渲染映射 | `SettingsContent.tsx` → `TAB_COMPONENTS.skills: SkillsTab` | 已接入 |

**Skill 后端 API 清单:**

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/skills` | 列出所有 skill（含 agent enabled 状态） |
| POST | `/api/skills/install` | 安装 skill（文件夹/.zip/.skill） |
| DELETE | `/api/skills/:name` | 删除 skill |
| PATCH | `/api/agents/:id/skills/:name` | 启用/停用单个 skill |
| PATCH | `/api/agents/:id/skill-bundles/:bundleId` | 启用/停用 bundle |
| GET/POST/PUT/DELETE | `/api/skills/bundles/*` | Bundle CRUD + 排序 + 导出 |
| GET/PUT | `/api/skills/external-paths` | 外部兼容路径管理 |
| POST | `/api/skills/translate` | 技能名翻译 |

**结论: Skill 模块前后端完整，已接入设置页面导航，用户可正常访问和使用。**

---

### 1.2 MCP 模块 — 后端已集成，前端组件完整但未接入导航

| 层级 | 文件路径 | 状态 |
|------|----------|------|
| 后端插件入口 | `plugins/mcp/index.js` | 完整 |
| MCP 运行时 | `plugins/mcp/lib/mcp-runtime.js` | 完整 |
| MCP 协议支持 | `plugins/mcp/lib/mcp-stdio-client.js`, `mcp-http-client.js` | 完整 (stdio/HTTP/SSE) |
| 连接管理 | `plugins/mcp/lib/connector-manager.js` | 完整 |
| OAuth 认证 | `plugins/mcp/lib/mcp-oauth.js`, `oauth-manager.js` | 完整 |
| 安全模块 | `plugins/mcp/lib/mcp-security.js` | 完整 |
| 注册表 | `plugins/mcp/lib/mcp-registry.js` | 完整 |
| 预设系统 | `plugins/mcp/lib/mcp-presets.js` | 完整 |
| API 路由 | `plugins/mcp/routes/api.js` | 完整 |
| 前端页面 | `desktop/src/react/settings/tabs/McpTab.tsx` | 组件完整 |
| 子组件 | `ConnectorList.tsx`, `ConnectorForm.tsx`, `RegistryBrowser.tsx`, `AgentConnectorControls.tsx` | 完整 |
| 类型定义 | `desktop/src/react/settings/tabs/mcp/types.ts` | 完整 |
| API 客户端 | `desktop/src/react/settings/tabs/mcp/mcp-api.ts` | 完整 |
| 配置解析 | `desktop/src/react/settings/tabs/mcp/mcp-config.ts` | 完整 |
| **导航入口** | `SettingsNav.tsx` 的 `TAB_ITEMS` | **缺失** |
| **渲染映射** | `SettingsContent.tsx` 的 `TAB_COMPONENTS` | **缺失** |

**MCP 后端 API 清单 (mcp-api.ts 已封装):**

| 方法 | 路径 | 功能 |
|------|------|------|
| GET | `/api/plugins/mcp/state` | 获取 MCP 状态（connectors、agentConfig） |
| PUT | `/api/plugins/mcp/settings/enabled` | 全局启用/禁用 MCP |
| POST | `/api/plugins/mcp/connectors` | 添加 connector |
| PUT | `/api/plugins/mcp/connectors/:id` | 更新 connector |
| DELETE | `/api/plugins/mcp/connectors/:id` | 删除 connector |
| POST | `/api/plugins/mcp/connectors/:id/action` | 执行 action (start/stop/refresh-tools) |
| PUT | `/api/plugins/mcp/agent/:agentId/connectors/:id` | Agent 级 connector 开关 |
| PUT | `/api/plugins/mcp/agent/:agentId/connectors/:id/tools/:tool` | Agent 级 tool 开关 |
| POST | `/api/plugins/mcp/oauth/start` | 发起 OAuth 认证 |
| POST | `/api/plugins/mcp/oauth/poll` | 轮询 OAuth 状态 |
| POST | `/api/plugins/mcp/oauth/logout` | 注销 OAuth |
| GET | `/api/plugins/mcp/registry/search` | 搜索 MCP 注册表 |

**结论: McpTab 组件已完整开发（含 connectors 管理、registry 浏览、Agent 级 tool 开关），但未在 SettingsNav 和 SettingsContent 中注册，用户无法访问。**

---

## 二、展示方案设计

### 方案 A: 独立 Tab 接入（推荐）

将 MCP 作为 Settings 导航中的独立 Tab，与 Skills 平级。

**优点:**
- 改动最小（3 个文件），风险最低
- McpTab 组件已完整，直接复用
- Skill 和 MCP 概念独立，分开管理更清晰
- 不影响现有 SkillsTab 的复杂逻辑

**缺点:**
- 用户需要在两个 Tab 间切换来管理"能力"

#### 页面布局

```
Settings 导航栏
┌──────────────────────────────────────────────────────────┐
│  ...  │ Skills (Wrench) │ MCP 服务 (Plugs) │ ...        │
└──────────────────────────────────────────────────────────┘

MCP Tab 页面内容
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌─ MCP 全局开关 ────────────────────────────────────┐  │
│  │  [MCP 总开关]    启用/禁用所有 MCP 服务连接       │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ MCP 服务连接 ────────────────────────────────────┐  │
│  │  ┌─ 子 Tab ─────────────────────────────────────┐  │  │
│  │  │  [我的连接]  |  [浏览注册表]                   │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                     │  │
│  │  (我的连接 Tab):                                    │  │
│  │  [导入 JSON]                                        │  │
│  │  ┌─ 添加新连接 ──────────────────────────────────┐  │  │
│  │  │  名称: [________]  传输方式: [stdio ▼]        │  │  │
│  │  │  命令: [________]  参数: [________]           │  │  │
│  │  │  [添加连接]                                    │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                     │  │
│  │  ┌─ 连接列表 ────────────────────────────────────┐  │  │
│  │  │  🟢 filesystem-server    stdio  [停止][编辑][删除]│  │  │
│  │  │     Tools: 5 | Resources: 3                    │  │  │
│  │  │  🔴 web-search           remote [启动][编辑][删除]│  │  │
│  │  │     Tools: 2 | OAuth: 未连接                   │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                     │  │
│  │  (浏览注册表 Tab):                                  │  │
│  │  [搜索: ____________]                               │  │
│  │  ┌─ 注册表服务器列表 ────────────────────────────┐  │  │
│  │  │  📦 @modelcontextprotocol/server-filesystem    │  │  │
│  │  │     文件系统访问    [安装]                      │  │  │
│  │  │  📦 @modelcontextprotocol/server-github         │  │  │
│  │  │     GitHub API 集成  [安装]                     │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Agent MCP 配置 ──────────────────────────────────┐  │
│  │  [Agent 选择器: agent-01 ▼]                        │  │
│  │                                                     │  │
│  │  ┌─ filesystem-server ──────────────────────────┐  │  │
│  │  │  ☑ filesystem-server (连接开关)              │  │  │
│  │  │    ☑ read_file                              │  │  │
│  │  │    ☑ write_file                             │  │  │
│  │  │    ☐ delete_file                            │  │  │
│  │  │    ☑ list_directory                         │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  │                                                     │  │
│  │  ┌─ web-search ─────────────────────────────────┐  │  │
│  │  │  ☐ web-search (连接开关)                     │  │  │
│  │  │    ☐ search                                 │  │  │
│  │  └───────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### 需要修改的文件清单

**文件 1: `desktop/src/react/settings/SettingsNav.tsx`**

在 `TAB_ITEMS` 数组中 `skills` 后面添加 mcp 项：

```typescript
// 第 35 行之后添加
{ id: 'mcp', key: 'settings.tabs.mcp', icon: Plugs },
```

需要在顶部 import 中添加 `Plugs` 图标：

```typescript
import { ..., Plugs } from '@phosphor-icons/react';
```

**文件 2: `desktop/src/react/settings/SettingsContent.tsx`**

添加 McpTab 导入和渲染映射：

```typescript
// import 区域添加
import { McpTab } from './tabs/McpTab';

// TAB_COMPONENTS 对象中添加
mcp: McpTab,
```

**文件 3: i18n 翻译文件**

需要在各语言文件中添加 `settings.tabs.mcp` 的翻译：

| 语言文件 | Key | 值 |
|----------|-----|-----|
| `locales/zh.json` | `settings.tabs.mcp` | `"MCP 服务"` |
| `locales/en.json` | `settings.tabs.mcp` | `"MCP"` |
| `locales/ja.json` | `settings.tabs.mcp` | `"MCP"` |
| `locales/ko.json` | `settings.tabs.mcp` | `"MCP"` |
| `locales/zh-TW.json` | `settings.tabs.mcp` | `"MCP 服務"` |

---

### 方案 B: Skills 页面内整合

将 MCP 作为 SkillsTab 内的一个 Section，形成统一的"能力中心"。

**优点:**
- 集中管理，用户在同一页面看到所有能力
- 体现 Skill + MCP = Agent 能力的统一概念

**缺点:**
- SkillsTab 逻辑已经很复杂（Bundle 管理、外部路径、Agent 开关等），再加 MCP 会更臃肿
- 需要将 McpTab 的状态管理逻辑嵌入 SkillsTab，改动量大
- MCP 和 Skill 的数据模型差异大，强行合并增加维护成本

#### 页面布局

```
Skills Tab 页面内容
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  ┌─ Section 1: 技能管理 ──────────────────────────────┐  │
│  │  [拖拽安装 Dropzone]                                │  │
│  │  Skill Bundle Tree (已有)                           │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Section 2: MCP 服务管理 ──────────────────────────┐  │  ← 新增
│  │  [MCP 全局开关]                                     │  │
│  │  [导入 JSON]  [添加连接]                            │  │
│  │  Connector List (复用 ConnectorList 组件)           │  │
│  │  [浏览注册表] → RegistryBrowser (复用)              │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Section 3: 全局能力配置 ──────────────────────────┐  │
│  │  (已有 SkillCapabilities)                           │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Section 4: Agent 能力配置 ────────────────────────┐  │
│  │  [Agent 选择器]                                     │  │
│  │  ┌─ Skills 开关 ──────────────────────────────────┐│  │
│  │  │  SkillBundleTree mode="agent" (已有)           ││  │
│  │  └─────────────────────────────────────────────────┘│  │
│  │  ┌─ MCP Tools 开关 ───────────────────────────────┐│  │  ← 新增
│  │  │  AgentConnectorControls (复用)                 ││  │
│  │  └─────────────────────────────────────────────────┘│  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Section 5: 自学 Skill ────────────────────────────┐  │
│  │  (已有 LearnedSkillsBlock)                          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌─ Section 6: 外部兼容 ──────────────────────────────┐  │
│  │  (已有 CompatPathDrawer)                            │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### 需要修改的文件清单

| 文件 | 改动内容 | 改动量 |
|------|----------|--------|
| `SkillsTab.tsx` | 导入 MCP 组件，添加 MCP 状态管理（loadMcpState 等），新增 Section 2 和 Section 4 中的 MCP 部分 | 大 |
| `mcp-api.ts` | 无需修改，直接复用 | 无 |
| `types.ts` | 无需修改 | 无 |

---

### 方案 C: 独立 Tab + 联动跳转

在方案 A 的基础上，增加 Skills Tab 和 MCP Tab 之间的联动。

**优点:**
- 概念独立但有联系
- 用户可从 Skill 详情跳转到关联的 MCP 服务

**缺点:**
- 需要定义 Skill 和 MCP 之间的关联关系（目前无此数据模型）
- 增加额外开发量

#### 联动场景

1. 在 Skills Tab 中，如果某个 Skill 依赖 MCP Tool，显示"MCP 服务 →"链接
2. 点击后跳转到 MCP Tab 并高亮对应的 Connector
3. 在 MCP Tab 中，显示哪些 Skill 使用了当前 Connector 的 Tools

**需要额外开发:**
- Skill → MCP Tool 依赖关系的数据模型
- Tab 间参数传递机制（通过 zustand store 或 URL params）
- UI 中的关联提示组件

---

## 三、推荐方案与实施计划

### 推荐: 方案 A（独立 Tab 接入）

**理由:**
1. McpTab 及其子组件已完整开发，直接接入即可
2. 改动量最小（3 个文件，约 10 行代码），风险最低
3. MCP 和 Skill 是不同概念层面（协议 vs 能力），分开更清晰
4. 不影响现有 SkillsTab 的复杂 Bundle 管理逻辑
5. 后续可平滑演进到方案 C（加联动）

### 实施步骤

#### Step 1: 修改 SettingsNav.tsx

```diff
 import {
   User, UserCircle, Gear, Briefcase, Desktop, Wrench, Link,
   ChartLine as Activity, Image, UploadSimple, Keyboard,
-  PuzzlePiece, ShieldCheck, Info, List, Database, MicrophoneStage,
+  PuzzlePiece, ShieldCheck, Info, List, Database, MicrophoneStage, Plugs,
 } from '@phosphor-icons/react';

 const TAB_ITEMS = [
   { id: 'agent', key: 'settings.tabs.agent', icon: User },
   { id: 'me', key: 'settings.tabs.me', icon: UserCircle },
   { id: 'interface', key: 'settings.tabs.interface', icon: Gear },
   { id: 'work', key: 'settings.tabs.work', icon: Briefcase },
   { id: 'computer', key: 'settings.tabs.computer', icon: Desktop },
   { id: 'skills', key: 'settings.tabs.skills', icon: Wrench },
+  { id: 'mcp', key: 'settings.tabs.mcp', icon: Plugs },
   { id: 'bridge', key: 'settings.tabs.bridge', icon: Link },
   // ...
 ];
```

#### Step 2: 修改 SettingsContent.tsx

```diff
 import { SkillsTab } from './tabs/SkillsTab';
+import { McpTab } from './tabs/McpTab';
 import { BridgeTab } from './tabs/BridgeTab';

 const TAB_COMPONENTS: Record<string, React.ComponentType> = {
   agent: AgentTab,
   me: MeTab,
   interface: InterfaceTab,
   work: WorkTab,
   computer: ComputerUseTab,
   skills: SkillsTab,
+  mcp: McpTab,
   bridge: BridgeTab,
   // ...
 };
```

#### Step 3: 添加 i18n 翻译

在各语言 locale 文件中添加:

```json
{
  "settings.tabs.mcp": "MCP 服务"
}
```

#### Step 4: 验证

1. 启动应用，打开 Settings 页面
2. 确认导航栏中出现 "MCP 服务" Tab
3. 点击进入 McpTab，验证：
   - MCP 全局开关正常工作
   - 可以添加/编辑/删除 Connector
   - 注册表浏览正常
   - Agent 级 Connector/Tool 开关正常
   - OAuth 认证流程正常

---

## 四、现有组件能力总结

### McpTab 组件能力清单

| 功能 | 组件/API | 状态 |
|------|----------|------|
| MCP 全局开关 | `setMcpEnabled()` | 完整 |
| 添加 Connector | `ConnectorForm` + `addMcpConnector()` | 完整 |
| 编辑 Connector | `ConnectorForm` (editing 模式) + `updateMcpConnector()` | 完整 |
| 删除 Connector | `removeMcpConnector()` | 完整 |
| 启动/停止 Connector | `runMcpConnectorAction()` | 完整 |
| 刷新 Tools | `runMcpConnectorAction('refresh-tools')` | 完整 |
| 导入 JSON 配置 | `connectorsFromMcpJson()` | 完整 |
| 浏览 MCP 注册表 | `RegistryBrowser` + `searchRegistry()` | 完整 |
| 一键安装注册表服务 | `RegistryBrowser.handleInstall()` | 完整 |
| OAuth 认证 | `startMcpOAuth()` + `pollMcpOAuth()` | 完整 |
| OAuth 注销 | `logoutMcpOAuth()` | 完整 |
| Agent 级 Connector 开关 | `AgentConnectorControls` + `setAgentMcpConnector()` | 完整 |
| Agent 级 Tool 开关 | `AgentConnectorControls` + `setAgentMcpTool()` | 完整 |
| 多 Agent 支持 | Agent 选择器下拉 | 完整 |

### MCP 数据模型 (types.ts)

```
McpState
├── enabled: boolean                    // 全局开关
├── connectors: McpConnector[]          // 连接列表
└── agentConfig                         // Agent 级配置
    └── connectors: Record<id, {
        enabled: boolean,               // 连接开关
        tools: Record<name, boolean>    // Tool 开关
    }>

McpConnector
├── id, name, description
├── transport: 'stdio' | 'remote' | 'streamable-http' | 'sse'
├── url?, command?, args?, cwd?, env?, headers?
├── status: 'running' | 'stopped'
├── tools: McpTool[]                    // 可用工具列表
├── resources?: McpResource[]           // 可用资源列表
├── prompts?: McpPrompt[]               // 可用提示列表
├── authType?: 'none' | 'bearer' | 'oauth'
├── oauth?: McpOAuthState               // OAuth 状态
└── serverInfo?: { name?, version? }    // 服务端信息
```

---

## 五、后续演进方向

### 5.1 短期优化（方案 A 上线后）

1. **MCP 状态指示器**: 在 Settings 导航的 MCP 项上显示已连接数量 badge
2. **连接健康监控**: 显示每个 Connector 的连接时长、最后活跃时间
3. **Tool 使用统计**: 记录每个 MCP Tool 的调用次数

### 5.2 中期演进

1. **方案 C 联动**: 建立 Skill ↔ MCP Tool 依赖关系，支持交叉跳转
2. **MCP 市场集成**: 在 Registry Browser 中支持评分、评论
3. **批量操作**: 支持批量启用/禁用 Connector、批量导出配置

### 5.3 长期愿景

1. **能力中心**: 统一 Skill + MCP + Plugin 的管理界面
2. **可视化编排**: 拖拽式 Skill + MCP Tool 组合编排
3. **智能推荐**: 根据用户使用模式推荐 Skill 和 MCP 服务

---

## 六、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| i18n key 缺失导致显示 raw key | 低 | 添加翻译后验证 |
| McpTab 依赖的后端 API 未注册 | 中 | 已确认 `plugins/mcp/routes/api.js` 已在 server 中注册 |
| 导航项顺序影响用户习惯 | 低 | 放在 skills 之后，符合能力管理的逻辑分组 |
| MCP 和 Skills 的 Agent 选择器状态不共享 | 低 | 各自独立管理，不影响功能 |

---

## 七、相关文件索引

### Skill 相关

| 文件 | 用途 |
|------|------|
| `core/skill-manager.js` | Skill 加载、过滤、per-agent 隔离核心 |
| `server/routes/skills.js` | Skill REST API |
| `lib/skills/skill-metadata.js` | SKILL.md frontmatter 解析 |
| `lib/skills/skill-file-identity.js` | Skill 文件身份标识 |
| `lib/tools/install-skill.js` | Skill 安装工具 |
| `lib/skill-bundles/store.js` | Bundle 存储 |
| `lib/skill-bundles/package-service.js` | Bundle 导出 |
| `shared/workspace-skill-paths.js` | Workspace Skill 路径 |
| `desktop/src/react/settings/tabs/SkillsTab.tsx` | Skill 设置页面 |
| `desktop/src/react/settings/tabs/skills/SkillBundleTree.tsx` | Bundle 树组件 |
| `desktop/src/react/settings/tabs/skills/SkillRow.tsx` | Skill 行组件 |
| `desktop/src/react/settings/tabs/skills/SkillCapabilities.tsx` | 全局能力配置 |
| `desktop/src/react/settings/tabs/skills/LearnedSkillsBlock.tsx` | 自学 Skill 组件 |
| `desktop/src/react/settings/tabs/skills/CompatPathDrawer.tsx` | 外部兼容路径组件 |
| `desktop/src/react/utils/skill-icons.ts` | Skill 图标工具 |

### MCP 相关

| 文件 | 用途 |
|------|------|
| `plugins/mcp/index.js` | MCP 插件入口 |
| `plugins/mcp/lib/mcp-runtime.js` | MCP 运行时核心 |
| `plugins/mcp/lib/connector-manager.js` | 连接管理器 |
| `plugins/mcp/lib/mcp-stdio-client.js` | stdio 传输客户端 |
| `plugins/mcp/lib/mcp-http-client.js` | HTTP 传输客户端 |
| `plugins/mcp/lib/mcp-oauth.js` | OAuth 认证 |
| `plugins/mcp/lib/oauth-manager.js` | OAuth 管理器 |
| `plugins/mcp/lib/mcp-security.js` | 安全模块 |
| `plugins/mcp/lib/mcp-registry.js` | 注册表 |
| `plugins/mcp/lib/mcp-presets.js` | 预设配置 |
| `plugins/mcp/lib/mcp-metrics.js` | 指标收集 |
| `plugins/mcp/lib/mcp-retry.js` | 重试逻辑 |
| `plugins/mcp/lib/tool-registry.js` | Tool 注册 |
| `plugins/mcp/lib/notification-handler.js` | 通知处理 |
| `plugins/mcp/routes/api.js` | MCP REST API |
| `desktop/src/react/settings/tabs/McpTab.tsx` | MCP 设置页面 |
| `desktop/src/react/settings/tabs/mcp/ConnectorList.tsx` | 连接列表组件 |
| `desktop/src/react/settings/tabs/mcp/ConnectorForm.tsx` | 连接表单组件 |
| `desktop/src/react/settings/tabs/mcp/RegistryBrowser.tsx` | 注册表浏览器 |
| `desktop/src/react/settings/tabs/mcp/AgentConnectorControls.tsx` | Agent 连接控制 |
| `desktop/src/react/settings/tabs/mcp/mcp-api.ts` | MCP API 客户端 |
| `desktop/src/react/settings/tabs/mcp/mcp-config.ts` | MCP 配置解析 |
| `desktop/src/react/settings/tabs/mcp/types.ts` | MCP 类型定义 |

### 设置框架相关

| 文件 | 用途 |
|------|------|
| `desktop/src/react/settings/SettingsNav.tsx` | 设置导航栏 |
| `desktop/src/react/settings/SettingsContent.tsx` | 设置内容路由 |
| `desktop/src/react/settings/SettingsApp.tsx` | 设置应用入口 |
| `desktop/src/react/settings/store.ts` | 设置状态管理 |
| `desktop/src/react/settings/helpers.ts` | i18n 等工具函数 |
| `desktop/src/react/settings/Settings.module.css` | 设置页面样式 |
