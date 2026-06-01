import { memo } from 'react';
import './VoiceVisualizations.css';

declare function t(key: string, vars?: Record<string, string | number>): string;

export type VoiceStatus = 'listening' | 'speaking' | 'thinking' | 'idle';

interface VoiceRippleProps {
  count?: number;
}

export const VoiceRipple = memo(function VoiceRipple({ count = 4 }: VoiceRippleProps) {
  return (
    <div className="voice-ripple-container">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="voice-ripple" />
      ))}
    </div>
  );
});

interface VoiceWaveformProps {
  barCount?: number;
}

export const VoiceWaveform = memo(function VoiceWaveform({ barCount = 9 }: VoiceWaveformProps) {
  return (
    <div className="voice-waveform">
      {Array.from({ length: barCount }).map((_, i) => (
        <div key={i} className="voice-waveform-bar" />
      ))}
    </div>
  );
});

interface VoiceParticlesProps {
  count?: number;
}

export const VoiceParticles = memo(function VoiceParticles({ count = 6 }: VoiceParticlesProps) {
  return (
    <div className="voice-particles">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="voice-particle" />
      ))}
    </div>
  );
});

export const VoicePulseRing = memo(function VoicePulseRing() {
  return <div className="voice-pulse-ring" />;
});

export const VoiceSoundCircle = memo(function VoiceSoundCircle() {
  return <div className="voice-sound-circle" />;
});

interface VoiceStatusIndicatorProps {
  status: VoiceStatus;
  label?: string;
}

export const VoiceStatusIndicator = memo(function VoiceStatusIndicator({
  status,
  label,
}: VoiceStatusIndicatorProps) {
  const statusLabels: Record<VoiceStatus, string> = {
    listening: t('voiceStatus.listening'),
    speaking: t('voiceStatus.speaking'),
    thinking: t('voiceStatus.thinking'),
    idle: t('voiceStatus.idle'),
  };

  return (
    <div className="voice-status-indicator">
      <div className={`voice-status-dot ${status}`} />
      <span>{label || statusLabels[status]}</span>
    </div>
  );
});

interface VoiceHeroVisualProps {
  status: VoiceStatus;
  showRipple?: boolean;
  showWaveform?: boolean;
  showParticles?: boolean;
}

export const VoiceHeroVisual = memo(function VoiceHeroVisual({
  status,
  showRipple = true,
  showWaveform = status === 'speaking',
  showParticles = status === 'listening',
}: VoiceHeroVisualProps) {
  return (
    <div className="voice-hero-visual">
      {showRipple && <VoiceRipple />}
      {showWaveform && <VoiceWaveform />}
      {showParticles && <VoiceParticles />}
      <VoiceStatusIndicator status={status} />
    </div>
  );
});
