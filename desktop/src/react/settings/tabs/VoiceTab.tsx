/**
 * VoiceTab.tsx — 语音配置设置页面
 *
 * 配置项：
 * - STT: Whisper 引擎 + 语言选择
 * - TTS: Mimo / WebSpeech 引擎 + 模型/语速/音调/音量
 *
 * 架构说明：
 * - 主进程使用 WhisperSTTAdapter 调用 OpenAI/本地 Whisper API
 * - API Key 存储在 added-models.yaml 中（非 .env）
 * - 渲染进程使用 Web Speech API 作为 fallback
 *
 * 性能监控：
 * - VoiceMetricsCollector 记录 STT/TTS 延迟（p50/p95）
 * - VoiceErrorTracker 捕获错误并上报 Sentry
 */

import { useState, useCallback, useEffect } from 'react';
import { Play } from '@phosphor-icons/react';
import { useSettingsStore } from '../store';
import { hanaFetch } from '../api';
import { t } from '../helpers';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { SelectWidget } from '@/ui';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import tabStyles from '../Settings.module.css';
import styles from './VoiceTab.module.css';

interface TTSConfig {
  engine: string;
  model: string;
  speed: number;
  pitch: number;
  volume: number;
  format: string;
}

interface STTConfig {
  engine: string;
  language: string;
}

interface VoiceConfig {
  tts: TTSConfig;
  stt: STTConfig;
}

const TTS_MODELS = [
  { value: 'mimo-v2.5-tts', labelKey: 'settings.voice.modelMimo25' },
  { value: 'mimo-v2-tts', labelKey: 'settings.voice.modelMimo2' },
  { value: 'mimo-v2.5-tts-voicedesign', labelKey: 'settings.voice.modelVoiceDesign' },
  { value: 'mimo-v2.5-tts-voiceclone', labelKey: 'settings.voice.modelVoiceClone' },
] as const;

function StatusPill({ online, label }: { online: boolean; label: string }) {
  return (
    <span className={styles.statusPill}>
      <span className={`${styles.statusDot} ${online ? styles.statusOnline : styles.statusOffline}`} />
      {label}
    </span>
  );
}

function SliderRow({
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className={styles.sliderControl}>
      <input
        type="range"
        className={styles.slider}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className={styles.sliderValue}>{format(value)}</span>
    </div>
  );
}

export function VoiceTab() {
  const [config, setConfig] = useState<VoiceConfig>({
    tts: {
      engine: 'mimo',
      model: 'mimo-v2.5-tts',
      speed: 1.0,
      pitch: 1.0,
      volume: 1.0,
      format: 'mp3',
    },
    stt: {
      engine: 'whisper',
      language: 'zh-CN',
    },
  });
  const [ttsStatus, setTtsStatus] = useState<{ configured: boolean; error?: string }>({ configured: false });
  const [sttStatus, setSttStatus] = useState<{ configured: boolean; error?: string }>({ configured: false });
  const [testing, setTesting] = useState(false);
  const [metrics, setMetrics] = useState<any>({});
  const showToast = useSettingsStore(s => s.showToast);

  useEffect(() => {
    const refreshMetrics = async () => {
      try {
        const result = await (window as any).hana?.invokeGetVoiceMetrics?.();
        if (result) setMetrics(result);
      } catch {}
    };
    refreshMetrics();
    const interval = setInterval(refreshMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const ttsRes = await hanaFetch('/api/tts/config');
      const ttsData = await ttsRes.json();
      setTtsStatus(ttsData.mimo || { configured: false });

      const sttRes = await hanaFetch('/api/voice/config');
      const sttData = await sttRes.json();
      setSttStatus({ configured: !!sttData.configured });
    } catch {
      setTtsStatus({ configured: false });
      setSttStatus({ configured: false });
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const patchConfig = (updates: Partial<VoiceConfig>) => {
    setConfig((prev) => ({
      ...prev,
      ...updates,
      tts: updates.tts ? { ...prev.tts, ...updates.tts } : prev.tts,
      stt: updates.stt ? { ...prev.stt, ...updates.stt } : prev.stt,
    }));
  };

  const testWebSpeech = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        reject(new Error(t('settings.voice.testFailed')));
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(t('settings.voice.testPhrase'));
      utterance.lang = config.stt.language;
      utterance.rate = config.tts.speed;
      utterance.pitch = config.tts.pitch;
      utterance.volume = config.tts.volume;
      utterance.onend = () => resolve();
      utterance.onerror = () => reject(new Error(t('settings.voice.testFailed')));
      window.speechSynthesis.speak(utterance);
    });

  const testTTS = async () => {
    setTesting(true);
    try {
      if (config.tts.engine === 'webspeech') {
        await testWebSpeech();
        showToast(t('settings.voice.testSuccess'), 'success');
        return;
      }

      // MiMo 引擎：调用后端 API
      if (config.tts.engine === 'mimo') {
        const res = await hanaFetch('/api/tts/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: t('settings.voice.testPhrase'),
            engine: 'mimo',
            model: config.tts.model,
            speed: config.tts.speed,
          }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(error.error || t('settings.voice.testFailed'));
        }

        const audioBlob = await res.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);
        audio.onended = () => URL.revokeObjectURL(audioUrl);
        audio.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          throw new Error(t('settings.voice.testFailed'));
        };
        await audio.play();
        showToast(t('settings.voice.testSuccess'), 'success');
        return;
      }

      // 未知引擎 fallback
      await testWebSpeech();
      showToast(t('settings.voice.testSuccess'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('settings.voice.testFailed');
      showToast(message, 'error');
    } finally {
      setTesting(false);
    }
  };

  const sttConfiguredLabel = sttStatus.configured
    ? t('settings.voice.configured')
    : t('settings.voice.notConfiguredStt');

  const webSpeechAvailable = typeof window !== 'undefined' && !!window.speechSynthesis;
  const ttsEngineReady =
    config.tts.engine === 'webspeech'
      ? webSpeechAvailable
      : config.tts.engine === 'mimo' && ttsStatus.configured;

  const ttsConfiguredLabel = ttsEngineReady
    ? t('settings.voice.configured')
    : t('settings.voice.notConfiguredTts');

  return (
    <div className={`${tabStyles['settings-tab-content']} ${tabStyles['active']}`} data-tab="voice">
      <div className={styles.root}>
        <p className={styles.intro}>{t('settings.voice.pageDesc')}</p>

        <SettingsSection title={t('settings.voice.sttSection')}>
          <SettingsSection.Note>{t('settings.voice.sttSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.voice.sttEngine')}
            control={
              <SelectWidget
                value={config.stt.engine}
                onChange={(engine) => patchConfig({ stt: { ...config.stt, engine } })}
                options={[{ value: 'whisper', label: t('settings.voice.engineWhisper') }]}
              />
            }
          />
          <SettingsRow
            label={t('settings.voice.sttLanguage')}
            control={
              <SelectWidget
                value={config.stt.language}
                onChange={(language) => patchConfig({ stt: { ...config.stt, language } })}
                options={[
                  { value: 'auto', label: t('settings.voice.langAuto') },
                  { value: 'zh-CN', label: t('settings.voice.langZhCN') },
                  { value: 'zh-TW', label: t('settings.voice.langZhTW') },
                  { value: 'en-US', label: t('settings.voice.langEnUS') },
                  { value: 'ja-JP', label: t('settings.voice.langJaJP') },
                  { value: 'ko-KR', label: t('settings.voice.langKoKR') },
                ]}
              />
            }
          />
          <SettingsRow
            label={t('settings.voice.configStatus')}
            control={<StatusPill online={sttStatus.configured} label={sttConfiguredLabel} />}
          />
        </SettingsSection>

        <SettingsSection title={t('settings.voice.ttsSection')}>
          <SettingsSection.Note>{t('settings.voice.ttsSectionNote')}</SettingsSection.Note>
          <SettingsRow
            label={t('settings.voice.ttsEngine')}
            control={
              <SelectWidget
                value={config.tts.engine}
                onChange={(engine) => patchConfig({ tts: { ...config.tts, engine } })}
                options={[
                  { value: 'mimo', label: t('settings.voice.engineMimo') },
                  { value: 'webspeech', label: t('settings.voice.engineWebSpeech') },
                ]}
              />
            }
          />

          {config.tts.engine === 'mimo' && (
            <SettingsRow
              label={t('settings.voice.ttsModel')}
              control={
                <SelectWidget
                  value={config.tts.model}
                  onChange={(model) => patchConfig({ tts: { ...config.tts, model } })}
                  options={TTS_MODELS.map((m) => ({ value: m.value, label: t(m.labelKey) }))}
                />
              }
            />
          )}

          <SettingsRow
            label={t('settings.voice.configStatus')}
            control={<StatusPill online={ttsEngineReady} label={ttsConfiguredLabel} />}
          />

          <SettingsRow
            label={t('settings.voice.speed')}
            control={
              <SliderRow
                value={config.tts.speed}
                min={0.5}
                max={2}
                step={0.1}
                format={(v) => `${v.toFixed(1)}×`}
                onChange={(speed) => patchConfig({ tts: { ...config.tts, speed } })}
              />
            }
          />
          <SettingsRow
            label={t('settings.voice.pitch')}
            control={
              <SliderRow
                value={config.tts.pitch}
                min={0.5}
                max={2}
                step={0.1}
                format={(v) => v.toFixed(1)}
                onChange={(pitch) => patchConfig({ tts: { ...config.tts, pitch } })}
              />
            }
          />
          <SettingsRow
            label={t('settings.voice.volume')}
            control={
              <SliderRow
                value={config.tts.volume}
                min={0}
                max={1}
                step={0.1}
                format={(v) => `${Math.round(v * 100)}%`}
                onChange={(volume) => patchConfig({ tts: { ...config.tts, volume } })}
              />
            }
          />
          <SettingsRow
            label={t('settings.voice.testVoice')}
            hint={t('settings.voice.testVoiceHint')}
            control={
              <button
                type="button"
                className={tabStyles['settings-btn-secondary']}
                onClick={testTTS}
                disabled={!ttsEngineReady || testing}
              >
                <PhosphorIcon icon={Play} size={14} />
                {testing ? t('settings.voice.testing') : t('settings.voice.playTest')}
              </button>
            }
          />
        </SettingsSection>

        <SettingsSection title={t('settings.voice.metricsSection')}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '14px' }}>
            <div style={{ padding: '8px 12px', background: 'var(--settings-bg-secondary)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{t('settings.voice.sttLatencyP50')}</div>
              <div style={{ fontWeight: 600, fontSize: '18px' }}>{metrics.stt?.p50 ? `${metrics.stt.p50.toFixed(0)} ms` : '—'}</div>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--settings-bg-secondary)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{t('settings.voice.sttLatencyP95')}</div>
              <div style={{ fontWeight: 600, fontSize: '18px' }}>{metrics.stt?.p95 ? `${metrics.stt.p95.toFixed(0)} ms` : '—'}</div>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--settings-bg-secondary)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{t('settings.voice.sttCount')}</div>
              <div style={{ fontWeight: 600, fontSize: '18px' }}>{metrics.stt?.count ?? 0}</div>
            </div>
            <div style={{ padding: '8px 12px', background: 'var(--settings-bg-secondary)', borderRadius: '8px' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>{t('settings.voice.errorCount')}</div>
              <div style={{ fontWeight: 600, fontSize: '18px', color: metrics.stt?.errorCount > 0 ? 'var(--color-error)' : 'inherit' }}>{metrics.stt?.errorCount ?? 0}</div>
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title={t('settings.voice.helpSection')}>
          <div className={styles.helpBody}>
            <h4>{t('settings.voice.helpSetupTitle')}</h4>
            <ol>
              <li>{t('settings.voice.helpStt')}</li>
              <li>{t('settings.voice.helpTts')}</li>
              <li>{t('settings.voice.helpModel')}</li>
              <li>{t('settings.voice.helpAdjust')}</li>
              <li>{t('settings.voice.helpTest')}</li>
            </ol>
            <h4>{t('settings.voice.helpKeysTitle')}</h4>
            <ul>
              <li>
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                  OpenAI API Key
                </a>
              </li>
              <li>
                <a href="https://dev.mi.com/mimo-open-platform" target="_blank" rel="noopener noreferrer">
                  Mimo API Key
                </a>
              </li>
            </ul>
          </div>
        </SettingsSection>
      </div>
    </div>
  );
}
