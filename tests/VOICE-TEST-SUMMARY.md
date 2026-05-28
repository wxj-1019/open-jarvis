# 语音模块测试总结

## 测试覆盖范围

### ✅ 所有测试通过 (133/133)

---

## 1. Voice Pipeline 测试 (18 tests)

**文件**: `tests/speech/voice-pipeline.test.js`

测试语音对话流水线的完整流程：STT → Agent → TTS

### 测试用例

- ✅ 初始化为 IDLE 状态
- ✅ 初始无会话
- ✅ 返回默认选项
- ✅ 更新选项合并新值
- ✅ 完成完整流水线：STT → Agent → TTS
- ✅ STT 识别后触发 'recognized' 事件
- ✅ TTS 启动时触发 'speaking' 事件
- ✅ 结束时触发 'complete' 事件
- ✅ 无语音识别时抛出错误
- ✅ 监听期间取消流水线
- ✅ 取消时触发 'cancelled' 事件
- ✅ Agent 处理错误优雅处理
- ✅ autoSpeak 关闭时跳过 TTS
- ✅ 状态转换正确
- ✅ 完成后可重新启动
- ✅ 非 IDLE 状态时启动被拒绝
- ✅ 空识别时触发错误事件
- ✅ 销毁时取消并移除监听器

---

## 2. Voice Input Tool 测试 (10 tests)

**文件**: `tests/tools/voice-input-tool.test.js`

测试 Agent 语音输入工具的功能

### 测试用例

- ✅ 工具名称正确
- ✅ 包含描述信息
- ✅ 参数架构包含可选的 lang 和 timeout
- ✅ 使用默认参数调用 onListen
- ✅ 传递自定义 lang 和 timeout
- ✅ 空结果返回 'No speech recognized'
- ✅ 纯空白结果返回 'No speech recognized'
- ✅ 处理 onListen 错误
- ✅ onListen 未定义时返回 no-speech
- ✅ 包含识别文本到 details

---

## 3. Voice Route 测试 (14 tests)

**文件**: `tests/voice-route.test.js`

测试 Whisper API 后端路由

### GET /api/voice/config (4 tests)

- ✅ API key 可用时返回 configured: true
- ✅ API key 缺失时返回 configured: false
- ✅ 配置自定义 baseUrl 时正确返回
- ✅ getProviderCredentials 不可用时回退到 getConfig

### POST /api/voice/transcribe (10 tests)

- ✅ 缺少音频文件时拒绝请求
- ✅ 不支持的音频格式时拒绝
- ✅ 空音频文件时拒绝
- ✅ API key 未配置时拒绝
- ✅ 文件过大 (>25MB) 时拒绝
- ✅ 使用正确参数调用 Whisper API
- ✅ 优雅处理 Whisper API 错误
- ✅ 处理速率限制错误 (429)
- ✅ 接受有效的音频格式 (webm, ogg, wav)
- ✅ 使用自定义 whisperBaseUrl

---

## 4. MiMo TTS 测试 (23 tests)

**文件**: `tests/speech/mimo-tts.test.js`

测试 MiMo TTS 语音合成服务的核心逻辑

### synthesizeSpeech (18 tests)

- ✅ API key 未配置时抛出错误
- ✅ API key 为空字符串时抛出错误
- ✅ 空文本抛出错误
- ✅ 纯空白文本抛出错误
- ✅ 超长文本（>5000字符）自动截断
- ✅ 正确调用 fetch（URL、headers）
- ✅ 发送正确的默认请求体
- ✅ 传递自定义选项到请求体
- ✅ 不包含 undefined 值
- ✅ 成功时返回 audioBuffer、format、contentType
- ✅ API 错误响应抛出异常
- ✅ API 错误响应（纯文本）抛出异常
- ✅ 空音频响应抛出异常
- ✅ 使用自定义 baseUrl
- ✅ 从配置获取 model（字符串格式）
- ✅ 从配置获取 model（对象格式）
- ✅ 配置为空时回退默认 model
- ✅ getConfig 异常时回退默认 model

### getAvailableModels (1 test)

- ✅ 返回支持的模型列表

### checkConfig (4 tests)

- ✅ 已配置时返回 configured: true
- ✅ 未配置时返回 configured: false
- ✅ apiKey 为空时返回 configured: false
- ✅ 无论配置状态都包含 models 列表

---

## 5. TTS Route 测试 (13 tests)

**文件**: `tests/tts-route.test.js`

测试 TTS 语音合成 HTTP 端点

### GET /api/tts/config (3 tests)

- ✅ API key 可用时返回 mimo 配置信息
- ✅ API key 缺失时返回未配置状态
- ✅ 包含 webspeech 可用性信息

### GET /api/tts/models (2 tests)

- ✅ 返回 mimo 模型列表
- ✅ 包含 webspeech 说明

### POST /api/tts/synthesize (8 tests)

- ✅ 缺少 text 时拒绝请求
- ✅ 空文本时拒绝请求
- ✅ 超 5000 字符文本时拒绝请求
- ✅ 不支持的引擎时拒绝请求
- ✅ webspeech 引擎返回客户端提示
- ✅ Mimo 未配置时返回 401
- ✅ 成功合成并返回音频和正确 headers
- ✅ Mimo API 错误时优雅处理

---

## 6. TTS Engine 测试 (33 tests)

**文件**: `tests/speech/tts-engine.test.js`

测试 TTS 引擎的状态机、队列管理、语音选择等功能

- ✅ 初始化为 IDLE 状态
- ✅ 初始化为空队列
- ✅ 接受自定义默认选项
- ✅ 默认语言为 zh-CN
- ✅ speak 发射事件并转换状态
- ✅ speak 返回 Promise，confirmPlayed 时 resolve
- ✅ speak confirmError 时 reject
- ✅ 空字符串/纯空白跳过
- ✅ 队列按序处理
- ✅ stop/pause/resume 语义正确
- ✅ selectVoice 语音选择优先级
- ✅ summarizeVoices 统计
- ✅ destroy 清理资源

---

## 7. STT Engine 测试 (22 tests)

**文件**: `tests/speech/stt-engine.test.js`

测试 STT 引擎的状态机、监听、超时、静音检测等功能

- ✅ 初始化为 IDLE 状态
- ✅ startListening 事件和状态转换
- ✅ 结果累积和 continuous 模式
- ✅ stopListening / cancel 语义
- ✅ onError 错误处理
- ✅ 超时自动停止
- ✅ 静音超时自动停止
- ✅ statechange 事件
- ✅ destroy 清理资源

---

## 运行测试

### 运行所有语音相关测试

```bash
npx vitest run tests/speech/ tests/tts-route.test.js tests/voice-route.test.js tests/tools/voice-input-tool.test.js
```

### 运行特定测试文件

```bash
# MiMo TTS 测试
npx vitest run tests/speech/mimo-tts.test.js

# TTS Route 测试
npx vitest run tests/tts-route.test.js

# 语音流水线测试
npx vitest run tests/speech/voice-pipeline.test.js

# 语音输入工具测试
npx vitest run tests/tools/voice-input-tool.test.js

# STT 引擎测试
npx vitest run tests/speech/stt-engine.test.js

# TTS 引擎测试
npx vitest run tests/speech/tts-engine.test.js

# 语音路由测试
npx vitest run tests/voice-route.test.js
```

---

## 测试覆盖率

| 模块 | 测试数 | 状态 |
|------|--------|------|
| MiMo TTS | 23 | ✅ 全部通过 |
| STT Engine | 22 | ✅ 全部通过 |
| TTS Engine | 33 | ✅ 全部通过 |
| Voice Pipeline | 18 | ✅ 全部通过 |
| Voice Input Tool | 10 | ✅ 全部通过 |
| Voice Route | 14 | ✅ 全部通过 |
| TTS Route | 13 | ✅ 全部通过 |
| **总计** | **133** | **✅ 100%** |

---

## 测试环境

- **测试框架**: Vitest v4.1.7
- **Node.js**: >= 20
- **操作系统**: Windows 11

---

## 代码修复记录 (2026-05-28)

1. **STT 超时竞态修复**: `_handleTimeout()` 和 `_resetSilenceTimer()` 中移除了 `stopListening()` 的双重 `_cleanup()` 调用，改为 `emit("stop")` + `_finishSession()`
2. **Pipeline cancel 标志修复**: 移除了 `setTimeout` 异步重置 `_cancelled` 的不安全机制，改为在 `start()` 的 catch 块中同步重置
3. **TTS Route 错误提示修复**: 更新了错误检测关键字和提示信息，从 `.env` 改为 Provider 系统指引
4. **新增 MiMo TTS 测试**: 23 个测试覆盖配置获取、API 调用、错误处理、模型回退等
5. **新增 TTS Route 测试**: 13 个测试覆盖 config/models/synthesize 端点

---

## 注意事项

1. **音频格式测试**: 测试覆盖了 WebM、OGG、WAV 格式，MP4 格式在允许列表中但未在测试中覆盖（因为 Hono 测试环境限制）
2. **Whisper API Mock**: 使用 vi.stubGlobal 模拟 fetch，确保测试不依赖外部服务
3. **临时文件清理**: 每个测试用例使用独立的临时目录，测试后自动清理

---

最后更新: 2026-05-28
