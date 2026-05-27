# 数据目录迁移指南：.hanako → .jarvis

> **更新日期**: 2026年5月27日  
> **变更**: 默认数据目录从 `~/.hanako` 改为 `~/.jarvis`

---

## 📋 变更说明

为了统一项目命名，我们已经将默认数据目录从 `.hanako` 更改为 `.jarvis`。

### 影响的目录

| 旧路径 | 新路径 | 说明 |
|--------|--------|------|
| `~/.hanako` | `~/.jarvis` | 生产环境数据目录 |
| `~/.hanako-dev` | `~/.jarvis-dev` | 开发环境数据目录 |

---

## 🔄 迁移步骤

### 选项 1：自动迁移（推荐）

首次启动新版本时，系统会自动检测旧目录并提示迁移。

### 选项 2：手动迁移

如果你希望手动迁移数据：

#### Windows

```powershell
# 备份旧目录
Copy-Item -Recurse $HOME\.hanako $HOME\.hanako.backup

# 重命名目录
Rename-Item $HOME\.hanako $HOME\.jarvis
Rename-Item $HOME\.hanako-dev $HOME\.jarvis-dev
```

#### macOS / Linux

```bash
# 备份旧目录
cp -r ~/.hanako ~/.hanako.backup

# 重命名目录
mv ~/.hanako ~/.jarvis
mv ~/.hanako-dev ~/.jarvis-dev
```

---

## 📁 目录内容

数据目录包含以下重要文件：

```
~/.jarvis/
├── added-models.yaml      # Provider 配置（API Keys 等）
├── auth.json              # OAuth 凭证
├── agents/                # Agent 配置和对话历史
│   ├── agent-1/
│   │   ├── config.yaml
│   │   └── sessions/
│   └── ...
├── sessions/              # 会话数据
├── backups/               # 备份文件
└── ...
```

---

## ⚠️ 注意事项

### 1. 环境变量优先级

如果你设置了 `HANA_HOME` 环境变量，它会覆盖默认路径：

```env
# .env 文件
HANA_HOME=/custom/path/to/jarvis-data
```

### 2. 配置文件不受影响

以下配置文件位置**不会改变**：

- `.env` - 项目根目录
- `added-models.yaml` - 仍在 `~/.jarvis/` 下
- `auth.json` - 仍在 `~/.jarvis/` 下
- Agent 的 `config.yaml` - 仍在 `~/.jarvis/agents/` 下

### 3. 向后兼容

如果你继续使用旧目录，可以在 `.env` 中指定：

```env
HANA_HOME=~/.hanako
```

---

## 🛠️ 故障排除

### 问题 1：启动后找不到之前的配置

**原因**: 系统使用了新的默认路径 `~/.jarvis`

**解决**:
1. 检查旧目录是否存在：`ls -la ~/.hanako`
2. 如果存在，按照上面的迁移步骤迁移数据
3. 或在 `.env` 中设置 `HANA_HOME=~/.hanako`

### 问题 2：API Keys 丢失

**原因**: 新目录中还没有配置

**解决**:
1. 检查旧目录中是否有 `added-models.yaml`
2. 如果有，复制到新目录：`cp ~/.hanako/added-models.yaml ~/.jarvis/`
3. 或者重新在设置页面配置

### 问题 3：Agent 配置丢失

**原因**: Agent 数据在旧目录中

**解决**:
1. 复制整个 agents 目录：`cp -r ~/.hanako/agents ~/.jarvis/`
2. 重启应用

---

## ✅ 验证迁移

迁移完成后，验证以下项目：

- [ ] 应用能正常启动
- [ ] 设置中的 Provider 配置正常显示
- [ ] Agent 列表完整
- [ ] 对话历史可访问
- [ ] API Keys 有效

---

## 📚 相关文档

- [Provider 配置指南](./mimo-tts-provider-setup.md)
- [语音设置指南](./voice-settings-setup.md)
- [环境变量配置](../.env.example)

---

**迁移日期**: 2026-05-27  
**旧目录**: `~/.hanako`, `~/.hanako-dev`  
**新目录**: `~/.jarvis`, `~/.jarvis-dev`
