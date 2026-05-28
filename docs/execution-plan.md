# OpenJarvis 详细执行计划

> **生成日期**: 2026-05-27
> **基于文档**: project-status-summary.md
> **执行周期**: 8 周（2 个月）

---

## 一、执行计划概览

### 目标

1. **短期（1-2 周）**: 代码质量优化，消除技术债务
2. **中期（3-6 周）**: 语音交互开发，提升用户体验
3. **长期（7-8 周）**: 通知分级 + 测试覆盖完善

### 优先级排序

| 优先级 | 任务 | 预期收益 | 风险等级 |
|--------|------|----------|----------|
| P0 | 代码质量优化 | 提升开发效率 30%+ | 低 |
| P1 | 测试覆盖率配置 | 保障重构安全 | 低 |
| P2 | 语音交互开发 | 用户体验质变 | 中 |
| P3 | 通知智能分级 | 信息管理优化 | 低 |

---

## 二、第一阶段：代码质量优化（Week 1-2）

### 2.1 拆分 InputArea.tsx（Day 1-3）

**当前状态**: 1,237 行，职责混杂

**目标**: 拆分为 5 个独立组件

```
InputArea.tsx (1,237 行)
    ↓
├── InputAreaCore.tsx        (300 行) - 核心输入逻辑
├── PasteHandler.tsx         (200 行) - 粘贴处理
├── SlashCommandMenu.tsx     (250 行) - 斜杠命令菜单
├── FileMention.tsx          (200 行) - 文件提及
└── InputAreaContainer.tsx   (287 行) - 容器组件
```

**执行步骤**:

```bash
# 1. 创建组件目录
mkdir -p desktop/src/react/components/input

# 2. 提取 PasteHandler
# - 识别粘贴相关逻辑（约 200 行）
# - 移动到 PasteHandler.tsx
# - 在 InputArea 中导入使用

# 3. 提取 SlashCommandMenu
# - 识别斜杠命令逻辑（约 250 行）
# - 移动到 SlashCommandMenu.tsx

# 4. 提取 FileMention
# - 识别文件提及逻辑（约 200 行）
# - 移动到 FileMention.tsx

# 5. 重构 InputAreaCore
# - 保留核心输入逻辑（约 300 行）
# - 使用提取的组件

# 6. 创建 InputAreaContainer
# - 组合所有子组件
# - 管理状态和事件
```

**验收标准**:
- [ ] InputArea.tsx 行数 < 100 行
- [ ] 所有子组件独立可测试
- [ ] 现有功能无回归
- [ ] 单元测试覆盖 70%+

---

### 2.2 拆分 session-coordinator.js（Day 4-5）

**当前状态**: createSession() 函数 480 行

**目标**: 拆分为 6 个独立函数

```
createSession() (480 行)
    ↓
├── validateSessionParams()     (50 行) - 参数校验
├── initializeSessionDir()      (80 行) - 目录初始化
├── loadSessionConfig()         (60 行) - 配置加载
├── setupSessionContext()       (100 行) - 上下文设置
├── registerSessionHandlers()   (90 行) - 处理器注册
└── createSession()             (100 行) - 主函数（协调）
```

**执行步骤**:

```bash
# 1. 分析 createSession() 函数结构
# - 识别独立的职责块
# - 确定拆分边界

# 2. 提取 validateSessionParams()
# - 参数校验逻辑（约 50 行）
# - 返回校验结果

# 3. 提取 initializeSessionDir()
# - 目录创建和初始化（约 80 行）
# - 返回目录路径

# 4. 提取 loadSessionConfig()
# - 配置文件加载（约 60 行）
# - 返回配置对象

# 5. 提取 setupSessionContext()
# - 上下文初始化（约 100 行）
# - 返回上下文对象

# 6. 提取 registerSessionHandlers()
# - 事件处理器注册（约 90 行）
# - 返回清理函数

# 7. 重构 createSession()
# - 协调调用各子函数
# - 保持原有接口不变
```

**验收标准**:
- [ ] createSession() 行数 < 100 行
- [ ] 每个子函数职责单一
- [ ] 现有测试全部通过
- [ ] 新增单元测试覆盖

---

### 2.3 拆分 ChannelsPanel.tsx（Day 6-7）

**当前状态**: 1,123 行，7 个职责混杂

**目标**: 拆分为 7 个独立组件

```
ChannelsPanel.tsx (1,123 行)
    ↓
├── ChannelList.tsx          (150 行) - 频道列表
├── ChannelItem.tsx          (120 行) - 频道项
├── ChannelHeader.tsx        (100 行) - 头部导航
├── ChannelSearch.tsx        (130 行) - 搜索功能
├── ChannelFilter.tsx        (120 行) - 筛选功能
├── ChannelActions.tsx       (150 行) - 操作按钮
└── ChannelsPanel.tsx        (353 行) - 主容器
```

**执行步骤**:

```bash
# 1. 识别职责边界
# - 列表渲染、单项渲染、搜索、筛选、操作等

# 2. 逐个提取组件
# - 每次提取后运行测试验证

# 3. 重构主容器
# - 组合子组件
# - 管理共享状态
```

**验收标准**:
- [ ] ChannelsPanel.tsx 行数 < 400 行
- [ ] 所有子组件独立可测试
- [ ] UI 功能无回归

---

### 2.4 隐式回调注入重构（Day 8-9）

**当前状态**: agent.js 有 7 个 set* 方法

**目标**: 合并为单个 `initialize(options)` 调用

```javascript
// 当前方式（7 个独立调用）
agent.setNotifyHandler(handler1)
agent.setBridgeManager(manager)
agent.setMemoryService(memory)
agent.setToolRegistry(registry)
agent.setEventBus(eventBus)
agent.setConfig(config)
agent.setLogger(logger)

// 重构后（单次初始化）
agent.initialize({
  notifyHandler: handler1,
  bridgeManager: manager,
  memoryService: memory,
  toolRegistry: registry,
  eventBus: eventBus,
  config: config,
  logger: logger
})
```

**执行步骤**:

```bash
# 1. 创建 initialize(options) 方法
# - 接收所有依赖
# - 内部调用原有 set* 方法

# 2. 标记旧方法为 deprecated
# - 添加 JSDoc @deprecated 注释
# - 控制台输出警告

# 3. 迁移所有调用点
# - 搜索所有 set* 调用
# - 替换为 initialize()

# 4. 移除旧方法（可选）
# - 确认无外部依赖后删除
```

**验收标准**:
- [ ] 所有调用点迁移完成
- [ ] 现有测试全部通过
- [ ] 无 breaking change

---

### 2.5 测试覆盖率配置（Day 10）

**目标**: 建立质量基线，保障重构安全

**执行步骤**:

```bash
# 1. 更新 vitest.config.ts
cat > vitest.config.ts << 'EOF'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      },
      include: [
        'core/**/*.js',
        'lib/**/*.js',
        'server/**/*.js'
      ],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**'
      ]
    }
  }
})
EOF

# 2. 添加 package.json 脚本
npm pkg set scripts.test:coverage="vitest --coverage"

# 3. 运行覆盖率报告
npm run test:coverage
```

**验收标准**:
- [ ] 覆盖率配置生效
- [ ] 基线报告生成
- [ ] CI/CD 集成（可选）

---

## 三、第二阶段：语音交互开发（Week 3-6）

### 3.1 技术选型（Week 3, Day 1-2）

**STT（语音转文字）选项**:

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| Whisper (本地) | 免费、隐私 | 需要 GPU | ⭐⭐⭐⭐⭐ |
| Azure Speech | 高精度 | 收费 | ⭐⭐⭐⭐ |
| Google STT | 多语言 | 收费 | ⭐⭐⭐ |

**TTS（文字转语音）选项**:

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| Edge TTS | 免费、高质量 | 需要网络 | ⭐⭐⭐⭐⭐ |
| Azure TTS | 最自然 | 收费 | ⭐⭐⭐⭐ |
| Coqui TTS | 本地、可定制 | 需要训练 | ⭐⭐⭐ |

**推荐方案**:
- **STT**: Whisper（本地部署，隐私优先）
- **TTS**: Edge TTS（免费、高质量）

---

### 3.2 STT 集成（Week 3, Day 3-5）

**执行步骤**:

```bash
# 1. 安装 Whisper 依赖
pip install openai-whisper

# 2. 创建 STT 服务
mkdir -p lib/voice
cat > lib/voice/stt-service.js << 'EOF'
import { spawn } from 'child_process'

export class STTService {
  constructor({ model = 'base', language = 'zh' }) {
    this.model = model
    this.language = language
  }

  async transcribe(audioBuffer) {
    // 调用 Whisper 进行语音识别
    const result = await this._runWhisper(audioBuffer)
    return result
  }

  async _runWhisper(audioBuffer) {
    // 实现 Whisper 调用逻辑
  }
}
EOF

# 3. 创建 STT API 路由
cat > server/routes/voice.js << 'EOF'
import { Router } from 'express'

export function createVoiceRoute(sttService) {
  const router = Router()

  router.post('/transcribe', async (req, res) => {
    const { audio } = req.body
    const text = await sttService.transcribe(audio)
    res.json({ text })
  })

  return router
}
EOF

# 4. 注册路由
# 在 server/index.js 中添加
```

**验收标准**:
- [ ] STT 服务可独立运行
- [ ] API 路由正常响应
- [ ] 中文识别准确率 > 90%

---

### 3.3 TTS 集成（Week 4, Day 1-3）

**执行步骤**:

```bash
# 1. 安装 Edge TTS 依赖
npm install edge-tts

# 2. 创建 TTS 服务
cat > lib/voice/tts-service.js << 'EOF'
import { MsEdgeTTS } from 'edge-tts'

export class TTSService {
  constructor({ voice = 'zh-CN-XiaoxiaoNeural' }) {
    this.voice = voice
    this.tts = new MsEdgeTTS()
  }

  async synthesize(text) {
    await this.tts.setMetadata(this.voice, MsEdgeTTS.OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const readable = this.tts.toStream(text)
    return readable
  }
}
EOF

# 3. 创建 TTS API 路由
cat >> server/routes/voice.js << 'EOF'

router.post('/synthesize', async (req, res) => {
  const { text } = req.body
  const audioStream = await ttsService.synthesize(text)
  res.set('Content-Type', 'audio/mpeg')
  audioStream.pipe(res)
})
EOF
```

**验收标准**:
- [ ] TTS 服务可独立运行
- [ ] 音频流正常输出
- [ ] 语音自然度可接受

---

### 3.4 前端语音组件（Week 4, Day 4-5 + Week 5）

**执行步骤**:

```bash
# 1. 创建语音输入组件
cat > desktop/src/react/components/voice/VoiceInput.tsx << 'EOF'
import React, { useState, useRef } from 'react'

export function VoiceInput({ onTranscript }) {
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorder = useRef(null)
  const audioChunks = useRef([])

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    mediaRecorder.current = new MediaRecorder(stream)
    audioChunks.current = []

    mediaRecorder.current.ondataavailable = (event) => {
      audioChunks.current.push(event.data)
    }

    mediaRecorder.current.onstop = async () => {
      const audioBlob = new Blob(audioChunks.current, { type: 'audio/wav' })
      const transcript = await transcribeAudio(audioBlob)
      onTranscript(transcript)
    }

    mediaRecorder.current.start()
    setIsRecording(true)
  }

  const stopRecording = () => {
    mediaRecorder.current.stop()
    setIsRecording(false)
  }

  return (
    <button onClick={isRecording ? stopRecording : startRecording}>
      {isRecording ? '⏹️ 停止' : '🎤 说话'}
    </button>
  )
}
EOF

# 2. 创建语音输出组件
cat > desktop/src/react/components/voice/VoiceOutput.tsx << 'EOF'
import React, { useRef } from 'react'

export function VoiceOutput({ text }) {
  const audioRef = useRef(null)

  const playAudio = async () => {
    const response = await fetch('/api/voice/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })
    const audioBlob = await response.blob()
    const audioUrl = URL.createObjectURL(audioBlob)
    audioRef.current.src = audioUrl
    audioRef.current.play()
  }

  return (
    <div>
      <button onClick={playAudio}>🔊 播放</button>
      <audio ref={audioRef} />
    </div>
  )
}
EOF

# 3. 集成到 InputArea
# 在 InputArea.tsx 中添加语音按钮
```

**验收标准**:
- [ ] 语音输入正常工作
- [ ] 语音输出正常播放
- [ ] UI 交互流畅

---

### 3.5 语音对话模式（Week 6）

**执行步骤**:

```bash
# 1. 创建语音对话管理器
cat > lib/voice/conversation-manager.js << 'EOF'
export class VoiceConversationManager {
  constructor({ sttService, ttsService, agent }) {
    this.sttService = sttService
    this.ttsService = ttsService
    this.agent = agent
    this.isActive = false
  }

  async start() {
    this.isActive = true
    while (this.isActive) {
      // 1. 监听用户语音
      const audio = await this.listen()
      
      // 2. 转录为文字
      const text = await this.sttService.transcribe(audio)
      
      // 3. 发送给 Agent
      const response = await this.agent.chat(text)
      
      // 4. 播放 Agent 回复
      await this.speak(response)
    }
  }

  stop() {
    this.isActive = false
  }
}
EOF

# 2. 创建连续对话 API
# 3. 前端语音对话 UI
```

**验收标准**:
- [ ] 连续语音对话可用
- [ ] 响应延迟 < 2 秒
- [ ] 可随时中断

---

## 四、第三阶段：通知智能分级（Week 7）

### 4.1 通知分级策略

```javascript
// 通知优先级定义
const NOTIFICATION_PRIORITY = {
  URGENT: {
    level: 'urgent',
    sound: true,
    popup: true,
    persist: true,  // 保留在通知中心
    vibrate: true   // 移动端震动
  },
  NORMAL: {
    level: 'normal',
    sound: false,
    popup: false,
    persist: true,
    vibrate: false
  },
  INFO: {
    level: 'info',
    sound: false,
    popup: false,
    persist: false,  // 不保留，批量处理
    vibrate: false
  }
}
```

### 4.2 执行步骤

```bash
# 1. 更新 notify-tool.js
# - 添加 priority 参数
# - 支持 urgent/normal/info

# 2. 更新 NotificationService
# - 根据优先级决定行为
# - 实现批量处理逻辑

# 3. 更新前端通知组件
# - 不同样式展示
# - 声音和震动控制
```

**验收标准**:
- [ ] 三级通知正常工作
- [ ] Urgent 通知立即弹窗
- [ ] Info 通知批量展示

---

## 五、第四阶段：测试覆盖完善（Week 8）

### 5.1 E2E 测试（Playwright）

```bash
# 1. 安装 Playwright
npm init playwright@latest

# 2. 创建核心流程测试
cat > tests/e2e/chat.spec.ts << 'EOF'
import { test, expect } from '@playwright/test'

test('发送消息并接收回复', async ({ page }) => {
  await page.goto('/')
  await page.fill('textarea', '你好')
  await page.click('button[type="submit"]')
  await expect(page.locator('.message')).toHaveCount(2)
})
EOF

# 3. 运行 E2E 测试
npx playwright test
```

### 5.2 单元测试补充

```bash
# 1. 为新增组件添加测试
# 2. 为新增服务添加测试
# 3. 运行覆盖率报告
npm run test:coverage
```

**验收标准**:
- [ ] E2E 测试覆盖 5+ 核心流程
- [ ] 单元测试覆盖率 > 70%
- [ ] CI/CD 自动运行测试

---

## 六、时间线总览

```
Week 1: 代码质量优化 (第一部分)
├── Day 1-3: 拆分 InputArea.tsx
├── Day 4-5: 拆分 session-coordinator.js
└── Day 6-7: 拆分 ChannelsPanel.tsx

Week 2: 代码质量优化 (第二部分)
├── Day 8-9: 隐式回调注入重构
└── Day 10: 测试覆盖率配置

Week 3: 语音交互 (STT)
├── Day 1-2: 技术选型
├── Day 3-5: STT 集成

Week 4: 语音交互 (TTS + 前端)
├── Day 1-3: TTS 集成
└── Day 4-5: 前端语音组件

Week 5-6: 语音交互 (对话模式)
├── Week 5: 语音对话管理器
└── Week 6: 连续对话 + 优化

Week 7: 通知智能分级
├── Day 1-3: 后端实现
└── Day 4-5: 前端实现

Week 8: 测试覆盖完善
├── Day 1-3: E2E 测试
└── Day 4-5: 单元测试补充
```

---

## 七、风险控制

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 重构引入 bug | 中 | 高 | 先写测试，再重构 |
| 语音引擎性能不足 | 低 | 中 | POC 验证后再集成 |
| 通知分级逻辑复杂 | 低 | 低 | 分阶段实现 |
| 测试覆盖率提升困难 | 中 | 中 | 优先覆盖核心路径 |

---

## 八、验收标准

### 代码质量优化完成标准

- [ ] 巨型函数 (< 100 行)
- [ ] 巨型组件 (< 400 行)
- [ ] 隐式回调注入消除
- [ ] 测试覆盖率配置完成

### 语音交互完成标准

- [ ] STT 中文识别准确率 > 90%
- [ ] TTS 语音自然度可接受
- [ ] 连续对话延迟 < 2 秒
- [ ] 前端语音组件可用

### 通知分级完成标准

- [ ] 三级通知正常工作
- [ ] Urgent 立即弹窗
- [ ] Info 批量展示

### 测试覆盖完成标准

- [ ] E2E 测试 5+ 核心流程
- [ ] 单元测试覆盖率 > 70%
- [ ] CI/CD 自动运行

---

## 九、下一步行动

**立即开始**: 拆分 InputArea.tsx

```bash
# 1. 分析当前结构
wc -l desktop/src/react/components/InputArea.tsx

# 2. 识别职责边界
# 3. 开始提取组件
```

---

> **文档维护**: 本文档基于 project-status-summary.md 生成
> **最后更新**: 2026-05-27
> **执行负责人**: AI Assistant + 开发者
