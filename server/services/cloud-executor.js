/**
 * CloudExecutor — 云端任务执行引擎（Phase 2 MVP）
 *
 * 职责：
 * 1. 轮询 cloud_tasks 表中 status='pending' 的任务
 * 2. 按顺序执行任务（MVP 串行，后续可并行）
 * 3. 更新任务状态：pending → running → done/error
 * 4. 存储执行结果到 cloud_tasks 表
 *
 * 后续接入 CloudStudio：
 *   - 创建 CloudStudio 工作空间
 *   - 在云端执行任务
 *   - 拉取执行结果
 */

import { emitAppEvent } from '../app-events.js';

const POLL_INTERVAL_MS = 10_000;  // 每 10 秒轮询一次
const MAX_CONCURRENT   = 1;         // MVP 串行执行

export class CloudExecutor {
  /**
   * @param {Object} opts
   * @param {Object} opts.engine  - HanaEngine 实例
   * @param {Object} opts.db      - better-sqlite3 实例
   * @param {Function} [opts.onLog] - 可选日志回调
   */
  constructor({ engine, db, onLog }) {
    this._engine  = engine;
    this._db      = db;
    this._onLog   = onLog || (() => {});
    this._timer   = null;
    this._running  = new Map();   // taskId → AbortController
    this._active  = false;
  }

  /* ------------------------------------------------------------------ */
  /* 生命周期                                                            */
  /* ------------------------------------------------------------------ */

  start() {
    if (this._active) return;
    this._active = true;
    this._log('CloudExecutor started');
    this._scheduleNext();
  }

  stop() {
    if (!this._active) return;
    this._active = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    // 中止所有正在执行的任务
    for (const [, ac] of this._running) {
      ac.abort();
    }
    this._running.clear();
    this._log('CloudExecutor stopped');
  }

  /* ------------------------------------------------------------------ */
  /* 轮询调度                                                            */
  /* ------------------------------------------------------------------ */

  _scheduleNext() {
    if (!this._active) return;
    this._timer = setTimeout(() => this._poll(), POLL_INTERVAL_MS);
  }

  async _poll() {
    if (!this._active) return;
    try {
      const tasks = this._fetchPendingTasks();
      for (const task of tasks) {
        if (!this._active) break;
        // MVP：超过最大并发数则停止拉取
        if (this._running.size >= MAX_CONCURRENT) break;
        this._executeTask(task).catch(err => {
          this._log(`Task ${task.taskId} failed: ${err.message}`);
        });
      }
    } catch (err) {
      this._log(`Poll error: ${err.message}`);
    } finally {
      this._scheduleNext();
    }
  }

  /* ------------------------------------------------------------------ */
  /* 获取待执行任务                                                      */
  /* ------------------------------------------------------------------ */

  _fetchPendingTasks() {
    return this._db
      .prepare(`SELECT * FROM cloud_tasks WHERE status = 'pending' ORDER BY submittedAt ASC LIMIT ?`)
      .all(MAX_CONCURRENT - this._running.size);
  }

  /* ------------------------------------------------------------------ */
  /* 执行单个任务                                                        */
  /* ------------------------------------------------------------------ */

  async _executeTask(task) {
    const ac = new AbortController();
    this._running.set(task.taskId, ac);

    try {
      this._log(`Executing task ${task.taskId}: ${task.prompt.slice(0, 60)}...`);
      this._updateStatus(task.taskId, 'running');

      /* ── MVP：本地执行 ── */
      const result = await this._executeLocally(task, ac.signal);

      /* ── 后续 Phase 2 真·云端执行 ──
      const result = await this._executeOnCloudStudio(task, ac.signal);
      */

      this._storeResult(task.taskId, result, null);
      this._log(`Task ${task.taskId} done`);
      emitAppEvent(this._engine, 'cloud-task-updated', { taskId: task.taskId, status: 'done' });
    } catch (err) {
      if (err.name === 'AbortError') {
        this._log(`Task ${task.taskId} cancelled`);
        this._updateStatus(task.taskId, 'cancelled');
      } else {
        this._log(`Task ${task.taskId} error: ${err.message}`);
        this._storeResult(task.taskId, null, err.message);
        emitAppEvent(this._engine, 'cloud-task-updated', { taskId: task.taskId, status: 'error' });
      }
    } finally {
      this._running.delete(task.taskId);
    }
  }

  /* ------------------------------------------------------------------ */
  /* MVP：本地执行（复用 engine.executeIsolated）                        */
  /* ------------------------------------------------------------------ */

  async _executeLocally(task, signal) {
    const agentId = task.agentId || 'hanako';
    const prompt  = task.prompt;

    // 确保 Agent 运行时已初始化
    await this._engine.ensureAgentRuntime?.(agentId, { priority: 'background', reason: 'cloud-task' });

    // 使用 executeIsolated 在隔离 session 中执行
    const result = await this._engine.executeIsolated(prompt, {
      agentId,
      signal,
      activityType: 'cloud-task',
      // 不持久化到主会话
      persist: null,
    });

    return { reply: result };
  }

  /* ------------------------------------------------------------------ */
  /* TODO：CloudStudio 云端执行（Phase 2 后续）                          */
  /* ------------------------------------------------------------------ */

  /*
  async _executeOnCloudStudio(task, signal) {
    // 1. 调用 CloudStudio API 创建 workspace
    const workspaceId = await this._createCloudStudioWorkspace(task);
    this._db.prepare(`UPDATE cloud_tasks SET cloudWorkspaceId = ? WHERE taskId = ?`)
      .run(workspaceId, task.taskId);

    // 2. 上传任务上下文（工作空间文件、记忆等）
    await this._uploadTaskContext(workspaceId, task, signal);

    // 3. 在 CloudStudio workspace 中启动 Agent 执行
    const executionId = await this._startCloudExecution(workspaceId, task, signal);

    // 4. 轮询执行状态，获取结果
    const result = await this._pollCloudExecution(workspaceId, executionId, signal);

    // 5. 清理（可选）
    // await this._cleanupCloudWorkspace(workspaceId);

    return result;
  }

  async _createCloudStudioWorkspace(task) {
    // TODO: 调用 CloudStudio Open API
    // https://docs.cloudstudio.net/docs/developer/api/workspace/create
    throw new Error('CloudStudio integration not yet implemented');
  }
  */

  /* ------------------------------------------------------------------ */
  /* 数据库更新辅助                                                        */
  /* ------------------------------------------------------------------ */

  _updateStatus(taskId, status) {
    const now = new Date().toISOString();
    if (status === 'running') {
      const sql = `UPDATE cloud_tasks SET status = ?, startedAt = COALESCE(startedAt, ?) WHERE taskId = ?`;
      this._db.prepare(sql).run(status, now, taskId);
    } else {
      const sql = `UPDATE cloud_tasks SET status = ?, finishedAt = COALESCE(finishedAt, ?) WHERE taskId = ?`;
      this._db.prepare(sql).run(status, now, taskId);
    }
  }

  _storeResult(taskId, result, error) {
    const now = new Date().toISOString();
    this._db.prepare(
      `UPDATE cloud_tasks SET status = ?, result = ?, error = ?, finishedAt = COALESCE(finishedAt, ?) WHERE taskId = ?`
    ).run(
      error ? 'error' : 'done',
      result ? JSON.stringify(result) : null,
      error || null,
      now,
      taskId
    );
  }

  /* ------------------------------------------------------------------ */
  /* 工具                                                                */
  /* ------------------------------------------------------------------ */

  _log(msg) {
    this._onLog(`[cloud-executor] ${msg}`);
  }
}
