/**
 * Scheduler — Heartbeat + Cron 调度（v2）
 *
 * Heartbeat：所有有 desk 的 agent 各自并行跑，不依赖焦点 agent
 * Cron：Studio 级任务列表统一调度，不随 active agent / workspace 切换而变化
 *
 * 通知策略：agent 自行决定是否调用 notify 工具，scheduler 不做通知判断。
 */

import fs from "fs";
import path from "path";
import { createHeartbeat } from "../lib/desk/heartbeat.js";
import { createCronScheduler } from "../lib/desk/cron-scheduler.js";
import { getLocale } from "../server/i18n.js";
import { createFreshCompactDailyScheduler } from "../lib/fresh-compact/daily-scheduler.js";
import { FreshCompactMaintainer } from "./fresh-compact-maintainer.js";
import { ProactiveRuleEngine } from "../lib/proactive/proactive-rule-engine.js";
import { DeepContextPipeline } from "../lib/context/deep-context-pipeline.js";
import { EventCaptureEngine } from "../lib/events/event-capture-engine.js";
import { BrowserContextAdapter } from "../lib/context/browser-context-adapter.js";
import { createModuleLogger } from "../lib/debug-log.js";
import { UsageStatistics } from "../lib/context/usage-statistics.js";
import { PatternMiner } from "../lib/context/pattern-miner.js";
import { TaskPredictor } from "../lib/context/task-predictor.js";
import { RuleSuggestionEngine } from "../lib/context/rule-suggestion-engine.js";
import { WindowEventsStore } from "../lib/db/window-events-store.js";
import { WORKSPACE_OUTPUT_ROOT_DIRNAME } from "../shared/workspace-output.js";

const log = createModuleLogger("scheduler");
const freshCompactLog = createModuleLogger("fresh-compact");

function normalizeCronExecutionContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      kind: "missing",
      cwd: null,
      workspaceFolders: [],
      sourceSessionPath: null,
    };
  }
  return {
    kind: typeof value.kind === "string" && value.kind.trim() ? value.kind.trim() : "session_workspace",
    cwd: typeof value.cwd === "string" && value.cwd.trim() ? value.cwd : null,
    workspaceFolders: Array.isArray(value.workspaceFolders)
      ? value.workspaceFolders.filter(p => typeof p === "string" && p.trim())
      : [],
    sourceSessionPath: typeof value.sourceSessionPath === "string" && value.sourceSessionPath.trim()
      ? value.sourceSessionPath
      : null,
  };
}

export class Scheduler {
  /**
   * @param {object} opts
   * @param {import('./index.js').Hub} opts.hub
   */
  constructor({ hub }) {
    this._hub = hub;
    this._heartbeats = new Map(); // agentId → heartbeat instance
    this._cronScheduler = null; // Studio CronScheduler
    this._executingJobs = new Map(); // jobId → AbortController（per-job 锁 + abort 控制）
    this._freshCompactMaintainer = new FreshCompactMaintainer({ hub });
    this._freshCompactScheduler = createFreshCompactDailyScheduler({
      runDaily: (opts) => this._freshCompactMaintainer.runDaily(opts),
      warn: (msg) => freshCompactLog.warn(msg),
    });
    this._ruleEngine = null; // 在 start() 中初始化（依赖 userContextTracker）
    this._deepContextPipeline = null; // 在 start() 中初始化
    this._richContextUnsubscriber = null;
    this._eventCaptureEngine = null; // 事件驱动捕获引擎（Phase 1）
    this._browserContextAdapter = null; // 浏览器扩展上下文（Phase 4）
    this._usageStats = null; // 使用统计（Phase 5）
    this._patternMiner = null; // 模式挖掘（Phase 5）
    this._taskPredictor = null; // 任务预测（Phase 5）
    this._ruleSuggestionEngine = null; // 规则建议（Phase 5）
    this._windowEventsStore = null; // 窗口事件存储（Phase 5）
    this._patternLearningTimer = null; // 模式学习定时器（Phase 5）
  }

  /** @returns {import('../core/engine.js').HanaEngine} */
  get _engine() { return this._hub.engine; }

  /** 获取某个 agent 的 heartbeat 实例 */
  getHeartbeat(agentId) {
    if (!agentId) return null;
    return this._heartbeats.get(agentId) ?? null;
  }

  /** 暴露 Studio cronScheduler（agentId 参数仅为兼容旧调用方） */
  getCronScheduler(agentId) {
    return this._cronScheduler ?? null;
  }

  // ──────────── 生命周期 ────────────

  start() {
    this.startHeartbeat();
    this._startStudioCron();
    this._freshCompactScheduler.start();
    this._subscribeOsEvents();
    this._startRuleEngine();
    this._startDeepContextPipeline();
    this._startEventCaptureEngine();
    this._startBrowserContextAdapter();
    this._startPatternLearning();
  }

  async stop() {
    this._stopBrowserContextAdapter();
    this._stopPatternLearning();
    this._stopEventCaptureEngine();
    this._stopDeepContextPipeline();
    this._stopRuleEngine();
    this._unsubscribeOsEvents();
    this._freshCompactScheduler.stop();
    await this.stopHeartbeat();
    if (this._cronScheduler) {
      await this._cronScheduler.stop();
      this._cronScheduler = null;
    }
  }

  /** 获取 ProactiveRuleEngine 实例 */
  get ruleEngine() { return this._ruleEngine; }

  /** 获取 TaskPredictor 实例（Phase 5） */
  get taskPredictor() { return this._taskPredictor; }

  /** 兼容旧 agent 生命周期调用：Studio cron 只有一个 scheduler */
  startAgentCron(agentId) { this._startStudioCron(); }

  /** 为指定 agent 启动 heartbeat（公共 API，供 createAgent 等场景使用） */
  startAgentHeartbeat(agentId, agent) {
    this._startAgentHeartbeat(agentId, agent);
  }

  /** 兼容旧 agent 生命周期调用：删除 agent 不停止 Studio cron scheduler */
  async removeAgentCron(agentId) {
    return undefined;
  }

  /** 重建 heartbeat（支持指定 agentId 或全量） */
  async reloadHeartbeat(agentId) {
    if (agentId) {
      await this.stopHeartbeat(agentId);
      const agent = this._engine.getAgent(agentId);
      if (agent) this._startAgentHeartbeat(agentId, agent);
      return;
    }
    await this.stopHeartbeat();
    this.startHeartbeat();
  }

  startHeartbeat() {
    for (const [agentId, agent] of this._engine.agents || []) {
      this._startAgentHeartbeat(agentId, agent);
    }
  }

  _startAgentHeartbeat(agentId, agent) {
    if (this._heartbeats.has(agentId)) return; // 幂等

    const engine = this._engine;
    const hbInterval = agent.config?.desk?.heartbeat_interval;
    const masterEnabled = engine.getHeartbeatMaster() !== false;
    const hbEnabled = masterEnabled && (agent.config?.desk?.heartbeat_enabled === true);
    // per-agent workspace（fallback: 主 agent → ~/Desktop）
    const getWorkspace = () => engine.getHomeCwd(agentId);
    const hb = createHeartbeat({
      getDeskFiles: async () => {
        try {
          const dir = getWorkspace();
          if (!dir) return [];
          let entries;
          try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
          catch { return []; }
          const items = await Promise.all(
            entries
              .filter(e => !e.name.startsWith(".") && e.name !== WORKSPACE_OUTPUT_ROOT_DIRNAME)
              .map(async (e) => {
                const fp = path.join(dir, e.name);
                let mtime = 0;
                try { mtime = (await fs.promises.stat(fp)).mtimeMs; } catch {}
                return { name: e.name, isDir: e.isDirectory(), mtime };
              })
          );
          return items;
        } catch { return []; }
      },
      getWorkspacePath: getWorkspace,
      getAgentName: () => agent.agentName,
      registryPath: path.join(agent.deskDir, "jian-registry.json"),
      overwatchPath: path.join(agent.deskDir, "overwatch.md"),
      // 巡检/笺巡检不传 withMemory：executeIsolated 默认走 agent.systemPrompt，
      // 而该 cache 始终按 master 开关构建，与 per-session 开关解耦。
      // 用户关 master 时自动不带记忆；只关某个 session 的开关不影响这里。
      onBeat: (prompt) => this._executeActivityForAgent(agentId, prompt, "heartbeat", null, {}),
      onJianBeat: (prompt, cwd) => {
        const isZh = getLocale().startsWith("zh");
        this._executeActivityForAgent(agentId, prompt, "heartbeat", `${isZh ? "笺" : "jian"}:${path.basename(cwd)}`, { cwd });
      },
      intervalMinutes: hbInterval,
      emitDevLog: (text, level) => engine.emitDevLog(text, level),
      locale: agent.config?.locale,
    });
    this._heartbeats.set(agentId, hb);
    if (hbEnabled) hb.start();
  }

  async stopHeartbeat(agentId) {
    if (agentId) {
      const hb = this._heartbeats.get(agentId);
      if (hb) { await hb.stop(); this._heartbeats.delete(agentId); }
      return;
    }
    // 并行停止所有 heartbeat，减少总关闭时间
    await Promise.all([...this._heartbeats.values()].map(hb => hb.stop()));
    this._heartbeats.clear();
  }

  // ──────────── Studio Cron ────────────

  _startStudioCron() {
    if (this._cronScheduler) return;
    const engine = this._engine;
    const cronStore = engine.getStudioCronStore?.();
    if (!cronStore) return;

    const sched = createCronScheduler({
      cronStore,
      executeJob: (job) => this._executeCronJob(job),
      abortJob: (jobId) => {
        const ac = this._executingJobs.get(jobId);
        if (ac) { ac.abort(); log.log(`cron abort ${jobId} (timeout)`); }
      },
      onJobDone: (job, result) => {
        this._hub.eventBus.emit(
          {
            type: "cron_job_done",
            jobId: job.id,
            label: job.label,
            agentId: job.actorAgentId,
            actorAgentId: job.actorAgentId,
            result,
          },
          null,
        );
      },
    });
    this._cronScheduler = sched;
    sched.start();
    log.log("Studio cron 已启动");
  }

  // ──────────── 执行 ────────────

  async _executeCronJob(job) {
    const actorAgentId = job.actorAgentId || job.legacyRef?.agentId || null;
    if (!actorAgentId) {
      throw new Error(`cron job ${job.id} missing actorAgentId`);
    }
    return this._executeCronJobForAgent(actorAgentId, job);
  }

  /**
   * 执行某个 agent 的 cron 任务（active 或非 active 均可）
   * 同一 agent 同时只运行一个 cron，防止并发写冲突
   */
  async _executeCronJobForAgent(agentId, job) {
    // per-job 锁：同一 job 不并发，但同一 agent 的不同 job 可以并行
    if (this._executingJobs.has(job.id)) {
      log.log(`cron 跳过 ${job.id}：上一次仍在执行`);
      const err = new Error(`cron job ${job.id} 仍在执行，跳过`);
      err.skipped = true;
      throw err;
    }
    const ac = new AbortController();
    this._executingJobs.set(job.id, ac);
    try {
      const isZh = getLocale().startsWith("zh");
      const prompt = isZh
        ? [
            `[定时任务 ${job.id}: ${job.label}]`,
            "",
            "**注意：这是系统自动触发的定时任务，不是用户发来的。**",
            "**不要在执行过程中创建新的定时任务。**",
            "",
            job.prompt,
          ].join("\n")
        : [
            `[Cron job ${job.id}: ${job.label}]`,
            "",
            "**Note: This is an automated cron job, NOT a user message.**",
            "**Do not create new cron jobs during execution.**",
            "",
            job.prompt,
          ].join("\n");
      await this._executeActivityForAgent(agentId, prompt, "cron", job.label, {
        model: job.model || undefined,
        signal: ac.signal,
        ...this._cronExecutionOptions(job),
      });
    } finally {
      this._executingJobs.delete(job.id);
    }
  }

  _cronExecutionOptions(job) {
    const ctx = normalizeCronExecutionContext(job.executionContext);
    const opts = {};
    if (ctx.cwd) opts.cwd = ctx.cwd;
    opts.workspaceFolders = ctx.workspaceFolders;
    if (ctx.sourceSessionPath) opts.parentSessionPath = ctx.sourceSessionPath;
    return opts;
  }

  /**
   * 执行活动（任意 agent，统一走 executeIsolated）
   */
  async _executeActivityForAgent(agentId, prompt, type, label, opts = {}) {
    const engine = this._engine;
    await engine.ensureAgentRuntime?.(agentId, {
      priority: "background",
      reason: type,
    });
    const agentDir = path.join(engine.agentsDir, agentId);
    const activityDir = path.join(agentDir, "activity");
    const startedAt = Date.now();
    const id = `${type === "heartbeat" ? "hb" : "cron"}_${startedAt}`;

    // 所有 agent 统一走 executeIsolated（支持 agentId + signal 参数）
    const { signal, ...restOpts } = opts;
    const result = await engine.executeIsolated(prompt, {
      agentId,
      persist: activityDir,
      signal,
      activityType: type,
      ...restOpts,
    });
    const { sessionPath, error } = result;

    const finishedAt = Date.now();
    const failed = !!error;

    // 取 agentName（从长驻实例获取，fallback agentId）
    const ag = engine.getAgent(agentId);
    const agentName = ag?.agentName || agentId;

    // 生成摘要
    let summary = null;
    if (typeof sessionPath === "string" && sessionPath) {
      try {
        summary = await engine.summarizeActivity(sessionPath, undefined, { agentId });
      } catch {}
    }

    const entry = {
      id,
      type,
      label: label || null,
      agentId,
      agentName,
      startedAt,
      finishedAt,
      summary: (() => {
        const isZhS = getLocale().startsWith("zh");
        const hbLabel = isZhS ? "日常巡检" : "routine patrol";
        const cronLabel = isZhS ? "定时任务" : "cron job";
        const failSuffix = isZhS ? "执行失败" : "execution failed";
        if (failed) return `${label || (type === "heartbeat" ? hbLabel : cronLabel)} ${failSuffix}`;
        return summary || (type === "heartbeat" ? hbLabel : (label || cronLabel));
      })(),
      sessionFile: typeof sessionPath === "string" ? path.basename(sessionPath) : null,
      status: failed ? "error" : "done",
      error: error || null,
    };

    // 写入对应 agent 的 ActivityStore
    engine.getActivityStore(agentId).add(entry);

    // WS 广播
    this._hub.eventBus.emit({ type: "activity_update", activity: entry }, null);

    if (failed) {
      const isZhR = getLocale().startsWith("zh");
      const reason = error || (isZhR ? "后台任务未生成 session" : "background task produced no session");
      engine.emitDevLog(`[${type}] ${label || "后台任务"} 失败: ${reason}`, "error");
      throw new Error(reason);
    }

    engine.emitDevLog(`活动记录: ${entry.summary}`, "heartbeat");
  }

  // ──────────── OS 事件订阅 ────────────

  _subscribeOsEvents() {
    const bus = this._hub.eventBus;
    if (!bus) return;
    this._osSubscriptions = [
      bus.subscribe(this._onWindowFocusChanged.bind(this), {
        types: ["window_focus_changed"],
      }),
      bus.subscribe(this._onFileSystemChanged.bind(this), {
        types: ["file_system_changed"],
      }),
      bus.subscribe(this._onUserContextChanged.bind(this), {
        types: ["window_focus_changed", "file_system_changed"],
      }),
    ];
  }

  _unsubscribeOsEvents() {
    if (this._osSubscriptions) {
      this._osSubscriptions.forEach((unsub) => unsub());
      this._osSubscriptions = null;
    }
  }

  /**
   * 窗口焦点变化处理
   * 当前阶段仅记录日志，实际规则留给 ProactiveRuleEngine
   * @param {object} event { type, app, title, platform, timestamp }
   */
  _onWindowFocusChanged(event) {
    log.log(`窗口焦点变化: ${event.app} - ${event.title}`);
  }

  /**
   * 文件系统变化处理
   * 文件变化时触发对应 agent 的按需巡检（Jian Beat）
   * @param {object} event { type, path, event: "add"|"change"|"unlink", timestamp }
   */
  _onFileSystemChanged(event) {
    const agentId = this._resolveWorkspaceAgent(event.path);
    if (!agentId) return;

    // 防抖：同一 agent 2s 内只触发一次
    if (!this._pendingJianAgents) this._pendingJianAgents = new Set();
    if (this._pendingJianAgents.has(agentId)) return;
    this._pendingJianAgents.add(agentId);

    setTimeout(() => {
      this._pendingJianAgents.delete(agentId);
      const hb = this._heartbeats.get(agentId);
      if (hb && hb.triggerJianBeat) {
        hb.triggerJianBeat(event.path);
      }
    }, 2000);
  }

  /**
   * 用户上下文变化处理
   * 现已由 ProactiveRuleEngine 接管，此处仅保留日志
   * @param {object} event { type, ... }
   */
  _onUserContextChanged(event) {
    // 规则引擎已在 _startRuleEngine 中独立订阅 EventBus
    // 此处仅做日志（保持向后兼容）
    switch (event.type) {
      case "window_focus_changed":
        log.log(`[context] 窗口切换: ${event.app} - ${event.title}`);
        break;
      case "file_system_changed":
        log.log(`[context] 文件变化: ${event.path} (${event.event})`);
        break;
    }
  }

  // ──────────── ProactiveRuleEngine 集成 ────────────

  /**
   * 启动规则引擎（Scheduler.start 中调用）
   */
  _startRuleEngine() {
    const hub = this._hub;
    const engine = this._engine;
    if (!hub?.eventBus) return;

    // 从 preferences 加载自定义规则
    let customRules = [];
    let builtinOverrides = {};
    try {
      const prefs = engine.preferences;
      if (prefs && typeof prefs.getProactiveRules === "function") {
        customRules = prefs.getProactiveRules();
      }
      // 加载内置规则 enabled 覆盖
      const allPrefs = prefs ? prefs.getPreferences() : {};
      builtinOverrides = allPrefs.proactive_builtin_overrides || {};
    } catch { /* ignore */ }

    this._ruleEngine = new ProactiveRuleEngine({
      eventBus: hub.eventBus,
      userContextTracker: hub.userContextTracker || null,
      executeAction: (prompt, meta) => this._executeProactiveAction(prompt, meta),
      customRules,
      builtinOverrides,
    });
    this._ruleEngine.start();
  }

  /**
   * 停止规则引擎
   */
  _stopRuleEngine() {
    if (this._ruleEngine) {
      this._ruleEngine.stop();
      this._ruleEngine = null;
    }
  }

  // ──────────── DeepContextPipeline 集成 ────────────

  /**
   * 启动深度上下文管道
   */
  _startDeepContextPipeline() {
    const hub = this._hub;
    if (!hub?.eventBus) return;

    // 从 preferences 读取隐私级别
    let privacyLevel = "standard";
    try {
      const prefs = this._engine.preferences;
      if (prefs && typeof prefs.get === "function") {
        privacyLevel = prefs.get("context_privacy") || "standard";
      }
    } catch { /* ignore */ }

    this._deepContextPipeline = new DeepContextPipeline({
      eventBus: hub.eventBus,
      options: { privacyLevel },
    });
    this._deepContextPipeline.start();

    // 事件驱动同步：监听 rich_context_changed 事件
    if (hub.userContextTracker) {
      const tracker = hub.userContextTracker;
      this._richContextUnsubscriber = hub.eventBus.subscribe(
        (event) => {
          tracker.setRichContext(event.context);
        },
        { types: ["rich_context_changed"] },
      );
    }

    log.log("深度上下文管道已启动 (privacy: %s)", privacyLevel);
  }

  /**
   * 停止深度上下文管道
   */
  _stopDeepContextPipeline() {
    if (this._richContextUnsubscriber) {
      this._richContextUnsubscriber();
      this._richContextUnsubscriber = null;
    }
    if (this._deepContextPipeline) {
      this._deepContextPipeline.stop();
      this._deepContextPipeline = null;
    }
  }

  /** 获取 DeepContextPipeline 实例 */
  get deepContextPipeline() { return this._deepContextPipeline; }

  // ──────────── EventCaptureEngine 集成 ────────────

  /**
   * 启动事件捕获引擎
   */
  _startEventCaptureEngine() {
    if (this._eventCaptureEngine) return;

    this._eventCaptureEngine = new EventCaptureEngine({
      platform: process.platform,
      useNative: false, // 当前使用 polling fallback，native addon 就绪后切换
    });

    // 将捕获事件转发到 EventBus（保持与现有 OSEventSource 兼容）
    this._eventCaptureEngine.on("event", (event) => {
      this._hub.eventBus.emit(
        {
          type: "capture_app_switch",
          app: event.app,
          title: event.title,
          prevApp: event.prevApp,
          platform: event.platform,
          timestamp: event.timestamp,
        },
        null,
      );
    });

    this._eventCaptureEngine.start().catch((err) => {
      log.warn(`EventCaptureEngine 启动失败: ${err.message}`);
    });

    log.log("EventCaptureEngine 已启动 (fallback mode)");
  }

  /**
   * 停止事件捕获引擎
   */
  _stopEventCaptureEngine() {
    if (this._eventCaptureEngine) {
      this._eventCaptureEngine.stop().catch(() => {});
      this._eventCaptureEngine = null;
    }
  }

  // ──────────── BrowserContextAdapter 集成 ────────────

  /**
   * 启动浏览器扩展上下文适配器
   */
  _startBrowserContextAdapter() {
    if (this._browserContextAdapter) return;

    this._browserContextAdapter = new BrowserContextAdapter();
    this._browserContextAdapter.on("context", (context) => {
      this._hub.eventBus.emit({
        type: "browser_context_changed",
        ...context,
      }, null);
    });
    this._browserContextAdapter.start();

    log.log("BrowserContextAdapter 已启动");
  }

  /**
   * 停止浏览器扩展上下文适配器
   */
  _stopBrowserContextAdapter() {
    if (this._browserContextAdapter) {
      this._browserContextAdapter.stop();
      this._browserContextAdapter = null;
    }
  }

  // ──────────── Proactive Action ────────────

  /**
   * 执行主动动作：触发 Agent 会话
   * @param {string} prompt
   * @param {object} meta  { ruleId, ruleName, event }
   */
  _executeProactiveAction(prompt, meta) {
    const engine = this._engine;
    if (!engine) return;

    const agentId = engine.currentAgentId;
    const cwd = agentId ? engine.getHomeCwd?.(agentId) : null;

    log.log(`[proactive] 规则 ${meta?.ruleId} 触发 Agent 动作`);

    // 使用 executeIsolated（ephemeral 模式，不阻塞用户当前会话）
    // persist 参数需要是字符串路径（目录），传 falsy 则使用 .ephemeral 默认目录
    engine.executeIsolated(prompt, {
      cwd: cwd || undefined,
    }).catch((err) => {
      log.warn(`[proactive] 动作执行失败: ${err.message}`);
    });
  }

  /**
   * 根据文件路径确定所属 agent
   * @param {string} filePath
   * @returns {string|null}
   */
  _resolveWorkspaceAgent(filePath) {
    if (!filePath) return null;
    const engine = this._engine;
    const agents = engine.agents;
    if (!agents) return null;
    for (const [agentId] of agents) {
      const cwd = engine.getHomeCwd?.(agentId);
      if (cwd && filePath.startsWith(cwd)) return agentId;
    }
    return null;
  }

  // ──────────── Pattern Learning（Phase 5）────────────

  /**
   * 启动行为模式学习
   * 每小时运行一次模式挖掘，分析最近 7 天的窗口事件
   */
  _startPatternLearning() {
    if (this._patternMiner) return; // 幂等

    try {
      // 尝试初始化 WindowEventsStore（依赖 better-sqlite3 数据库实例）
      // 如果数据库不可用则跳过，不阻塞 Scheduler 启动
      const db = this._engine.getDb?.();
      if (!db) {
        log.log("Pattern Learning 跳过: 数据库不可用");
        return;
      }

      this._windowEventsStore = new WindowEventsStore(db);
      this._windowEventsStore.init();

      this._patternMiner = new PatternMiner();
      this._taskPredictor = new TaskPredictor();
      this._ruleSuggestionEngine = new RuleSuggestionEngine();
      this._usageStats = new UsageStatistics({ store: this._windowEventsStore });

      // 每小时运行一次模式分析
      this._patternLearningTimer = setInterval(() => {
        this._runPatternAnalysis().catch((err) => {
          log.warn(`Pattern analysis failed: ${err.message}`);
        });
      }, 3600000);

      log.log("Pattern Learning 已启动 (hourly)");
    } catch (err) {
      log.warn(`Pattern Learning 启动失败: ${err.message}`);
    }
  }

  /**
   * 停止行为模式学习
   */
  _stopPatternLearning() {
    if (this._patternLearningTimer) {
      clearInterval(this._patternLearningTimer);
      this._patternLearningTimer = null;
    }
    this._usageStats = null;
    this._patternMiner = null;
    this._taskPredictor = null;
    this._ruleSuggestionEngine = null;
    this._windowEventsStore = null;
  }

  /**
   * 运行模式分析
   * 1. 获取最近 7 天事件
   * 2. 挖掘频繁模式 + 周期性模式
   * 3. 训练预测模型
   * 4. 生成规则建议并发射到 EventBus
   */
  async _runPatternAnalysis() {
    const store = this._windowEventsStore;
    if (!store) return;

    try {
      const now = Date.now();
      const weekAgo = now - 7 * 86400000;
      const events = store.queryRange(weekAgo, now);

      if (events.length < 10) {
        log.log(`Pattern analysis skipped: only ${events.length} events`);
        return;
      }

      // 挖掘模式
      const patterns = this._patternMiner.findFrequentPatterns(events, 2);
      const periodicPatterns = this._patternMiner.findPeriodicPatterns(events);

      // 训练预测模型
      this._taskPredictor.train(events);

      // 生成规则建议
      const allPatterns = [...patterns, ...periodicPatterns];
      const suggestions = this._ruleSuggestionEngine.generateSuggestions(allPatterns, 5);

      // 发射到 EventBus
      const bus = this._hub.eventBus;
      if (bus) {
        for (const suggestion of suggestions) {
          bus.emit({
            type: "rule_suggestion",
            ...suggestion,
          }, null);
        }
      }

      log.log(`Pattern analysis done: ${allPatterns.length} patterns, ${suggestions.length} suggestions`);
    } catch (err) {
      log.warn(`Pattern analysis error: ${err.message}`);
    }
  }

}
