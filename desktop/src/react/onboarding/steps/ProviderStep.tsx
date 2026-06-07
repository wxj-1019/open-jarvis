/**
 * ProviderStep.tsx — Step 2: Provider configuration + connection test
 */

import { useState, useCallback, useEffect } from 'react';
import { Eye, EyeSlash, CaretDown, CheckCircle, Warning } from '@phosphor-icons/react';
import { PhosphorIcon } from '../../ui/PhosphorIcon';
import { PROVIDER_PRESETS } from '../constants';
import type { ProviderPreset } from '../constants';
import { getProviderPresetLabel } from '../../utils/provider-presets';
import { testConnection, saveProvider as saveProviderAction } from '../onboarding-actions';
import type { HanaFetch } from '../onboarding-actions';
import { StepContainer, Multiline } from '../onboarding-ui';
import { SelectWidget } from '@/ui';

interface ProviderStepProps {
  preview: boolean;
  hanaFetch: HanaFetch;
  goToStep: (index: number) => void;
  showError: (msg: string) => void;
  onProviderReady: (providerName: string, providerUrl: string, providerApi: string, apiKey: string) => void;
}

export function ProviderStep({
  preview, hanaFetch, goToStep, showError, onProviderReady,
}: ProviderStepProps) {
  // ── Provider state ──
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [providerName, setProviderName] = useState('');
  const [providerUrl, setProviderUrl] = useState('');
  const [providerApi, setProviderApi] = useState('openai-completions');
  const [apiKey, setApiKey] = useState('');
  const [isLocalProvider, setIsLocalProvider] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [testStatus, setTestStatus] = useState<{ type: '' | 'loading' | 'success' | 'error'; text: string }>({ type: '', text: '' });
  const [showKey, setShowKey] = useState(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [providerSearch, setProviderSearch] = useState('');

  // ── Ollama auto-detect ──
  const [ollamaDetected, setOllamaDetected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('http://localhost:11434/v1/models', { method: 'GET' } as RequestInit)
      .then(res => {
        if (cancelled) return;
        if (res.ok) {
          setOllamaDetected(true);
          const preset = PROVIDER_PRESETS.find(p => p.value === 'ollama');
          if (preset) selectPreset(preset);
        }
      })
      .catch(() => { /* ignore – Ollama not running */ });
    return () => { cancelled = true; };
  }, [selectPreset]);

  // ── Custom provider fields ──
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customApi, setCustomApi] = useState('openai-completions');

  const providerLabel = useCallback((preset: ProviderPreset) => (
    preset.custom ? t('onboarding.provider.custom') : getProviderPresetLabel(preset, i18n.locale)
  ), []);

  const selectedProviderLabel = selectedPreset
    ? providerLabel(PROVIDER_PRESETS.find(preset => preset.value === selectedPreset) || PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1])
    : '';

  const providerQuery = providerSearch.trim().toLowerCase();
  const filteredProviders = providerQuery
    ? PROVIDER_PRESETS.filter(preset => providerLabel(preset).toLowerCase().includes(providerQuery) || preset.value.toLowerCase().includes(providerQuery))
    : PROVIDER_PRESETS;

  // ── Preset selection ──
  const selectPreset = useCallback((preset: ProviderPreset) => {
    setSelectedPreset(preset.value);
    setProviderMenuOpen(false);
    setProviderSearch('');
    setConnectionTested(false);
    setTestStatus({ type: '', text: '' });

    if (preset.custom) {
      setProviderName(customName.trim().toLowerCase().replace(/\s+/g, '-'));
      setProviderUrl(customUrl.trim());
      setProviderApi(customApi);
      setIsLocalProvider(false);
    } else {
      setProviderName(preset.value);
      setProviderUrl(preset.url);
      setProviderApi(preset.api);
      setIsLocalProvider(!!preset.local || preset.value === 'demo');
      if (preset.local || preset.value === 'demo') setApiKey('');
    }
  }, [customName, customUrl, customApi]);

  // ── Custom input sync ──
  const onCustomInput = useCallback((name: string, url: string, api: string) => {
    setCustomName(name);
    setCustomUrl(url);
    setCustomApi(api);
    if (selectedPreset === '_custom') {
      setProviderName(name.trim().toLowerCase().replace(/\s+/g, '-'));
      setProviderUrl(url.trim());
      setProviderApi(api);
      setConnectionTested(false);
      setTestStatus({ type: '', text: '' });
    }
  }, [selectedPreset]);

  // ── API key input ──
  const onApiKeyInput = useCallback((val: string) => {
    const cleaned = val.replace(/[^\x20-\x7E]/g, '').trim();
    setApiKey(cleaned);
    setConnectionTested(false);
    setTestStatus({ type: '', text: '' });
  }, []);

  // ── Button states ──
  const hasKey = !!apiKey || isLocalProvider;
  const hasProvider = !!providerName;
  const hasUrl = !!providerUrl;
  const testBtnDisabled = preview ? false : !(hasProvider && hasUrl && hasKey);
  const nextDisabled = preview ? false : !(hasProvider && hasUrl && hasKey && connectionTested);

  // ── Test connection ──
  const onTest = useCallback(async () => {
    if (preview) {
      setTestStatus({ type: 'success', text: t('onboarding.provider.testSuccess') });
      setConnectionTested(true);
      return;
    }
    setTestStatus({ type: 'loading', text: t('onboarding.provider.testing') });
    try {
      const result = await testConnection({ hanaFetch, providerUrl, providerApi, apiKey });
      if (result.ok) {
        setTestStatus({ type: 'success', text: result.text });
        setConnectionTested(true);
      } else {
        setTestStatus({ type: 'error', text: result.text });
        setConnectionTested(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTestStatus({ type: 'error', text: msg });
      setConnectionTested(false);
    }
  }, [preview, hanaFetch, providerUrl, providerApi, apiKey]);

  // ── Next ──
  const onNext = useCallback(async () => {
    if (preview) { goToStep(3); return; }
    if (!connectionTested) return;
    try {
      await saveProviderAction({ hanaFetch, providerName, providerUrl, apiKey, providerApi });
      onProviderReady(providerName, providerUrl, providerApi, apiKey);
      goToStep(3);
    } catch (err) {
      console.error('[onboarding] save provider failed:', err);
      showError(t('onboarding.provider.testFailed'));
    }
  }, [preview, connectionTested, hanaFetch, providerName, providerUrl, apiKey, providerApi, goToStep, showError, onProviderReady]);

  return (
    <StepContainer>
      <h1 className="onboarding-title">{t('onboarding.provider.title')}</h1>
      <Multiline className="onboarding-subtitle" text={t('onboarding.provider.subtitle')} />

      <div className="ob-provider-select">
        <button type="button" className="ob-provider-trigger" onClick={() => setProviderMenuOpen(open => !open)}>
          <span>{selectedProviderLabel || t('onboarding.provider.selectPlaceholder')}</span>
          <PhosphorIcon icon={CaretDown} size={14} />
        </button>
        {providerMenuOpen && (
          <div className="ob-provider-menu">
            <input
              className="ob-input ob-provider-search"
              type="text"
              placeholder={t('onboarding.provider.searchPlaceholder')}
              value={providerSearch}
              onChange={e => setProviderSearch(e.target.value)}
              autoComplete="off"
              autoFocus
            />
            <div className="ob-provider-options">
              {filteredProviders.length > 0 ? filteredProviders.map(preset => (
                <button
                  key={preset.value}
                  type="button"
                  className={`ob-provider-option${selectedPreset === preset.value ? ' selected' : ''}`}
                  onClick={() => selectPreset(preset)}
                >
                  {providerLabel(preset)}
                </button>
              )) : (
                <div className="ob-provider-empty">{t('onboarding.provider.empty')}</div>
              )}
            </div>
          </div>
        )}
      </div>

      {ollamaDetected && selectedPreset === 'ollama' && (
        <div className="ob-olloma-hint">
          <PhosphorIcon icon={CheckCircle} size={16} />
          <span>{t('onboarding.provider.ollamaDetected')}</span>
        </div>
      )}

      {selectedPreset === 'demo' && (
        <div className="ob-demo-hint">
          <PhosphorIcon icon={Warning} size={16} />
          <span>{t('onboarding.provider.demoHint')}</span>
        </div>
      )}

      {/* Custom provider fields */}
      {selectedPreset === '_custom' && (
        <div className="custom-provider-row">
          <div className="custom-provider-fields">
            <div className="custom-field">
              <span className="ob-field-label">{t('onboarding.provider.customName')}</span>
              <input
                className="ob-input"
                type="text"
                placeholder={t('onboarding.provider.customNamePlaceholder')}
                value={customName}
                onChange={e => onCustomInput(e.target.value, customUrl, customApi)}
                autoComplete="off"
              />
            </div>
            <div className="custom-field">
              <span className="ob-field-label">{t('onboarding.provider.customUrl')}</span>
              <input
                className="ob-input"
                type="text"
                placeholder={t('onboarding.provider.customUrlPlaceholder')}
                value={customUrl}
                onChange={e => onCustomInput(customName, e.target.value, customApi)}
                autoComplete="off"
              />
            </div>
            <div className="custom-field">
              <SelectWidget
                className="ob-select-widget"
                triggerClassName="ob-input"
                options={[
                  { value: 'openai-completions', label: 'OpenAI Compatible' },
                  { value: 'anthropic-messages', label: 'Anthropic Messages' },
                ]}
                value={customApi}
                onChange={value => onCustomInput(customName, customUrl, value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* API Key */}
      {!isLocalProvider && (
        <>
          <span className="ob-field-label">{t('onboarding.provider.keyLabel')}</span>
          <div className="ob-key-row">
            <input
              className="ob-input"
              type={showKey ? 'text' : 'password'}
              placeholder={t('onboarding.provider.keyPlaceholder')}
              value={apiKey}
              onChange={e => onApiKeyInput(e.target.value)}
              autoComplete="off"
            />
            <button className="ob-key-toggle" onClick={() => setShowKey(!showKey)}>
              {showKey ? <PhosphorIcon icon={EyeSlash} size={14} /> : <PhosphorIcon icon={Eye} size={14} />}
            </button>
          </div>
        </>
      )}

      {/* Test connection */}
      <div className="ob-test-row">
        <button
          className="ob-test-btn"
          disabled={testBtnDisabled}
          onClick={onTest}
        >
          {t('onboarding.provider.test')}
        </button>
        {testStatus.text && (
          <span className={`ob-status ${testStatus.type}`}>{testStatus.text}</span>
        )}
      </div>

      <div className="onboarding-actions">
        <button className="ob-btn ob-btn-secondary" onClick={() => goToStep(1)}>
          {t('onboarding.provider.back')}
        </button>
        <button
          className="ob-btn ob-btn-primary"
          disabled={nextDisabled}
          onClick={onNext}
        >
          {t('onboarding.provider.next')}
        </button>
      </div>
    </StepContainer>
  );
}
