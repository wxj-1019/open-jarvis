# 语音对话配置指南

> **更新日期**: 2026年6月2日
> **状态**: 已集成性能监控和错误追踪

---

## 概述

语音对话系统支持完整的语音交互流程：

```
用户说话 → VAD检测 → STT识别 → Agent处理 → TTS合成 → 播放回复
```

## 架构

```
前端 (Renderer)
  ├─ VoiceChatOverlay (UI 覆盖层)
  ├─ AudioWorklet (VAD 能量检测)
  └─ MediaRecorder (音频录制)
       │
       │ IPC
       ▼
主进程 (Main)
  ├─ VADService (语音活动检测)
  ├─ VoiceConversationLoop (对话状态机)
  │    IDLE → LISTENING → PROCESSING → SPEAKING → IDLE
  ├─ WhisperSTTAdapter (STT API 适配器)
  │    ├─ 重试机制 (最多3次)
  │    ├─ 超时控制
  │    └─ 错误分类
  ├─ VoiceAgentRouter (Agent 路由)
  └─ TTSEngine (TTS 合成)
```

## 配置方式

### 1. STT 配置 (语音识别)

**OpenAI Whisper API**（推荐）

方法 A：通过设置界面
1. 打开设置 → 语音配置
2. 在 OpenAI Provider 中配置 API Key

方法 B：环境变量
```bash
export OPENAI_API_KEY=sk-xxx
```

**本地 whisper.cpp**（离线模式）
```bash
export WHISPER_SERVER_URL=http://localhost:8080
```

### 2. TTS 配置 (语音合成)

**Mimo TTS**（推荐）

1. 打开设置 → 语音配置
2. 选择 TTS 引擎为 "Mimo"
3. 选择模型：
   - mimo-v2.5-tts（标准）
   - mimo-v2-tts（旧版）
   - mimo-v2.5-tts-voicedesign（音色设计）
   - mimo-v2.5-tts-voiceclone（声音克隆）

**Web Speech API**（Fallback）
- 无需额外配置
- 使用浏览器内置语音合成

### 3. VAD 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| silenceThreshold | 静音检测阈值 | 0.01 |
| speechDuration | 最短语音时长 | 200ms |
| silenceDuration | 静音结束判定 | 800ms |

## 性能监控

系统内置 `VoiceMetricsCollector` 收集以下指标：

| 指标 | 说明 | 统计方式 |
|------|------|----------|
| STT 延迟 | 音频发送到识别完成 | p50/p95 百分位数 |
| TTS 延迟 | 文本发送到播放开始 | p50/p95 百分位数 |
| 对话周期 | 完整一轮对话时长 | 平均值 |
| 错误计数 | 累计错误次数 | 计数器 |

查询指标：
```javascript
import { voiceMetrics } from './lib/metrics/voice-metrics-collector.js';
const stats = voiceMetrics.getStats();
console.log(stats.stt.p50); // STT p50 延迟
```

## 错误追踪

系统内置 `VoiceErrorTracker` 捕获语音错误：

```typescript
import { voiceErrorTracker } from './services/voice-error-tracker';

try {
  await sttAdapter.transcribe(audioBlob);
} catch (err) {
  voiceErrorTracker.captureError({
    error: err,
    component: 'WhisperSTTAdapter',
    state: 'PROCESSING',
    metadata: { attempt: 1 },
  });
}
```

**Sentry 集成**（可选）
- 安装 `@sentry/electron` 后自动启用
- 错误包含组件、状态、元数据上下文
- 未安装时静默降级

## 故障排除

### STT 识别失败
1. 检查 OpenAI API Key 是否配置
2. 查看日志：`~/.hanako-dev/logs/whisper-stt-adapter.log`
3. 验证网络连接
4. 检查重试次数（最多3次）

### VAD 不工作
1. 确认麦克风权限已授予
2. 检查 VADService 日志
3. 调整 silenceThreshold 参数

### TTS 无声音
1. 检查 TTS Provider 配置
2. 查看 tts-engine 日志
3. 验证音频输出设备
4. 测试按钮播放测试音频

## API 密钥管理

| 服务 | 获取地址 | 存储位置 |
|------|----------|----------|
| OpenAI | https://platform.openai.com/api-keys | added-models.yaml |
| Mimo | https://dev.mi.com/mimo-open-platform | added-models.yaml |

> 注意：API Key 存储在 `added-models.yaml` 中，不是 `.env` 文件
