# Agent 备份 UI 设计文档

> **方案 B**: 完整备份管理面板

**目标**: 为 Agent 备份功能创建独立的前端设置页面，包含手动备份/恢复、备份历史管理、自动备份配置。

**架构**: 新增 Settings 页面的 "备份与恢复" Tab，包含 3 个主要 Section：手动备份、备份历史、自动备份配置。后端复用已有的 `agent-backup.js` 模块，新增 API 端点支持备份管理和自动备份调度。

**技术栈**: React (TypeScript), Hono (Node.js), CSS Modules, cron-scheduler

---

## 1. 前端组件设计

### 1.1 文件结构

```
desktop/src/react/settings/
├── tabs/
│   ├── BackupTab.tsx                          # 备份与恢复主页面
│   └── backup/
│       ├── ManualBackup.tsx                   # 手动备份/恢复组件
│       ├── BackupHistory.tsx                  # 备份历史列表
│       ├── AutoBackupConfig.tsx               # 自动备份配置
│       └── RestoreConfirmDialog.tsx           # 恢复确认对话框
├── SettingsContent.tsx                        # 修改：添加 Backup Tab 导航
```

### 1.2 BackupTab 主页面

**职责**: 组合 3 个 Section 组件，管理全局状态

**组件树**:
```
BackupTab
├── SettingsSection: 手动备份
│   └── ManualBackup
│       ├── Agent 选择器
│       ├── 导出按钮
│       └── 导入按钮
├── SettingsSection: 备份历史
│   └── BackupHistory
│       ├── 备份列表表格
│       ├── 下载/删除/恢复按钮
│       └── 分页控件
└── SettingsSection: 自动备份配置
    └── AutoBackupConfig
        ├── 启用开关
        ├── 频率选择器
        ├── 时间选择器
        └── 保留数量选择器
```

### 1.3 ManualBackup 组件

**状态**:
- `selectedAgentId: string` - 当前选择的 agent
- `exporting: boolean` - 导出中状态
- `importing: boolean` - 导入中状态

**操作**:
- `handleExport()` - POST `/api/agents/:id/backup`
- `handleImport()` - 打开文件选择器 → POST `/api/agents/:id/restore`

### 1.4 BackupHistory 组件

**状态**:
- `backups: BackupRecord[]` - 备份历史列表
- `loading: boolean` - 加载中状态

**数据结构**:
```typescript
interface BackupRecord {
  filename: string;
  agentId: string;
  agentName: string;
  size: number;
  createdAt: string;
  checksum: string;
}
```

**操作**:
- `loadBackups()` - GET `/api/agents/:id/backups`
- `handleDownload(backup)` - POST `/api/agents/:id/backup/download`
- `handleDelete(backup)` - DELETE `/api/agents/:id/backups/:file`
- `handleRestore(backup)` - 弹出 RestoreConfirmDialog → POST `/api/agents/:id/restore`

### 1.5 AutoBackupConfig 组件

**状态**:
- `enabled: boolean` - 自动备份开关
- `frequency: 'daily' | 'weekly' | 'monthly'` - 备份频率
- `time: string` - 备份时间 (HH:MM)
- `retainCount: number` - 保留数量

**操作**:
- `loadConfig()` - GET `/api/settings/backup-config`
- `saveConfig()` - PUT `/api/settings/backup-config`

### 1.6 RestoreConfirmDialog 组件

**Props**:
- `backup: BackupRecord` - 要恢复的备份
- `onConfirm: () => void` - 确认回调
- `onCancel: () => void` - 取消回调

**内容**:
- 备份详情（文件名、大小、日期、checksum）
- 警告提示（恢复将覆盖当前 agent）
- 确认/取消按钮

---

## 2. 后端 API 设计

### 2.1 新增端点

**文件**: `server/routes/agents.js`

```javascript
// 获取 agent 备份历史列表
GET /api/agents/:id/backups
→ 返回: { backups: BackupRecord[] }

// 创建新备份
POST /api/agents/:id/backup
→ Body: { outputPath?: string } (可选，默认 backup/ 目录)
→ 返回: { success: true, backup: BackupRecord }

// 从备份恢复
POST /api/agents/:id/restore
→ Body: { backupFile: string } (备份文件路径)
→ 返回: { success: true }

// 删除备份
DELETE /api/agents/:id/backups/:filename
→ 返回: { success: true }

// 下载备份文件
POST /api/agents/:id/backup/download
→ Body: { backupFile: string }
→ 返回: 文件流 (application/zip)

// 获取自动备份配置
GET /api/settings/backup-config
→ 返回: { enabled, frequency, time, retainCount }

// 更新自动备份配置
PUT /api/settings/backup-config
→ Body: { enabled, frequency, time, retainCount }
→ 返回: { success: true }
```

### 2.2 自动备份调度

**文件**: `server/index.js` 或新增 `lib/backup/auto-backup-scheduler.js`

**逻辑**:
```javascript
import { CronJob } from 'cron';

export function startAutoBackupScheduler(engine) {
  // 读取配置
  const config = loadBackupConfig();
  
  if (!config.enabled) return;
  
  // 创建 cron job
  const cronExpression = buildCronExpression(config.frequency, config.time);
  
  const job = new CronJob(cronExpression, async () => {
    await backupAllAgents(engine, config.retainCount);
  });
  
  job.start();
}

async function backupAllAgents(engine, retainCount) {
  const agents = engine.listAgents();
  const backupDir = path.join(engine._d.agentsDir, '..', 'backups');
  
  for (const agent of agents) {
    const outputPath = path.join(backupDir, `${agent.id}-${Date.now()}.zip`);
    await engine.exportAgent(agent.id, outputPath);
  }
  
  // 清理旧备份
  await cleanupOldBackups(backupDir, retainCount);
}
```

---

## 3. 数据流设计

### 3.1 手动备份流程

```
用户选择 Agent → 点击"导出备份"
  ↓
前端: POST /api/agents/:id/backup
  ↓
后端: exportAgent(agentDir, outputPath)
  ↓
后端: 返回 { success: true, backup: BackupRecord }
  ↓
前端: 刷新备份历史列表
  ↓
前端: 显示成功提示
```

### 3.2 手动恢复流程

```
用户选择备份 → 点击"恢复"
  ↓
前端: 弹出 RestoreConfirmDialog
  ↓
用户确认 → 前端: POST /api/agents/:id/restore
  ↓
后端: importAgent(backupFile, agentDir)
  ↓
后端: 返回 { success: true }
  ↓
前端: 刷新 agent 列表
  ↓
前端: 显示成功提示 + 建议重启
```

### 3.3 自动备份流程

```
服务器启动
  ↓
读取 backup-config
  ↓
enabled = true → 创建 CronJob
  ↓
到达设定时间 → 触发 backupAllAgents()
  ↓
遍历所有 agent → 调用 exportAgent()
  ↓
保存到 backup/ 目录
  ↓
清理旧备份 (保留最近 N 个)
  ↓
记录日志
```

---

## 4. 错误处理

### 4.1 前端错误处理

| 场景 | 处理方式 |
|------|---------|
| API 请求失败 | 显示 Toast 错误提示 |
| 备份文件不存在 | 从历史列表移除该项 |
| 恢复失败 | 显示错误详情，不刷新页面 |
| 磁盘空间不足 | 提前检查，提示用户清理 |
| 备份文件损坏 | checksum 验证失败时拒绝恢复 |

### 4.2 后端错误处理

| 场景 | 处理方式 |
|------|---------|
| Agent 不存在 | 返回 404 |
| 备份文件损坏 | 返回 400 + 错误详情 |
| 磁盘空间不足 | 返回 507 (Insufficient Storage) |
| 配置文件错误 | 返回 400 + 错误详情 |
| 自动备份失败 | 记录日志，不中断服务 |

---

## 5. 国际化

### 5.1 新增翻译键 (zh.json)

```json
{
  "settings.backup": {
    "title": "备份与恢复",
    "manualBackup": "手动备份",
    "selectAgent": "选择 Agent",
    "exportBackup": "导出备份",
    "importBackup": "导入备份",
    "backupHistory": "备份历史",
    "filename": "文件名",
    "size": "大小",
    "date": "日期",
    "actions": "操作",
    "download": "下载",
    "delete": "删除",
    "restore": "恢复",
    "autoBackup": "自动备份",
    "enableAutoBackup": "启用自动备份",
    "frequency": "频率",
    "time": "时间",
    "retainCount": "保留数量",
    "daily": "每天",
    "weekly": "每周",
    "monthly": "每月",
    "restoreConfirm": "确认恢复",
    "restoreWarning": "恢复将覆盖当前 Agent 数据，此操作不可撤销。",
    "backupDetails": "备份详情",
    "noBackups": "暂无备份",
    "exportSuccess": "备份导出成功",
    "importSuccess": "备份恢复成功",
    "deleteSuccess": "备份已删除",
    "configSaved": "自动备份配置已保存",
    "exportFailed": "备份导出失败",
    "importFailed": "备份恢复失败",
    "deleteFailed": "备份删除失败"
  }
}
```

### 5.2 新增翻译键 (en.json)

```json
{
  "settings.backup": {
    "title": "Backup & Restore",
    "manualBackup": "Manual Backup",
    "selectAgent": "Select Agent",
    "exportBackup": "Export Backup",
    "importBackup": "Import Backup",
    "backupHistory": "Backup History",
    "filename": "Filename",
    "size": "Size",
    "date": "Date",
    "actions": "Actions",
    "download": "Download",
    "delete": "Delete",
    "restore": "Restore",
    "autoBackup": "Auto Backup",
    "enableAutoBackup": "Enable Auto Backup",
    "frequency": "Frequency",
    "time": "Time",
    "retainCount": "Retain Count",
    "daily": "Daily",
    "weekly": "Weekly",
    "monthly": "Monthly",
    "restoreConfirm": "Confirm Restore",
    "restoreWarning": "Restoring will overwrite current Agent data. This action cannot be undone.",
    "backupDetails": "Backup Details",
    "noBackups": "No backups yet",
    "exportSuccess": "Backup exported successfully",
    "importSuccess": "Backup restored successfully",
    "deleteSuccess": "Backup deleted",
    "configSaved": "Auto backup config saved",
    "exportFailed": "Backup export failed",
    "importFailed": "Backup restore failed",
    "deleteFailed": "Backup delete failed"
  }
}
```

---

## 6. 测试计划

### 6.1 单元测试

- ✅ `lib/backup/agent-backup.js` 已覆盖 (269 行测试)

### 6.2 集成测试

**新增测试文件**: `tests/backup-api.test.js`

测试用例:
1. GET `/api/agents/:id/backups` - 返回备份历史列表
2. POST `/api/agents/:id/backup` - 创建新备份
3. POST `/api/agents/:id/restore` - 从备份恢复
4. DELETE `/api/agents/:id/backups/:file` - 删除备份
5. GET `/api/settings/backup-config` - 获取自动备份配置
6. PUT `/api/settings/backup-config` - 更新自动备份配置

### 6.3 E2E 测试

**测试流程**:
1. 打开 Settings 页面
2. 切换到 "备份与恢复" Tab
3. 选择 Agent → 点击"导出备份"
4. 验证备份历史列表显示新备份
5. 点击"恢复" → 确认对话框 → 确认
6. 验证恢复成功提示

---

## 7. 实施计划

详见: `docs/superpowers/plans/2026-05-23-agent-backup-ui-implementation.md`

---

## 8. 自审检查

### 8.1 占位符扫描

✅ 无 TBD/TODO
✅ 所有 API 端点已定义
✅ 所有组件接口已明确
✅ 翻译键完整

### 8.2 内部一致性

✅ 前端 API 调用与后端端点匹配
✅ 数据结构定义一致 (BackupRecord)
✅ 错误处理覆盖所有场景

### 8.3 范围检查

✅ 功能聚焦于备份管理，无过度设计
✅ 可分 3 个独立任务实施（前端组件、后端 API、自动备份调度）

---

## 9. 用户审核

设计文档已完成，请审核并确认是否有需要修改的地方。
