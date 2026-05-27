# Mimo 模型语音模块集成方案

> **生成日期**: 2026年5月27日  
> **目的**: 评估 Mimo 模型在语音模块中的应用可能性

---

## 📊 Mimo 语音模型能力评估

### ✅ 支持的语音功能

| 功能 | 模型 ID | 模型名称 | 状态 | 说明 |
|------|---------|----------|------|------|
| **TTS** | `mimo-v2.5-tts` | MiMo V2.5 TTS | ✅ 可用 | 文本转语音，支持多语言 |
| **TTS** | `mimo-v2-tts` | MiMo V2 TTS | ✅ 可用 | 上一代 TTS 模型 |
| **音色设计** | `mimo-v2.5-tts-voicedesign` | MiMo V2.5 TTS Voice Design | ✅ 可用 | 自定义音色参数 |
| **声音克隆** | `mimo-v2.5-tts-voiceclone` | MiMo V2.5 TTS Voice Clone | ✅ 可用 | 克隆特定声音 |

### ❌ 不支持的语音功能

| 功能 | 说明 |
|------|------|
| **STT (语音识别)** | Mimo 目前没有提供语音转文字模型 |

---

## 🎯 推荐集成方案

### 方案 A：Mimo TTS + OpenAI Whisper（推荐）

**架构**：
```
用户说话 → [Web 录音] → Whisper STT → 文本 → Agent 处理 → 文本 → Mimo TTS → [播放语音]
```

**优势**：
- ✅ STT 使用成熟的 Whisper API（高准确率）
- ✅ TTS 使用 Mimo（可能更便宜、更快、中文更好）
- ✅ 混合使用各自最优方案

**配置要求**：
- OpenAI API Key（用于 Whisper STT）
- Mimo API Key（用于 TTS，如果你有）

---

### 方案 B：纯 OpenAI 方案（当前实现）

**架构**：
```
用户说话 → [Web 录音] → Whisper STT → 文本 → Agent 处理 → 文本 → Web Speech TTS → [播放语音]
```

**优势**：
- ✅ 简单，只需一个 API Key
- ✅ 已实现并测试通过

**劣势**：
- ❌ TTS 使用浏览器内置引擎，质量一般
- ❌ 无法自定义音色

---

## 🔧 如何启用 Mimo TTS

### 步骤 1：确认 API Key

检查你的 Mimo API Key 是否已配置：

1. 打开应用设置
2. 查看 Providers 列表
3. 确认是否有 "Xiaomi (MiMo)" provider
4. 如果没有，添加并填入 API Key

**获取 Mimo API Key**：
- 访问 https://dev.mi.com/mimo-open-platform
- 注册开发者账号
- 创建 API Key

### 步骤 2：配置 TTS 引擎

需要在 TTS 引擎中添加 Mimo 支持。以下是实现要点：

**文件**: `lib/speech/tts-engine.js`

需要添加：
1. Mimo TTS API 调用逻辑
2. 音频流播放支持
3. 队列管理（与现有架构一致）

### 步骤 3：测试 TTS 功能

使用以下模型进行测试：
- `mimo-v2.5-tts`（推荐，最新版本）
- 测试中文和英文语音质量
- 对比 Web Speech API 的效果

---

## 💰 费用对比

### OpenAI Whisper STT
- **价格**: $0.006 / 分钟音频
- **计费**: 按实际使用量
- **质量**: 行业领先

### Mimo TTS（预估）
- **价格**: 需查看 Mimo 官方定价
- **可能优势**: 中文语音可能更便宜/质量更好
- **特色功能**: 声音克隆、音色设计

### 浏览器 Web Speech TTS（当前）
- **价格**: 免费
- **质量**: 一般，机械感较强
- **限制**: 无法自定义，依赖浏览器

---

## 📋 实施优先级

### 当前阶段（Phase 1）：基础语音对话 ✅

**已完成**：
- ✅ Whisper STT 后端路由
- ✅ Web Speech TTS 前端实现
- ✅ 语音按钮 UI
- ✅ 完整的测试覆盖（42/42 测试通过）

**可以立即使用**：
- 按住语音按钮说话
- 松开后自动识别
- Agent 处理后浏览器朗读

### 下一阶段（Phase 2）：Mimo TTS 集成 🔄

**需要实现**：
1. Mimo TTS API 调用封装
2. 音频播放优化
3. 音色选择 UI
4. 性能优化和缓存

**预期收益**：
- 更自然的语音质量
- 可自定义音色
- 可能更低的成本

---

## 🔍 检查你的 Mimo 配置

### 检查方法 1：查看已知模型列表

项目中已包含完整的 Mimo 模型列表：
- 文件：[lib/known-models.json](file:///e:/A_Project/open-jarvis/lib/known-models.json#L2980-L3037)
- 包含 8 个 Mimo 模型（4 个 TTS 相关）

### 检查方法 2：查看 Provider 支持

Mimo Provider 插件已就绪：
- 文件：[lib/providers/mimo.js](file:///e:/A_Project/open-jarvis/lib/providers/mimo.js)
- 默认端点：`https://api.xiaomimimo.com/v1`

### 检查方法 3：查看兼容层

Mimo 兼容层已实现：
- 文件：[core/provider-compat/mimo.js](file:///e:/A_Project/open-jarvis/core/provider-compat/mimo.js)
- 支持思考模式、工具调用等高级功能

---

## ✅ 结论

### Mimo 可以用于语音模块！

**当前可用**：
- ✅ TTS（文字转语音）- 4 个模型可选
- ✅ 音色设计 - 自定义语音风格
- ✅ 声音克隆 - 复制特定声音

**需要配合**：
- ⚠️ STT 仍需使用 Whisper（Mimo 暂无语音识别模型）

### 建议行动

1. **立即**：使用当前的 Whisper STT + Web Speech TTS 方案（已就绪）
2. **短期**：如果你有 Mimo API Key，可以集成 Mimo TTS 提升语音质量
3. **长期**：关注 Mimo 是否发布 STT 模型，实现纯 Mimo 语音方案

---

## 📚 参考资源

- [Mimo 开放平台](https://dev.mi.com/mimo-open-platform)
- [Mimo GitHub](https://github.com/XiaomiMiMo/MiMo)
- [Mimo TTS 文档](https://dev.mi.com/mimo-open-platform)（待补充）
- 项目模型配置：[lib/known-models.json](file:///e:/A_Project/open-jarvis/lib/known-models.json#L2980-L3037)

---

**最后更新**: 2026-05-27  
**状态**: Mimo TTS 可用，STT 需配合 Whisper
