/**
 * UserMessage — 用户消息气泡
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Columns, Folder, File, Copy, ArrowsClockwise, PencilSimple, Check, X, StarFour } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { MarkdownContent } from './MarkdownContent';
import { MessageFooterActions, formatMessageTime, type MessageFooterAction } from './MessageFooterActions';
import { AttachmentChip } from '../shared/AttachmentChip';
import type { ChatMessage, UserAttachment, DeskContext } from '../../stores/chat-types';
import { useStore } from '../../stores';
import { selectIsStreamingSession, selectSelectedIdsBySession } from '../../stores/session-selectors';
import { extractSelectedTexts } from '../../utils/message-text';
import { openFilePreview } from '../../utils/file-preview';
import { isImageOrSvgExt, extOfName } from '../../utils/file-kind';
import { getUserAttachmentImageSrc } from '../../utils/user-attachment-media';
import { AgentAvatar, resolveAgentDisplayInfo } from '../../utils/agent-display';
import { replayLatestUserMessage } from '../../stores/message-turn-actions';
import styles from './Chat.module.css';
import badgeStyles from '../input/SkillBadgeView.module.css';

interface Props {
  message: ChatMessage;
  showAvatar: boolean;
  sessionPath: string;
  readOnly?: boolean;
  hideIdentity?: boolean;
  userIdentity?: { name?: string | null; avatarUrl?: string | null };
  isLatestUserMessage?: boolean;
  messageRef?: (element: HTMLDivElement | null) => void;
}

export const UserMessage = memo(function UserMessage({
  message,
  showAvatar,
  sessionPath,
  readOnly = false,
  hideIdentity = false,
  userIdentity,
  isLatestUserMessage = false,
  messageRef,
}: Props) {
  const userAvatarUrl = useStore(s => s.userAvatarUrl);
  const t = window.t ?? ((p: string) => p);
  const storeUserName = useStore(s => s.userName) || t('common.me');
  const userName = userIdentity?.name || storeUserName;
  const displayAvatarUrl = userIdentity ? (userIdentity.avatarUrl || null) : userAvatarUrl;
  const userDisplayInfo = useMemo(() => resolveAgentDisplayInfo({
    id: 'user',
    agents: [],
    userName,
    userAvatarUrl: displayAvatarUrl,
  }), [userName, displayAvatarUrl]);

  const isStreaming = useStore(s => selectIsStreamingSession(s, sessionPath));
  const selectedIds = useStore(s => selectSelectedIdsBySession(s, sessionPath));
  const isSelected = selectedIds.includes(message.id);

  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.text || '');
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!editing) setEditValue(message.text || '');
  }, [editing, message.text]);

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, [editing]);

  const handleCopy = useCallback(() => {
    const ids = selectSelectedIdsBySession(useStore.getState(), sessionPath);
    const text = ids.length > 0
      ? extractSelectedTexts(sessionPath, ids)
      : (message.text || '');
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [message.text, sessionPath]);

  const handleRegenerate = useCallback(async () => {
    if (busy || isStreaming) return;
    setBusy(true);
    try {
      await replayLatestUserMessage(sessionPath, message);
    } finally {
      setBusy(false);
    }
  }, [busy, isStreaming, message, sessionPath]);

  const handleEdit = useCallback(() => {
    if (busy || isStreaming) return;
    setEditValue(message.text || '');
    setEditing(true);
  }, [busy, isStreaming, message.text]);

  const handleCancelEdit = useCallback(() => {
    if (busy) return;
    setEditing(false);
    setEditValue(message.text || '');
  }, [busy, message.text]);

  const handleConfirmEdit = useCallback(async () => {
    const nextText = editValue.trim();
    if (!nextText || busy || isStreaming) return;
    setBusy(true);
    try {
      const ok = await replayLatestUserMessage(sessionPath, message, nextText);
      if (ok) setEditing(false);
    } finally {
      setBusy(false);
    }
  }, [busy, editValue, isStreaming, message, sessionPath]);

  const canShowLatestActions = !readOnly && isLatestUserMessage;
  const timeText = formatMessageTime(message.timestamp);
  const editingActions: MessageFooterAction[] = useMemo(() => [
    {
      id: 'cancel',
      title: t('common.cancel'),
      icon: <PhosphorIcon icon={X} size={15} />,
      onClick: () => handleCancelEdit(),
      disabled: busy,
    },
    {
      id: 'confirm',
      title: t('common.confirm'),
      icon: <PhosphorIcon icon={Check} size={15} />,
      onClick: () => { void handleConfirmEdit(); },
      disabled: busy || !editValue.trim(),
    },
  ], [busy, editValue, handleCancelEdit, handleConfirmEdit, t]);
  const defaultActions: MessageFooterAction[] = useMemo(() => [
    {
      id: 'copy',
      title: t('common.copyText'),
      icon: copied ? <PhosphorIcon icon={Check} size={15} /> : <PhosphorIcon icon={Copy} size={15} />,
      onClick: () => handleCopy(),
      disabled: isStreaming || busy,
      active: copied,
    },
    {
      id: 'regenerate',
      title: t('common.regenerate'),
      icon: <PhosphorIcon icon={ArrowsClockwise} size={15} />,
      onClick: () => { void handleRegenerate(); },
      disabled: isStreaming || busy,
    },
    {
      id: 'edit',
      title: t('common.edit'),
      icon: <PhosphorIcon icon={PencilSimple} size={15} />,
      onClick: () => handleEdit(),
      disabled: isStreaming || busy,
    },
  ], [busy, copied, handleCopy, handleEdit, handleRegenerate, isStreaming, t]);

  return (
    <div className={`${styles.messageGroup} ${styles.messageGroupUser}${isSelected ? ` ${styles.messageGroupSelected}` : ''}`}
         ref={messageRef}
         data-message-id={message.id}>
      {showAvatar && !hideIdentity && (
        <div className={`${styles.avatarRow} ${styles.avatarRowUser}`}>
          <span className={styles.avatarName}>{userName}</span>
          <AgentAvatar
            info={userDisplayInfo}
            className={`${styles.avatar} ${styles.userAvatar}`}
            alt={userName}
          />
        </div>
      )}
      {message.quotedText && (
        <div className={styles.userAttachments}>
          <AttachmentChip
            icon={<PhosphorIcon icon={Columns} size={14} />}
            name={message.quotedText}
          />
        </div>
      )}
      {message.attachments && message.attachments.length > 0 && (
        <UserAttachmentsView
          attachments={message.attachments}
          deskContext={message.deskContext}
          sessionPath={sessionPath}
          messageId={message.id}
        />
      )}
      <div className={`${styles.message} ${styles.messageUser}${editing ? ` ${styles.messageUserEditing}` : ''}`}>
        {message.skills && message.skills.length > 0 && message.skills.map(skillName => (
          <span key={skillName} className={badgeStyles.badge} style={{ cursor: 'default' }}>
            <PhosphorIcon icon={StarFour} size={13} className={badgeStyles.icon} />
            <span className={badgeStyles.name}>{skillName}</span>
          </span>
        ))}
        {editing ? (
          <textarea
            ref={textareaRef}
            className={styles.userEditTextarea}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void handleConfirmEdit();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                handleCancelEdit();
              }
            }}
            disabled={busy}
          />
        ) : (
          message.textHtml && <MarkdownContent html={message.textHtml} />
        )}
      </div>
      {canShowLatestActions && (
        <MessageFooterActions
          align="right"
          timeText={timeText}
          visible={editing}
          actions={editing ? editingActions : defaultActions}
        />
      )}
    </div>
  );
});

// ── 附件区 ──

const UserAttachmentsView = memo(function UserAttachmentsView({ attachments, deskContext, sessionPath, messageId }: {
  attachments: UserAttachment[];
  deskContext?: DeskContext | null;
  sessionPath: string;
  messageId: string;
}) {
  // 扩展名识别统一走中心表 EXT_TO_KIND；禁止维护私有 IMAGE_EXTS 表。
  const isImage = useCallback((att: UserAttachment) => {
    return isImageOrSvgExt(extOfName(att.name));
  }, []);

  const t = window.t ?? ((p: string) => p);

  return (
    <div className={styles.userAttachments}>
      {attachments.map((att, i) => {
        const expired = att.status === 'expired';
        const expiredLabel = t('chat.fileExpired');
        const imageSrc = !expired && isImage(att) ? getUserAttachmentImageSrc(att) : null;
        if (imageSrc) {
          return (
            <div key={att.name || `att-${i}`} className={styles.attachImageWrap}>
              <img
                className={styles.attachImage}
                src={imageSrc}
                alt={att.name}
                loading="lazy"
                onClick={(e) => {
                  e.stopPropagation();
                  const ext = att.name.split('.').pop()?.toLowerCase() || '';
                  openFilePreview(att.path, att.name, ext, {
                    origin: 'session',
                    sessionPath,
                    messageId,
                  });
                }}
                style={{ cursor: 'pointer' }}
              />
              {att.visionAuxiliary && (
                <div className={styles.visionAuxiliaryLabel}>
                  {t('chat.visionAuxiliary')}
                </div>
              )}
            </div>
          );
        }
        return (
          <AttachmentChip
            key={att.name || `att-${i}`}
            icon={att.isDir ? <PhosphorIcon icon={Folder} size={14} /> : <PhosphorIcon icon={File} size={14} />}
            name={expired ? `${att.name} · ${expiredLabel}` : att.name}
            variant={expired ? 'expired' : 'normal'}
          />
        );
      })}
      {deskContext && (
        <AttachmentChip
          icon={<PhosphorIcon icon={Folder} size={14} />}
          name={`${t('sidebar.jian')} (${deskContext.fileCount})`}
        />
      )}
    </div>
  );
});

