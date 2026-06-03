import { useState, useEffect, useCallback } from 'react';
import {
  VoiceHistoryEntry,
  voiceHistoryService,
} from '../../services/voice-history-service';

function formatDate(date: Date): string {
  const d = new Date(date);
  return d.toLocaleString();
}

function truncate(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}

export function VoiceHistory() {
  const [entries, setEntries] = useState<VoiceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const data = await voiceHistoryService.getEntries({
        limit: 50,
        sortBy: 'newest',
      });
      setEntries(data);
    } catch (err) {
      console.error('[VoiceHistory] Failed to load entries:', err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        await voiceHistoryService.deleteEntry(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
      } catch (err) {
        console.error('[VoiceHistory] Failed to delete entry:', err);
      }
    },
    [],
  );

  const handleClear = useCallback(async () => {
    // eslint-disable-next-line no-alert
    if (!window.confirm('Clear all voice history? This cannot be undone.')) {
      return;
    }
    setClearing(true);
    try {
      await voiceHistoryService.clearAll();
      setEntries([]);
      setExpandedId(null);
    } catch (err) {
      console.error('[VoiceHistory] Failed to clear history:', err);
    } finally {
      setClearing(false);
    }
  }, []);

  if (loading) {
    return <div style={styles.container}>Loading history...</div>;
  }

  if (entries.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.emptyState}>No voice history yet.</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Voice History</h3>
        <button
          style={{ ...styles.button, ...styles.clearButton }}
          onClick={handleClear}
          disabled={clearing}
        >
          {clearing ? 'Clearing...' : 'Clear History'}
        </button>
      </div>

      <div style={styles.list}>
        {entries.map((entry) => {
          const isExpanded = expandedId === entry.id;
          return (
            <div key={entry.id} style={styles.item}>
              <div
                style={styles.itemHeader}
                onClick={() => handleToggle(entry.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleToggle(entry.id);
                }}
              >
                <div style={styles.itemMain}>
                  <span style={styles.date}>{formatDate(entry.timestamp)}</span>
                  <span style={styles.userText}>
                    {truncate(entry.userText, 60)}
                  </span>
                  <span style={styles.duration}>
                    {formatDuration(entry.duration)}
                  </span>
                </div>
                <span style={styles.chevron}>{isExpanded ? '\u25BC' : '\u25B6'}</span>
              </div>

              {isExpanded && (
                <div style={styles.expandedContent}>
                  <div style={styles.detailRow}>
                    <span style={styles.label}>You:</span>
                    <span style={styles.detailText}>{entry.userText}</span>
                  </div>
                  <div style={styles.detailRow}>
                    <span style={styles.label}>AI:</span>
                    <span style={styles.detailText}>{entry.aiText}</span>
                  </div>
                  {entry.metrics && (
                    <div style={styles.metricsRow}>
                      {entry.metrics.sttLatency != null && (
                        <span>STT: {entry.metrics.sttLatency}ms</span>
                      )}
                      {entry.metrics.ttsLatency != null && (
                        <span>TTS: {entry.metrics.ttsLatency}ms</span>
                      )}
                      {entry.metrics.totalLatency != null && (
                        <span>Total: {entry.metrics.totalLatency}ms</span>
                      )}
                    </div>
                  )}
                  <button
                    style={styles.deleteButton}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(entry.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    maxWidth: 700,
    margin: '0 auto',
    padding: 16,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600,
  },
  button: {
    padding: '6px 12px',
    border: '1px solid #ccc',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 13,
    background: '#fff',
  },
  clearButton: {
    color: '#c00',
    borderColor: '#c00',
  },
  emptyState: {
    textAlign: 'center',
    padding: '40px 0',
    color: '#888',
    fontSize: 14,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  item: {
    border: '1px solid #e0e0e0',
    borderRadius: 6,
    overflow: 'hidden',
    background: '#fff',
  },
  itemHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  itemMain: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  date: {
    fontSize: 12,
    color: '#888',
    whiteSpace: 'nowrap',
    minWidth: 140,
  },
  userText: {
    flex: 1,
    fontSize: 14,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  duration: {
    fontSize: 12,
    color: '#666',
    whiteSpace: 'nowrap',
  },
  chevron: {
    fontSize: 10,
    color: '#888',
    marginLeft: 8,
  },
  expandedContent: {
    padding: '10px 14px',
    borderTop: '1px solid #e0e0e0',
    background: '#f9f9f9',
  },
  detailRow: {
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 1.5,
  },
  label: {
    fontWeight: 600,
    marginRight: 6,
    color: '#555',
  },
  detailText: {
    color: '#333',
  },
  metricsRow: {
    display: 'flex',
    gap: 16,
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    paddingTop: 8,
    borderTop: '1px solid #e8e8e8',
  },
  deleteButton: {
    marginTop: 10,
    padding: '4px 10px',
    fontSize: 12,
    color: '#c00',
    border: '1px solid #c00',
    borderRadius: 3,
    background: '#fff',
    cursor: 'pointer',
  },
};

export default VoiceHistory;
