# 语音模块测试总结

## 测试覆盖范围

### ✅ 所有测试通过 (42/42)

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

## 运行测试

### 运行所有语音相关测试

```bash
npm test -- --run voice
```

### 运行特定测试文件

```bash
# 语音流水线测试
npm test -- --run voice-pipeline

# 语音输入工具测试
npm test -- --run voice-input-tool

# 语音路由测试
npm test -- --run voice-route
```

---

## 测试覆盖率

| 模块 | 测试数 | 状态 |
|------|--------|------|
| Voice Pipeline | 18 | ✅ 全部通过 |
| Voice Input Tool | 10 | ✅ 全部通过 |
| Voice Route | 14 | ✅ 全部通过 |
| **总计** | **42** | **✅ 100%** |

---

## 测试环境

- **测试框架**: Vitest v4.1.7
- **Node.js**: >= 20
- **操作系统**: Windows 11

---

## 注意事项

1. **音频格式测试**: 测试覆盖了 WebM、OGG、WAV 格式，MP4 格式在允许列表中但未在测试中覆盖（因为 Hono 测试环境限制）
2. **Whisper API Mock**: 使用 vi.stubGlobal 模拟 fetch，确保测试不依赖外部服务
3. **临时文件清理**: 每个测试用例使用独立的临时目录，测试后自动清理

---

最后更新: 2026-05-27
