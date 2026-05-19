# 2026-05-19 第二轮代码审查报告

## 审查范围

1. 前端组件边界情况（事件处理、refs、DOM操作、日期处理）
2. 服务端会话生命周期与资源清理
3. 数据持久化一致性与原子性

---

## Bug #007: 无效时间戳导致 RangeError（已修复）

**严重程度**: MEDIUM
**文件**: `desktop/src/react/components/BridgePanel.tsx:381`, `desktop/src/react/components/ActivityPanel.tsx:95,248`

**问题**: `formatSessionDate(new Date(s.lastActive).toISOString())` — 当 `s.lastActive` 为无效日期字符串时，`new Date()` 返回 Invalid Date，调用 `.toISOString()` 抛出 `RangeError: Invalid time value`，导致组件崩溃。

**修复**:
1. 在 `format.ts` 中新增 `safeFormatSessionDate(rawDate)` 包装函数，内部 try-catch 捕获 toISOString() 异常
2. 在 `formatSessionDate` 内部增加 `isNaN(date.getTime())` 防御性检查
3. BridgePanel.tsx 和 ActivityPanel.tsx 中 3 处调用点统一改用 `safeFormatSessionDate`

**影响文件**:
- `desktop/src/react/utils/format.ts` — 新增 `safeFormatSessionDate` + `formatSessionDate` 内部防御
- `desktop/src/react/components/BridgePanel.tsx` — 第 381 行
- `desktop/src/react/components/ActivityPanel.tsx` — 第 95、248 行

---

## 已排除的误报

以下项目经代码审查确认为误报，无需修改：

| 文件 | 原疑点 | 实际结论 |
|------|--------|----------|
| `use-sidebar-resize.ts` | 拖拽中卸载导致事件泄漏 | `activeDragCleanup` 在 useEffect cleanup 链中被正确调用 |
| `stream-key-dispatcher.ts` | 内联箭头导致取消订阅失效 | unsubscribe 闭包捕获同一 `cb` 引用，Set.delete 正确工作 |
| `SessionList.tsx` | 事件监听泄漏 | 全部 3 个 listener 在 useEffect return 中正确 removeEventListener |
| `WelcomeScreen.tsx` | 事件监听泄漏 | 唯一 click listener 有正确 cleanup |

---

## 后续建议（未修复，架构层面）

以下为架构层面的改进建议，需要更大范围的变更：

### 1. 非原子写入（25+ 处）
项目中大量使用 `fsp.writeFile` / `writeFileSync` 直接写入，而非 `tmp+rename` 原子模式。进程崩溃时可能导致文件损坏。
- 优先级: LOW — 桌面 Electron 单进程场景下风险较低
- 范围: 约 25+ 处分布在 core/ 和 server/ 目录
- 建议: 按模块逐步迁移到 `writeFileAtomic` 模式

### 2. Session 文件 / sidecar 操作缺乏事务性
归档/写入操作涉及主文件 + sidecar 两次独立 write，中间无事务包裹。
- 优先级: LOW
- 文件: `server/routes/sessions.js:856-903`

### 3. session-meta.json 非原子写入
`core/session-coordinator.js:2245` 使用 `fsp.writeFile` 直接覆写，无 tmp+rename。
- 优先级: LOW
