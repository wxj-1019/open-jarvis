# OpenJarvis 项目长期记忆

## 项目概要

- **名称**: OpenJarvis（代号 Jarvis / Hanako）
- **版本**: v0.225.7
- **定位**: 有记忆、有灵魂的私人 AI Agent 桌面应用，面向非程序员用户
- **作者**: liliMozi
- **许可**: Apache 2.0
- **用户数据目录**: `~/.hanako`（开发：`~/.hanako-dev`）

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面端 | Electron 38 |
| 前端 | React 19 + Zustand 5 + CSS Modules |
| 构建 | Vite 7 |
| 服务端 | Hono + @hono/node-server（独立 Node.js 进程） |
| Agent 运行时 | Pi SDK（@mariozechner/pi-ai / pi-coding-agent） |
| 数据库 | better-sqlite3（WAL 模式） |
| 测试 | Vitest |
| 包管理 | pnpm |

## 目录结构

```
core/      引擎编排层（AgentManager, ModelManager, PluginManager 等）
lib/       核心能力库（memory, tools, sandbox, bridge, rag, tts/stt 等）
server/    Hono HTTP + WebSocket 服务
hub/       后台调度（事件总线、定时任务、频道路由）
desktop/   Electron 主进程 + React 前端（src/ 含多个 HTML 入口）
shared/    跨层公共工具
plugins/   内置系统插件
tests/     Vitest 测试（~1034 文件，91k+ 行）
```

## 核心特性

1. **记忆系统 v3**：多阶段编译（今日/本周/长期/事实）、FTS5 + 向量混合检索、艾宾浩斯遗忘曲线
2. **安全沙盒**：PathGuard 四级访问控制 + OS 级沙盒（macOS Seatbelt / Linux Bubblewrap / Windows restricted token）
3. **多 Agent**：独立记忆/人格/定时任务，支持频道群聊和任务委派
4. **Bridge 接入**：Telegram / 飞书 / QQ / 微信机器人
5. **插件系统**：约定优先，两级权限（restricted / full-access）
6. **角色卡**：zip 导出/导入，携带人格 + 头像 + 记忆 + Skills
7. **RAG 检索**：FTS5 + 向量 RRF 混合，支持 PDF/Markdown/txt
8. **语音**：STT + TTS 管线，流式处理
9. **国际化**：zh / en / ja / ko / zh-TW

## 开发命令

```bash
pnpm start          # 启动 Electron（自动构建 renderer）
pnpm start:vite     # Vite HMR 开发模式
pnpm server         # 仅启动 server
pnpm test           # 运行测试
pnpm typecheck      # 类型检查
pnpm dist:win       # 打包 Windows
```
