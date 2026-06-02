# 语音交互优化方案

> **日期**: 2026年6月2日
> **状态**: 规划中
> **优先级**: P0 — 核心体验瓶颈

---

## 现状诊断

### 核心问题

项目存在 **两套并行语音管线未统一** 的架构问题：

| 管线 | 位置 | 状态 | 实际使用 |
|------|------|------|----------|
| **主进程管线** | `lib/speech/` + `desktop/voice-conversation-manager.cjs` | 架构完善，IPC 通道断裂（`voice:audioBlob` 为 TODO） | ❌ 闲置 |
| **渲染进程管线** | `desktop/src/react/hooks/useVoiceConversation.ts` | Web Speech API 临时方案 | ✅ 实际使用 |

### 端到端延迟分析

当前管线是 **全量串行**：

```
用户说完 → 整段音频 → STT全量识别(~2-5s) → Agent全量生成(~1-5s) → TTS全量合成(~1-3s) → 播放
```

**总延迟：3-13 秒**，远超自然对话可接受范围（<2s）。

### 关键短板清单

| # | 短板 | 影响 | 优先级 |
|---|------|------|--------|
| 1 | 双管线未统一 | Whisper + VAD 优势无法发挥 | P0 |
| 2 | 无流式处理 | 端到端延迟 3-13s | P0 |
| 3 | 无 Barge-in 打断 | AI 说话时用户无法语音打断 | P1 |
| 4 | VAD 精度差（RMS 能量检测） | 噪声环境误判率高 | P1 |
| 5 | IPC 音频通道断裂 | WhisperSTTAdapter 实质无法使用 | P0 |
| 6 | 无回声消除 | 扬声器模式 AI 声音被识别为用户输入 | P2 |
| 7 | TTS 试听与引擎不一致 | 设置页试听始终用 WebSpeech | P2 |
| 8 | 无 VAD 参数 UI | 关键参数无法调节 | P2 |
| 9 | 无自动语言检测 | STT 需手动选语言 | P3 |
| 10 | 无话轮管理 | 对话节奏不自然 | P3 |

---

## Phase 1：统一管线 + 基础体验（P0）

> 目标：消除双管线混乱，让 Whisper + VAD 真正工作起来

### 1.1 打通 IPC 音频通道

**现状**：`desktop/voice-conversation-manager.cjs` 中 `voice:audioBlob` 处理器标记为 TODO

**改造方案**：

```
渲染进程 (audio-recorder.ts)
  → MediaRecorder 产出 webm/opus Blob
  → Blob → ArrayBuffer (IPC 可传输)
  → ipcRenderer.send('voice:audioBlob', arrayBuffer, mimeType)

主进程 (voice-conversation-manager.cjs)
  → ipcMain.on('voice:audioBlob', ...)
  → ArrayBuffer → Blob
  → WhisperSTTAdapter.transcribe(blob)
  → 结果通过 IPC 回传渲染进程
```

**涉及文件**：
- `desktop/voice-conversation-manager.cjs` — 实现 TODO 处理器
- `desktop/src/react/hooks/useVoiceConversation.ts` — 发送端改造
- `desktop/src/react/utils/audio-recorder.ts` — 添加 Blob → ArrayBuffer 转换

**验收标准**：
- 渲染进程录音 → 主进程 Whisper 识别 → 结果回传渲染进程，延迟 <5s
- 支持 webm/ogg/wav 格式自动识别

### 1.2 统一到主进程管线

**现状**：渲染进程使用 `webkitSpeechRecognition` + `SpeechSynthesisUtterance`

**改造方案**：
1. 渲染进程仅保留 UI 层（录音控制、状态展示、音频播放）
2. STT/TTS/Agent 处理全部走主进程 IPC
3. Web Speech API 降级为 offline fallback（Whisper 不可用时自动切换）

**涉及文件**：
- `desktop/src/react/hooks/useVoiceConversation.ts` — 重构为 IPC 调用
- `lib/speech/voice-conversation-loop.js` — 作为主进程核心编排器
- `desktop/voice-conversation-manager.cjs` — IPC 桥接层完善

**验收标准**：
- 语音对话使用 Whisper STT（非 Web Speech API）
- Whisper 不可用时自动降级到 Web Speech API
- 状态机 IDLE→LISTENING→PROCESSING→SPEAKING→IDLE 完整运行

### 1.3 Whisper 自动语言检测

**现状**：用户需在 VoiceTab 手动选择识别语言（zh-CN/en-US/ja-JP/ko-KR）

**改造方案**：
- Whisper API 请求时 `language` 字段传 `null` 或不传，启用自动检测
- 返回结果中包含 `detected_language` 字段，展示给用户

**涉及文件**：
- `lib/speech/whisper-stt-adapter.js` — transcribe() 方法 language 参数默认值改为 null
- `desktop/src/react/settings/tabs/VoiceTab.tsx` — 语言选择添加"自动检测"选项
- `desktop/src/react/hooks/useVoiceConversation.ts` — 展示检测到的语言

**验收标准**：
- 默认启用自动语言检测
- 中英文混合内容识别质量不下降

### 1.4 TTS 试听与引擎一致

**现状**：VoiceTab 试听按钮始终使用 Web Speech API，即使选择了 MiMo 引擎

**改造方案**：
- `testTTS()` 方法根据当前选择的引擎决定调用路径
- MiMo 引擎 → 调用 `/api/tts/synthesize` 接口
- WebSpeech 引擎 → 使用 `speechSynthesis`

**涉及文件**：
- `desktop/src/react/settings/tabs/VoiceTab.tsx` — 修改 `testTTS()` 逻辑

**验收标准**：
- 选择 MiMo 引擎时试听播放 MiMo 合成的音频
- 选择 WebSpeech 时试听使用浏览器语音

---

## Phase 2：流式处理（P0）

> 目标：端到端延迟从 3-13s 降低到 ~3.5s（首句响应）

### 2.1 分句 TTS

**现状**：Agent 全部输出完毕后才开始 TTS 合成播放

**改造方案**：

```
Agent 流式输出 text_delta
  → 分句检测（。！？.!?\n）
  → 每完成一句：
      1. 将该句加入 TTS 队列
      2. TTS 引擎合成该句音频
      3. AudioContext 播放该句
  → 多句音频队列无缝拼接播放
```

**涉及文件**：
- `desktop/src/react/hooks/useVoiceConversation.ts` — Agent 流式文本分句
- `lib/speech/tts-engine.js` — 添加分句队列管理
- 新建 `lib/speech/sentence-splitter.js` — 多语言分句工具

**验收标准**：
- Agent 输出第一句后 <1s 即开始播放语音
- 多句之间无缝拼接，无明显停顿
- 长回复（10+ 句）播放流畅

### 2.2 流式 TTS

**现状**：MiMo TTS API 一次性返回完整音频

**改造方案**：
- MiMo API 请求添加 `stream: true` 参数（如支持）
- 响应以 chunked audio 形式返回
- 前端使用 `AudioContext.decodeAudioData()` 逐 chunk 解码播放
- 不支持流式的引擎保持全量模式

**涉及文件**：
- `lib/speech/mimo-tts.js` — 支持 streaming 响应
- `desktop/src/react/hooks/useVoiceConversation.ts` — 流式音频播放

**验收标准**：
- 首句 TTS 延迟 <500ms
- 流式播放无杂音/断裂

### 2.3 TTS 音频队列

**现状**：单段播放，无队列管理

**改造方案**：
- `AudioContext` + `AudioBufferSourceNode` 队列
- 预缓冲：提前合成下一句，当前句播放完毕立即衔接
- 暂停/恢复：暂停时保持队列，恢复时继续播放

**涉及文件**：
- 新建 `desktop/src/react/utils/audio-playback-queue.ts` — 音频播放队列管理

**验收标准**：
- 句间间隔 <100ms
- 暂停/恢复无音频丢失

### 2.4 延迟指标 UI

**现状**：后端 `VoiceMetricsCollector` 已有数据，前端不展示

**改造方案**：
- VoiceTab 添加"性能监控"折叠面板
- 展示 STT/TTS 延迟 p50/p95、错误计数
- 通过 IPC 获取 `voiceMetrics.getStats()`

**涉及文件**：
- `desktop/src/react/settings/tabs/VoiceTab.tsx` — 添加监控面板
- `desktop/voice-conversation-manager.cjs` — 暴露 getStats IPC

**验收标准**：
- VoiceTab 展示实时延迟数据
- 数据每 5 秒刷新

---

## Phase 3：自然对话能力（P1）

> 目标：接近真人对话体验，支持打断、自适应环境

### 3.1 Silero VAD

**现状**：RMS 能量检测，对噪声敏感

**改造方案**：
- 集成 `@ricky0123/vad`（已在 `pnpm-lock.yaml` 中但未使用）
- Silero ONNX 模型运行在 AudioWorklet 中
- 替换当前 RMS 能量计算逻辑
- 保留 RMS 作为 fallback（Silero 加载失败时降级）

**涉及文件**：
- `desktop/src/react/utils/vad-worklet.ts` — 集成 Silero VAD
- `lib/speech/vad-service.js` — 接受 Silero 置信度替代 RMS
- `desktop/src/react/hooks/useVoiceVAD.ts` — 桥接层适配

**验收标准**：
- 嘈杂环境（办公室/街道）VAD 误判率 <5%
- 模型加载时间 <2s
- CPU 占用 <5%

### 3.2 Barge-in 打断

**现状**：AI 说话时用户只能手动点击停止按钮

**改造方案**：

```
TTS 播放期间：
  → VAD 持续监听麦克风
  → 检测到连续 N 帧（~300ms）语音
  → 判定为用户打断
  → 停止 TTS 播放
  → 切换到 LISTENING 状态
  → 开始新的识别周期
```

**涉及文件**：
- 新建 `lib/speech/barge-in-detector.js` — 打断检测器
- `lib/speech/voice-conversation-loop.js` — SPEAKING 状态添加 VAD 监听
- `desktop/voice-conversation-manager.cjs` — IPC 事件转发

**验收标准**：
- AI 说话时用户说"停"/"等一下"能立即打断
- 打断延迟 <500ms
- 误打断率 <10%（非用户说话不触发）

### 3.3 回声消除

**现状**：仅依赖浏览器 `echoCancellation: true`，质量参差不齐

**改造方案**：
- Phase A：优化浏览器 AEC 配置（`echoCancellation: true` + `noiseSuppression: true` + `autoGainControl: true`）
- Phase B：TTS 播放期间降低 VAD 灵敏度（软件回声消除）
- Phase C（长期）：集成 WebRTC AEC 模块或 Speex AEC

**涉及文件**：
- `desktop/src/react/utils/audio-recorder.ts` — 优化 AEC 配置
- `lib/speech/vad-service.js` — 播放期间动态调整阈值
- `desktop/src/react/settings/tabs/VoiceTab.tsx` — AEC 开关

**验收标准**：
- 扬声器模式下 AI 回复不触发 VAD
- 耳机模式下无影响

### 3.4 自适应 VAD 阈值

**现状**：`silenceThreshold` 硬编码 0.01

**改造方案**：
- 启动时采样 2 秒环境噪声，计算噪声基线
- 阈值 = 噪声基线 × 3（可调）
- 运行时每 30 秒重新校准

**涉及文件**：
- `lib/speech/vad-service.js` — 添加自适应校准逻辑

**验收标准**：
- 安静环境阈值自动降低，嘈杂环境自动升高
- 切换环境后 30 秒内适应

### 3.5 VAD 参数 UI

**现状**：关键参数无法在设置中调整

**改造方案**：
- VoiceTab 添加"高级设置"折叠面板
- 可调参数：静音阈值、语音最短时长、静音判定时长、AEC 开关

**涉及文件**：
- `desktop/src/react/settings/tabs/VoiceTab.tsx` — 高级设置面板

**验收标准**：
- 参数修改实时生效
- 提供"恢复默认"按钮

---

## Phase 4：高级体验（P2-P3）

### 4.1 话轮管理 TurnTakingManager

**目标**：智能判断用户是否说完，处理"嗯"、"那个"等填充词

**方案**：
- 填充词过滤：维护填充词列表，VAD 检测到短语音时先过滤
- 语义完整度检测：利用 LLM 判断用户意图是否完整
- 停顿时长动态调整：根据对话节奏自动缩短/延长等待时间

### 4.2 实时字幕

**目标**：STT 中间结果实时显示，不等 final result

**方案**：
- Whisper API streaming 模式（如支持）或 `webkitSpeechRecognition` 的 `interimResults`
- UI 层添加实时字幕浮动区域
- 中间结果用灰色文字，最终结果用白色

### 4.3 多音色选择 UI

**目标**：列出系统可用的 TTS voices，让用户选择音色

**方案**：
- MiMo TTS：列出可用模型和音色
- Web Speech API：`speechSynthesis.getVoices()` 获取音色列表
- VoiceTab 添加音色选择下拉框 + 预览按钮

### 4.4 降噪/回声消除设置

**目标**：前端提供 `echoCancellation` / `noiseSuppression` 开关

**方案**：
- VoiceTab 高级设置中添加开关
- 开关状态通过 IPC 传递给 audio-recorder.ts

### 4.5 语音唤醒词

**目标**："Hey Jarvis" 热词检测，免按钮启动

**方案**：
- 集成 Porcupine / Snowboy 等轻量唤醒词引擎
- 后台持续监听麦克风（低功耗模式）
- 检测到唤醒词后激活完整语音管线
- 支持自定义唤醒词

---

## 技术选型参考

| 模块 | 推荐方案 | 备选方案 |
|------|----------|----------|
| VAD | Silero VAD ONNX (`@ricky0123/vad`) | Web RTC VAD |
| 分句 | 正则 + 语义分句 | LLM 分句 |
| 音频队列 | AudioContext + AudioBufferSourceNode | Web Audio API + MediaStream |
| 回声消除 | 浏览器 AEC + 软件补偿 | Speex AEC / WebRTC AEC |
| 唤醒词 | Porcupine | Snowboy / 自训练模型 |
| 语言检测 | Whisper auto-detect | fasttext lid |

---

## 预期收益

| Phase | 改造后延迟 | 体验提升 |
|-------|-----------|----------|
| Phase 1 | 3-8s（管线统一） | Whisper 识别精度提升 |
| Phase 2 | ~3.5s（首句） | 接近实时对话 |
| Phase 3 | ~2s（打断+VAD优化） | 自然对话体验 |
| Phase 4 | ~1.5s（唤醒+全双工） | 免提交互 |
