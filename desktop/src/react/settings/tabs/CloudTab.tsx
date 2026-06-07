/**
 * CloudTab.tsx — 云端沙箱设置面板
 * Apple Liquid Glass 设计风格 · CSS Modules · 完整三态覆盖
 */
import { useState, useCallback, useRef } from 'react';
import { StepContainer } from './Steps/StepContainer';
import { t } from '@/i18n';
import styles from './CloudTab.module.css';

type TaskStatus = 'pending' | 'running' | 'done' | 'error' | 'cancelled' | '';

interface TaskInfo {
  taskId: string;
  status: TaskStatus;
  result?: string;
  error?: string;
}

export function CloudTab() {
  const [cloudEnabled, setCloudEnabled] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [task, setTask] = useState<TaskInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const submitTask = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    clearPoll();

    try {
      const res = await fetch('/api/cloud/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: trimmed }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      if (!data.taskId) {
        throw new Error('No taskId returned');
      }

      setTask({ taskId: data.taskId, status: 'pending' });
      setPrompt(''); // clear input after submit

      // Start polling
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/cloud/tasks/${data.taskId}`);
          if (!r.ok) return;
          const d = await r.json();
          setTask(prev => prev?.taskId === d.taskId
            ? { taskId: d.taskId, status: d.status || '', result: d.result, error: d.error }
            : prev
          );
          if (['done', 'error', 'cancelled'].includes(d.status)) {
            clearPoll();
          }
        } catch {
          // Silently retry on next interval
        }
      }, 3000);
    } catch (err: any) {
      setError(err?.message || 'submit failed');
      setTask(null);
    } finally {
      setLoading(false);
    }
  }, [prompt, loading, clearPoll]);

  // Cleanup on unmount
  // (handled via useRef pattern — real cleanup via useEffect if needed)

  const statusBadgeClass = (() => {
    switch (task?.status) {
      case 'pending': return styles.statusPending;
      case 'running': return styles.statusRunning;
      case 'done':    return styles.statusDone;
      case 'error':
      case 'cancelled': return styles.statusError;
      default:        return styles.statusPending;
    }
  })();

  const statusLabel = (() => {
    switch (task?.status) {
      case 'pending':   return '⏳ Pending';
      case 'running':   return '🔄 Running';
      case 'done':      return '✅ Done';
      case 'error':     return '❌ Error';
      case 'cancelled': return '⊘ Cancelled';
      default:          return task?.status || '...';
    }
  })();

  return (
    <StepContainer title={t('settings.cloud.title')} description={t('settings.cloud.description')}>
      <div className={styles.root}>

        {/* ── Toggle Row ── */}
        <div className={styles.toggleRow} onClick={() => setCloudEnabled(v => !v)}>
          <div style={{ flex: 1 }}>
            <div className={styles.toggleLabel}>{t('settings.cloud.enable')}</div>
            <div className={styles.toggleDesc}>
              {cloudEnabled ? '云端沙箱已激活，任务将在后台执行' : '开启后 Agent 可在云端执行任务'}
            </div>
          </div>
          <input
            type="checkbox"
            className={styles.toggleSwitch}
            checked={cloudEnabled}
            onChange={e => setCloudEnabled(e.target.checked)}
            aria-label={t('settings.cloud.enable')}
          />
        </div>

        {/* ── Configuration Panel ── */}
        {cloudEnabled && (
          <div className={styles.configPanel}>

            {/* API Endpoint */}
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('settings.cloud.endpoint')}</span>
              <input
                type="text"
                className={styles.fieldInput}
                placeholder="https://your-cloud-api.example.com"
                value={endpoint}
                onChange={e => setEndpoint(e.target.value)}
              />
            </div>

            {/* API Key */}
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>API Key</span>
              <input
                type="password"
                className={styles.fieldInput}
                placeholder={t('settings.cloud.apiKeyPlaceholder') || '可选'}
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
              />
            </div>

            {/* Test Task */}
            <div className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>{t('settings.cloud.testTask')}</span>
              <textarea
                className={styles.fieldTextarea}
                rows={3}
                placeholder={t('settings.cloud.promptPlaceholder') || '输入任务描述…'}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => {
                  // Ctrl+Enter to submit
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submitTask();
                  }
                }}
              />
              <div className={styles.submitRow}>
                <button
                  type="button"
                  className={styles.submitBtn}
                  onClick={submitTask}
                  disabled={loading || !prompt.trim()}
                >
                  {loading && <span className={styles.spinner} />}
                  {loading ? '提交中…' : t('settings.cloud.submit')}
                </button>
                {!loading && prompt.trim() && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    Ctrl+Enter 快速提交
                  </span>
                )}
              </div>
            </div>

            {/* ── Error state ── */}
            {error && (
              <div className={styles.errorCard}>
                <span className={styles.errorIcon}>⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* ── Task status card ── */}
            {task && (
              <div className={styles.statusCard}>
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>Task ID</span>
                  <span className={styles.statusValue}>{task.taskId}</span>
                </div>
                <div className={styles.statusRow}>
                  <span className={styles.statusLabel}>{t('settings.cloud.status')}</span>
                  <span className={statusBadgeClass}>
                    {task.status === 'running' && <span className={styles.breathingDot} />}
                    {statusLabel}
                  </span>
                </div>

                {/* Result content */}
                {task.status === 'done' && task.result && (
                  <div className={styles.resultContent}>{task.result}</div>
                )}
                {task.status === 'error' && task.error && (
                  <div className={styles.resultContent} style={{ color: '#dc2626' }}>
                    {task.error}
                  </div>
                )}
              </div>
            )}

            {/* ── Empty state (no task yet) ── */}
            {!task && !loading && !error && (
              <div className={styles.emptyHint}>
                <div className={styles.emptyIcon}>☁</div>
                <p className={styles.emptyText}>
                  输入任务描述后点击提交，任务将在云端沙箱中执行
                </p>
              </div>
            )}

            {/* ── Loading state (submitting) ── */}
            {loading && !task && (
              <div className={styles.loadingShimmer}>
                <div className={styles.loadingDots}>
                  <span className={styles.loadingDot} />
                  <span className={styles.loadingDot} />
                  <span className={styles.loadingDot} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Disabled empty hint ── */}
        {!cloudEnabled && (
          <div className={styles.emptyHint}>
            <div className={styles.emptyIcon}>🔒</div>
            <p className={styles.emptyText}>
              开启云端沙箱模式，让 Agent 在后台持续执行任务
            </p>
          </div>
        )}
      </div>
    </StepContainer>
  );
}
