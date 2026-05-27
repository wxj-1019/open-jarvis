# OpenJarvis 项目战略规划 (2026)

> **生成日期**: 2026年5月27日  
> **基于报告**: [OpenJarvis 竞品深度调研与能力扩展战略报告](../report/report.md)  
> **当前状态**: Phase 1-3 已完成，具备从被动响应到主动服务的完整基础设施

---

## 📊 项目定位与竞争态势

### 当前市场地位

OpenJarvis 在开源个人 AI 助手领域处于**第一梯队**（综合评分 85/100），核心竞争优势：

| 优势维度 | 具体表现 | 竞品对比 |
|----------|----------|----------|
| 🔒 **安全架构深度** | PathGuard 4级 + OS级沙盒 + 多层认证 | OpenClaw 无凭证隔离 |
| 🧠 **记忆系统成熟度** | 7层多级记忆 + 5层检索 + 遗忘曲线 | 多数竞品仅单层向量存储 |
| ⚡ **事件驱动架构** | OSEventSource + 上下文感知 + 意图预测 | 多数竞品为被动响应 |
| 🤖 **多Agent协作** | DAG并行 + 独立记忆/人格 + 群聊/私聊 | 部分竞品支持简单多Agent |
| 🌐 **跨平台覆盖** | macOS/Windows/Linux/PWA/CLI 全平台 | 多数竞品仅1-2个平台 |

### 直接竞品对比

| 项目 | 综合评分 | 核心优势 | 明显短板 |
|------|----------|----------|----------|
| **Vellum** | 100/100 | 进程级凭证隔离、主动引擎 | 仅限 macOS |
| **OpenClaw** | 88/100 | 24个社交平台、5700+ skills | 凭证明文存储、prompt注入不在安全范围 |
| **OpenJarvis** | **85/100** | 7层记忆、双层沙盒、事件驱动 | 语音交互待开发、代码质量待优化 |

---

## 🎯 能力扩展优先级矩阵

### P0 - 立即启动（1-3个月）

#### 1. 语音交互系统 ⭐⭐⭐⭐⭐
**预期收益**: 实现"真正的Jarvis"体验，用户交互方式质变  
**实施周期**: 4-6周

**技术栈选型**：

| 层级 | 推荐方案 | 备选方案 | 决策依据 |
|------|----------|----------|----------|
| **STT** | faster-whisper (本地GPU) | Deepgram (云端) / moonshine (CPU) | 离线优先、质量与延迟平衡 |
| **TTS** | Piper (本地, MIT协议) | ElevenLabs (云端) / Coqui TTS | 完全离线可用 |
| **唤醒词** | OpenWakeWord | Porcupine | 开源、可自定义唤醒词 |

**实施计划**：

| 阶段 | 任务 | 输出物 | 时间 |
|------|------|--------|------|
| Week 1-2 | STT引擎集成 | `stt-engine.ts`, `stt-service.ts` | 2周 |
| Week 2-3 | TTS引擎集成 | `tts-engine.ts`, `tts-service.ts` | 1-2周 |
| Week 3-4 | 唤醒词检测集成 | `wake-word-detector.ts` | 1周 |
| Week 4-5 | 语音对话模式UI | `VoiceMode.tsx`, `VoiceSettings.tsx` | 1-2周 |
| Week 5-6 | 语音与Agent系统集成测试 | 测试覆盖、性能优化 | 1-2周 |

**关键技术决策**：
- ✅ 默认离线运行（whisper.cpp + Piper）
- ✅ 云端作为质量增强备选
- ✅ 语音服务作为独立进程通过事件总线与 Agent 核心通信
- ✅ 支持语音打断（barge-in）和对话状态可视化

---

#### 2. 安全加固与凭证隔离 ⭐⭐⭐⭐⭐
**预期收益**: 对标 Vellum 的进程级凭证隔离，消除安全短板  
**实施周期**: 2-3周

**实施计划**：

| 阶段 | 任务 | 输出物 | 时间 |
|------|------|--------|------|
| Week 1 | Credential Vault 进程设计与实现 | `credential-vault.ts`, `vault-client.ts` | 1周 |
| Week 1-2 | MCP Server 凭证迁移到 Vault | 更新所有 MCP Server 的认证逻辑 | 1周 |
| Week 2-3 | Prompt 注入检测中间件 | `injection-detector.ts`, `guard-middleware.ts` | 1-2周 |
| Week 3 | 安全审计与渗透测试 | 安全报告、漏洞修复 | 1周 |

**核心设计**：
- 将凭证存储迁移到独立的 Credential Vault 进程
- 通过 Unix Domain Socket 或命名管道进行受控访问
- 每次工具调用的事前授权检查
- 进程级凭证隔离（对标 Vellum 的黄金标准）

---

### P1 - 短期目标（3-4个月）

#### 3. A2A协议支持 (Agent-to-Agent) ⭐⭐⭐⭐
**预期收益**: 与 MCP 互补，实现跨框架 Agent 互操作  
**实施周期**: 3-4周

**背景**：
- A2A 协议由 Google 于 2025 年 4 月开源，2026 年 4 月发布 v1.0 稳定版本
- 已有 150+ 组织采纳（Microsoft、AWS、Salesforce、SAP 等）
- MCP 解决"Agent 如何调用工具"，A2A 解决"Agent 如何与其他 Agent 协作"

**实施计划**：

| 阶段 | 任务 | 输出物 | 时间 |
|------|------|--------|------|
| Week 1 | Agent Card 生成与发布 | `agent-card.ts`, `/.well-known/agent.json` | 1周 |
| Week 1-2 | A2A Task 生命周期管理 | `a2a-task-manager.ts`, `task-states.ts` | 1-2周 |
| Week 2-3 | 跨Agent任务委托（OpenJarvis 作为 client） | `a2a-client.ts`, `delegation-service.ts` | 1-2周 |
| Week 3-4 | Signed Agent Cards 验证 + 安全测试 | `signature-verifier.ts`, `a2a-security.test.ts` | 1-2周 |

---

#### 4. 多模态理解增强 (屏幕/音频) ⭐⭐⭐⭐
**预期收益**: 对标 Omi 的"第二大脑"能力，实现环境感知  
**实施周期**: 6-8周

**实施计划**：

| 阶段 | 任务 | 输出物 | 时间 |
|------|------|--------|------|
| Week 1-2 | 屏幕截图 + OCR 基础模块 | `screen-capture.ts`, `ocr-engine.ts` | 2周 |
| Week 2-4 | 多模态 LLM 集成 | `vision-service.ts`, `image-understanding.ts` | 2-3周 |
| Week 4-6 | 屏幕内容语义理解 | `screen-analyzer.ts`, `visual-context.ts` | 2-3周 |
| Week 6-8 | 隐私保护设计 + 用户控制面板 | `privacy-settings.tsx`, `capture-consent.ts` | 2周 |

**渐进式实现路径**：
1. **第一阶段**（4-6周）：屏幕截图 + OCR 基础理解
2. **第二阶段**（6-8周）：集成多模态 LLM（GPT-5.4 Vision 或本地 LLaVA）
3. **第三阶段**（8-12周）：探索持续屏幕捕获模式（参考 Omi 的隐私保护设计）

---

### P2 - 中期目标（4-6个月）

#### 5. IoT/智能家居集成 ⭐⭐⭐
**预期收益**: 扩展物理世界控制能力  
**实施周期**: 4-6周

**技术方案**：通过 MCP Client 模式连接 Home Assistant 的 ha-mcp

| 阶段 | 任务 | 输出物 | 时间 |
|------|------|--------|------|
| Week 1-2 | Home Assistant MCP Client 集成 | `ha-mcp-connector.ts`, `device-registry.ts` | 2周 |
| Week 2-3 | 自然语言设备控制 | `device-controller.ts`, `nl-device-parser.ts` | 1-2周 |
| Week 3-4 | 上下文感知自动化规则 | `context-automation.ts`, `proactive-home.ts` | 1-2周 |
| Week 4-6 | 测试 + 文档 + 用户引导 | 测试文件、文档、UI 引导 | 2周 |

**ha-mcp 能力**：86 个工具横跨 24 个类别（非官方但最全面）

---

#### 6. 行为模式学习与自动优化 ⭐⭐⭐
**预期收益**: 从规则引擎向数据驱动进化  
**实施周期**: 8-12周

**实施计划**：

| 阶段 | 任务 | 输出物 | 时间 |
|------|------|--------|------|
| Week 1-3 | 交互时间线记录与存储 | `interaction-timeline.ts`, `pattern-store.ts` | 3周 |
| Week 3-5 | 高频模式统计与识别 | `pattern-miner.ts`, `frequency-analyzer.ts` | 2-3周 |
| Week 5-8 | 模式到规则的自动转化 | `rule-generator.ts`, `proactive-rule-sync.ts` | 3-4周 |
| Week 8-10 | A/B 测试框架 + 效果评估 | `pattern-ab-test.ts`, `effectiveness-metrics.ts` | 2-3周 |
| Week 10-12 | 反馈循环 + 用户控制面板 | `feedback-loop.ts`, `learning-dashboard.tsx` | 2-3周 |

---

## 🗺️ 长期愿景（6-12个月）

### 1. 跨设备记忆同步
- 基于已有的 7 层记忆系统
- 实现跨设备（Mac → Windows → Linux → Mobile PWA）的记忆同步
- 技术方案：端到端加密的对等同步（Syncthing 协议）或本地优先的 CRDT 数据结构
- 确保记忆数据在设备间同步时始终保持本地存储、不上传云端

### 2. 开放 Agent 市场
- 参考 OpenClaw 的 ClawHub 模式，建立 **OpenJarvis Skill Marketplace**
- 允许社区贡献 Skills 和 MCP Server 配置
- **关键差异化**：安全签名验证——每个社区贡献在上架前必须通过安全审计和代码签名

### 3. 本地多模态模型支持
- 随着本地模型能力的持续提升（Qwen3.5、Gemma 4、LLaVA 等）
- 逐步将云端多模态依赖替换为本地模型
- 实现**完全离线的多模态理解**
- 与 Ollama 等本地运行器深度集成

---

## 📋 协议兼容性矩阵

| 协议 | 状态 | 优先级 | 价值 |
|------|------|--------|------|
| **MCP (Model Context Protocol)** | ✅ **已完成原生支持** | — | 工具生态接入（15,930+ servers） |
| **A2A (Agent-to-Agent)** | 待实施 | **P1** | 跨框架 Agent 互操作（150+ 组织采纳） |
| **Structured Output** | 部分使用 | **立即全面采用** | 消除 0.1% 级格式错误 |
| **OAuth 2.1 (MCP Auth)** | 需更新 | P1 | 符合 MCP 2025-06-18 规范 |
| **MCP Tunnels** | 待评估 | P2 | 企业级无入站防火墙部署 |

---

## 🛠️ 关键技术选型

### 本地 LLM 优化支持

| 模型 | 参数 | 协议 | 特点 | 推荐场景 |
|------|------|------|------|----------|
| **Qwen3.5** | 122B (10B激活) | Apache 2.0 | 中文能力突出、64GB RAM 可运行 | 通用任务、中文场景 |
| **Gemma 4** | 26B (MoE) | 开放 | 消费级硬件 85 tokens/秒 | 低资源环境 |
| **DeepSeek V3.2-Exp** | - | 开放 | 推理能力强 | plan_execute 复杂任务分解 |

### 模型路由策略

根据任务类型自动选择最适合的模型：
- 🎯 **编码任务** → Claude
- 🎨 **多模态任务** → Gemini
- ⚡ **高速响应任务** → 本地 Ollama 模型
- 🔧 **Computer Use** → GPT-5.4 或 Claude API + 本地 Ollama 备选

---

## ⚠️ 关键挑战与应对策略

| 挑战 | 严重程度 | 应对策略 | 时间框架 |
|------|----------|----------|----------|
| **语音交互缺失** | 🔴 高 | 集成 whisper.cpp + Piper，4-6周 | 立即启动 |
| **代码质量债务** | 🟡 中 | 拆分巨型函数/组件，576处 fs.*Sync 迁移 | 并行推进 |
| **多模态能力弱** | 🟡 中 | 渐进式屏幕理解，先 OCR 后多模态 LLM | 3-6个月 |
| **社区生态规模** | 🟡 中 | 建立安全签名 Skills 市场，差异化安全定位 | 6-12个月 |
| **测试覆盖不足** | 🟡 中 | 添加 coverage 配置 + Playwright E2E | 1-2个月 |

---

## 🚀 行动号召

### 未来 3 个月集中目标

在未来 3 个月内集中资源完成以下三项 P0/P1 任务：

1. ✅ **语音交互**（P0）- 体验质变
2. ✅ **安全加固**（P0）- 安全领先
3. ✅ **A2A 协议支持**（P1）- 生态互操作

这将为 OpenJarvis 带来**体验质变 + 安全领先 + 生态互操作**的三重竞争优势，确立其在开源个人 AI 助手领域的领导地位。

### 战略方向

**向右上象限移动**（Vellum 所在位置）：
- 强化主动性和凭证隔离
- 保持安全架构的差异化优势（OpenClaw 等竞品短期内难以复制的核心壁垒）

---

## 📈 里程碑时间线

```
2026 Q2 (5-6月)
├─ 语音交互系统 STT/TTS 基础集成
└─ 安全加固 Credential Vault 设计

2026 Q3 (7-9月)
├─ 语音交互完整上线
├─ 安全加固完成
├─ A2A 协议支持
└─ 多模态理解第一阶段（OCR）

2026 Q4 (10-12月)
├─ 多模态理解增强
├─ IoT/智能家居集成
└─ 行为模式学习系统启动

2027 Q1-Q2 (1-6月)
├─ 跨设备记忆同步
├─ 开放 Agent 市场
└─ 本地多模态模型支持
```

---

## 📚 参考资源

- [Vellum AI 评测报告](https://www.vellum.ai/blog/best-open-source-personal-ai-assistants)
- [MCP Server Ecosystem Tracker](https://www.digitalapplied.com/blog/mcp-server-ecosystem-tracker-50-servers-cataloged-2026)
- [A2A Protocol Guide 2026](https://niteagent.com/blog/a2a-protocol-guide-2026/)
- [构建离线语音助手 2026](https://www.promptquorum.com/zh/power-local-llm/build-local-voice-assistant-2026)
- [Home Assistant MCP Server Guide](https://smarthomescene.com/guides/home-assistant-mcp-server-complete-guide/)

---

**文档维护**: 本文档应根据项目进展定期更新，建议每月回顾一次  
**最后更新**: 2026-05-27
