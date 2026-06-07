/**
 * 云端沙箱 — 任务提交 & 状态查询 API（MVP）
 *
 * MVP 阶段：任务存入 SQLite，由外部 CloudExecutor 拉取执行。
 * 后续阶段：接入 CloudStudio，真正在云端执行。
 */

import { Hono } from "hono";
import { emitAppEvent } from "../app-events.js";
import { denyWithoutScope } from "../http/capability-guard.js";

const SQL_CREATE = `
  CREATE TABLE IF NOT EXISTS cloud_tasks (
    taskId       TEXT PRIMARY KEY,
    agentId       TEXT NOT NULL,
    sessionId     TEXT,
    prompt        TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending'
                  CHECK( status IN ('pending','running','done','error','cancelled') ),
    result         TEXT,
    error          TEXT,
    cloudWorkspaceId TEXT,
    submittedAt   TEXT NOT NULL DEFAULT (datetime('now') ),
    startedAt      TEXT,
    finishedAt     TEXT,
    createdAt      TEXT NOT NULL DEFAULT (datetime('now') )
  );
  CREATE INDEX IF NOT EXISTS idx_cloud_tasks_status  ON cloud_tasks(status);
  CREATE INDEX IF NOT EXISTS idx_cloud_tasks_agent  ON cloud_tasks(agentId);
`;

function ensureTable(db) {
  db.exec(SQL_CREATE);
}

function generateTaskId() {
  return 'tsk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function createCloudRoute(_engine) {
  const route = new Hono();
  const db = _engine.serverDb;
  ensureTable(db);

  // ── POST /api/cloud/tasks ──
  route.post('/api/cloud/tasks', async (c) => {
    const scopeDenied = denyWithoutScope(c, 'cloud.submit');
    if (scopeDenied) return scopeDenied;

    const body = await c.req.json().catch(() => ({}));
    const { prompt, agentId, sessionId } = body;
    if (!prompt || !prompt.trim()) {
      return c.json({ error: 'prompt is required' }, 400);
    }

    const taskId = generateTaskId();
    const now = new Date().toISOString();
    const resolvedAgentId = agentId || _engine.currentAgentId || 'hanako';

    const stmt = db.prepare(`
      INSERT INTO cloud_tasks (taskId, agentId, sessionId, prompt, status, submittedAt, createdAt)
      VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `);
    stmt.run(taskId, resolvedAgentId, sessionId || null, prompt.trim(), now, now);

    emitAppEvent(_engine, 'cloud-task-submitted', { taskId, agentId: resolvedAgentId });
    return c.json({ ok: true, taskId, status: 'pending' });
  });

  // ── GET /api/cloud/tasks/:taskId ──
  route.get('/api/cloud/tasks/:taskId', (c) => {
    const scopeDenied = denyWithoutScope(c, 'cloud.read');
    if (scopeDenied) return scopeDenied;

    const taskId = c.req.param('taskId');
    const row = db.prepare('SELECT * FROM cloud_tasks WHERE taskId = ?').get(taskId);
    if (!row) return c.json({ error: 'task not found' }, 404);

    const out = {
      taskId:        row.taskId,
      agentId:       row.agentId,
      sessionId:     row.sessionId,
      status:        row.status,
      result:        row.result        ? JSON.parse(row.result)  : null,
      error:         row.error         || null,
      cloudWorkspaceId: row.cloudWorkspaceId || null,
      submittedAt:  row.submittedAt,
      startedAt:     row.startedAt     || null,
      finishedAt:    row.finishedAt    || null,
      createdAt:     row.createdAt,
    };
    return c.json(out);
  });

  // ── GET /api/cloud/tasks ──
  route.get('/api/cloud/tasks', (c) => {
    const scopeDenied = denyWithoutScope(c, 'cloud.read');
    if (scopeDenied) return scopeDenied;

    const agentId = c.req.query('agentId') || _engine.currentAgentId || 'hanako';
    const status  = c.req.query('status') || '';
    const limitParam = c.req.query('limit');
    const limitStr = Array.isArray(limitParam) ? String(limitParam[0]) : (limitParam || '20');
    const limit = Math.min(parseInt(limitStr, 10) || 20, 100);

    let sql = 'SELECT taskId, agentId, status, submittedAt, finishedAt FROM cloud_tasks WHERE agentId = ?';
    const params = [agentId];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY submittedAt DESC LIMIT ?';
    params.push(limit);

    const rows = db.prepare(sql).all(...params);
    return c.json({ tasks: rows });
  });

  // ── PATCH /api/cloud/tasks/:taskId ──  (内部 CloudExecutor 回调）
  route.patch('/api/cloud/tasks/:taskId', async (c) => {
    // 内部回调不校验 scope，用独立 token 或信任内网调用
    const body = await c.req.json().catch(() => ({}));
    const { status, result, error, cloudWorkspaceId } = body;

    const now = new Date().toISOString();
    const updates = [];
    const params  = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
      if (status === 'running')  updates.push("startedAt = COALESCE(startedAt, ?)");
      if (status === 'done' || status === 'error') updates.push("finishedAt = COALESCE(finishedAt, ?)");
      params.push(now);
      if (status === 'done' || status === 'error') params.push(now);
    }
    if (result !== undefined)  { updates.push('result = ?');          params.push(JSON.stringify(result)); }
    if (error !== undefined)   { updates.push('error = ?');            params.push(error); }
    if (cloudWorkspaceId)   { updates.push('cloudWorkspaceId = ?'); params.push(cloudWorkspaceId); }

    if (!updates.length) return c.json({ ok: true });

    params.push(c.req.param('taskId'));
    db.prepare(`UPDATE cloud_tasks SET ${updates.join(', ')} WHERE taskId = ?`).run(...params);
    emitAppEvent(_engine, 'cloud-task-updated', { taskId: c.req.param('taskId'), status });
    return c.json({ ok: true });
  });

  return route;
}
