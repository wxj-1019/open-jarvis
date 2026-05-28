import { useState } from 'react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { CaretDown, CaretRight, CheckCircle, WarningCircle, Clock } from '@phosphor-icons/react';
import styles from './ToolCallCard.module.css';

export interface ToolCallCardData {
  title: string;
  description?: string;
  params?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
  connectorId?: string;
  connectorName?: string;
}

export function ToolCallCard({ data }: { data: ToolCallCardData }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = !!data.error;
  const displayName = data.connectorName
    ? `${data.connectorName} / ${data.title}`
    : data.title;

  if (hasError) {
    return (
      <div className={`${styles.toolCard} ${styles.errorCard}`}>
        <div className={styles.cardHeader} onClick={() => setExpanded(e => !e)}>
          <PhosphorIcon icon={expanded ? CaretDown : CaretRight} size={12} />
          <PhosphorIcon icon={WarningCircle} size={14} className={styles.errorIcon} />
          <span className={styles.cardTitle}>{displayName}</span>
        </div>
        {expanded && <div className={styles.errorBody}>{data.error}</div>}
      </div>
    );
  }

  return (
    <div className={styles.toolCard}>
      <div className={styles.cardHeader} onClick={() => setExpanded(e => !e)}>
        <PhosphorIcon icon={expanded ? CaretDown : CaretRight} size={12} />
        <span className={styles.cardTitle}>{displayName}</span>
      </div>
      {expanded && (
        <div className={styles.cardBody}>
          {data.description && <div className={styles.cardDesc}>{data.description}</div>}
          {data.params && Object.keys(data.params).length > 0 && (
            <div className={styles.cardSection}>
              <div className={styles.cardSectionTitle}>Params</div>
              <pre className={styles.cardJson}>{JSON.stringify(data.params, null, 2)}</pre>
            </div>
          )}
          {data.error && (
            <div className={styles.cardSection}>
              <div className={styles.cardSectionTitle}>Result</div>
              <div className={styles.cardResult}>{data.error.slice(0, 500)}</div>
              {data.error.length > 500 && (
                <button className={styles.expandBtn} onClick={() => {}}>展开全文</button>
              )}
            </div>
          )}
          <div className={styles.cardFooter}>
            {data.durationMs != null && (
              <span className={styles.cardMeta}>
                <PhosphorIcon icon={Clock} size={12} /> {(data.durationMs / 1000).toFixed(1)}s
              </span>
            )}
            <span className={styles.cardMeta}>
              <PhosphorIcon icon={CheckCircle} size={12} className={styles.successIcon} /> Done
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
