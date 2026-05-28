# OpenJarvis 语音对话系统演进方案

> **状态**: 规划中  
> **最后更新**: 2026-05-28  
> **目标**: 从当前的"按住说话"模式演进为"像人一样自然对话"的实时语音交互

---

## 1. 现状分析

### 1.1 当前架构

```
[按住麦克风] → 录音/Web Speech识别 → [松开] → 文字送入Agent → Agent回复文字 → TTS播放
```

**核心文件：**

| 文件 | 职责 |
|------|------|
| `desktop/src/react/components/input/VoiceButton.tsx` | Push-to-Talk 语音按钮 |
| `desktop/src/react/utils/speech-to-text.ts` | STT 前端适配（Web Speech / Whisper） |
| `desktop/src/react/utils/audio-recorder.ts` | MediaRecorder 录音封装 |
| `desktop/src/react/settings/tabs/VoiceTab.tsx` | 语音设置页 |
| `lib/speech/stt-engine.js` | STT 状态机（服务端） |
| `lib/speech/tts-engine.js` | TTS 队列管理（服务端） |
| `lib/speech/voice-pipeline.js` | STT → Agent → TTS 全链路编排 |
| `lib/speech/mimo-tts.js` | MiMo TTS API 封装 |
| `server/routes/voice.js` | Whisper STT HTTP 端点 |
| `server/routes/tts.js` | TTS 合成 HTTP 端点 |

### 1.2 当前能力

- Push-to-Talk：按住说话，松开识别
- 双 STT 后端：Web Speech API（浏览器原生） / Whisper API（服务器端）
- 双 TTS 后端：Web Speech Synthesis（浏览器内置） / MiMo TTS（服务器端）
- VoicePipeline 编排完整链路：STT → Agent → TTS

### 1.3 与"自然语音对话"的差距

| 能力 | 当前状态 | 自然对话需要的 |
|------|---------|-------------|
| 触发方式 | 手动按住按钮 | VAD 自动检测说话开始/结束 |
| 语音识别 | 松开后整体识别 | 边说边识别（流式） |
| TTS 播放 | 全部合成完才播放 | 边生成边播放（流式） |
| 打断机制 | 无 | AI 说话时用户可随时打断 |
| 对话循环 | 单次触发单次对话 | 持续循环，无需重新触发 |
| 回声消除 | 基本配置 | 强 AEC 避免自我识别 |
| 通信方向 | 半双工 | 全双工（同时听和说） |
| 延迟 | 3-8秒（整段处理） | <1.5秒（流式首字） |

---

## 2. 目标架构

```
┌──────────────────────────────────────────────────────────┐
│                  Voice Conversation Loop                   │
│                                                          │
│   ┌─────────┐    ┌──────────┐    ┌──────────┐           │
│   │  VAD    │───>│ 流式 STT  │───>│  Agent   │           │
│   │(新增)   │    │ (增强)    │    │ (流式)   │           │
│   └─────────┘    └──────────┘    └──────────┘           │
│        ↑                              │                  │
│        │                         ┌────┴────┐            │
│   打断检测                         │ 流式 TTS │            │
│   (新增)                          │ (增强)  │            │
│        ↑                          └────┬────┘            │
│        │                               │                  │
│        └──────── 音频播放 ◄────────────┘                  │
│                                                          │
│   新增模块:                                               │
│   1. VoiceConversationLoop — 对话循环管理器               │
│   2. VADService — 语音活动检测                            │
│   3. BargeInDetector — 打断检测                           │
│   4. StreamingAudioPlayer — 流式音频播放                  │
│   5. TurnTakingManager — 话轮管理                         │
└──────────────────────────────────────────────────────────┘
```

---

## 3. 分阶段演进计划

### 阶段 1：免手操作连续对话

**目标**: 去掉"按住说话"，实现点击一次进入连续对话模式，VAD 自动检测说话/停止。

**预计工期**: 2-3 周

#### 3.1.1 新增文件

| 文件 | 职责 |
|------|------|
| `lib/speech/vad-service.js` | VAD 语音活动检测服务 |
| `lib/speech/voice-conversation-loop.js` | 连续对话循环管理器 |
| `desktop/src/react/utils/vad-worklet.js` | Web Audio VAD AudioWorklet（前端） |
| `desktop/src/react/components/input/VoiceChatButton.tsx` | 对话模式按钮（替代 VoiceButton） |
| `desktop/src/react/components/VoiceChatOverlay.tsx` | 语音对话浮层 UI |
| `tests/speech/vad-service.test.js` | VAD 测试 |
| `tests/speech/voice-conversation-loop.test.js` | 对话循环测试 |

#### 3.1.2 VADService 设计

```javascript
// lib/speech/vad-service.js
//
// 基于 Web Audio API 的能量检测 VAD（阶段1）
// 后续可替换为 Silero VAD / ONNX 模型

export const VAD_STATE = Object.freeze({
  SILENCE: 'silence',    // 静音中
  SPEECH: 'speech',      // 检测到语音
  UNKNOWN: 'unknown',    // 初始化/未启动
});

export class VADService extends EventEmitter {
  /**
   * @param {object} opts
   * @param {number} opts.silenceThreshold - 静音能量阈值 (0-1, 默认 0.01)
   * @param {number} opts.silenceDurationMs - 持续静音判定时间 (默认 1500ms)
   * @param {number} opts.speechDurationMs - 持续语音判定时间 (默认 300ms)
   * @param {number} opts.sampleRate - 采样率 (默认 16000)
   */

  // 公共 API:
  // start() — 开始 VAD 监听
  // stop() — 停止 VAD 监听
  // getState() — 获取当前状态
  // onAudioData(Float32Array) — 前端通过 IPC 送入音频数据
  //
  // 事件:
  // 'speechstart' — 检测到语音开始
  // 'speechend' — 检测到语音结束
  // 'silence' — 检测到持续静音
  // 'statechange' — 状态变化
}
```

**VAD 方案选型：**

| 方案 | 优点 | 缺点 | 阶段 |
|------|------|------|------|
| 能量检测 (RMS) | 简单、零依赖、延迟低 | 噪音环境误判 | 阶段1 |
| Silero VAD (ONNX) | 高精度、低延迟 | 需要 ONNX Runtime (~2MB) | 阶段2 |
| Web Speech API 间接 | 已有实现 | 不可控 | 备选 |

#### 3.1.3 VoiceConversationLoop 设计

```javascript
// lib/speech/voice-conversation-loop.js
//
// 替代 VoicePipeline 的连续对话循环
// 核心差异：持续运行，不需要外部触发

export const LOOP_STATE = Object.freeze({
  IDLE: 'idle',           // 空闲，等待用户说话
  LISTENING: 'listening', // VAD 检测到语音，正在识别
  PROCESSING: 'processing', // Agent 处理中
  SPEAKING: 'speaking',   // TTS 播放中
  PAUSED: 'paused',       // 用户暂停对话
});

export class VoiceConversationLoop extends EventEmitter {
  /**
   * @param {object} deps
   * @param {import('./vad-service.js').VADService} deps.vadService
   * @param {import('./stt-engine.js').STTEngine} deps.sttEngine
   * @param {import('./tts-engine.js').TTSEngine} deps.ttsEngine
   * @param {(userText: string) => Promise<string>} deps.onUserText
   * @param {object} opts
   * @param {boolean} opts.continuous - 是否持续对话 (默认 true)
   * @param {boolean} opts.autoSpeak - 是否自动播放回复 (默认 true)
   */

  // 公共 API:
  // start() — 启动对话循环
  // stop() — 停止对话循环
  // pause() — 暂停（停止监听但不结束会话）
  // resume() — 恢复监听
  // getState()
  //
  // 事件:
  // 'speechstart' — 用户开始说话
  // 'recognized' — 识别到用户文本
  // 'speaking' — AI 开始播放
  // 'complete' — 一轮对话完成
  // 'error' — 错误
  // 'statechange' — 状态变化
}
```

**对话循环状态机：**

```
         start()
           │
           ▼
        ┌──────┐   VAD: speechstart   ┌───────────┐
        │ IDLE │ ──────────────────>  │ LISTENING  │
        └──────┘                      └───────────┘
           ▲                              │
           │                    VAD: speechend + STT完成
           │                              │
           │                              ▼
           │                       ┌───────────┐
           │                       │ PROCESSING │
           │                       └───────────┘
           │                              │
           │                        Agent 回复完成
           │                              │
           │                              ▼
           │                        ┌───────────┐
           │                        │ SPEAKING  │
           │                        └───────────┘
           │                              │
           └────── TTS 播放完成 ◄─────────┘
```

#### 3.1.4 前端 UI 变更

**VoiceChatButton** — 替代现有 VoiceButton：

```
┌─────────────────────────────────────────────┐
│  对话模式:                                   │
│                                              │
│  [🎤 开始对话]  →  点击后变为:               │
│                                              │
│  [⏹ 停止对话]  🔴 00:32 正在听你说话...      │
│                                              │
│  状态显示:                                    │
│  · 正在听... (蓝色脉冲动画)                   │
│  · 正在想... (思考动画)                       │
│  · 正在说... (波形动画)                       │
└─────────────────────────────────────────────┘
```

**VoiceChatOverlay** — 可选的全屏语音对话界面：

```
┌──────────────────────────────────┐
│                                  │
│         🤖 Jarvis                │
│                                  │
│    ┌────────────────────┐        │
│    │  "你好，今天..."    │        │
│    │  (AI 回复字幕)      │        │
│    └────────────────────┘        │
│                                  │
│    ═══════════════════           │
│    (用户说话波形)                │
│                                  │
│         [⏹ 停止]                │
│                                  │
└──────────────────────────────────┘
```

#### 3.1.5 IPC 通信协议扩展

阶段 1 需要在 preload/main 之间新增以下 IPC 通道：

| 通道 | 方向 | 用途 |
|------|------|------|
| `voice:startConversation` | Renderer → Main | 启动对话循环 |
| `voice:stopConversation` | Renderer → Main | 停止对话循环 |
| `voice:pauseConversation` | Renderer → Main | 暂停对话 |
| `voice:resumeConversation` | Renderer → Main | 恢复对话 |
| `voice:audioChunk` | Renderer → Main | 前端送入音频数据（用于 VAD） |
| `voice:stateChange` | Main → Renderer | 对话状态变化通知 |
| `voice:userText` | Main → Renderer | 识别到的用户文本 |
| `voice:aiText` | Main → Renderer | AI 回复文本（用于字幕） |
| `voice:audioData` | Main → Renderer | TTS 音频数据（用于播放） |

---

### 阶段 2：低延迟流式对话

**目标**: 将延迟从 3-8 秒降低到 <1.5 秒，实现边说边识别、边生成边播放。

**预计工期**: 3-4 周

#### 3.2.1 流式 STT

**方案**: 使用 OpenAI Whisper Streaming API (WebSocket) 或本地 Whisper.cpp 流式模式

```javascript
// lib/speech/streaming-stt-engine.js
//
// 流式语音识别引擎
// 通过 WebSocket 连接实现边说边识别

export class StreamingSTTEngine extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.provider - 'openai-ws' | 'whisper-cpp' | 'deepgram'
   * @param {string} opts.lang - 语言
   * @param {string} opts.apiKey - API 密钥
   */

  // 公共 API:
  // start() — 建立 WebSocket 连接
  // sendAudio(Int16Array) — 发送音频片段（实时流）
  // endAudio() — 通知音频结束
  // stop() — 关闭连接
  //
  // 事件:
  // 'partial' — 中间识别结果（可用于实时字幕）
  // 'final' — 最终识别结果
  // 'error' — 错误
}
```

**流式 STT Provider 选型：**

| Provider | 延迟 | 成本 | 精度 | 离线 |
|----------|------|------|------|------|
| OpenAI Audio WebSocket | ~300ms | 按 token 计费 | 高 | 否 |
| Deepgram | ~250ms | 按分钟计费 | 高 | 否 |
| Whisper.cpp (本地) | ~100ms | 免费 | 高 | 是 |
| Azure Speech | ~200ms | 按分钟计费 | 高 | 否 |

**推荐**: 优先实现 OpenAI WebSocket（已有 API Key），备选 Whisper.cpp 本地部署。

#### 3.2.2 流式 TTS

**方案**: 使用 MiMo 流式接口 或 Edge TTS / 浏览器 SpeechSynthesis 分句播放

```javascript
// lib/speech/streaming-tts-engine.js
//
// 流式 TTS 引擎
// 策略1: 分句播放 — Agent 流式输出时按句子切分，立即合成播放
// 策略2: 真流式 — 使用支持流式的 TTS API 逐 chunk 播放

export class StreamingTTSEngine extends EventEmitter {
  // 公共 API:
  // startStream(text, opts) — 开始流式合成
  // appendText(partialText) — 追加 Agent 输出（流式生成时调用）
  // endStream() — 标记文本结束
  // stop() — 停止播放
  //
  // 事件:
  // 'audioChunk' — 一个可播放的音频片段
  // 'complete' — 所有音频播放完毕
  // 'error' — 错误
}
```

**流式 TTS 分句策略：**

```
Agent 流式输出: "你好！" + "今天天气" + "不错，" + "我们可以去" + "公园散步。"
                                    │
                          分句器检测到句子边界
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
               "你好！今天天气不错，"  "我们可以去公园散步。"
                    │               │
               立即送 TTS 合成    立即送 TTS 合成
                    │               │
               播放 chunk 1     播放 chunk 2
```

**分句规则：**
- 标点符号：`。！？；` 强制断句
- 逗号后累积 > 20 字符也可断句
- 最大 chunk 长度：50 字符

#### 3.2.3 Silero VAD 集成

替换阶段 1 的简单能量检测，使用 Silero VAD ONNX 模型：

```javascript
// lib/speech/silero-vad.js
//
// 基于 Silero VAD 的语音活动检测
// 使用 ONNX Runtime Web 在前端运行

export class SileroVAD {
  /**
   * @param {object} opts
   * @param {number} opts.threshold - 语音检测阈值 (0-1, 默认 0.5)
   * @param {number} opts.sampleRate - 采样率 (默认 16000)
   * @param {number} opts.frameSize - 帧大小 (默认 512, 约 32ms)
   */

  // processFrame(Float32Array) → { speech: boolean, confidence: number }
  // 每帧调用一次，返回是否检测到语音及置信度
}
```

**集成方式：**
- 使用 `@ricky0123/vad` npm 包（封装了 Silero VAD + ONNX Runtime）
- 在前端 AudioWorklet 中运行，不阻塞主线程
- 输入：麦克风 PCM 数据
- 输出：speech start / speech end 事件

---

### 阶段 3：全双工自然对话

**目标**: 实现真正的全双工对话——AI 说话时用户可以随时打断，对话节奏自然。

**预计工期**: 4-6 周

#### 3.3.1 Barge-in 打断机制

```
┌──────────────────────────────────────────────┐
│              Barge-in 检测流程                │
│                                              │
│   TTS 播放中 ──> 持续 VAD 监听               │
│       │                                      │
│       ├── VAD 检测到用户说话                  │
│       │       │                              │
│       │       ├── 置信度 > 阈值 (0.7)        │
│       │       │       │                      │
│       │       │       ├── 停止 TTS 播放      │
│       │       │       ├── 截断 Agent 回复    │
│       │       │       └── 切换到 LISTENING   │
│       │       │                              │
│       │       └── 置信度 < 阈值              │
│       │               └── 忽略，继续播放     │
│       │                                      │
│       └── TTS 自然播放完成                    │
│               └── 回到 IDLE                  │
└──────────────────────────────────────────────┘
```

**关键实现：**

```javascript
// lib/speech/barge-in-detector.js
//
// 打断检测器
// 在 TTS 播放期间监听麦克风输入

export class BargeInDetector extends EventEmitter {
  /**
   * @param {object} deps
   * @param {import('./vad-service.js').VADService} deps.vadService
   * @param {import('./tts-engine.js').TTSEngine} deps.ttsEngine
   * @param {object} opts
   * @param {number} opts.speechFrames - 连续语音帧数阈值 (默认 5, 约 160ms)
   * @param {number} opts.confidenceThreshold - 置信度阈值 (默认 0.7)
   */

  // enable() — 启用打断检测（TTS 播放时调用）
  // disable() — 禁用打断检测
  //
  // 事件:
  // 'bargein' — 检测到用户打断
}
```

#### 3.3.2 Turn-Taking 话轮管理

```javascript
// lib/speech/turn-taking-manager.js
//
// 话轮管理器
// 管理对话中的"谁在说话"和"何时该切换"

export class TurnTakingManager extends EventEmitter {
  /**
   * @param {object} opts
   * @param {number} opts.endOfTurnSilenceMs - 用户说完后的静音判定 (默认 800ms)
   * @param {number} opts.minResponseDelayMs - AI 回复最小延迟 (默认 200ms)
   * @param {number} opts.maxResponseDelayMs - AI 回复最大延迟 (默认 1500ms)
   * @param {boolean} opts.enableFillerResponses - 是否启用填充词 (如"嗯"、"让我想想")
   */

  // 事件:
  // 'userturnstart' — 用户开始说话
  // 'userturnend' — 用户说完（静音判定后）
  // 'aiturnstart' — AI 开始回复
  // 'aiturnend' — AI 回复结束
  // 'shouldrespond' — 建议开始处理回复
  // 'shouldlisten' — 建议开始监听
}
```

**话轮管理状态机：**

```
                ┌──────────────┐
                │  USER_TURN   │ ← VAD: speechstart
                │  (用户说话)  │
                └──────┬───────┘
                       │ VAD: silenceDuration 达标
                       ▼
                ┌──────────────┐
                │  TRANSITION  │ ← 延迟 200-500ms
                │  (话轮切换)  │
                └──────┬───────┘
                       │
              ┌────────┴────────┐
              ▼                  ▼
       ┌──────────────┐  ┌──────────────┐
       │   AI_TURN    │  │  FILLER      │
       │  (AI 回复)   │  │  (填充词)    │
       └──────┬───────┘  └──────────────┘
              │ TTS 完成
              ▼
       ┌──────────────┐
       │  LISTENING   │ ← 等待用户说话
       │  (等待用户)  │
       └──────────────┘
              │
              │ VAD: speechstart
              └──────► 回到 USER_TURN
```

#### 3.3.3 回声消除增强

在 AI 播放语音期间，麦克风可能会拾取扬声器的声音导致误识别。需要增强回声消除：

**方案 1 — 浏览器内置 AEC（当前已启用）：**
```javascript
// audio-recorder.ts 已配置
audio: {
  echoCancellation: true,  // 已有
  noiseSuppression: true,  // 已有
}
```

**方案 2 — 软件级 AEC（阶段 3 新增）：**
```javascript
// lib/speech/echo-canceller.js
//
// 软件回声消除
// 对比 TTS 输出音频与麦克风输入，消除回声

export class EchoCanceller {
  // setReferenceAudio(Float32Array) — 设置 TTS 输出作为参考信号
  // process(Float32Array) → Float32Array — 消除回声后的音频
}
```

**方案 3 — 硬件回声消除（推荐给用户）：**
- 使用带硬件 AEC 的耳机/外置声卡
- 在设置中建议用户使用耳机

#### 3.3.4 可选：接入实时语音 API

对于追求极致体验的用户，可接入 OpenAI Realtime API：

```javascript
// lib/speech/realtime-voice-api.js
//
// OpenAI Realtime API 集成
// 提供端到端的实时语音对话能力

export class RealtimeVoiceAPI extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.model - 'gpt-4o-realtime-preview'
   * @param {string} opts.voice - 'alloy' | 'echo' | 'shimmer'
   * @param {string} opts.lang - 语言
   */

  // connect() — 建立 WebSocket 连接
  // sendAudio(Int16Array) — 发送音频
  // sendText(string) — 发送文本
  // disconnect() — 断开连接
  //
  // 事件:
  // 'audiodelta' — AI 语音片段
  // 'textdelta' — AI 文本片段
  // 'speechstarted' — AI 开始说话
  // 'speechstopped' — AI 停止说话
  // 'inputspeechstarted' — 用户开始说话 (服务端 VAD)
  // 'inputspeechstopped' — 用户停止说话
}
```

**接入条件：**
- 需要 OpenAI API Key 且开通 Realtime API 权限
- 需要稳定的低延迟网络环境
- 可作为"高质量模式"的选项

---

## 4. 技术依赖

### 4.1 新增 npm 依赖

| 阶段 | 依赖 | 用途 | 体积 |
|------|------|------|------|
| 阶段 1 | 无新增 | 使用内置 Web Audio API | 0 |
| 阶段 2 | `@ricky0123/vad` | Silero VAD 封装 | ~2MB |
| 阶段 2 | `onnxruntime-web` | ONNX 推理引擎 | ~3MB |
| 阶段 3 | `web-audio-beat-detector` (可选) | 音频节奏检测 | ~50KB |

### 4.2 外部服务依赖

| 阶段 | 服务 | 用途 | 是否必须 |
|------|------|------|---------|
| 阶段 1 | 现有 Whisper + MiMo | 无变化 | 是 |
| 阶段 2 | OpenAI Audio WebSocket | 流式 STT | 推荐 |
| 阶段 2 | Whisper.cpp 本地部署 | 离线流式 STT | 可选 |
| 阶段 3 | OpenAI Realtime API | 全双工实时对话 | 可选 |

---

## 5. 实施优先级建议

```
推荐实施顺序:

阶段 1.1  ──  VADService (能量检测)                    [1周]
    │
阶段 1.2  ──  VoiceConversationLoop                    [1周]
    │
阶段 1.3  ──  VoiceChatButton + UI 更新                [3天]
    │
阶段 1.4  ──  IPC 通道扩展 + 集成测试                  [3天]
    │
    ╰──── 阶段 1 完成里程碑: 可免手操作连续对话 ────╯
         │
阶段 2.1  ──  StreamingSTTEngine                       [1.5周]
    │
阶段 2.2  ──  StreamingTTSEngine (分句播放)            [1周]
    │
阶段 2.3  ──  Silero VAD 替换能量检测                  [3天]
    │
阶段 2.4  ──  延迟优化 + 性能调优                      [3天]
    │
    ╰──── 阶段 2 完成里程碑: 延迟 < 1.5s ──────────╯
         │
阶段 3.1  ──  BargeInDetector                          [1周]
    │
阶段 3.2  ──  TurnTakingManager                        [1周]
    │
阶段 3.3  ──  EchoCanceller                            [1周]
    │
阶段 3.4  ──  RealtimeVoiceAPI (可选)                  [1.5周]
    │
阶段 3.5  ──  全面集成 + 端到端测试                    [1周]
    │
    ╰──── 阶段 3 完成里程碑: 自然语音对话 ──────────╯
```

---

## 6. 风险与注意事项

### 6.1 技术风险

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Web Speech API 浏览器兼容性 | 部分浏览器不支持 | 已有 Whisper 备选方案 |
| Silero VAD 模型加载延迟 | 首次加载需下载 ~2MB | 预加载 + 缓存 |
| 流式 TTS 音质不连贯 | 分句边界可能有停顿 | 交叉淡入淡出 + 预缓存 |
| 回声消除不充分 | AI 声音被识别为用户输入 | 多层 AEC + 建议使用耳机 |
| OpenAI WebSocket 断连 | 对话中断 | 自动重连 + 降级到非流式 |

### 6.2 用户体验注意事项

- **降噪提示**: 首次使用时提示用户在安静环境或使用耳机
- **状态可视化**: 每个阶段都需要清晰的状态指示
- **快捷键**: 阶段 1 应支持键盘快捷键（如 Space）触发对话
- **超时机制**: 长时间无对话自动退出，释放麦克风
- **多语言**: 保持现有 zh-CN / en-US / ja-JP 等多语言支持

### 6.3 性能考量

- VAD 在前端 AudioWorklet 中运行，不阻塞主线程
- 流式 STT 的 WebSocket 消息大小控制在 4KB/帧
- TTS 音频预缓存：提前合成下一句
- 对话历史滑动窗口：只保留最近 N 轮作为上下文

---

## 7. 测试策略

### 7.1 单元测试

每个新增模块都需要完整的单元测试：

| 模块 | 测试重点 |
|------|---------|
| VADService | 状态转换、静音/语音阈值、超时 |
| VoiceConversationLoop | 对话循环状态机、连续对话、错误恢复 |
| StreamingSTTEngine | WebSocket 通信、partial/final 事件 |
| StreamingTTSEngine | 分句逻辑、音频 chunk 播放 |
| BargeInDetector | 打断检测灵敏度、误判率 |
| TurnTakingManager | 话轮切换时机、填充词 |

### 7.2 集成测试

- VAD + STT 联动测试
- 完整对话循环端到端测试
- 打断场景测试
- 网络断连恢复测试

### 7.3 手动验收测试

- [ ] 点击按钮进入对话模式，无需按住
- [ ] 自然说话，AI 自动识别
- [ ] AI 回复后自动继续监听
- [ ] 可随时打断 AI 说话
- [ ] 对话延迟 < 2 秒
- [ ] 戴耳机和用扬声器均可正常工作
- [ ] 连续对话 5 分钟无崩溃
