# Bug #001: 启动动画 CSS 未复制到 dist-renderer

- **状态**: 已修复
- **级别**: HIGH
- **发现日期**: 2026-05-19
- **修复提交**: 20cbf092

## 问题描述

`vite.config.ts` 中的 `copyLegacyFiles` 插件未将 `splash.css` 包含在文件复制列表中。构建后 `dist-renderer/splash.css` 不存在，导致 Electron 启动动画窗口只显示背景色，所有动画内容丢失。

## 根因

`copyLegacyFiles()` 插件只复制了 `styles.css` 和 `animations.css`，遗漏了新增的 `splash.css`。

## 修复

在 `vite.config.ts` 的 `files` 数组中添加 `'splash.css'`：

```js
const files = ['styles.css', 'animations.css', 'splash.css', ...];
```

## 教训

新增独立 CSS 文件时，必须同步更新 Vite 构建配置的文件复制列表。

---

# Bug #002: 4 个窗口 CSS 文件未复制到 dist-renderer

- **状态**: 已修复
- **级别**: HIGH
- **发现日期**: 2026-05-19

## 问题描述

与 Bug #001 同类问题。以下 CSS 文件未被 `copyLegacyFiles` 插件复制到 `dist-renderer/`：

| 文件 | 影响窗口 |
|---|---|
| `settings.css` | 设置窗口：面板布局、标题栏拖拽区域全部失效 |
| `onboarding.css` | 引导窗口：背景色/溢出设置丢失 |
| `browser-viewer.css` | 浏览器查看器：工具栏、按钮、卡片框架无样式 |
| `viewer-window.css` | 查看器窗口：工具栏、关闭按钮、布局失效 |

## 修复

在 `vite.config.ts` 的 `files` 数组中补充所有缺失文件。

---

# Bug #003: 新建 Session 返回 500 Internal Server Error

- **状态**: 已修复（重启服务器解决）
- **级别**: HIGH
- **发现日期**: 2026-05-19

## 问题描述

通过 Electron 客户端新建会话时报错：`hanaFetch/api/sessions/new:500 Internal Server Error`

## 根因

Hanako Server 在未配置聊天模型的状态下启动（日志显示 `Model: (none)`）。虽然后续通过设置页面添加了 DeepSeek V4 Pro 模型，但 `SessionCoordinator.createSession()` 在第 392 行解析模型时，`models.currentModel` 仍为 `null`，导致抛出 `noAvailableModel` 错误。

服务器日志同时显示 `stdout pipe broken (EPIPE)`，表明进程间通信已中断。

## 修复

关闭旧的服务器进程，重新启动。新进程正确加载了模型配置：`Model: DeepSeek V4 Pro`。

## 潜在改进

- 模型配置热更新后应刷新 `ModelManager._defaultModel`
- 或在 `createSession` 中增加更清晰的错误提示（区分"从未配置"和"配置后未生效"）
