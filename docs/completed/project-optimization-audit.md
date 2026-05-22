# OpenJarvis 项目全面优化审计报告

> **日期**: 2026-05-23  
> **方法**: 6 路并行审计代理 (项目结构 / Server&API / Core&LLM / 配置&安全 / 测试&错误处理)  
> **覆盖范围**: 1,453 个源文件 | 411 个测试文件 | ~30 个 API 路由 | 87 个 core 模块 | 22 个 memory 模块

---

## 一、项目总览

| 维度 | 数据 |
|------|------|
| 版本 | v0.225.7 |
| 总源文件 | ~1,453 (JS/TS/TSX) |
| 测试文件 | ~562 (411 @ `tests/` + ~95 @ `desktop/src/react/__tests__/` + ~5 @ `plugins/`) |
| 最大文件 | `desktop/main.cjs` (3,667行), `core/session-coordinator.js` (2,842行) |
| 技术栈 | Electron 38 + Hono + React 19 + better-sqlite3 + pnpm workspace monorepo |
| 语言支持 | 5 种 (中文/英文/日文/韩文/繁体中文) |

---

## 二、发现项汇总 (按优先级)

### CRITICAL (3 项) — 可能导致服务中断或安全漏洞

#### C1: LLM 客户端零重试机制

- **位置**: `core/llm-client.js` `callText()`
- **问题**: 任何 LLM 调用失败（网络抖动、429、5xx）立即抛出异常，**无任何重试**。`AppError` 已定义 `retryable: true` 标记但从未被消费
- **影响**: 用户对话中瞬时网络故障直接导致回复失败
- **建议**:
  1. 添加指数退避重试（3 次，1s/2s/4s）
  2. 对 429 响应解析 `Retry-After` header
  3. 连接 `compile-retry.js` 的 CircuitBreaker 到 LLM 调用路径

#### C2: 核心模块零测试覆盖

- **位置**: `core/agent.js` (72KB), `core/engine.js` (81KB), `core/llm-client.js` (15KB)
- **问题**: 这些是整个系统的核心引擎，没有单元测试
- **影响**: 任何修改都无法自动化验证，回归风险极高
- **建议**: 至少为以下模块添加基础测试：
  - `llm-client.js` — mock HTTP 层，测试超时/重试/错误分类
  - `engine.js` — 测试 tool building 管道 (filter → sandbox → checkpoint → permission)
  - `config-coordinator.js` — 测试配置读写/迁移

#### C3: API 全局无速率限制

- **位置**: `server/index.js` (整个 Hono app)
- **问题**: 无任何请求频率控制、无并发限制、无全局请求体大小限制 (`safeJson` 可消耗任意内存)
- **影响**: 单客户端可发起 DoS 攻击、内存耗尽攻击
- **建议**:
  1. 添加全局 `bodyLimit` 中间件 (如 50MB)
  2. 对认证端点添加速率限制 (如 `/api/auth/*`)
  3. 对 LLM chat WebSocket 添加并发连接上限

---

### HIGH (7 项) — 功能不完备或显著风险

#### H1: LLM 调用无断路器保护

- **位置**: `core/llm-client.js`
- **问题**: 断路器 (`compile-retry.js` 的 CircuitBreaker) 仅在 memory 编译管道中使用，未连接到主 LLM 调用路径
- **影响**: API Key 失效或 Provider 宕机时，大量请求堆积导致级联失败
- **建议**: 将 `createCircuitBreaker` 注入到 `callText()` 的调用链中

#### H2: 无 LLM 请求前 Token 计数

- **位置**: 缺少前置 token 预算管理
- **问题**: 上下文窗口溢出只能通过请求失败后发现
- **影响**: 浪费 API 调用费用 + 用户等待时间
- **建议**: 在 `buildSystemPrompt()` 后使用 tokenizer 预估 token 数，超限时触发 compaction

#### H3: 无 API Key 轮换/回退机制

- **位置**: `core/provider-registry.js` `getCredentials()`
- **问题**: 每个 Provider 仅支持单个 API Key，认证失败即死路
- **影响**: Key 过期/限流时服务完全不可用
- **建议**: 支持多 Key 配置 + 失败自动切换

#### H4: 错误基础设施无测试

- **位置**: `shared/errors.js`, `shared/error-bus.js`
- **问题**: `AppError` (20 种预定义错误/severity/category/retryable 标志) 和 `ErrorBus` (dedup/路由/breadcrumb) 是错误处理的基础设施，完全没有测试
- **影响**: 错误分类、告警路由、重试决策的正确性无法保证
- **建议**: 优先补齐这两个模块的单元测试

#### H5: API 请求体无 Schema 校验

- **位置**: 全部 30 个路由处理函数
- **问题**: 所有参数验证都是手动 `if` 检查，无 Zod/Typebox Schema 验证
- **影响**: 无效参数直接进入引擎层，错误信息不友好，安全面暴露
- **建议**: 对关键路由 (agents, sessions, config, plugins) 添加 Schema 验证层

#### H6: 缺少安全 HTTP Headers

- **位置**: `server/index.js` Hono app 配置
- **问题**: 仅 `bridge.js` 一个路由设置了 `X-Content-Type-Options: nosniff`。其他安全 header 全缺：`X-Frame-Options`, `Strict-Transport-Security`, `X-XSS-Protection`
- **影响**: 点击劫持、MIME 嗅探攻击等风险
- **建议**: 添加全局安全 header 中间件 (Hono 的 `secureHeaders`)

#### H7: Unhandled Rejection 仅记录不恢复

- **位置**: `server/index.js:975`, `desktop/main.cjs:3662`
- **问题**: `unhandledRejection` 处理器只写日志，不触发 gracefulShutdown
- **影响**: 进程可能进入不一致状态继续运行
- **建议**: 区分 "可恢复" vs "致命" rejection，致命类型触发 gracefulShutdown

---

### MODERATE (10 项) — 代码质量/可维护性/完整性

#### M1: 巨型文件需拆分

| 文件 | 行数 | 建议 |
|------|------|------|
| `desktop/main.cjs` | 3,667 | 拆为 window-manager、ipc-handlers、auto-updater 等模块 |
| `core/session-coordinator.js` | 2,842 | 拆为 session-lifecycle、prompt-executor、tool-dispatcher |
| `core/engine.js` | 1,803 | 拆为 tool-builder、hook-registry、extension-factory |
| `core/agent.js` | 1,326 | 已相对合理，可考虑拆 buildSystemPrompt 子模块 |

#### M2: 双锁文件冲突

- **问题**: `package-lock.json` (npm) 和 `pnpm-lock.yaml` (pnpm) 同时存在。`package.json` 声明 `"packageManager": "pnpm@11.2.2"`
- **影响**: CI/CD 可能使用错误的包管理器
- **建议**: 删除 `package-lock.json`，统一使用 pnpm

#### M3: pnpm-workspace.yaml 被删除

- **问题**: `pnpm-workspace.yaml` 在工作树中被删除但 `package.json` 仍有 `"workspaces": ["packages/*"]`
- **影响**: pnpm workspace 解析可能失败
- **建议**: 恢复 `pnpm-workspace.yaml` 或确认 pnpm 能从 `package.json` 解析 workspaces

#### M4: 无 `.env.example` 文件

- **问题**: 用户需要从 `lib/config.example.yaml` 和源码中推断所需的环境变量
- **建议**: 创建 `.env.example` 列出 `HANA_TOKEN`, `HANA_CORS_ORIGIN` 等关键变量

#### M5: 缺少全局访问日志中间件

- **问题**: 无请求日志（方法、路径、状态码、耗时），无法追踪 API 使用模式
- **建议**: 添加 Hono logger middleware 或自定义访问日志

#### M6: 缺少请求 ID 传播

- **问题**: 无 `X-Request-ID` header、无 trace context。前端错误无法与后端日志关联
- **建议**: 添加 request ID 中间件，注入到所有日志和 `AppError.traceId`

#### M7: Web Session 无定期清理

- **位置**: `core/web-session-store.js`
- **问题**: 过期 Web Session 仅在认证时被动检测，不被主动清理
- **建议**: 添加定时清理 (如每小时)

#### M8: LLM 调用固定 60s 超时

- **位置**: `core/llm-client.js:42`
- **问题**: 所有 Provider 统一 60s 超时，但不同模型差异大（小模型 5s，大模型 120s+）
- **建议**: 按 Provider/Model 级别配置超时

#### M9: `core/llm-client.js` 不支持流式

- **问题**: 所有 LLM 调用都是非流式 HTTP POST，流式完全委托 Pi SDK
- **影响**: 工具调用（如 compile、search）无法获得流式体验
- **建议**: 评估是否需要在 `callText()` 中添加流式选项

#### M10: 无外部监控/APM

- **问题**: 无 Sentry、Datadog、OpenTelemetry 等集成
- **影响**: 生产问题只能通过用户反馈发现
- **建议**: 评估集成 Sentry 或自建 error tracking

---

### LOW (7 项) — 改进建议

#### L1: Session 流状态无 TTL 清理

- **位置**: `server/routes/chat.js` `sessionState` Map
- **问题**: LRU 限制 100 个但无基于时间的 TTL 清理
- **建议**: 添加 30 分钟 TTL 自动清理

#### L2: Health Check 同步 `readdirSync`

- **位置**: `server/index.js:613` `GET /api/health`
- **问题**: 健康检查中同步读取头像目录，阻塞事件循环
- **建议**: 使用缓存的布尔值而非每次 `readdirSync`

#### L3: 迁移文件遗留 TODO

- **位置**: `core/migrations/013-*.js:47,81`
- **问题**: 规划 v0.150.0 后删除的遗留兼容代码仍在
- **建议**: 评估当前版本是否已满足清理条件

#### L4: `_computeQualityForNewFact` O(n²)

- **位置**: `lib/memory/fact-store.js:367`
- **问题**: 每次添加事实加载全部事实到内存，`addBatch(N)` 加载 N 次
- **建议**: 在 `addBatch()` 中一次性加载并复用

#### L5: Provider-compat 分发顺序敏感

- **位置**: `core/provider-compat.js`
- **问题**: 首匹配即胜，添加宽泛匹配可能遮蔽特定规则
- **建议**: 添加冲突检测或使用优先队列

#### L6: Force Release 存在竞态

- **位置**: `core/session-coordinator.js:1682`
- **问题**: `_forceReleaseStreamingSession` 先释放 sessionPath 再后台清理，存在竞态
- **建议**: 添加清理完成前的占用标记

#### L7: Agent 记忆快照不更新

- **位置**: `core/agent.js` `buildSystemPrompt()`
- **问题**: 系统提示在 session 创建时快照，中 session 记忆变化不反映
- **建议**: 评估是否需要实时更新（权衡缓存命中 vs 记忆新鲜度）

---

## 三、已有优势 (应保持)

| 领域 | 强项 |
|------|------|
| **安全** | 多层防御：CSP/CORS/PathGuard/OS Sandbox/PII Guard/日志脱敏/安全审计日志 |
| **日志脱敏** | `log-redactor.cjs` 9+ 正则模式 + 递归对象遍历 + 路径归一化，业界罕见细致 |
| **错误分类** | `AppError` 20 种预定义错误，severity/category/retryable/i18n/HTTP status/traceId |
| **沙箱** | 三层隔离：PathGuard + OS sandbox (seatbelt/bwrap/restricted-token) + managed-config-guard |
| **CSP** | 7 种窗口类型独立 CSP profile，生产模式 `script-src 'self'`，构建时自动注入 |
| **认证** | 三层体系：Loopback Token + Device Credential + Web Session，RBAC 范围控制 |
| **CORS** | 严格白名单：仅 loopback + 可配置远程 origin，其余拒绝 |
| **原子写** | `safe-fs.js` 的 `tmp → rename` 模式防止文件损坏 |
| **测试** | 562 个测试文件，vitest 框架完善，teardown 测试范例级质量 |
| **记忆系统** | 15 轮审计后达到可交付状态，调用链全线贯通 |

---

## 四、优先修复路线图 (建议顺序)

### 阶段 1: 安全防线 (本周)
1. **[C3]** 添加全局 `bodyLimit` 中间件 + 认证端点速率限制
2. **[H6]** 添加全局安全 HTTP Headers 中间件
3. **[M4]** 创建 `.env.example`

### 阶段 2: 核心可靠性 (本周~下周)
4. **[C1]** LLM 客户端添加重试机制 + 断路器
5. **[H1]** 将断路器注入到主 LLM 调用路径
6. **[H7]** Unhandled Rejection 处理改进

### 阶段 3: 代码质量 (下周)
7. **[C2]** 为核心模块 (`llm-client`, `engine`, `errors`, `error-bus`) 添加测试
8. **[H4]** `AppError` + `ErrorBus` 单元测试
9. **[H5]** 关键路由添加 Schema 校验
10. **[M5]** 添加全局访问日志中间件

### 阶段 4: 架构优化 (本月)
11. **[M1]** 拆分巨型文件
12. **[M2]** **[M3]** 解决锁文件和 workspace 配置冲突
13. **[H2]** LLM 前置 Token 计数
14. **[H3]** API Key 多配置支持

---

🤖 Generated with [Qoder](https://qoder.com)
