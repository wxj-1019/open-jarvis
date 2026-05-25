/**
 * GuiWhitelistDialog.tsx - GUI 白名单确认对话框
 *
 * 当 AI 尝试执行不在白名单中的 GUI 程序时，显示确认对话框询问用户是否添加。
 */

import React, { useState, useCallback } from 'react';
import { useStore } from '../stores';
import { hanaFetch } from '../hooks/use-hana-fetch';

interface GuiWhitelistRequest {
  executable: string;
  currentWhitelist: string[];
}

export function GuiWhitelistDialog() {
  const guiWhitelistRequest = useStore(s => s.guiWhitelistRequest);
  const [processing, setProcessing] = useState(false);

  const handleApprove = useCallback(async () => {
    if (!guiWhitelistRequest) return;
    setProcessing(true);
    
    try {
      await hanaFetch('/api/sandbox/gui-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executable: guiWhitelistRequest.executable,
          approved: true,
        }),
      });
    } catch (error) {
      console.error('[gui-whitelist] Failed to approve:', error);
    } finally {
      setProcessing(false);
      useStore.setState({ guiWhitelistRequest: null });
    }
  }, [guiWhitelistRequest]);

  const handleReject = useCallback(async () => {
    if (!guiWhitelistRequest) return;
    setProcessing(true);
    
    try {
      await hanaFetch('/api/sandbox/gui-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executable: guiWhitelistRequest.executable,
          approved: false,
        }),
      });
    } catch (error) {
      console.error('[gui-whitelist] Failed to reject:', error);
    } finally {
      setProcessing(false);
      useStore.setState({ guiWhitelistRequest: null });
    }
  }, [guiWhitelistRequest]);

  if (!guiWhitelistRequest) return null;

  return (
    <div className="gui-whitelist-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div className="gui-whitelist-dialog" style={{
        backgroundColor: 'var(--bg-surface)',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '400px',
        width: '90%',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 600 }}>
          允许程序显示窗口？
        </h2>
        <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)' }}>
          AI 助手尝试执行 <code style={{ backgroundColor: 'var(--bg-elevated)', padding: '2px 6px', borderRadius: '4px' }}>{guiWhitelistRequest.executable}</code>，但该程序不在 GUI 白名单中。
        </p>
        <div style={{ marginBottom: '16px' }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text-secondary)' }}>
            当前白名单：
          </p>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            {guiWhitelistRequest.currentWhitelist.map(name => (
              <li key={name} style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {name}
              </li>
            ))}
          </ul>
        </div>
        <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
          允许后，该程序可以在沙盒中显示窗口。
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            onClick={handleReject}
            disabled={processing}
            style={{
              padding: '8px 16px',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.6 : 1,
            }}
          >
            拒绝
          </button>
          <button
            onClick={handleApprove}
            disabled={processing}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              backgroundColor: 'var(--color-primary)',
              color: 'white',
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.6 : 1,
            }}
          >
            {processing ? '处理中...' : '允许并添加到白名单'}
          </button>
        </div>
      </div>
    </div>
  );
}
