/**
 * GuiWhitelistDialog.tsx - GUI 白名单请求对话框
 * 
 * 当沙盒遇到不在白名单中的程序时，显示确认对话框
 * 用户可以选择批准或拒绝该程序添加到白名单
 */

import React, { useState } from 'react';
import { useStore } from '../stores';
import { hanaFetch } from '../hooks/use-hana-fetch';

export const GuiWhitelistDialog: React.FC = () => {
  const request = useStore(s => s.guiWhitelistRequest);
  const [showDetails, setShowDetails] = useState(false);

  if (!request) {
    return null;
  }

  const handleApprove = async () => {
    try {
      await hanaFetch('/api/sandbox/gui-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executable: request.executable,
          approved: true,
        }),
      });
    } catch (err) {
      console.error('[GuiWhitelistDialog] Failed to approve:', err);
    } finally {
      useStore.setState({ guiWhitelistRequest: null });
    }
  };

  const handleDeny = async () => {
    try {
      await hanaFetch('/api/sandbox/gui-whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          executable: request.executable,
          approved: false,
        }),
      });
    } catch (err) {
      console.error('[GuiWhitelistDialog] Failed to deny:', err);
    } finally {
      useStore.setState({ guiWhitelistRequest: null });
    }
  };

  return (
    <div className="gui-whitelist-dialog-overlay">
      <div className="gui-whitelist-dialog">
        <div className="dialog-header">
          <h3>🔒 沙盒安全提示</h3>
          <button 
            className="close-btn" 
            onClick={handleDeny}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="dialog-body">
          <p className="dialog-message">
            Agent 尝试运行不在白名单中的程序：
          </p>
          
          <div className="executable-name">
            <code>{request.executable}</code>
          </div>

          <p className="dialog-question">
            是否允许该程序在沙盒中运行？
          </p>

          <button
            className="toggle-details"
            onClick={() => setShowDetails(!showDetails)}
          >
            {showDetails ? '隐藏' : '查看'}当前白名单 ({request.currentWhitelist.length} 个程序)
          </button>

          {showDetails && (
            <div className="whitelist-details">
              <h4>当前白名单：</h4>
              <ul>
                {request.currentWhitelist.map((exe) => (
                  <li key={exe}><code>{exe}</code></li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="dialog-actions">
          <button 
            className="btn btn-deny" 
            onClick={handleDeny}
          >
            拒绝
          </button>
          <button 
            className="btn btn-approve" 
            onClick={handleApprove}
          >
            允许运行
          </button>
        </div>

        <div className="dialog-footer">
          <p>
            ⚠️ 允许后，该程序将被添加到沙盒白名单，可以在当前会话中运行。
          </p>
        </div>
      </div>
    </div>
  );
};

export default GuiWhitelistDialog;
