# OpenJarvis 差距分析

> 目标定位：「真正能帮你完成所有事情的 Jarvis」— 一个全能型个人 AI 助理，在本地运行，有记忆、有灵魂、能主动帮你做事。
>
> **迭代版**：基于源码深度分析，每个差距项附带具体代码级实现路径、改动文件和依赖关系。

---

## 一、现状盘点：你已经有了什么

### 1.1 基础工具链（27+ 工具）

| 类别 | 工具 | 说明 |
|------|------|------|
| 文件操作 | read / write / edit / stage_files | 基础 CRUD |
| 命令执行 | bash / terminal | 一次性和持久化 PTY 终端 |
| 网络 | web_search / web_fetch | 搜索和网页内容抓取 |
| 浏览器 | browser | Chromium 控制，含 AXTree 快照、截图、点击、输入 |
| 电脑控制 | computer_use | **实验性**，macOS CUA / Windows UIA |
| 多 Agent | ask_agent / channel / dm | 子任务委派、群聊、私聊 |
| 任务管理 | todo_write / check_pending_tasks / stop_task / wait | 计划跟踪和异步任务管理 |
| 定时 | cron | at / every / cron expression 三种调度模式 |
| 通知 | notify | 桌面和 Bridge 平台通知 |
| 记忆 | search_memory / pin_memory / unpin_memory | 事实检索和置顶记忆 |
| 经验 | experience_read / experience_write | 工作流经验记录 |
| 技能 | install_skill | Agent 自主安装技能 |
| 设置 | update_settings | 两阶段设置修改 |
| 环境 | current_status | 查询运行时信息 |
| 媒体 | generate_image / generate_video | 插件提供（image-gen） |
| MCP | 动态注册的 MCP 工具 | MCP Bridge 插件提供 |

### 1.2 记忆系统（7 层多级）

```
原始对话 (JSONL)
  → 滚动摘要 (每 10 轮 / Session 结束)     // session-summary.js
  → 当日编译 (today.md)                     // compile.js: compileToday()
  → 周编译 (week.md)                        // compile.js: compileWeek()
  → 长期折叠 (longterm.md)                  // compile.js: compileLongterm()
  → 深度记忆 (facts.db, FTS5 + 标签)        // fact-store.js + deep-memory.js
  → 置顶记忆 (pinned.md, 永不过期)          // pinned-memory.js
```

**检索策略**：标签精确匹配 → FTS5 全文搜索（CJK n-gram）→ LIKE 降级，三层 fallback。配置已预留 `embedding_api` 通道（`config-loader.js`），向量检索基础设施待接入。

**编译流水线**：4 个独立 LLM 调用阶段，MD5 指纹跳过未变输入，`compileFacts` 读取 30 天全部摘要拼接送 LLM——随着事实量增长存在上下文溢出风险。

### 1.3 平台覆盖

| 平台 | 状态 | 备注 |
|------|------|------|
| macOS (Apple Silicon / Intel) | 稳定 | 已签名公证 |
| Windows | **Beta** | 安装包未代码签名 |
| Linux | 稳定 | AppImage + deb |
| Mobile PWA | **v0** | 基础会话和工作台 |
| CLI (`hana`) | 可用 | Server-first 模式 |

### 1.4 社交平台接入（Bridge）

同一 Agent 可同时接入 Telegram、飞书、QQ、微信。Owner/Guest 权限分离，`/rc` 远程桌面接管。

### 1.5 多 Agent 与协作

多 Agent 独立记忆/人格/工作区。4 种思维框架（Yuan）。频道群聊（Channel）、私聊（DM）、子任务委派（`ask_agent`）。Hub 中央调度（`hub/index.js`）。

### 1.6 安全

双层沙箱：PathGuard 四级访问控制 + OS 级（Seatbelt / Bubblewrap / AppContainer）。文件预修改备份（Checkpoint）。PII 脱敏。

### 1.7 扩展生态

插件系统：两级权限（Restricted / Full-access）、8+ 贡献类型、Marketplace。技能系统：内置/用户安装/Agent 自学/外部兼容。29 个 LLM 供应商适配。MCP Bridge 插件（间接支持）。

### 1.8 其他已有能力

办公文档读写（PDF / DOCX / XLSX / PPTX）。日记系统。5 语言国际化。10+ UI 主题。全屏媒体预览器。

---

## 二、行业对标

### 2.1 主流开源 AI Agent 项目

| 项目 | 定位 | 核心差异化 |
|------|------|-----------|
| **Open Interpreter** | 本地代码执行 + 自然语言控制电脑 | 终端直接执行代码，无沙盒限制 |
| **AutoGPT / AgentGPT** | 自主任务规划与执行 | 目标分解 → 自动规划 → 多步执行 → 自我修正闭环 |
| **CrewAI** | 多 Agent 角色协作 | 基于角色的 Agent 编排、任务委派、结果汇总 |
| **MetaGPT** | 软件公司模拟 | 多 Agent 模拟产品经理/架构师/工程师，端到端产出 |
| **OpenHands (原 OpenDevin)** | 自主软件开发 Agent | 浏览器+终端+代码编辑三合一 |
| **Dify / Coze / FastGPT** | 低代码 Agent 平台 | 可视化工作流编排、知识库管理 |
| **Langchain / LangGraph** | Agent 开发框架 | 工具调用、记忆、RAG、图状工作流编排 |
| **Home Assistant + Assist** | 智能家居 AI | IoT 设备控制、语音唤醒、本地推理 |
| **Leon AI** | 开源个人助理 | 模块化技能系统、语音交互、离线能力 |
| **Mycroft / OVOS** | 开源语音助理 | 语音唤醒 + 本地 STT/TTS + 技能插件 |

### 2.2 能力对比矩阵

| 能力 | OpenJarvis | Open Interpreter | AutoGPT | CrewAI | Home Assistant |
|------|-----------|-----------------|---------|--------|---------------|
| 桌面原生 | **强** | 弱 | 无 | 无 | 弱 |
| 多 Agent | **强** | 无 | 弱 | **强** | 无 |
| 安全沙盒 | **强** | 无 | 无 | 无 | 中 |
| 记忆系统 | **强** | 无 | 弱 | 无 | 无 |
| 语音交互 | 无 | 弱 | 无 | 无 | **强** |
| MCP 生态 | 弱 | 无 | 无 | 无 | 弱 |
| 日历/邮件 | 无 | 无 | 无 | 无 | 中 |
| IoT 控制 | 无 | 无 | 无 | 无 | **强** |
| 自主规划 | 弱 | 弱 | **强** | **强** | 无 |

### 2.3 OpenJarvis 独特优势

- **桌面原生**：不是 Web 应用，是真正的桌面 Agent，能操作本地文件和软件
- **多平台 Bridge**：一个 Agent 同时接入 Telegram/飞书/QQ/微信，竞品没有
- **安全沙盒**：双层隔离在开源 Agent 中非常少见
- **人格系统**：不只是工具，是有性格的伙伴

---

## 三、差距分析（代码级实现路径）

---

### 层级一：核心可靠性（P0）

#### 3.1.1 记忆系统优化

| 项 | 详情 |
|---|------|
| 现状 | FTS5 全文搜索 + 标签匹配，无向量语义搜索。`fact-store.js` 使用 `unicode61` tokenizer，CJK 靠手动 n-gram 绕过。`_likeFallback` 是全表扫描 `%LIKE%`，线性退化 |
| 具体瓶颈 | ① `compileFacts` 读取 30 天全部摘要拼接送 LLM，O(n) 上下文增长 ② `memory-search.js` 标签结果和 FTS 结果无融合排序，标签优先但无权重 ③ 无时间衰减加权，新旧事实同分 |
| **实现路径** | |
| Step 1 | `fact-store.js`：新增 `fact_embeddings` 表（id, fact_id, embedding BLOB），加载 `sqlite-vec` 扩展，注册 `vec0` 虚拟表 |
| Step 2 | `fact-store.js:searchFullText()`：新增第三策略——计算查询文本 embedding → KNN 搜索 → 与 FTS5 结果做 reciprocal-rank fusion 合并 |
| Step 3 | `memory-search.js`：三路检索（标签 → FTS5 → 向量 KNN），加权融合排序，引入时间衰减因子 |
| Step 4 | `config-loader.js`：`embedding_api` 已预留，接入本地 nomic-embed-text（Ollama）或云端嵌入 API |
| Step 5 | `compile.js:compileFacts()`：改为分块摘要（每 50 条事实一组），避免上下文溢出 |
| **改动文件** | `lib/memory/fact-store.js`, `lib/memory/memory-search.js`, `lib/memory/compile.js`, `lib/memory/config-loader.js` |
| 参考 | Mem0、Zep |
| 优先级 | **P0** |

#### 3.1.2 Windows 代码签名

| 项 | 详情 |
|---|------|
| 现状 | SmartScreen 拦截 + "未知发布者"警告 |
| **实现路径** | 购买 EV 代码签名证书（~$300-500/年）→ 配置 `electron-builder` 的 `win.signingHashAlgorithms` 和 `win.certificateSubjectName` → CI/CD 集成签名流程 |
| **改动文件** | `package.json`（build.win 配置）、CI 配置 |
| 优先级 | **P0** |

#### 3.1.3 电脑控制稳定性

| 项 | 详情 |
|---|------|
| 现状 | macOS CUA 通过 Unix socket 与 `hana-computer-use-helper` 通信，Windows UIA 通过 PowerShell 编码脚本。`pixel-level` 操作（click_point, drag）在 macOS 上被禁用。Windows 仅支持 foreground 操作 |
| 具体问题 | ① macOS 无统一错误恢复机制 ② Windows UIA 树在不同应用差异大 ③ 两个 provider 的 action 集不对称（macOS 有 right-click/press_key，Windows 没有） |
| **实现路径** | |
| Step 1 | `core/computer-use/computer-host.js`：增加操作失败自动重试（最多 3 次），指数退避 |
| Step 2 | `providers/windows-uia-provider.js`：补齐 click_point、double_click、drag 等 foreground 操作 |
| Step 3 | 建立高频应用兼容性测试矩阵（Chrome、VS Code、Office、Finder/Explorer），每个应用记录支持的 action 列表 |
| Step 4 | 增加操作前截图 + 操作后截图对比验证，确认操作生效 |
| **改动文件** | `core/computer-use/computer-host.js`, `core/computer-use/providers/macos-cua-provider.js`, `core/computer-use/providers/windows-uia-provider.js` |
| 优先级 | **P0** |

#### 3.1.4 Agent 备份功能

| 项 | 详情 |
|---|------|
| 现状 | README 承诺"后续添加"，Agent 目录结构即文件夹（config.yaml + memory + sessions + desk） |
| **实现路径** | |
| Step 1 | 新增 `lib/backup/agent-backup.js`：遍历 Agent 目录 → 打包为 zip（排除 node_modules、临时文件）→ 写入元数据（版本、创建时间、Agent 名称） |
| Step 2 | `core/agent-manager.js`：新增 `exportAgent(agentId)` / `importAgent(zipPath)` 方法 |
| Step 3 | Settings UI 新增"备份与恢复"页面：手动导出/导入、定时自动备份（可配置间隔）、备份列表管理 |
| Step 4 | （可选）云存储备份：通过 Bridge 或插件上传到飞书/Telegram 作为备份存储 |
| **改动文件** | 新增 `lib/backup/agent-backup.js`，修改 `core/agent-manager.js`，新增 desktop UI 组件 |
| 优先级 | **P0** |

---

### 层级二：主动性与上下文理解（P1）

> 当前架构核心模式：**用户问 → Agent 答**。真正 Jarvis：**感知 → 主动做 → 告诉你结果**。

#### 3.2.1 事件驱动架构（上下文感知的基础）

| 项 | 详情 |
|---|------|
| 现状 | EventBus（`hub/event-bus.js`）已有 emit/subscribe + request/handle 双模式，约 30 个 typed capability。但**零 OS 级事件钩子**——Heartbeat 是 `setInterval` 轮询（默认 31 分钟），Cron 是 60 秒间隔扫描，文件变化靠 diff mtimes 而非 inotify |
| 当前事件类型 | `activity_update`, `cron_job_done`, `channel_new_message`, `dm_new_message`, `error`——全部是内部业务事件 |
| **实现路径** | |
| Step 1 | 新增 `lib/events/os-event-source.js`：跨平台 OS 事件监听器，统一抽象为 EventBus 事件 |
| Step 2 | macOS 实现：`active-win`（当前窗口变化）+ `node-mac-notifier`（系统通知监听）+ `chokidar`（文件系统 watch，已有依赖） |
| Step 3 | Windows 实现：`active-win` + PowerShell UI Automation 事件（窗口焦点变化）+ `chokidar` |
| Step 4 | Linux 实现：`active-win`（X11/Wayland）+ `chokidar` + D-Bus 监听（可选） |
| Step 5 | 新增事件类型注入 EventBus：`window_focus_changed`, `file_system_changed`, `notification_received`, `calendar_event_approaching` |
| Step 6 | `hub/scheduler.js`：注册事件驱动 handler，替代部分 Heartbeat 轮询逻辑 |
| **改动文件** | 新增 `lib/events/os-event-source.js`，修改 `hub/scheduler.js`, `hub/event-bus.js`, `hub/event-bus-capabilities.js` |
| 依赖 | 无前置依赖，可独立开发 |
| 优先级 | **P1** |

#### 3.2.2 持续上下文感知

| 项 | 详情 |
|---|------|
| 现状 | Agent 无"用户当前状态"概念，只能从对话内容推断 |
| **实现路径** | |
| Step 1 | 新增 `lib/context/user-context-tracker.js`：聚合 OS 事件 → 维护用户状态模型（当前应用、当前窗口标题、最近操作、时间上下文） |
| Step 2 | `core/agent.js:buildSystemPrompt()`：注入用户上下文摘要（"用户当前在 VS Code 中编辑 open-jarvis 项目"） |
| Step 3 | `hub/scheduler.js`：基于用户上下文的主动触发规则（if 打开 IDE then 加载项目上下文） |
| **改动文件** | 新增 `lib/context/user-context-tracker.js`，修改 `core/agent.js`（~line 848-1222 buildSystemPrompt），修改 `hub/scheduler.js` |
| 依赖 | 依赖 3.2.1 事件驱动架构 |
| 优先级 | **P1** |

#### 3.2.3 多步自主规划

| 项 | 详情 |
|---|------|
| 现状 | Agent 无规划循环。`todo_write` 是纯状态替换协议（每次传全量 todos），状态靠 `todo-compat.js` 从历史反向扫描重建。`subagent` 是 fire-and-forget（`executeIsolated`），15 分钟超时，结果通过 `DeferredResultStore` 异步回注，无自动编排。**零自主规划基础设施** |
| **实现路径** | |
| Step 1 | 新增 `lib/planner/plan-schema.js`：定义计划数据结构（goal, steps[], dependencies DAG, status, result） |
| Step 2 | 新增 `lib/planner/plan-executor.js`：Plan-and-Execute 循环——① LLM 分解目标为步骤 ② 按 DAG 拓扑序执行 ③ 每步执行后观察结果 ④ 失败时 LLM 重新规划 ⑤ 全部完成时验证目标达成 |
| Step 3 | `lib/tools/subagent-tool.js`：增加结果回调机制（替代纯 fire-and-forget），支持 `onComplete` callback 注入父会话 |
| Step 4 | 新增 `plan_execute` 工具：Agent 可主动调用，传入目标描述，返回计划+自动执行 |
| Step 5 | UI：执行进度可视化（步骤列表 + 状态指示 + 当前步骤高亮） |
| **改动文件** | 新增 `lib/planner/plan-schema.js`, `lib/planner/plan-executor.js`，修改 `lib/tools/subagent-tool.js`（~line 387 deferred result），新增工具注册 |
| 参考 | LangGraph 图状工作流、AutoGPT 的 ReAct 循环 |
| 依赖 | 可独立开发，但与 3.2.5 子 Agent 调度增强互补 |
| 优先级 | **P1** |

#### 3.2.4 意图预测与主动介入

| 项 | 详情 |
|---|------|
| 现状 | Agent 完全被动，Cron + Heartbeat 是定时轮询，不是事件驱动 |
| **实现路径** | |
| Step 1 | 新增 `lib/proactive/rule-engine.js`：规则引擎，条件为事件模式匹配（"窗口切换到 IDE" + "工作时间内"），动作为触发 Agent 会话 |
| Step 2 | 内置规则库：打开 IDE → 加载项目上下文；日历提醒 → 准备会议材料；新邮件 → 摘要通知 |
| Step 3 | `hub/scheduler.js`：集成规则引擎，事件到来时评估规则并触发动作 |
| Step 4 | Settings UI：规则管理页面（启用/禁用/自定义规则） |
| **改动文件** | 新增 `lib/proactive/rule-engine.js`，修改 `hub/scheduler.js` |
| 依赖 | 依赖 3.2.1 + 3.2.2 |
| 优先级 | **P1** |

#### 3.2.5 子 Agent 调度增强

| 项 | 详情 |
|---|------|
| 现状 | `subagent-tool.js`：fire-and-forget，工具白名单固定 12 个，`DeferredResultStore` 异步回注，无结果编排。最大并发 8/父会话、20/全局 |
| **实现路径** | |
| Step 1 | `lib/tools/subagent-tool.js`：增加 `awaitResult` 模式——可选同步等待结果（带超时），替代纯异步 |
| Step 2 | 新增 `lib/planner/parallel-executor.js`：DAG 并行执行器——识别无依赖步骤，`Promise.all` 并行派发子 Agent，汇总结果 |
| Step 3 | 增加子任务进度通知：子 Agent 每完成一步，通过 EventBus 推送进度到父会话 |
| **改动文件** | 修改 `lib/tools/subagent-tool.js`，新增 `lib/planner/parallel-executor.js` |
| 依赖 | 与 3.2.3 共用 plan-schema |
| 优先级 | **P2** |

---

### 层级三：生态集成（P1-P2）

#### 3.3.1 MCP 原生支持

| 项 | 详情 |
|---|------|
| 现状 | MCP Bridge 插件（`plugins/mcp/`）已实现 stdio + HTTP + SSE 三种传输，但**只实现了 `initialize`、`tools/list`、`tools/call` 三个方法**。工具通过 `ctx.registerTool()` 注册，名称加前缀 `mcp_{connectorId}_{toolName}`。`_handleMessage()` 静默丢弃所有非 response 消息（通知、Resources、Prompts 均被忽略）。client identity 仍硬编码为 `"hana"` |
| 与原生 MCP 的差距 | ① 无 Resources 支持（context injection）② 无 Prompts 支持 ③ 无通知处理（`tools/list_changed` 等）④ 无 Sampling 支持 ⑤ 无 per-workspace `mcp.json` 约定 ⑥ 工具名被前缀污染 |
| **实现路径** | |
| Step 1 | `plugins/mcp/lib/mcp-stdio-client.js`：处理 `notifications/tools/list_changed` → 触发重新 `tools/list` 并更新注册。处理 `notifications/resources/list_changed` |
| Step 2 | `plugins/mcp/lib/mcp-runtime.js`：新增 `resources/list` + `resources/read` 支持，MCP Resources 注入为 Agent 上下文 |
| Step 3 | `plugins/mcp/lib/mcp-runtime.js`：新增 `prompts/list` + `prompts/get` 支持，MCP Prompts 注册为可调用的提示模板 |
| Step 4 | 修复 client identity：所有 transport 的 `clientInfo.name` 从 `"hana"` 改为 `"jarvis"` |
| Step 5 | 支持 workspace root 下的 `mcp.json` 约定（类似 VS Code / Claude Code），启动时自动加载 |
| Step 6 | 工具命名优化：保留原始 MCP tool name 作为 metadata，前缀仅用于内部去重，LLM 可见友好名称 |
| **改动文件** | `plugins/mcp/lib/mcp-stdio-client.js`（~190 行）, `plugins/mcp/lib/mcp-http-client.js`（~550 行）, `plugins/mcp/lib/mcp-runtime.js`（~674 行）, `plugins/mcp/routes/api.js` |
| 优先级 | **P1** |

#### 3.3.2 日历集成

| 项 | 详情 |
|---|------|
| 缺失 | 无法读取/创建日历事件 |
| **实现路径** | |
| 方案 A | MCP Server 路线：使用社区 Google Calendar / Outlook MCP Server，原生 MCP 支持后即插即用 |
| 方案 B | 内置工具路线：新增 `lib/tools/calendar-tool.js`，CalDAV 协议（通用）+ Google Calendar API + Outlook REST API。飞书日历通过已有 Lark SDK 集成 |
| 建议 | 先走方案 A 验证需求，再决定是否内置 |
| 依赖 | 方案 A 依赖 3.3.1 MCP 原生支持 |
| 优先级 | **P1** |

#### 3.3.3 邮件集成

| 项 | 详情 |
|---|------|
| 缺失 | 无法收发邮件 |
| **实现路径** | 同日历：MCP Server 路线（社区已有 Gmail / Outlook MCP Server）或内置工具路线（IMAP/SMTP + API） |
| 依赖 | 方案 A 依赖 3.3.1 |
| 优先级 | **P1** |

#### 3.3.4 知识库 / RAG

| 项 | 详情 |
|---|------|
| 缺失 | 无文档摄入能力 |
| **实现路径** | |
| Step 1 | 新增 `lib/rag/document-ingestor.js`：支持拖入文件 → 解析（pdf-parse, mammoth, cheerio）→ 递归字符分割（chunk size 512, overlap 64）→ 嵌入 → 存入 `doc_chunks` 表 |
| Step 2 | 复用 `fact-store.js` 的 SQLite-vec 基础设施，`doc_chunks` 表共享同一 vec0 虚拟表 |
| Step 3 | 新增 `lib/rag/rag-retriever.js`：FTS5 关键词 + 向量语义 + RRF 融合检索 |
| Step 4 | 新增 `ingest_document` 工具：Agent 可主动调用，或用户拖拽触发 |
| Step 5 | `core/agent.js:buildSystemPrompt()`：注入相关文档片段作为上下文 |
| **改动文件** | 新增 `lib/rag/document-ingestor.js`, `lib/rag/rag-retriever.js`，修改 `core/agent.js` |
| 依赖 | 依赖 3.1.1 记忆系统向量化（共享 sqlite-vec 基础设施） |
| 优先级 | **P2** |

#### 3.3.5 项目与任务管理

| 项 | 详情 |
|---|------|
| 缺失 | 无法连接 Linear / Jira / Notion / GitHub Issues |
| **实现路径** | MCP 原生支持后，通过社区 MCP Server 快速接入（GitHub、Jira、Linear、Notion 均有成熟 MCP Server） |
| 依赖 | 依赖 3.3.1 |
| 优先级 | **P2** |

#### 3.3.6 通讯协作增强

| 项 | 详情 |
|---|------|
| 现状 | Bridge 被动接收消息并回复 |
| **实现路径** | |
| Step 1 | `lib/bridge/` 各 adapter：增加 `proactiveSend(target, message)` 方法，支持 Agent 主动发起对话 |
| Step 2 | `hub/scheduler.js`：增加 Bridge 主动触发规则（"重要邮件摘要 → 推送到 Telegram"） |
| Step 3 | 消息优先级分类：Urgent / Normal / Info，决定推送策略 |
| **改动文件** | `lib/bridge/telegram-adapter.js`, `lib/bridge/feishu-adapter.js`, `lib/bridge/qq-adapter.js`, `lib/bridge/wechat-adapter.js`, `hub/scheduler.js` |
| 优先级 | **P2** |

#### 3.3.7 IoT 与智能家居

| 项 | 详情 |
|---|------|
| 缺失 | 无智能家居控制能力 |
| **实现路径** | 通过 MCP Server 接入 Home Assistant API（社区已有成熟 MCP Server）。MQTT 直连作为补充方案 |
| 依赖 | 依赖 3.3.1 |
| 优先级 | **P3** |

---

### 层级四：交互体验（P1-P3）

#### 3.4.1 系统级快速唤起

| 项 | 详情 |
|---|------|
| 缺失 | 无全局快捷键、无 Spotlight 式快唤 |
| **实现路径** | |
| Step 1 | `desktop/main.cjs`：Electron `globalShortcut.register('CommandOrControl+Shift+J', ...)` 全局快捷键 |
| Step 2 | 新增 Spotlight 式浮动搜索框：轻量 Electron BrowserWindow（无边框、透明背景、居中显示），输入即对话 |
| Step 3 | 系统托盘右键菜单：快速新建会话、查看最近会话、Agent 状态概览 |
| **改动文件** | `desktop/main.cjs`，新增桌面 UI 组件 |
| 优先级 | **P1** |

#### 3.4.2 语音交互

| 项 | 详情 |
|---|------|
| 缺失 | 无 STT/TTS 引擎，无语音唤醒 |
| **实现路径** | |
| Step 1 | 新增 `lib/voice/stt-engine.js`：接入 faster-whisper（本地，Python 子进程）或 Whisper API（云端），支持流式识别 |
| Step 2 | 新增 `lib/voice/tts-engine.js`：接入 Piper（本地）/ OpenAI TTS / ElevenLabs，支持流式输出 |
| Step 3 | 新增 `lib/voice/wake-word.js`：接入 openWakeWord，训练 "Hey Jarvis" 唤醒词 |
| Step 4 | 新增 `lib/voice/voice-pipeline.js`：唤醒 → STT → Agent 对话 → TTS → 播放，全链路流水线 |
| Step 5 | UI：语音对话模式（按住说话 / 唤醒词触发），波形可视化 |
| **改动文件** | 新增 `lib/voice/` 目录（4 个文件），修改 `core/agent.js`（工具注册） |
| 参考 | Home Assistant 本地 Whisper STT + Piper TTS；Mycroft/OVOS 完整语音流水线 |
| 优先级 | **P2** |

#### 3.4.3 通知智能分级

| 项 | 详情 |
|---|------|
| 现状 | `notify` 工具无优先级概念 |
| **实现路径** | |
| Step 1 | `lib/tools/notify-tool.js`：增加 `priority` 参数（urgent / normal / info） |
| Step 2 | Desktop 通知层：Urgent → 立即弹窗+声音；Normal → 静默通知栏；Info → 仅记录 |
| Step 3 | Bridge 通知层：Urgent → 立即推送；Normal → 空闲时汇总；Info → 不推送 |
| **改动文件** | `lib/tools/notify-tool.js`，Desktop 通知组件 |
| 优先级 | **P3** |

#### 3.4.4 多模态理解增强

| 项 | 详情 |
|---|------|
| 现状 | Vision Bridge 转述图片给纯文本模型 |
| **实现路径** | |
| 屏幕实时理解 | 复用 computer-use 的截图能力 + Vision 模型定时分析（可配置间隔） |
| 音频理解 | 虚拟音频设备捕获系统音频 → STT → 文本理解 |
| 视频理解 | 关键帧抽取（ffmpeg）→ Vision 模型逐帧分析 |
| 优先级 | **P3** |

---

### 层级五：个性化与学习（P2-P3）

#### 3.5.1 反馈学习

| 项 | 详情 |
|---|------|
| 缺失 | 用户纠正后无法系统性避免重复犯错 |
| **实现路径** | |
| Step 1 | `lib/memory/deep-memory.js`：增加 feedback 类型事实提取——检测"不要/不对/别这样做"等纠正信号 |
| Step 2 | `fact-store.js`：事实表增加 `type` 字段（fact / feedback / preference），检索时 feedback 类型高权重 |
| Step 3 | `core/agent.js:buildSystemPrompt()`：注入高权重 feedback 事实到系统提示 |
| **改动文件** | `lib/memory/deep-memory.js`, `lib/memory/fact-store.js`, `core/agent.js` |
| 优先级 | **P2** |

#### 3.5.2 行为模式学习

| 项 | 详情 |
|---|------|
| 缺失 | 无法学习用户习惯 |
| **实现路径** | 新增 `lib/proactive/behavior-tracker.js`：记录交互时间线 → 统计高频模式 → 转化为规则引擎的触发规则 |
| 依赖 | 依赖 3.2.4 规则引擎 |
| 优先级 | **P3** |

#### 3.5.3 情感理解

| 项 | 详情 |
|---|------|
| 缺失 | 无法感知用户情绪 |
| **实现路径** | 从文本推断情绪（LLM prompt）；语音交互后从语调推断；根据情绪调整回复风格 |
| 优先级 | **P3** |

---

## 四、2025-2026 年行业趋势

1. **Agent 原生操作系统**：Windows Recall、Apple Intelligence 深度集成 OS
2. **多模态实时交互**：GPT-4o、Gemini Live 支持实时语音+视觉+文本
3. **MCP 成为标准**：Anthropic MCP 正成为 AI 工具调用的事实标准
4. **本地优先（Local-First）**：端侧模型（Llama、Phi、Gemma）能力接近云端
5. **Agentic Workflow**：从单次对话到多步自主工作流
6. **多 Agent 协作**：CrewAI、AutoGen、MetaGPT 证明多 Agent 价值
7. **Computer Use**：Claude Computer Use、Operator 让 Agent 直接操作 GUI
8. **记忆即服务**：Mem0、Zep 证明记忆是 Agent 核心竞争力

---

## 五、依赖关系与分阶段路线图

### 5.1 关键依赖链

```
记忆向量化 (3.1.1)
  ├── RAG 文档摄入 (3.3.4)     // 共享 sqlite-vec 基础设施
  └── 反馈学习 (3.5.1)         // 共享 fact-store 扩展

事件驱动架构 (3.2.1)
  ├── 上下文感知 (3.2.2)       // 依赖 OS 事件源
  ├── 意图预测 (3.2.4)         // 依赖事件+上下文
  └── 行为学习 (3.5.1)         // 依赖事件时间线

MCP 原生支持 (3.3.1)
  ├── 日历集成 (3.3.2)         // 方案 A 路线
  ├── 邮件集成 (3.3.3)         // 方案 A 路线
  ├── 项目管理 (3.3.5)         // 社区 MCP Server
  └── IoT 控制 (3.3.7)         // Home Assistant MCP Server

子 Agent 调度 (3.2.5)
  └── 多步自主规划 (3.2.3)     // 共用 plan-schema
```

### 5.2 分阶段路线图

#### Phase 1：地基加固（独立可并行）

| 任务 | 改动范围 | 预估工作量 |
|------|---------|-----------|
| 记忆向量化 | 4 文件修改 | 中（2-3 周） |
| Agent 备份 | 1 新文件 + UI | 小（1 周） |
| 电脑控制稳定性 | 3 文件修改 | 中（2 周） |
| Windows 代码签名 | 配置 + 采购 | 小（1 周，含采购等待） |
| 系统级快速唤起 | 1 文件修改 + UI | 小（3-5 天） |

> Phase 1 的 5 个任务**无相互依赖**，可全部并行开发。

#### Phase 2：从被动到主动

| 任务 | 改动范围 | 预估工作量 | 前置依赖 |
|------|---------|-----------|---------|
| 事件驱动架构 | 1 新文件 + 3 文件修改 | 中（2 周） | 无 |
| 上下文感知 | 1 新文件 + 2 文件修改 | 中（1-2 周） | 事件驱动 |
| MCP 原生支持 | 4 文件修改 | 中（2-3 周） | 无 |
| 多步自主规划 | 2 新文件 + 1 文件修改 | 大（3 周） | 无 |

> Phase 2 中 MCP 原生支持与事件驱动架构**可并行**。多步规划独立开发。

#### Phase 3：生态扩展

| 任务 | 改动范围 | 预估工作量 | 前置依赖 |
|------|---------|-----------|---------|
| 日历 / 邮件集成 | MCP Server 配置 | 小（1 周） | MCP 原生支持 |
| RAG 文档摄入 | 2 新文件 + 1 修改 | 中（2 周） | 记忆向量化 |
| 意图预测与主动介入 | 1 新文件 + 1 修改 | 中（1-2 周） | 事件+上下文 |
| 子 Agent 调度增强 | 1 新文件 + 1 修改 | 中（2 周） | 无 |
| 反馈学习 | 3 文件修改 | 小（1 周） | 记忆向量化 |

#### Phase 4：自然交互

| 任务 | 改动范围 | 预估工作量 | 前置依赖 |
|------|---------|-----------|---------|
| 语音交互 | 4 新文件 + UI | 大（4 周） | 无 |
| 通讯协作增强 | 5 文件修改 | 中（2 周） | 无 |
| 通知智能分级 | 1 文件修改 + UI | 小（1 周） | 无 |

#### Phase 5：长期演进

| 任务 | 前置依赖 |
|------|---------|
| IoT / 智能家居 | MCP 原生支持 |
| 行为模式学习 | 事件驱动 + 规则引擎 |
| 情感理解 | 语音交互（可选） |
| 多模态理解增强 | Vision 模型能力 |
| 移动端完善 | 独立 |

### 5.3 关键路径

最短路径到"真正的 Jarvis"体验：

```
记忆向量化 → MCP 原生支持 → 日历/邮件集成
     ↓              ↓
  RAG 文档      多步自主规划
     ↓              ↓
  反馈学习      事件驱动 → 上下文感知 → 意图预测
                              ↓
                         语音交互
```

**关键路径瓶颈**：MCP 原生支持（Phase 2），因为它同时阻塞日历、邮件、项目管理、IoT 四个下游能力。

---

## 六、优先级矩阵

```
                    低投入 ──────────────────── 高投入
                    │
高收益  ┌───────────┼───────────┐
        │ 记忆优化   │ 多步自主规划 │
        │ 系统级唤起  │ 持续上下文感知│
        │ Agent备份  │ MCP 原生支持 │
        ├───────────┼───────────┤
        │ 代码签名   │ 语音交互    │
        │ 反馈学习   │ 日历/邮件集成│
        │ 电脑控制稳定│ RAG 文档摄入 │
低收益  └───────────┼───────────┘
                    │
```

### 推荐实施顺序

| 优先级 | 类别 | 内容 | 理由 | 改动文件 |
|--------|------|------|------|---------|
| **P0** | 可靠性 | 记忆系统优化 | 灵魂，没有它 Jarvis 只是个 chatbot | `lib/memory/*` 4 文件 |
| **P0** | 可靠性 | Agent 备份功能 | 数据安全基本保障 | 新增 `lib/backup/` + UI |
| **P0** | 可靠性 | 电脑控制稳定性 | 操作桌面软件是核心场景 | `core/computer-use/*` 3 文件 |
| **P0** | 分发 | Windows 代码签名 | 不签名 Windows 用户无法流畅安装 | 配置文件 |
| **P1** | 交互 | 系统级快速唤起 | 降低交互启动成本，投入极小 | `desktop/main.cjs` |
| **P1** | 生态 | **MCP 原生支持** | 一个动作打开整个社区生态 | `plugins/mcp/*` 4 文件 |
| **P1** | 智能 | 事件驱动架构 | 从被动到主动的基础设施 | 新增 1 文件 + 3 修改 |
| **P1** | 智能 | 多步自主规划 | 从执行指令到完成目标 | 新增 2 文件 + 1 修改 |
| **P1** | 生态 | 日历 / 邮件集成 | 覆盖最高频日常工作流 | MCP Server 配置 |
| **P2** | 生态 | RAG 文档摄入 | 让 Agent 学会你的知识 | 新增 2 文件 + 1 修改 |
| **P2** | 交互 | 语音交互 | "真正的 Jarvis"标志 | 新增 4 文件 + UI |
| **P2** | 智能 | 反馈学习 / 子 Agent 增强 | 智能体成熟度 | 3-4 文件修改 |
| **P3** | 交互 | 通知分级 / 多模态 | 精细化体验 | 1-3 文件修改 |
| **P3** | 平台 | 移动端 / IoT / 行为学习 | 扩展边界 | 视具体方案 |

---

## 七、战略建议：三个核心突破方向

### 1. 从被动到主动

事件驱动 + 上下文感知 + 意图预测，让 Agent 不等你问就主动帮你做事。

> 代码路径：`lib/events/os-event-source.js` → `lib/context/user-context-tracker.js` → `lib/proactive/rule-engine.js` → `hub/scheduler.js`

### 2. 从孤立到连接

MCP 原生支持 + 日历/邮件/任务管理集成，让 Agent 能接入你工作的所有服务。

> 代码路径：`plugins/mcp/lib/mcp-runtime.js` 扩展 → 400+ 社区 Server 即插即用 → 日历/邮件专项集成

### 3. 从打字到自然

语音交互 + 系统级唤起 + 多模态理解，让交互回归自然。

> 代码路径：`desktop/main.cjs` 全局快捷键 → `lib/voice/` 语音流水线 → 屏幕/音频实时理解

**如果只能做一件事**：MCP 原生支持。因为它是一个乘数效应——接入 400+ 社区 Server 后，日历、邮件、数据库、项目管理等能力可以快速获得，不需要逐个实现。

---

## 八、一句话总结

你们现在的项目**已经有了一辆车的底盘、发动机、方向盘和四个轮子**。问题不在于缺某个零件，而在于：

1. **可靠性** → 车有时候会熄火（P0 问题）
2. **缺少自动驾驶系统** → 只能手动挡，你得一步一步告诉它做什么（主动性鸿沟）
3. **缺少服务区地图** → 能去的加油站有限（生态集成不足）
4. **缺少语音助手和中控屏** → 交互方式单一，上车还得翻手册（体验问题）

从「能用的工具」到「真正的 Jarvis」，核心突破点不是继续加工具数量，而是**从被动响应跨越到主动服务**——这需要架构层面的演进，不是加几个插件能解决的。

---

## 九、后续讨论入口

以上每个差距都可以展开成具体的技术方案。如果你想深入讨论某一个方向，可以告诉我：

- 「我想先做记忆系统优化」→ 聊 sqlite-vec 集成、混合检索、编译分块
- 「我想先做 MCP 原生支持」→ 聊 Resources/Prompts 扩展、通知处理、workspace mcp.json
- 「我想先做多步自主规划」→ 聊 plan-schema、执行循环、子 Agent 结果回调
- 「我想先做事件驱动架构」→ 聊 OS 事件源、EventBus 扩展、规则引擎
- 「我想先做语音交互」→ 聊 STT/TTS 选型、唤醒词训练、流式对话架构
- 「我想先做 Agent 备份」→ 聊 zip 导出、定时备份、云存储

---

> 生成日期：2026-05-21
> 项目版本：v0.222.29
> 分析来源：项目源码深度分析（411 个源文件逐文件审查）+ GitHub 主流开源 Agent 项目对标研究
