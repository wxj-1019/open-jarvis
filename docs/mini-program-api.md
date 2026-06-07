# 小程序云端任务 API 文档（MVP）

> OpenJarvis 云端沙箱模式 — 小程序对接指南

## 认证方式

小程序需要通过 **设备凭证（Device Credential）** 认证后，才能调用云端任务 API。

### 获取设备凭证

有两种方式获取设备凭证：

#### 方式一：通过桌面端创建（推荐）

在 OpenJarvis 桌面端的 **设置 → 访问与设备** 中：
1. 点击"添加设备"
2. 设备类型选择"小程序"
3. 授予 `cloud.submit` 和 `cloud.read` 权限
4. 复制生成的 Token（格式：`device_xxx...`）

#### 方式二：通过 API 创建（高级）

```bash
# 需要先通过本地 loopback token 调用
curl -X POST http://localhost:8765/api/devices \
  -H "Authorization: Bearer <loopback_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Mini Program",
    "scopes": ["cloud.submit", "cloud.read"],
    "trustState": "lan"
  }'
```

响应示例：
```json
{
  "ok": true,
  "credential": {
    "deviceId": "dev_abc123",
    "secret": "device_abc123.xxxxxxxx",
    "scopes": ["cloud.submit", "cloud.read"],
    "expiresAt": null
  }
}
```

> ⚠️ **secret 只显示一次，请妥善保存！**

---

## API 端点

### Base URL

- 本地测试：`http://localhost:8765`
- 局域网：`http://<服务器局域网IP>:8765`
- 云端部署：`https://your-domain.com`

### 认证头

所有请求需要在 `Authorization` 头中携带 Bearer Token：

```
Authorization: Bearer device_abc123.xxxxxxxx
```

---

### 1. 提交云端任务

```
POST /api/cloud/tasks
```

**请求体：**

```json
{
  "prompt": "帮我分析这个 CSV 文件：...",
  "agentId": "hanako",       // 可选，默认当前 agent
  "sessionId": "optional"    // 可选，关联会话
}
```

**响应：**

```json
{
  "ok": true,
  "taskId": "tsk_2xxxx_abc123",
  "status": "pending"
}
```

---

### 2. 查询任务状态

```
GET /api/cloud/tasks/:taskId
```

**响应：**

```json
{
  "taskId": "tsk_2xxxx_abc123",
  "agentId": "hanako",
  "sessionId": null,
  "status": "running",
  "result": null,
  "error": null,
  "cloudWorkspaceId": null,
  "submittedAt": "2026-06-07T10:00:00.000Z",
  "startedAt": "2026-06-07T10:00:05.000Z",
  "finishedAt": null,
  "createdAt": "2026-06-07T10:00:00.000Z"
}
```

**状态说明：**

| 状态 | 说明 |
|------|------|
| `pending` | 任务已提交，等待执行 |
| `running` | 任务正在执行中 |
| `done` | 任务完成，`result` 字段有结果 |
| `error` | 任务执行失败，`error` 字段有错误信息 |
| `cancelled` | 任务被取消 |

---

### 3. 列出任务列表

```
GET /api/cloud/tasks?agentId=hanako&status=done&limit=10
```

**查询参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `agentId` | string | 按 Agent 过滤，默认当前 agent |
| `status` | string | 按状态过滤（`pending`/`running`/`done`/`error`） |
| `limit` | number | 返回数量限制，默认 20，最大 100 |

**响应：**

```json
{
  "tasks": [
    {
      "taskId": "tsk_2xxxx_abc123",
      "agentId": "hanako",
      "status": "done",
      "submittedAt": "2026-06-07T10:00:00.000Z",
      "finishedAt": "2026-06-07T10:00:30.000Z"
    }
  ]
}
```

---

## 结果获取方式

### MVP：轮询（Polling）

小程序定期调用 `GET /api/cloud/tasks/:taskId` 检查任务状态，直到 `status` 变为 `done` 或 `error`。

**示例流程：**

```javascript
// 1. 提交任务
const submitRes = await wx.request({
  url: 'http://example.com:8765/api/cloud/tasks',
  method: 'POST',
  header: { Authorization: 'Bearer ' + deviceToken },
  data: { prompt: '帮我写一份 PPT 大纲' }
});
const { taskId } = submitRes.data;

// 2. 轮询状态
let task = null;
while (!task || ['pending', 'running'].includes(task.status)) {
  await new Promise(r => setTimeout(r, 3000)); // 每 3 秒轮询一次
  const res = await wx.request({
    url: `http://example.com:8765/api/cloud/tasks/${taskId}`,
    header: { Authorization: 'Bearer ' + deviceToken }
  });
  task = res.data;
}
// 3. 获取结果
if (task.status === 'done') {
  console.log('任务结果：', task.result);
} else {
  console.error('任务失败：', task.error);
}
```

---

### 后续版本：Server-Sent Events（SSE）推送

> 📡 **计划中的功能**，当前版本请使用轮询方式。

当任务状态变更时，服务器通过 SSE 向小程序推送更新：

```
GET /api/cloud/tasks/stream?taskId=tsk_xxx
```

小程序通过 `wx.request` 无法保持长连接，建议使用轮询或 WebSocket（如果支持）。

---

## 错误码

| HTTP 状态码 | 说明 |
|--------------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误（如缺少 prompt）|
| 401 | 未认证（缺少或无效的 Token）|
| 403 | 权限不足（Token 没有所需的 scope）|
| 404 | 任务不存在 |
| 500 | 服务器内部错误 |

**403 错误示例：**

```json
{
  "error": "insufficient_scope",
  "scope": "cloud.submit"
}
```

---

## 小程序集成示例（微信小程序）

```javascript
// utils/cloud-api.js
const CLOUD_API_BASE = 'http://your-server:8765';

export async function submitCloudTask(prompt) {
  const deviceToken = wx.getStorageSync('device_token');
  if (!deviceToken) {
    throw new Error('请先绑定设备');
  }
  const res = await wx.request({
    url: `${CLOUD_API_BASE}/api/cloud/tasks`,
    method: 'POST',
    header: {
      'Authorization': `Bearer ${deviceToken}`,
      'Content-Type': 'application/json'
    },
    data: { prompt }
  });
  if (res.statusCode !== 200) {
    throw new Error(res.data.error || '提交任务失败');
  }
  return res.data.taskId;
}

export async function getTaskStatus(taskId) {
  const deviceToken = wx.getStorageSync('device_token');
  const res = await wx.request({
    url: `${CLOUD_API_BASE}/api/cloud/tasks/${taskId}`,
    header: { 'Authorization': `Bearer ${deviceToken}` }
  });
  return res.data;
}
```

---

## 进阶：结果推送（Phase 3 后续）

计划在后续版本中支持：
1. **WebSocket 推送**：小程序建立 WebSocket 连接，任务状态变更时实时推送
2. **微信订阅消息**：任务完成时通过微信服务通知用户
3. **CloudStudio 深度集成**：真正在云端执行任务，支持更复杂的工作流

---

*文档版本：MVP 1.0（2026-06-07）*
