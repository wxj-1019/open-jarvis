<p align="center">
  <img src=".github/assets/banner.jpg" width="100%" alt="OpenJarvis Banner">
</p>

<p align="center">
  <img src=".github/assets/Hanako-280.png" width="80" alt="Jarvis">
</p>

<h1 align="center">OpenJarvis</h1>

<p align="center">一个有记忆、有灵魂的私人 AI 助理</p>

<p align="center"><a href="README_EN.md">English</a></p>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com/liliMozi/openjarvis/releases)

---

## 贾维斯 是什么

OpenJarvis 是一个更加易用的 AI agent，有记忆，有性格，会主动行动，还能多 Agent 在你的电脑上一同工作。

作为助手，Ta 是温柔的：不需要写复杂的配置，不需要理解晦涩的术语。贾维斯 它不只面向 coder ，而是为每一个坐在电脑前工作的人设计的助手。
作为工具，Ta 是强大的：记住你说过的每一件事，操作你的电脑，浏览网页，搜索信息，读写文件，执行代码，管理日程，还能自主学习新技能。

我开这个项目的初衷是：弥合绝大多数人和 AI Agent 之间的缝隙，让强大的 Agent 能力不再只局限于命令行里。于是我做了比传统 Coding Agent 更多一些的优化：一方面是强化 Agent「像人」的属性，是你和他们沟通更自然；另一方面，因为我本职也是一介文员，所以我也针对日常办公场景做了很多工具性和流程性的优化，敬请探索。
此外，贾维斯 有比较完备的图形页面。

如果你用过 claude code、codex、Manus 等 CLI 或是图形化的 Agent，你会在 贾维斯 这里找到熟悉又新奇的感觉。

## 功能特性

**记忆** — 结合主流的记忆方案，自己又发挥了一下，做了个记忆系统，近期的事情记得非常牢固。v3 版本包含：
- 多阶段编译管线（今日/本周/长期/事实），自动指纹缓存避免重复编译
- 深度记忆提取：LLM 从会话摘要中拆分原子事实 + 自动打标签
- FTS5 全文搜索 + 向量语义搜索混合检索，支持中英文日韩国语言 ngram
- 遗忘曲线模型：基于艾宾浩斯曲线自动衰减旧记忆权重，模拟人脑自然遗忘
- 质量评分与修复：每步独立健康状态追踪，自动检测冲突记忆，修复降级错误
- 编译重试与质量保障：指数退避重试 + 降级到缓存结果，编译质量评分
- 记忆归档：将低频访问的旧记忆迁移到归档库，保证主库性能
- 嵌入模型：支持本地和远程嵌入服务，自动选择合适的向量维度
- 详细文档：[记忆系统架构](docs/memory-system-architecture.md) | [API 参考](docs/memory-api-reference.md) | [配置指南](docs/memory-configuration-guide.md) | [迁移指南](docs/memory-migration-guide.md)

**人格** — 不是千篇一律的"AI 助手"。通过人格模板和自定义人格文件塑造独特的性格，每个 Agent 都有自己的说话方式和行为逻辑，Agent 之间分离做得很好，备份方便，Agent 就是文件夹。支持手动备份和自动定时备份，备份内容包括人格、头像、记忆和技能。

**工具** — 读写文件、执行一次性命令或持续终端会话、浏览网页、通过浏览器后端或 API 搜索互联网、截图、分段长截图、媒体预览、检查网页。能力覆盖日常办公的绝大多数场景。也可以通过 server-first CLI 连接同一个 Hana Server，在终端里查看状态、列会话和继续对话。

**SKILLS 支持** — 内置兼容庞大 SKILLS 社区生态，之外，我也做了一些主动的优化：有时候干活之前，Agent 会从 GitHub 安装社区技能，Agent 也可以自己编写并学会新技能，有比较不错的主动性。当然，默认情况给 Agent 做了比较严格的 SKILLS 审核，如果发现 SKILLS 装不上可以自行关闭。

**角色卡与技能包** — Agent 可以导入 / 导出为本地优先的角色卡 zip，按白名单携带人格、头像、可选记忆和 Skills。Skill Bundle 是独立的技能包基础设施，可以在技能管理页分组、拖拽、成组启用，并单独导出为 zip，方便迁移和分享。

**多 Agent** — 创建多个 Agent，各自有独立的记忆、人格和定时任务。Agent 之间可以通过频道群聊协作，也可以互相委派任务。

**书桌** — 每个 Agent 都有自己的书桌，可以放文件、写笺（类似便签，Agent 会主动读取并执行）。支持拖拽操作、文件预览和工作区文件树变更监听，是你和 Agent 之间的异步协作空间。

**全屏媒体查看器** — 聊天里或书桌上的任意图片、SVG、视频，点开就是暗色遮罩的全屏预览：滚轮缩放、拖拽平移，`+` / `−` / `0` 键盘快捷，左右箭头在同会话或同目录的相邻媒体间切换。

**定时任务与心跳** — Agent 可以设置定时任务（Cron），也会定期巡检书桌上的文件变化。你不在的时候，Ta 也能按计划自主工作。

**语音交互** — 集成 STT（语音转文本）和 TTS（文本转语音）引擎，支持在聊天中语音输入和语音输出。语音管线自动管理编码、分片和流式处理，让你可以用"说"的方式与 Agent 自然沟通。

**文档检索 (RAG)** — 摄入本地文档（PDF、Markdown、纯文本等），自动分块并生成向量嵌入。通过 FTS5 关键词搜索 + 向量语义搜索的 RRF 混合检索，让 Agent 能基于你的知识库精准回答问题。

**多步规划** — Agent 可以将复杂任务拆解为多步执行计划，每个步骤有独立状态和依赖管理。支持并行执行器同时推进多个独立步骤，提升任务完成效率。

**主动引擎** — 可配置的规则引擎，让 Agent 能基于时间、事件、上下文变化等条件主动发起行动——不只是"响应你"，而是"为你着想"。

**安全沙盒** — 双层隔离：应用层 PathGuard 四级访问控制 + 操作系统级沙盒（macOS Seatbelt / Linux Bubblewrap / Windows restricted token）。Agent 的权限在你的掌控之中。平时可只读访问系统普通文件，写入和删除限制在工作目录与受控数据目录。Windows 命令沙盒目前是写隔离模型：读取按当前用户权限自然发生，网络也按当前用户网络权限运行；macOS / Linux 的网络隔离仍由对应平台沙盒能力决定。如果你想调整权限，可以在设置 → 安全页面修改沙盒级别；外部网络也可以配置系统代理、手动代理或直连。

**插件系统** — 约定优先的可扩展插件架构。拖拽安装社区插件，插件可以贡献工具、技能、命令、Agent 模板、HTTP 路由、事件钩子、LLM Provider、页面、侧栏 Widget、配置 schema 和后台任务。路由可直接访问核心服务（PluginContext 注入），通过 Session Bus 与 Agent 对话、获取历史、管理 session。两级权限模型（restricted / full-access）保障安全。

**多平台接入** — 同一个 Agent 可以同时接入 Telegram、飞书、QQ、微信机器人，在任何平台和 Ta 对话，可以远程操作电脑；Bridge 消息会带平台上下文，通知也可以回发到当前外部平台。

**移动端与 LAN 前端** — Hana Server 可以托管 `/mobile/` PWA，手机通过设备访问密钥或本地账号登录，查看会话、继续聊天和管理工作台文件。另一台桌面端也可以通过 LAN URL + access key 连接到已有 Hana Server，继续消费同一套会话和资源。

**国际化** — 界面支持中文、英文、日文、韩文、繁体中文 5 种语言。

## 截图

<p align="center">
  <img src=".github/assets/screenshot-main.jpg" width="100%" alt="贾维斯 主界面">
</p>

## 快速开始

### 下载安装

**macOS（Apple Silicon / Intel）**：从 [Releases](https://github.com/liliMozi/openjarvis/releases) 下载最新 `.dmg`。

应用已通过 Apple Developer ID 签名和公证，macOS 应该可以直接打开。

**Windows**：从 [Releases](https://github.com/liliMozi/openjarvis/releases) 下载最新 `.exe` 安装包。

> **Windows SmartScreen 提示：** Windows 安装包现已支持代码签名，首次运行时 Windows Defender SmartScreen 可能仍会提示，点击**更多信息** → **仍要运行**后即可正常使用。你可以在设置 → 代码签名页面查看签名详情。

**Linux**：从 [Releases](https://github.com/liliMozi/openjarvis/releases) 下载最新 `.AppImage` 或 `.deb`。

### 首次运行

首次启动时，引导向导会带你完成配置：选择语言、输入你的名字、连接模型提供商（API key + base URL），并选择三个模型：**对话模型**（主对话）、**小工具模型**（轻量任务）、**大工具模型**（记忆编译和深度分析）。设置页还可以单独选择**视觉模型**，让文本模型通过 Vision Bridge 处理图片附件。贾维斯 支持 OpenAI 兼容、Anthropic 风格、OAuth Provider 和 Ollama 本地模型等多类接入。
目前也添加了 OpenAI 的 OAuth 登录，鉴于 Anthropic 会有封号风险，所以暂时不提供。

## 架构

```
core/           引擎编排层 + Manager（含 PluginManager）
lib/            核心库（记忆、工具、沙盒、Bridge 适配器）
server/         Hono HTTP + WebSocket 服务（独立 Node.js 进程）
hub/            调度器、频道路由、事件总线
desktop/        Electron 应用 + React 前端
shared/         跨层共享工具（config schema、error bus、模型引用等）
plugins/        内置系统插件（随应用打包）
skills2set/     内置技能定义
scripts/        构建工具（server 打包、启动器、签名）
tests/          Vitest 测试
```

引擎层协调多个 Manager（Agent、Session、Model、Preferences、Skill、Channel、BridgeSession、Plugin 等），通过统一的 facade 暴露。Hub 负责后台任务（心跳巡检、定时任务、频道路由、Agent 间通信、DM 路由），独立于当前聊天会话运行。

Session 内的用户可见文件通过 `SessionFile` sidecar 统一登记，桌面端、Bridge、Mobile PWA 和其它远程前端按各自能力消费同一份文件身份。Bridge 平台媒体发送规则见 `.docs/BRIDGE-MEDIA-CAPABILITIES.md`，插件文件贡献规则见 `PLUGINS.md`。

本机 staged 文件优先由各平台 adapter 直接上传：Telegram / 飞书 / 微信走各自上传接口，QQ 走官方 Bot 分片上传接口，再发送 `msg_type: 7` 富媒体消息。`preferences.bridge.mediaPublicBaseUrl` / `HANA_BRIDGE_PUBLIC_BASE_URL` 只用于仍需公网 URL 的平台或远程 fallback；该 URL 作为 `/api/bridge/media/:token` 临时文件路由的 origin，文件本身仍由短期 token、下载次数和本地路径白名单保护。Hana 不会自动开启公网 tunnel，公网入口必须由用户显式提供。

Server 以独立 Node.js 进程运行（由 Electron spawn 或独立启动），通过 Vite 打包，@vercel/nft 追踪依赖。与 Electron 渲染进程通过 WebSocket 通信。
用户数据目录由 `HANA_HOME` 决定（生产默认 `~/.hanako`，开发默认 `~/.hanako-dev`）。Pi SDK 自己的数据隔离在 `${HANA_HOME}/.pi/` 下。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面端 | Electron 38 |
| 前端 | React 19 + Zustand 5 + CSS Modules |
| 构建 | Vite 7 |
| 服务端 | Hono + @hono/node-server |
| Agent 运行时 | [Pi SDK](https://github.com/nicepkg/pi) |
| 数据库 | better-sqlite3（WAL 模式） |
| 测试 | Vitest |
| 包管理 | pnpm |
| 国际化 | 5 语言（zh / en / ja / ko / zh-TW） |

## 平台支持

| 平台 | 状态 |
|------|------|
| macOS (Apple Silicon) | 已支持（已签名公证） |
| macOS (Intel) | 已支持 |
| Windows | Beta |
| Linux | 已支持（AppImage / deb） |
| 移动端 (PWA) | v0：同一 Hana server 的手机会话与工作台访问 |

## 开发

```bash
# 安装依赖（需要 pnpm）
pnpm install

# Electron 启动（自动构建 renderer）
pnpm start

# Vite HMR 开发（需先运行 pnpm dev:renderer）
pnpm start:vite

# 仅启动 server
pnpm server

# server-first CLI
pnpm cli

# 运行测试
pnpm test

# 类型检查
pnpm typecheck
```

## 许可证

[Apache License 2.0](LICENSE)

## 链接

- [官网](https://openjarvis.com)
- [提交 Issue](https://github.com/liliMozi/openjarvis/issues)
- [安全页](https://github.com/liliMozi/openjarvis/security)
- [安全政策](SECURITY.md)
- [插件开发指南](PLUGINS.md)
- [贡献指南](CONTRIBUTING.md)
