/**
 * VoiceConversationManager — 主进程语音对话管理器
 *
 * 职责：
 * 1. 管理语音对话生命周期（启动/停止/暂停/恢复）
 * 2. 桥接前端 IPC 和后端语音引擎
 * 3. 转发状态变化事件到渲染进程
 * 4. 处理音频能量数据
 */

const { ipcMain, BrowserWindow } = require("electron");
const { EventEmitter } = require("events");

// 后端引擎（延迟加载，避免启动时依赖）
let VoiceConversationLoop = null;
let VADService = null;
let STTEngine = null;
let TTSEngine = null;
let WhisperSTTAdapter = null;
let VoiceAgentRouter = null;

class VoiceConversationManager extends EventEmitter {
  constructor() {
    super();
    this._loop = null;
    this._vad = null;
    this._stt = null;
    this._tts = null;
    this._whisperSTT = null;
    this._agentRouter = null;
    this._initialized = false;
    this._serverUrl = "";
    this._serverToken = "";
  }

  /**
   * 初始化管理器
   * @param {object} opts
   * @param {string} opts.serverUrl - 服务器 URL
   * @param {string} opts.serverToken - 服务器 token
   * @param {object} opts.engine - HanaEngine 实例
   * @param {object} opts.hub - Hub 实例
   */
  async initialize(opts = {}) {
    if (this._initialized) return;

    this._serverUrl = opts.serverUrl || "";
    this._serverToken = opts.serverToken || "";

    try {
      // 动态加载后端引擎（ESM 模块，使用 dynamic import）
      const [vadModule, sttModule, ttsModule, whisperModule, loopModule, routerModule] = await Promise.all([
        import("../lib/speech/vad-service.js"),
        import("../lib/speech/stt-engine.js"),
        import("../lib/speech/tts-engine.js"),
        import("../lib/speech/whisper-stt-adapter.js"),
        import("../lib/speech/voice-conversation-loop.js"),
        import("../lib/voice/voice-agent-router.js"),
      ]);

      VADService = vadModule.VADService;
      STTEngine = sttModule.STTEngine;
      TTSEngine = ttsModule.TTSEngine;
      WhisperSTTAdapter = whisperModule.WhisperSTTAdapter;
      VoiceConversationLoop = loopModule.VoiceConversationLoop;
      VoiceAgentRouter = routerModule.VoiceAgentRouter;

      // 创建引擎实例
      this._vad = new VADService();
      this._stt = new STTEngine();
      this._tts = new TTSEngine();
      this._whisperSTT = new WhisperSTTAdapter({
        serverUrl: this._serverUrl,
      });

      // 创建 Agent 路由器（如果 engine 和 hub 可用）
      if (opts.engine && opts.hub) {
        this._agentRouter = new VoiceAgentRouter({
          engine: opts.engine,
          hub: opts.hub,
        });
      }

      this._initialized = true;
      console.log("[VoiceConversationManager] 初始化成功");
    } catch (err) {
      console.error("[VoiceConversationManager] 初始化失败:", err.message);
      throw err;
    }
  }

  /**
   * 启动语音对话
   * @param {object} opts
   * @param {boolean} opts.continuous - 是否持续对话
   * @param {boolean} opts.autoSpeak - 是否自动播放回复
   */
  async start(opts = {}) {
    if (!this._initialized) {
      throw new Error("VoiceConversationManager 未初始化");
    }

    if (this._loop) {
      console.warn("[VoiceConversationManager] 对话已在进行中");
      return;
    }

    // 创建对话循环
    this._loop = new VoiceConversationLoop(
      {
        vadService: this._vad,
        sttEngine: this._stt,
        ttsEngine: this._tts,
        whisperSTTAdapter: this._whisperSTT,
        onUserText: async (text) => {
          // 转发用户文本到渲染进程
          this._sendToRenderer("voice:userText", text);

          // 如果有 Agent 路由器，使用它处理
          if (this._agentRouter) {
            try {
              const response = await this._agentRouter.route(text);
              return response || "";
            } catch (err) {
              console.error("[VoiceConversationManager] Agent 处理失败:", err.message);
              return "";
            }
          }

          // 否则返回空响应
          return "";
        },
      },
      {
        continuous: opts.continuous ?? true,
        autoSpeak: opts.autoSpeak ?? true,
      }
    );

    // 监听状态变化
    this._loop.on("statechange", (state) => {
      this._sendToRenderer("voice:stateChange", state);
    });

    // 监听识别结果
    this._loop.on("recognized", (text) => {
      this._sendToRenderer("voice:recognized", text);
    });

    // 监听 AI 响应
    this._loop.on("aiText", (text) => {
      this._sendToRenderer("voice:aiText", text);
    });

    // 监听 TTS 播放
    this._loop.on("speaking", () => {
      this._sendToRenderer("voice:ttsSpeak", "start");
    });

    // 监听错误
    this._loop.on("error", (err) => {
      console.error("[VoiceConversationManager] 对话错误:", err.message);
      this._sendToRenderer("voice:stateChange", "error");
    });

    // 监听超时
    this._loop.on("timeout", () => {
      console.log("[VoiceConversationManager] 对话超时");
    });

    // 监听完成
    this._loop.on("complete", () => {
      console.log("[VoiceConversationManager] 对话完成");
    });

    // 启动对话
    await this._loop.start();
    console.log("[VoiceConversationManager] 对话已启动");
  }

  /**
   * 停止语音对话
   */
  async stop() {
    if (!this._loop) return;

    try {
      await this._loop.stop();
      this._loop = null;
      console.log("[VoiceConversationManager] 对话已停止");
    } catch (err) {
      console.error("[VoiceConversationManager] 停止对话失败:", err.message);
    }
  }

  /**
   * 暂停语音对话
   */
  pause() {
    if (!this._loop) return;
    this._loop.pause();
    console.log("[VoiceConversationManager] 对话已暂停");
  }

  /**
   * 恢复语音对话
   */
  resume() {
    if (!this._loop) return;
    this._loop.resume();
    console.log("[VoiceConversationManager] 对话已恢复");
  }

  /**
   * 获取当前状态
   * @returns {string}
   */
  getState() {
    if (!this._loop) return "idle";
    return this._loop.getState();
  }

  /**
   * 处理音频能量数据
   * @param {number} rms - RMS 能量值
   */
  processAudioEnergy(rms) {
    if (!this._vad) return;
    this._vad.processAudio(rms);
  }

  /**
   * 发送消息到渲染进程
   * @param {string} channel - IPC 频道
   * @param {any} data - 数据
   */
  _sendToRenderer(channel, data) {
    const mainWindow = BrowserWindow.getAllWindows().find(
      (win) => !win.isDestroyed() && win.isVisible()
    );
    if (mainWindow) {
      mainWindow.webContents.send(channel, data);
    }
  }

  /**
   * 销毁管理器
   */
  destroy() {
    if (this._loop) {
      this._loop.stop().catch(() => {});
      this._loop = null;
    }
    if (this._vad) {
      this._vad.stop();
    }
    if (this._stt) {
      this._stt.destroy();
    }
    if (this._tts) {
      this._tts.destroy();
    }
    if (this._whisperSTT) {
      this._whisperSTT.destroy();
    }
    this._initialized = false;
    console.log("[VoiceConversationManager] 已销毁");
  }
}

// 创建单例
const voiceManager = new VoiceConversationManager();

/**
 * 注册语音对话 IPC 处理
 */
function registerVoiceIPCHandlers() {
  // 启动语音对话
  ipcMain.handle("voice:start", async (_event, opts) => {
    try {
      await voiceManager.start(opts);
      return { success: true };
    } catch (err) {
      console.error("[IPC] voice:start 失败:", err.message);
      return { success: false, error: err.message };
    }
  });

  // 停止语音对话
  ipcMain.handle("voice:stop", async () => {
    try {
      await voiceManager.stop();
      return { success: true };
    } catch (err) {
      console.error("[IPC] voice:stop 失败:", err.message);
      return { success: false, error: err.message };
    }
  });

  // 暂停语音对话
  ipcMain.handle("voice:pause", () => {
    try {
      voiceManager.pause();
      return { success: true };
    } catch (err) {
      console.error("[IPC] voice:pause 失败:", err.message);
      return { success: false, error: err.message };
    }
  });

  // 恢复语音对话
  ipcMain.handle("voice:resume", () => {
    try {
      voiceManager.resume();
      return { success: true };
    } catch (err) {
      console.error("[IPC] voice:resume 失败:", err.message);
      return { success: false, error: err.message };
    }
  });

  // 获取语音对话状态
  ipcMain.handle("voice:getState", () => {
    return voiceManager.getState();
  });

  // 处理音频能量数据
  ipcMain.on("voice:audioEnergy", (_event, rms) => {
    voiceManager.processAudioEnergy(rms);
  });

  // 处理音频 Blob（渲染进程录音 → 主进程 Whisper 识别）
  ipcMain.handle("voice:audioBlob", async (_event, arrayBuffer, mimeType) => {
    try {
      if (!arrayBuffer || !(arrayBuffer instanceof ArrayBuffer)) {
        return { success: false, error: "Invalid audio data: expected ArrayBuffer" };
      }

      // ArrayBuffer → Blob
      const blob = new Blob([arrayBuffer], { type: mimeType || "audio/webm" });

      if (blob.size === 0) {
        return { success: false, error: "Empty audio data" };
      }

      // 懒加载 WhisperSTTAdapter
      if (!voiceManager._whisperSTT) {
        return { success: false, error: "WhisperSTTAdapter not initialized" };
      }

      // 执行转录
      const result = await voiceManager._whisperSTT.transcribe(blob);

      return {
        success: true,
        text: result.text,
        confidence: result.confidence,
        language: result.language,
      };
    } catch (err) {
      console.error("[IPC] voice:audioBlob 转录失败:", err.message);
      return { success: false, error: err.message };
    }
  });

  // 获取语音指标
  ipcMain.handle("voice:getMetrics", () => {
    if (!voiceManager._whisperSTT) {
      return { stt: null, tts: null };
    }
    return {
      stt: voiceManager._whisperSTT.getMetrics(),
    };
  });

  // TTS 播放请求：广播给所有渲染窗口
  ipcMain.handle("speak-text", (_event, text, opts) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send("speak-request", text, opts);
      }
    }
    return { success: true };
  });

  console.log("[VoiceConversationManager] IPC 处理已注册");
}

module.exports = {
  VoiceConversationManager,
  voiceManager,
  registerVoiceIPCHandlers,
};
