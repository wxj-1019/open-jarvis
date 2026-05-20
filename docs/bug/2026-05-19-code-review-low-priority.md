# 代码审查: 已知但未修复的低优先级问题

- **审查日期**: 2026-05-19
- **审查范围**: server/, core/, desktop/src/react/, 构建配置

## 一、空 catch 块（约 172 处）

### 严重位置

| 文件 | 行 | 影响 |
|---|---|---|
| `server/routes/chat.js` | 769 | abort 调用失败被静默吞掉，用户以为中止成功 |
| `core/first-run.js` | 113 | 首次运行配置失败被忽略，新用户可能得到不完整配置 |
| `core/migrations.js` | 281, 824 | 数据库迁移错误被静默吞掉，可能导致数据不一致 |
| `lib/desk/heartbeat.js` | 多处 | 心跳错误被忽略，可能掩盖断连检测失败 |
| `lib/sandbox/exec-helper.js` | 154, 160 | 沙箱进程 kill 失败被忽略，可能残留孤儿进程 |
| `lib/sandbox/win32-exec.js` | 多处 | Windows 沙箱清理错误被忽略 |
| `core/engine.js` | 1164 | 模型同步刷新失败被忽略，模型列表可能过时 |
| `server/routes/upload.js` | 172-174 | 上传清理错误被忽略，临时文件可能累积 |

### 建议

- 高影响 catch 块至少添加 `console.error` 或 `log.error`
- 迁移和心跳系统应考虑加入错误计数和告警

## 二、TOCTOU 竞态条件

| 文件 | 行 | 操作 |
|---|---|---|
| `server/routes/desk.js` | 706-707 | `existsSync` + `mkdirSync` |
| `server/routes/desk.js` | 716-718 | `existsSync` + `renameSync` |
| `server/routes/desk.js` | 483-491 | 技能安装: `existsSync` + `rmSync` + `renameSync` |
| `server/routes/sessions.js` | 931-939 | 会话恢复: `access()` + `rename()` |

### 风险评估

桌面单用户场景下风险低。如未来支持多客户端并发访问，需改用 `fs.promises` + `try/catch` 模式替代 `existsSync` 预检。

## 三、路由错误未记录日志

几乎所有路由 handler（`sessions.js`, `agents.js`, `config.js`, `desk.js`, `skills.js`）的 catch 块都只返回 JSON 错误给客户端，不做服务端日志记录。

### 影响

生产环境调试困难，500 错误无法通过服务器日志追溯。

### 建议

在全局 `app.onError` 或每个路由的 catch 中统一添加 `log.error`。

## 四、IPC 文件访问无限制

| IPC 通道 | 文件:行 | 能力 |
|---|---|---|
| `read-file` | main.cjs:2909 | 读取任意绝对路径文件 |
| `read-file-base64` | main.cjs:3061 | 读取任意二进制文件（20MB 以内） |
| `write-file` | main.cjs:2924 | 写入任意绝对路径 |
| `write-file-binary` | main.cjs:2942 | 写入任意二进制文件 |
| `open-file` | main.cjs:2890 | 通过 shell 打开任意文件 |

### 风险评估

桌面 Electron 应用的常见模式，用户信任应用本身。但如果渲染进程存在 XSS 漏洞，攻击者可利用这些 IPC 通道进行任意文件读写。

### 缓解措施

- `contextIsolation: true` + `nodeIntegration: false` 已启用
- 可考虑添加路径白名单校验（仅允许工作目录和 hanakoHome 下的文件操作）

## 五、流资源泄漏风险

| 文件 | 行 | 问题 |
|---|---|---|
| `plugins/image-gen/routes/media.js` | 125-130 | `streamPipe` 客户端断连时未 destroy Node.js Readable |
| `server/http/file-content.js` | 69-70 | `createReadStream` 转 Web ReadableStream 无错误处理 |
| `server/routes/resources.js` | 136-137 | 同上 |
