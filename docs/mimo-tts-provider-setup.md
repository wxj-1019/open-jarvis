# Mimo TTS 统一配置指南

> **更新日期**: 2026年5月27日  
> **变更**: 从 `.env` 文件迁移到 Provider 系统配置

---

## 🎯 配置方式变更

### ❌ 旧方式（已废弃）

之前需要在 `.env` 文件中配置：

```env
MIMO_API_KEY=your-key-here
MIMO_TTS_MODEL=mimo-v2.5-tts
```

### ✅ 新方式（推荐）

现在通过 **Provider 系统** 统一管理，与 OpenAI、Claude 等模型配置方式一致：

1. 打开 **设置** → **供应商 (Providers)**
2. 找到 **Xiaomi MiMo TTS**
3. 点击并填入 API Key
4. 配置保存到 `~/.hanako-dev/added-models.yaml`

---

## 📋 配置步骤

### 步骤 1：打开设置页面

- 点击应用中的 **设置** 按钮
- 或按快捷键 `Ctrl+,`

### 步骤 2：进入供应商标签页

在左侧导航栏点击 **供应商**（图标：📊）

### 步骤 3：配置 MiMo TTS

1. 在供应商列表中找到 **Xiaomi MiMo TTS**
2. 点击该条目
3. 在右侧面板中填入：
   - **API Key**: 你的 Mimo API Key
   - **Base URL**: `https://api.xiaomimimo.com/v1`（默认）
   - **API**: `mimo-tts`（默认）

### 步骤 4：保存并验证

1. 点击 **保存**
2. 状态指示灯变为 **绿色**（已配置）
3. 可选：点击 **测试** 按钮验证配置

---

## 🔑 获取 API Key

访问小米开放平台：

- **网址**: https://dev.mi.com/mimo-open-platform
- **步骤**:
  1. 注册开发者账号
  2. 创建应用
  3. 生成 API Key
  4. 复制并粘贴到设置页面

---

## 📁 配置文件位置

配置保存在以下位置：

```
~/.hanako-dev/added-models.yaml
```

示例内容：

```yaml
mimo-tts:
  api_key: "your-api-key-here"
  base_url: "https://api.xiaomimimo.com/v1"
  api: "mimo-tts"
  models:
    - "mimo-v2.5-tts"
    - "mimo-v2-tts"
    - "mimo-v2.5-tts-voicedesign"
    - "mimo-v2.5-tts-voiceclone"
```

---

## 🎨 优势

### 1. 统一管理

所有模型的配置都在同一个地方：

| 模型 | 配置位置 |
|------|----------|
| OpenAI | 设置 → 供应商 → OpenAI |
| Claude | 设置 → 供应商 → Anthropic |
| **MiMo TTS** | **设置 → 供应商 → Xiaomi MiMo TTS** |
| Gemini | 设置 → 供应商 → Google Gemini |

### 2. 热更新

- 修改配置后 **无需重启应用**
- 配置实时生效

### 3. 多模型支持

可以为 MiMo TTS 配置多个模型：

```yaml
mimo-tts:
  api_key: "your-key"
  models:
    - "mimo-v2.5-tts"        # 主要模型
    - "mimo-v2.5-tts-voicedesign"  # 备选模型
```

### 4. 安全存储

- 配置文件存储在用户数据目录（`~/.hanako-dev/`）
- **不会** 被提交到 Git
- 每个用户独立配置

---

## 🔧 故障排除

### 问题 1：找不到 "Xiaomi MiMo TTS" 供应商

**原因**: 应用版本过旧

**解决**:
1. 更新到最新版本
2. 重启应用

### 问题 2：配置后仍显示 "未配置"

**原因**: 配置未正确保存

**解决**:
1. 检查 `~/.hanako-dev/added-models.yaml` 文件是否存在
2. 确认文件格式正确
3. 重新保存配置

### 问题 3：API Key 无效

**原因**: API Key 错误或已过期

**解决**:
1. 登录 https://dev.mi.com/mimo-open-platform
2. 检查 API Key 状态
3. 重新生成并更新配置

---

## 📚 相关文档

- [Provider 系统架构](../core/provider-registry.js)
- [Mimo TTS API 模块](../lib/speech/mimo-tts.js)
- [Mimo TTS Provider 插件](../lib/providers/mimo-tts.js)
- [语音设置页面](../desktop/src/react/settings/tabs/VoiceTab.tsx)

---

## ✅ 配置检查清单

- [ ] 已获取 Mimo API Key
- [ ] 已在设置 → 供应商 → Xiaomi MiMo TTS 中配置
- [ ] 状态指示灯显示绿色（已配置）
- [ ] 测试语音播放成功

---

**最后更新**: 2026-05-27  
**配置方式**: Provider 系统（added-models.yaml）  
**废弃方式**: .env 文件
