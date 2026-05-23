import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, ShieldWarning, Spinner, CheckCircle, XCircle, ArrowClockwise } from '@phosphor-icons/react';
import { hanaFetch } from '../api';
import { t } from '../helpers';
import { useSettingsStore } from '../store';
import styles from './CodeSigningPanel.module.css';

interface SignerInfo {
  subject: string;
  issuer: string;
  validFrom: string;
  validTo: string;
  thumbprint: string;
}

interface ExecutableInfo {
  name: string;
  path: string;
  supported: boolean;
  signed: boolean | null;
  valid: boolean | null;
  status: string;
  message: string | null;
  signer: SignerInfo | null;
}

interface CodeSigningResponse {
  platform: string;
  supported: boolean;
  executables: ExecutableInfo[];
}

type VerificationState = 'idle' | 'loading' | 'success' | 'error';

function StatusIcon({ valid, signed }: { valid: boolean | null; signed: boolean | null }) {
  if (valid === true) {
    return <CheckCircle size={18} weight="fill" className={styles.iconValid} />;
  }
  if (signed === false || valid === false) {
    return <XCircle size={18} weight="fill" className={styles.iconInvalid} />;
  }
  return <ShieldWarning size={18} className={styles.iconUnknown} />;
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString();
  } catch {
    return isoString;
  }
}

export function CodeSigningPanel() {
  const [data, setData] = useState<CodeSigningResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifyState, setVerifyState] = useState<VerificationState>('idle');
  const [verifyMessage, setVerifyMessage] = useState('');
  const showToast = useSettingsStore(s => s.showToast);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hanaFetch('/api/system/code-signing');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('[CodeSigningPanel] Load failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleVerify = async (filePath: string) => {
    setVerifyState('loading');
    setVerifyMessage('');

    try {
      const res = await hanaFetch('/api/system/code-signing/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: filePath }),
      });
      const result = await res.json();

      if (result.success) {
        setVerifyState('success');
        setVerifyMessage(result.valid ? t('settings.codeSigning.verifySuccess') : t('settings.codeSigning.verifyFailed'));
        showToast(result.valid ? t('settings.codeSigning.verifySuccess') : t('settings.codeSigning.verifyFailed'), result.valid ? 'success' : 'error');
        loadStatus();
      } else {
        setVerifyState('error');
        setVerifyMessage(result.error || t('settings.codeSigning.verifyError'));
        showToast(result.error || t('settings.codeSigning.verifyError'), 'error');
      }
    } catch (err: any) {
      setVerifyState('error');
      setVerifyMessage(err.message || t('settings.codeSigning.verifyError'));
      showToast(err.message || t('settings.codeSigning.verifyError'), 'error');
    }
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <ShieldCheck size={20} />
          <h3>{t('settings.codeSigning.title')}</h3>
        </div>
        <div className={styles.loading}>
          <Spinner size={20} className={styles.spinner} />
          <span>{t('settings.codeSigning.loading')}</span>
        </div>
      </div>
    );
  }

  if (!data?.supported) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <ShieldCheck size={20} />
          <h3>{t('settings.codeSigning.title')}</h3>
        </div>
        <div className={styles.unsupported}>
          <ShieldWarning size={24} />
          <p>{t('settings.codeSigning.unsupported')}</p>
        </div>
      </div>
    );
  }

  const hasValidSignature = data.executables.some(e => e.valid === true);
  const hasInvalidSignature = data.executables.some(e => e.signed === false || e.valid === false);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <ShieldCheck size={20} />
        <h3>{t('settings.codeSigning.title')}</h3>
        <button
          className={styles.refreshBtn}
          onClick={loadStatus}
          disabled={loading}
        >
          <ArrowClockwise size={14} />
        </button>
      </div>

      <div className={styles.description}>
        {t('settings.codeSigning.description')}
      </div>

      <div className={styles.statusSummary}>
        {hasValidSignature && (
          <div className={styles.statusValid}>
            <CheckCircle size={16} weight="fill" />
            <span>{t('settings.codeSigning.validSignature')}</span>
          </div>
        )}
        {hasInvalidSignature && (
          <div className={styles.statusInvalid}>
            <XCircle size={16} weight="fill" />
            <span>{t('settings.codeSigning.invalidSignature')}</span>
          </div>
        )}
        {!hasValidSignature && !hasInvalidSignature && (
          <div className={styles.statusUnknown}>
            <ShieldWarning size={16} />
            <span>{t('settings.codeSigning.noSignature')}</span>
          </div>
        )}
      </div>

      <div className={styles.executablesList}>
        {data.executables.map((exe, index) => (
          <div key={index} className={styles.executableItem}>
            <div className={styles.executableHeader}>
              <StatusIcon valid={exe.valid} signed={exe.signed} />
              <div className={styles.executableInfo}>
                <span className={styles.executableName}>{exe.name}</span>
                <span className={styles.executablePath}>{exe.path}</span>
              </div>
              <button
                className={styles.verifyBtn}
                onClick={() => handleVerify(exe.path)}
                disabled={verifyState === 'loading'}
              >
                {verifyState === 'loading' ? (
                  <Spinner size={14} className={styles.spinner} />
                ) : (
                  t('settings.codeSigning.verify')
                )}
              </button>
            </div>

            {exe.signer && (
              <div className={styles.signerDetails}>
                <div className={styles.signerRow}>
                  <span className={styles.signerLabel}>{t('settings.codeSigning.subject')}:</span>
                  <span className={styles.signerValue}>{exe.signer.subject}</span>
                </div>
                <div className={styles.signerRow}>
                  <span className={styles.signerLabel}>{t('settings.codeSigning.issuer')}:</span>
                  <span className={styles.signerValue}>{exe.signer.issuer}</span>
                </div>
                <div className={styles.signerRow}>
                  <span className={styles.signerLabel}>{t('settings.codeSigning.validPeriod')}:</span>
                  <span className={styles.signerValue}>
                    {formatDate(exe.signer.validFrom)} - {formatDate(exe.signer.validTo)}
                  </span>
                </div>
                <div className={styles.signerRow}>
                  <span className={styles.signerLabel}>{t('settings.codeSigning.thumbprint')}:</span>
                  <span className={styles.signerValueMono}>{exe.signer.thumbprint}</span>
                </div>
              </div>
            )}

            {exe.message && !exe.signer && (
              <div className={styles.executableMessage}>
                {exe.message}
              </div>
            )}
          </div>
        ))}
      </div>

      {verifyMessage && (
        <div className={`${styles.verifyMessage} ${verifyState === 'success' ? styles.verifySuccess : styles.verifyError}`}>
          {verifyMessage}
        </div>
      )}
    </div>
  );
}
