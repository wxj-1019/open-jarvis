# Bug #004: character-cards 头像映射仍引用 Hanako.png

- **状态**: 已修复
- **级别**: HIGH
- **发现日期**: 2026-05-19

## 问题描述

`lib/character-cards/service.js` 中的 `defaultAvatarForYuan()` 函数将 `hanako` yuan 类型映射到 `Hanako.png`，且所有未知 yuan 的 fallback 也是 `Hanako.png`。但该文件已在 commit `7aec5d12` 中被重命名为 `jarvis.png`。

## 影响范围

- 任何使用 `defaultAvatarForYuan("hanako")` 的代码路径返回不存在的文件路径
- 所有未映射的 yuan 类型（非 hanako/butter/ming/kong）fallback 到不存在的 `Hanako.png`

## 涉及文件

| 文件 | 行 | 问题 |
|---|---|---|
| `lib/character-cards/service.js` | 392 | `hanako: "Hanako.png"` |
| `lib/character-cards/service.js` | 396 | fallback `\|\| "Hanako.png"` |
| `scripts/build-server-runtime-assets.mjs` | 5 | `"Hanako.png"` 列为运行时资源 |
| `tests/build-server-runtime-assets.test.js` | 82 | 测试断言期望 `Hanako.png` |
| `scripts/generate-screenshot-previews.cjs` | 47 | 构建脚本引用 `Hanako.png` |

## 修复

将 `defaultAvatarForYuan()` 中的 `Hanako.png` 全部替换为 `jarvis.png`，同步更新 `build-server-runtime-assets.mjs`。

## 教训

批量重命名文件时，除了 grep 源码中的字符串引用，还必须检查：
1. 数据映射/字典中的值
2. 构建脚本中的资源列表
3. 测试文件中的断言
4. 运行时 fallback 默认值

---

# Bug #005: InputArea.tsx editor 空引用错误

- **状态**: 已修复
- **级别**: MEDIUM
- **发现日期**: 2026-05-19

## 问题描述

`desktop/src/react/components/InputArea.tsx` 中多处 `editor.commands.*` 调用缺少可选链保护。当 TipTap editor 在异步间隙中被销毁时（组件卸载、session 切换），访问 `null.commands` 导致运行时崩溃。

## 涉及位置

| 行 | 代码 | 风险原因 |
|---|---|---|
| 644 | `editor.commands.scrollIntoView()` | `requestAnimationFrame` 异步回调，editor 可能在回调执行时已销毁 |
| 967 | `editor.commands.clearContent()` | `handleSend` 中多个 `await` 操作后调用，editor 可能已失效 |
| 1022 | `editor.commands.clearContent()` | `handleSteer` 中 `await import()` 后调用，editor 可能已失效 |

## 修复

全部改为可选链：`editor?.commands?.methodName()`

## 规律

在 React 中使用 TipTap editor 时，任何在 `await` 或 `requestAnimationFrame`/`setTimeout` 之后访问 editor 的代码，都必须使用可选链或重新检查 `editor && !editor.isDestroyed`。

---

# Bug #006: screenshot.ts msg.blocks 未做 null 检查

- **状态**: 已修复
- **级别**: MEDIUM
- **发现日期**: 2026-05-19

## 问题描述

`desktop/src/react/utils/screenshot.ts` 第 119 行：

```javascript
for (const block of msg.blocks) {
```

`msg.blocks` 可能为 `undefined` 或 `null`。当消息对象缺少 `blocks` 属性时，`for...of` 抛出 `TypeError: undefined is not iterable`。

## 修复

```javascript
for (const block of msg.blocks || []) {
```
