import React, { useState, useEffect, useCallback } from 'react';
import { Warning, CheckCircle, Spinner, CaretDown, CaretUp, ArrowClockwise } from '@phosphor-icons/react';
import { hanaFetch } from '../api';
import { t } from '../helpers';
import { useSettingsStore } from '../store';
import styles from './SystemHealthBanner.module.css';

interface HealthCheck {
  id: string;
  name: string;
  status: 'ok' | 'failed' | 'error';
  error?: string | null;
  fixable: boolean;
  fixAction?: string | null;
  impact?: string | null;
}

interface HealthResponse {
  status: 'healthy' | 'degraded' | 'critical';
  checks: HealthCheck[];
}

type FixState = 'idle' | 'fixing' | 'success' | 'error';

export function SystemHealthBanner() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [fixState, setFixState] = useState<FixState>('idle');
  const [fixMessage, setFixMessage] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const showToast = useSettingsStore(s => s.showToast);

  const checkHealth = useCallback(async () => {
    try {
      setLoading(true);
      const data = await hanaFetch('/api/system/health');
      setHealth(data);
    } catch (err) {
      console.error('[SystemHealthBanner] Health check failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  const failedChecks = health?.checks.filter(c => c.status !== 'ok') || [];
  const hasIssues = failedChecks.length > 0;

  if (loading || !hasIssues || dismissed) {
    return null;
  }

  const handleFixAll = async () => {
    setFixState('fixing');
    setFixMessage(t('settings.health.fixing'));

    try {
      const result = await hanaFetch('/api/system/fix/rebuild-all', {
        method: 'POST',
      });

      if (result.success) {
        setFixState('success');
        setFixMessage(t('settings.health.fixSuccess'));
        showToast(t('settings.health.fixSuccess'), 'success');
        checkHealth();
      } else {
        setFixState('error');
        setFixMessage(result.error || t('settings.health.fixFailed'));
        showToast(result.error || t('settings.health.fixFailed'), 'error');
      }
    } catch (err: any) {
      setFixState('error');
      setFixMessage(err.message || t('settings.health.fixFailed'));
      showToast(err.message || t('settings.health.fixFailed'), 'error');
    }
  };

  const handleFixSingle = async (action: string) => {
    setFixState('fixing');
    setFixMessage(t('settings.health.fixing'));

    try {
      const result = await hanaFetch(`/api/system/fix/${action}`, {
        method: 'POST',
      });

      if (result.success) {
        setFixState('success');
        setFixMessage(t('settings.health.fixSuccess'));
        showToast(t('settings.health.fixSuccess'), 'success');
        checkHealth();
      } else {
        setFixState('error');
        setFixMessage(result.error || t('settings.health.fixFailed'));
        showToast(result.error || t('settings.health.fixFailed'), 'error');
      }
    } catch (err: any) {
      setFixState('error');
      setFixMessage(err.message || t('settings.health.fixFailed'));
      showToast(err.message || t('settings.health.fixFailed'), 'error');
    }
  };

  const handleRestart = () => {
    if (window.platform?.restartApp) {
      window.platform.restartApp();
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  return (
    <div className={styles.banner}>
      <div className={styles.header}>
        <div className={styles.iconWrapper}>
          <Warning size={20} weight="fill" />
        </div>
        <div className={styles.titleWrapper}>
          <h3 className={styles.title}>{t('settings.health.bannerTitle')}</h3>
          <p className={styles.subtitle}>
            {failedChecks.length === 1
              ? `${failedChecks[0].name}: ${failedChecks[0].impact}`
              : t('settings.health.multipleIssues', { count: failedChecks.length })}
          </p>
        </div>
        <div className={styles.actions}>
          {fixState === 'idle' && (
            <>
              <button
                className={styles.fixButton}
                onClick={handleFixAll}
                disabled={fixState === 'fixing'}
              >
                {t('settings.health.fixButton')}
              </button>
              <button
                className={styles.expandButton}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
                <span>{t('settings.health.viewDetails')}</span>
              </button>
            </>
          )}
          {fixState === 'fixing' && (
            <div className={styles.fixingState}>
              <Spinner size={16} className={styles.spinner} />
              <span>{fixMessage}</span>
            </div>
          )}
          {fixState === 'success' && (
            <div className={styles.successState}>
              <CheckCircle size={16} weight="fill" />
              <span>{fixMessage}</span>
              <button className={styles.restartButton} onClick={handleRestart}>
                {t('settings.health.restartNow')}
              </button>
            </div>
          )}
          {fixState === 'error' && (
            <div className={styles.errorState}>
              <Warning size={16} weight="fill" />
              <span>{fixMessage}</span>
              <button
                className={styles.retryButton}
                onClick={() => {
                  setFixState('idle');
                  setFixMessage('');
                }}
              >
                <ArrowClockwise size={14} />
                {t('settings.health.retry')}
              </button>
            </div>
          )}
          <button className={styles.dismissButton} onClick={handleDismiss}>
            ×
          </button>
        </div>
      </div>

      {expanded && (
        <div className={styles.details}>
          {failedChecks.map(check => (
            <div key={check.id} className={styles.checkItem}>
              <div className={styles.checkHeader}>
                <Warning size={14} weight="fill" className={styles.checkIcon} />
                <span className={styles.checkName}>{check.name}</span>
                <span className={styles.checkImpact}>{check.impact}</span>
                {check.fixable && check.fixAction && (
                  <button
                    className={styles.singleFixButton}
                    onClick={() => handleFixSingle(check.fixAction!)}
                    disabled={fixState === 'fixing'}
                  >
                    {t('settings.health.fixSingle')}
                  </button>
                )}
              </div>
              {check.error && (
                <pre className={styles.checkError}>{check.error}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
