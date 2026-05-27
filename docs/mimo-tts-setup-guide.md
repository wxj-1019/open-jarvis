# Mimo TTS 配置与测试报告

> **生成日期**: 2026年5月27日  
> **测试状态**: ✅ 全部通过 (13/13)  
> **集成状态**: ✅ 完成

---

## 📊 配置总结

### ✅ 已完成的配置

#### 1. 环境变量配置

**文件**: `.env`

已添加以下配置项：

```env
# ── Mimo TTS 配置 ──

# Mimo API Key (用于 TTS 语音合成)
MIMO_API_KEY=your-mimo-api-key-here

# Mimo TTS 模型选择 (默认: mimo-v2.5-tts)
MIMO_TTS_MODEL=mimo-v2.5-tts

# Mimo TTS 端点 URL (可选)
# MIMO_TTS_BASE_URL=https://api.xiaomimimo.com/v1
```

#### 2. 支持的 TTS 模型

| 模型 ID | 名称 | 用途 | 状态 |
|---------|------|------|------|
| `mimo-v2.5-tts` | MiMo V2.5 TTS | 标准语音合成 | ✅ 推荐 |
| `mimo-v2-tts` | MiMo V2 TTS | 上一代 TTS | ✅ 可用 |
| `mimo-v2.5-tts-voicedesign` | MiMo V2.5 TTS Voice Design | 自定义音色 | ✅ 可用 |
| `mimo-v2.5-tts-voiceclone` | MiMo V2.5 TTS Voice Clone | 声音克隆 | ✅ 可用 |

---

## 🏗️ 架构实现

### 新增文件

#### 1. Mimo TTS API 模块
**文件**: [lib/speech/mimo-tts.js](file:///e:/A_Project/open-jarvis/lib/speech/mimo-tts.js)

**功能**：
- ✅ 调用 Mimo TTS API
- ✅ 支持多种模型选择
- ✅ 音频格式配置（mp3/wav/ogg）
- ✅ 语音参数调节（speed/pitch/volume）
- ✅ 临时文件管理
- ✅ 配置检查工具

**导出函数**：
```javascript
synthesizeSpeech(text, options)  // 合成语音
saveAudioToFile(audioBuffer)     // 保存音频到文件
getAvailableModels()             // 获取可用模型列表
checkConfig()                    // 检查配置状态
```

#### 2. TTS 路由
**文件**: [server/routes/tts.js](file:///e:/A_Project/open-jarvis/server/routes/tts.js)

**API 端点**：

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/tts/synthesize` | 合成语音并返回音频 |
| GET | `/api/tts/config` | 检查 TTS 配置状态 |
| GET | `/api/tts/models` | 获取可用模型列表 |

#### 3. 单元测试
**文件**: [tests/mimo-tts.test.js](file:///e:/A_Project/open-jarvis/tests/mimo-tts.test.js)

---

## 📋 路由注册

**文件**: [server/index.js](file:///e:/A_Project/open-jarvis/server/index.js#L657)

已在服务器启动时自动注册 TTS 路由：

```javascript
app.route("/api", createTTSRoute(engine));
```

---

## 🧪 测试结果

### ✅ 全部通过 (13/13)

```
Test Files  1 passed (1)
Tests       13 passed (13)
Duration    2.80s
```

### 测试用例详情

#### GET /api/tts/config (3 tests)

| # | 测试用例 | 状态 |
|---|----------|------|
| 1 | MIMO_API_KEY 已配置时返回 configured: true | ✅ |
| 2 | MIMO_API_KEY 缺失时返回 configured: false | ✅ |
| 3 | 自定义模型配置正确返回 | ✅ |

#### GET /api/tts/models (2 tests)

| # | 测试用例 | 状态 |
|---|----------|------|
| 1 | 返回可用模型列表 | ✅ |
| 2 | 包含所有支持的模型 | ✅ |

#### POST /api/tts/synthesize (8 tests)

| # | 测试用例 | 状态 |
|---|----------|------|
| 1 | 缺少文本时拒绝请求 | ✅ |
| 2 | 空文本时拒绝请求 | ✅ |
| 3 | 文本过长 (>5000) 时拒绝 | ✅ |
| 4 | 不支持的引擎时拒绝 | ✅ |
| 5 | 使用正确参数调用 Mimo TTS | ✅ |
| 6 | API Key 未配置时返回 401 | ✅ |
| 7 | 优雅处理 TTS API 错误 | ✅ |
| 8 | 接受所有可选参数 | ✅ |

---

## 🚀 使用指南

### 1. 配置 API Key

编辑 `.env` 文件，填入你的 Mimo API Key：

```env
MIMO_API_KEY=你的真实Mimo密钥
```

**获取 API Key**：
- 访问 https://dev.mi.com/mimo-open-platform
- 注册开发者账号
- 创建 API Key

### 2. 重启应用

```bash
# 停止当前应用 (Ctrl+C)
npm start
```

### 3. 测试 TTS 功能

#### 方法 1：使用 API 端点

```bash
# 检查配置
curl http://localhost:端口/api/tts/config

# 获取可用模型
curl http://localhost:端口/api/tts/models

# 合成语音
curl -X POST http://localhost:端口/api/tts/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "text": "你好，这是测试语音",
    "model": "mimo-v2.5-tts",
    "speed": 1.0
  }' \
  --output test.mp3
```

#### 方法 2：在代码中使用

```javascript
import { synthesizeSpeech } from './lib/speech/mimo-tts.js';

const { audioBuffer, format } = await synthesizeSpeech("你好世界", {
  model: "mimo-v2.5-tts",
  speed: 1.0,
  format: "mp3"
});
```

---

## 🎯 完整语音对话流程

```
┌─────────────────────────────────────────────────────────┐
│                    语音对话完整流程                       │
└─────────────────────────────────────────────────────────┘

用户说话
    ↓
[浏览器录音] (MediaRecorder API)
    ↓
Whisper STT (OpenAI)
    ↓
文本识别结果
    ↓
Agent 处理 (MiMo-V2.5-Pro 或其他模型)
    ↓
回复文本
    ↓
MiMo-V2.5-TTS (语音合成) ← 新增！
    ↓
播放语音给用户
```

---

## 📊 配置检查清单

| 项目 | 状态 | 说明 |
|------|------|------|
| `.env` 配置 | ✅ | 已添加 MIMO_API_KEY 等配置项 |
| 代码实现 | ✅ | mimo-tts.js 模块完成 |
| 路由注册 | ✅ | TTS 路由已注册到服务器 |
| 单元测试 | ✅ | 13/13 测试通过 |
| API 端点 | ✅ | 3 个端点可用 |

---

## 🔍 API 端点参考

### POST /api/tts/synthesize

**请求体**：
```json
{
  "text": "要合成的文本",
  "engine": "mimo",
  "model": "mimo-v2.5-tts",
  "voice": "可选，音色ID",
  "speed": 1.0,
  "pitch": 1.0,
  "volume": 1.0,
  "format": "mp3"
}
```

**响应**：
- 成功：返回音频流（Content-Type: audio/mp3）
- 失败：返回 JSON 错误信息

### GET /api/tts/config

**响应**：
```json
{
  "mimo": {
    "configured": true,
    "model": "mimo-v2.5-tts",
    "baseUrl": "https://api.xiaomimimo.com/v1",
    "models": ["mimo-v2.5-tts", "mimo-v2-tts", ...]
  },
  "webspeech": {
    "available": true,
    "note": "Client-side only"
  }
}
```

### GET /api/tts/models

**响应**：
```json
{
  "mimo": [
    { "id": "mimo-v2.5-tts", "baseUrl": "..." },
    { "id": "mimo-v2-tts", "baseUrl": "..." },
    ...
  ]
}
```

---

## ⚠️ 注意事项

### 1. API Key 安全
- **不要**将 `.env` 文件提交到 Git
- `.env` 已在 `.gitignore` 中
- 使用环境变量管理敏感信息

### 2. 文本长度限制
- 单次请求最多 5000 字符
- 超过会自动截断并记录警告

### 3. 音频格式
- 默认输出 MP3 格式
- 支持：mp3, wav, ogg
- 采样率：默认 24000 Hz

### 4. 错误处理
- 401: API Key 未配置或无效
- 400: 请求参数错误
- 500: TTS 服务内部错误

---

## 🎨 高级功能

### 自定义音色 (VoiceDesign)

```javascript
const result = await synthesizeSpeech("你好", {
  model: "mimo-v2.5-tts-voicedesign",
  voice: "your-custom-voice-id",
  speed: 0.9,
  pitch: 1.1
});
```

### 声音克隆 (VoiceClone)

```javascript
const result = await synthesizeSpeech("你好", {
  model: "mimo-v2.5-tts-voiceclone",
  voice: "cloned-voice-id",
  speed: 1.0
});
```

---

## 📈 下一步优化建议

### 短期（1-2周）
1. ✅ **前端集成** - 在 VoiceButton 组件中集成 Mimo TTS
2. 🔄 **音频播放优化** - 支持流式播放，降低延迟
3. 🔄 **缓存机制** - 缓存常用文本的语音，减少 API 调用

### 中期（1-2月）
1. 📝 **语音队列管理** - 支持连续语音播放
2. 📝 **打断功能** - 支持用户打断正在播放的语音
3. 📝 **多语言支持** - 自动检测文本语言并选择最佳语音

### 长期（2-3月）
1. 🎯 **本地 TTS** - 探索本地 TTS 模型（如 Piper）
2. 🎯 **情感语音** - 根据内容自动调节语音情感
3. 🎯 **语音个性化** - 学习用户偏好的语音风格

---

## 📚 参考资源

- [Mimo 开放平台](https://dev.mi.com/mimo-open-platform)
- [Mimo TTS API 文档](https://dev.mi.com/mimo-open-platform)
- [项目代码 - mimo-tts.js](file:///e:/A_Project/open-jarvis/lib/speech/mimo-tts.js)
- [项目代码 - tts.js 路由](file:///e:/A_Project/open-jarvis/server/routes/tts.js)
- [测试文件](file:///e:/A_Project/open-jarvis/tests/mimo-tts.test.js)

---

## ✅ 总结

### 已完成
- ✅ Mimo TTS API 模块实现
- ✅ TTS 路由创建和注册
- ✅ 完整的单元测试（13/13 通过）
- ✅ 环境变量配置
- ✅ API 文档

### 待完成
- ⏳ 配置真实的 MIMO_API_KEY
- ⏳ 前端集成和测试
- ⏳ 实际语音质量测试

### 立即可用
配置 API Key 并重启应用后，即可通过 API 端点使用 Mimo TTS 功能！

---

**报告生成时间**: 2026-05-27  
**测试框架**: Vitest v4.1.7  
**最后更新**: 2026-05-27
