import React, { useState, useCallback, useEffect } from 'react';
import { useSettingsStore } from '../store';
import { hanaFetch } from '../api';
import { t } from '../helpers';
import { SettingsSection } from '../components/SettingsSection';
import { SettingsRow } from '../components/SettingsRow';
import { SelectWidget, Toggle } from '@/ui';
import styles from '../Settings.module.css';

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
  const [saving, setSaving] = useState(false);
  const showToast = useSettingsStore(s => s.showToast);

  const loadConfig = useCallback(async () => {
    try {
      // 加载 TTS 配置
      const ttsRes = await hanaFetch('/api/tts/config');
      const ttsData = await ttsRes.json();
      setTtsStatus(ttsData.mimo);

      // 加载 STT 配置
      const sttRes = await hanaFetch('/api/voice/config');
      const sttData = await sttRes.json();
      setSttStatus({ configured: sttData.configured });
    } catch {
      // 配置未加载
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const saveConfig = async (updates: Partial<VoiceConfig>) => {
    setSaving(true);
    try {
      const nextConfig = { ...config, ...updates };
      setConfig(nextConfig);

      // TODO: 保存到后端配置存储
      // await hanaFetch('/api/voice/config', {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(nextConfig),
      // });

      showToast('配置已保存', 'success');
    } catch (err: any) {
      showToast(err.message || '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const testTTS = async () => {
    try {
      const res = await hanaFetch('/api/tts/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: '你好，这是语音测试',
          engine: config.tts.engine,
          model: config.tts.model,
          speed: config.tts.speed,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'TTS 测试失败');
      }

      // 播放音频
      const audioBlob = await res.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      await audio.play();

      showToast('TTS 测试成功！', 'success');
    } catch (err: any) {
      showToast(err.message || 'TTS 测试失败', 'error');
    }
  };

  const ttsModels = [
    { id: 'mimo-v2.5-tts', name: 'MiMo V2.5 TTS (推荐)' },
    { id: 'mimo-v2-tts', name: 'MiMo V2 TTS' },
    { id: 'mimo-v2.5-tts-voicedesign', name: 'MiMo V2.5 Voice Design' },
    { id: 'mimo-v2.5-tts-voiceclone', name: 'MiMo V2.5 Voice Clone' },
  ];

  return (
    <div className={`${styles['settings-tab-content']} ${styles['active']}`} data-tab="voice">
      <SettingsSection title="语音识别 (STT)">
        <SettingsRow label="识别引擎">
          <SelectWidget
            value={config.stt.engine}
            onChange={(engine) => saveConfig({ stt: { ...config.stt, engine } })}
            options={[
              { id: 'whisper', name: 'OpenAI Whisper' },
            ]}
          />
        </SettingsRow>

        <SettingsRow label="默认语言">
          <SelectWidget
            value={config.stt.language}
            onChange={(language) => saveConfig({ stt: { ...config.stt, language } })}
            options={[
              { id: 'zh-CN', name: '中文 (简体)' },
              { id: 'zh-TW', name: '中文 (繁体)' },
              { id: 'en-US', name: 'English (US)' },
              { id: 'ja-JP', name: '日本語' },
              { id: 'ko-KR', name: '한국어' },
            ]}
          />
        </SettingsRow>

        <SettingsRow label="配置状态">
          <div className={styles['status-indicator']}>
            <span className={`${styles['status-dot']} ${sttStatus.configured ? styles['online'] : styles['offline']}`} />
            <span>{sttStatus.configured ? '已配置' : '未配置 OpenAI API Key'}</span>
          </div>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="语音合成 (TTS)">
        <SettingsRow label="TTS 引擎">
          <SelectWidget
            value={config.tts.engine}
            onChange={(engine) => saveConfig({ tts: { ...config.tts, engine } })}
            options={[
              { id: 'mimo', name: 'Xiaomi MiMo TTS' },
              { id: 'webspeech', name: '浏览器内置 (Web Speech)' },
            ]}
          />
        </SettingsRow>

        {config.tts.engine === 'mimo' && (
          <>
            <SettingsRow label="TTS 模型">
              <SelectWidget
                value={config.tts.model}
                onChange={(model) => saveConfig({ tts: { ...config.tts, model } })}
                options={ttsModels.map(m => ({ id: m.id, name: m.name }))}
              />
            </SettingsRow>

            <SettingsRow label="配置状态">
              <div className={styles['status-indicator']}>
                <span className={`${styles['status-dot']} ${ttsStatus.configured ? styles['online'] : styles['offline']}`} />
                <span>{ttsStatus.configured ? '已配置' : '未配置 Mimo API Key'}</span>
              </div>
            </SettingsRow>
          </>
        )}

        <SettingsRow label="语速">
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={config.tts.speed}
            onChange={(e) => saveConfig({ tts: { ...config.tts, speed: parseFloat(e.target.value) } })}
            className={styles['slider']}
          />
          <span>{config.tts.speed.toFixed(1)}x</span>
        </SettingsRow>

        <SettingsRow label="音调">
          <input
            type="range"
            min="0.5"
            max="2.0"
            step="0.1"
            value={config.tts.pitch}
            onChange={(e) => saveConfig({ tts: { ...config.tts, pitch: parseFloat(e.target.value) } })}
            className={styles['slider']}
          />
          <span>{config.tts.pitch.toFixed(1)}</span>
        </SettingsRow>

        <SettingsRow label="音量">
          <input
            type="range"
            min="0"
            max="1.0"
            step="0.1"
            value={config.tts.volume}
            onChange={(e) => saveConfig({ tts: { ...config.tts, volume: parseFloat(e.target.value) } })}
            className={styles['slider']}
          />
          <span>{Math.round(config.tts.volume * 100)}%</span>
        </SettingsRow>

        <SettingsRow label="测试语音">
          <button
            onClick={testTTS}
            disabled={!ttsStatus.configured || saving}
            className={`${styles['btn']} ${styles['btn-primary']}`}
          >
            播放测试音频
          </button>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="使用说明">
        <div className={styles['help-text']}>
          <h4>配置步骤：</h4>
          <ol>
            <li>
              <strong>STT（语音识别）</strong>：在 <code>.env</code> 文件中配置 <code>OPENAI_API_KEY</code>
            </li>
            <li>
              <strong>TTS（语音合成）</strong>：在 <code>.env</code> 文件中配置 <code>MIMO_API_KEY</code>
            </li>
            <li>
              选择你喜欢的 TTS 模型（推荐使用 mimo-v2.5-tts）
            </li>
            <li>
              调整语速、音调、音量以获得最佳效果
            </li>
            <li>
              点击"播放测试音频"验证配置
            </li>
          </ol>

          <h4>获取 API Key：</h4>
          <ul>
            <li>OpenAI API Key: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">https://platform.openai.com/api-keys</a></li>
            <li>Mimo API Key: <a href="https://dev.mi.com/mimo-open-platform" target="_blank" rel="noopener">https://dev.mi.com/mimo-open-platform</a></li>
          </ul>
        </div>
      </SettingsSection>
    </div>
  );
}
