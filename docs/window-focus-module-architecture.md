# 窗口焦点模块 — 系统架构文档

## 一、模块定位

窗口焦点模块是 open-jarvis **用户上下文感知系统**的核心数据源。它让 Agent 能够理解"用户当前在做什么"，从而提供更智能的主动服务。

## 二、架构全景

```
┌─────────────────────────────────────────────────────────────────────┐
│                        数据采集层                                     │
│  get-windows (activeWindow)    chokidar (FSWatcher)                 │
│       ↓ 每次轮询                       ↓ 实时监听                    │
│  ┌──────────────────────────────────────────────────┐               │
│  │           OSEventSource (数据源)                    │               │
│  │  · 窗口焦点轮询（自适应 500ms/2000ms）              │               │
│  │  · 文件系统变化监听（300ms 去抖）                    │               │
│  │  · 连续错误熔断（10 次）                            │               │
│  │  · 窗口过期重发（60s）                              │               │
│  └──────────────┬───────────────────────────────────┘               │
│                 ↓ EventBus.emit()                                    │
│  ┌──────────────────────────────────────────────────┐               │
│  │           EventBus (事件总线)                       │               │
│  │  type: "window_focus_changed" / "file_system_changed"│            │
│  └──┬──────────┬──────────────┬──────────────────────┘              │
│     ↓          ↓              ↓                                      │
│  ┌──────┐ ┌──────────┐ ┌──────────────────┐                         │
│  │Scheduler│ │UserContext│ │DeepContextPipeline│                     │
│  │(日志)   │ │Tracker    │ │(L1/L2/L3 三层)   │                      │
│  │(规则引擎)│ │(状态维护)  │ │(内容提取)        │                      │
│  └──────┘ └────┬─────┘ └────────┬─────────┘                         │
│                ↓                  ↓                                   │
│  ┌──────────────────────────────────────────────────┐               │
│  │    getContextSummary(locale)                       │               │
│  │    → "用户当前在 VS Code (main.js) 中工作。         │               │
│  │       最近也在 Chrome、Terminal 之间切换。           │               │
│  │       最近涉及文件: config.json, agent.js"          │               │
│  └──────────────┬───────────────────────────────────┘               │
│                 ↓ 注入系统提示                                         │
│  ┌──────────────────────────────────────────────────┐               │
│  │           Agent.buildSystemPrompt()                │               │
│  └──────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

## 三、各模块职责

### 3.1 OSEventSource — 数据采集

- **文件**: `lib/events/os-event-source.js`
- **职责**: 底层 OS 事件采集，转换为 EventBus 标准事件

#### 窗口焦点轮询机制

| 特性 | 值 | 说明 |
|------|-----|------|
| 数据源 | `get-windows` `activeWindow()` | Windows/macOS/Linux 跨平台 |
| 快速轮询 | 500ms | 检测到窗口切换后使用 |
| 慢速轮询 | 2000ms | 连续 5 次相同窗口后切换 |
| 窗口过期 | 60s | 同窗口超过 60s 后重新发射事件 |
| 错误熔断 | 10 次 | 连续失败 10 次后停止轮询 |
| 启动方式 | `async start()` | await `import("get-windows")` 确保就绪 |

#### 文件系统监听

| 特性 | 值 | 说明 |
|------|-----|------|
| 数据源 | `chokidar` watch | 监听 agent workspace 目录 |
| 去抖 | 300ms | 同文件同事件 300ms 内只发一次 |
| 深度 | 0 | 仅监听顶层文件，不递归 |
| 忽略 | node_modules, .git, .cache, .output | |

### 3.2 UserContextTracker — 状态维护

- **文件**: `lib/context/user-context-tracker.js`
- **职责**: 聚合 OS 事件为用户状态模型，为 Agent 提供上下文感知

#### 维护的状态

| 状态 | 类型 | 容量 |
|------|------|------|
| `_currentApp` / `_currentTitle` | `string | null` | 1（当前窗口） |
| `_windowHistory` | `WindowRecord[]` | 最近 10 条 |
| `_recentFiles` | `FileRecord[]` | 最近 20 条 |
| `_richContext` | `object | null` | 由 DeepContextPipeline 写入 |

#### 核心输出 — `getContextSummary(locale)`

生成可注入 Agent 系统提示的上下文文本，包含：
- 当前活跃窗口（应用名 + 标题）
- 最近切换的应用列表（最多 3 个，去重）
- L2 深度上下文（文件内容预览 / 浏览器搜索 / 终端工作目录）
- 最近涉及的文件名列表

### 3.3 DeepContextPipeline — 三层深度采集

- **文件**: `lib/context/deep-context-pipeline.js`
- **职责**: L1/L2/L3 三层上下文采集协调

| 层级 | 内容 | 触发条件 | 隐私级别 |
|------|------|---------|---------|
| **L1** | 应用名 + 窗口标题 | 每次焦点变化 | minimal+ |
| **L2** | 文件内容 / 浏览器搜索 / 终端目录 / 剪贴板 | 窗口停留 5s 后 | standard+ |
| **L3** | 截图 + 多模态模型分析 | 按需，30s 冷却 | full |

L2 适配器优先级：IDE → 终端 → 浏览器 → 剪贴板

### 3.4 Scheduler — 事件分发

- **文件**: `hub/scheduler.js`
- **职责**: 订阅 EventBus，分发到各处理器

#### EventBus 订阅关系

```
window_focus_changed → _onWindowFocusChanged()  → 日志
                     → _onUserContextChanged()   → 日志
                     → ProactiveRuleEngine       → 主动规则触发
                     → UserContextTracker        → 状态更新
                     → DeepContextPipeline       → L2/L3 触发

file_system_changed  → _onFileSystemChanged()   → agent 按需巡检（Jian Beat）
                     → _onUserContextChanged()   → 日志
                     → UserContextTracker        → 状态更新
```

### 3.5 ProactiveRuleEngine — 主动规则引擎

- **文件**: `lib/proactive/proactive-rule-engine.js`
- **职责**: 根据用户上下文变化触发主动 Agent 行为

基于 `window_focus_changed` 和 `file_system_changed` 事件，结合用户偏好中配置的规则，自动触发 Agent 执行任务（如检测到用户在浏览器搜索某个问题时主动提供帮助）。

## 四、事件格式

```typescript
// 窗口焦点变化
interface WindowFocusChanged {
  type: "window_focus_changed";
  app: string;        // 应用名（如 "Code.exe", "chrome"）
  title: string;      // 窗口标题（如 "main.js - open-jarvis"）
  platform: string;   // "win32" | "darwin" | "linux"
  timestamp: number;  // Date.now()
}

// 文件系统变化
interface FileSystemChanged {
  type: "file_system_changed";
  path: string;                    // 文件绝对路径
  event: "add" | "change" | "unlink";
  timestamp: number;
}
```

## 五、启动链路

```
server/index.js
  → hub.initSchedulers()
    → scheduler.start()
      → _subscribeOsEvents()           // 注册 EventBus 订阅
      → _startRuleEngine()             // ProactiveRuleEngine 独立订阅
      → _startDeepContextPipeline()    // DeepContextPipeline 独立订阅
    → osEventSource.start()            // async, await import("get-windows")
      → _startWindowFocusPolling()     // setTimeout 递归轮询
      → _startFileWatching()           // chokidar watch
    → userContextTracker.start()       // 订阅 EventBus
```

## 六、配置参数

| 参数 | 默认值 | 配置位置 | 说明 |
|------|--------|---------|------|
| `fastPollMs` | 500 | `hub/index.js` | 窗口变化后的快速轮询间隔 |
| `slowPollMs` | 2000 | `hub/index.js` | 空闲时的慢速轮询间隔 |
| `stableThreshold` | 5 | `hub/index.js` | 切换到慢速所需的连续相同窗口次数 |
| `staleWindowMs` | 60000 | `os-event-source.js` | 同窗口过期时间 |
| `maxConsecutiveErrors` | 10 | `os-event-source.js` | 熔断阈值 |
| `debounceMs` | 300 | `hub/index.js` | 文件变化去抖间隔 |
| `maxWindowHistory` | 10 | `user-context-tracker.js` | 窗口历史容量 |
| `maxFileHistory` | 20 | `user-context-tracker.js` | 文件变化历史容量 |
| `privacyLevel` | "standard" | `deep-context-pipeline.js` | minimal/standard/full |
| `l2DwellMs` | 5000 | `deep-context-pipeline.js` | L2 触发延迟 |
| `l3CooldownMs` | 30000 | `deep-context-pipeline.js` | L3 冷却时间 |

## 七、测试覆盖

| 测试文件 | 测试数 | 覆盖范围 |
|---------|--------|---------|
| `tests/os-event-source.test.js` | 18 | 启停、焦点发射、去重、自适应轮询、过期重发、熔断、文件事件 |

## 八、日志观测

| 日志标签 | 关键日志 | 位置 |
|---------|---------|------|
| `[os-event-source]` | `窗口焦点检测已启动` / `窗口焦点检测不可用` / `窗口焦点检测失败` | 采集层 |
| `[scheduler]` | `窗口焦点变化: xxx - yyy` | 分发层 |
| `[user-context-tracker]` | `用户上下文追踪已启动` | 状态层 |
| `[deep-context-pipeline]` | `深度上下文管道已启动 (privacy: standard)` | 深度层 |

日志持久化到 `~/.hanako-dev/logs/jarvis-dev-*.log`。

## 九、文件索引

| 文件路径 | 职责 |
|---------|------|
| `lib/events/os-event-source.js` | OS 事件采集（窗口焦点 + 文件系统） |
| `lib/context/user-context-tracker.js` | 用户上下文状态维护与摘要生成 |
| `lib/context/deep-context-pipeline.js` | L1/L2/L3 三层深度上下文管道 |
| `lib/context/rich-context-aggregator.js` | 富上下文聚合器 |
| `lib/context/adapters/ide-content-adapter.js` | IDE 内容适配器（L2） |
| `lib/context/adapters/browser-adapter.js` | 浏览器内容适配器（L2） |
| `lib/context/adapters/terminal-adapter.js` | 终端内容适配器（L2） |
| `lib/context/adapters/clipboard-adapter.js` | 剪贴板适配器（L2 兜底） |
| `lib/proactive/proactive-rule-engine.js` | 主动规则引擎 |
| `hub/scheduler.js` | 事件分发与调度 |
| `hub/event-bus.js` | 事件总线 |
| `hub/event-bus-capabilities.js` | EventBus 事件类型注册（含 schema） |
| `hub/index.js` | Hub 初始化与模块组装 |
| `desktop/main.cjs` | Electron 主进程（server 日志转发） |
| `tests/os-event-source.test.js` | OSEventSource 单元测试 |
