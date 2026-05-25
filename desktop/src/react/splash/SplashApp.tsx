/**
 * SplashApp.tsx — 启动画面
 *
 * 头像呼吸动画 + 打字机文字轮播 + 底部进度点。
 * 不依赖 server（splash 显示时 server 还没启动），数据来源全部是 IPC + 本地文件。
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_NAME = 'Jarvis';
const YUAN_AVATARS: Record<string, string> = {
  hanako: 'jarvis.png',
  butter: 'Butter.png',
  ming: 'Ming.png',
};
const YUAN_SYMBOLS: Record<string, string> = {
  hanako: '\u273F',  // ✿
  butter: '\u274A',  // ❊
  ming: '\u25C8',    // ◈
};
const YUAN_COLORS: Record<string, string> = {
  hanako: '#537D96',
  butter: '#5BA88C',
  ming: '#8BA4B4',
};

const TYPING_SPEED = 65;
const TYPING_PAUSE = 1800;
const TYPING_BATCH_SIZE = 3; // 每批显示的字符数，减少重渲染次数

const MAX_PARTICLES = 3;
const PARTICLE_MIN_DELAY = 1500;
const PARTICLE_MAX_DELAY = 3000;

export function SplashApp() {
  const [avatarSrc, setAvatarSrc] = useState('assets/jarvis.png');
  const [displayText, setDisplayText] = useState('');
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [animationPhase, setAnimationPhase] = useState<'entering' | 'awake' | 'breathing'>('entering');

  const linesRef = useRef<string[]>([]);
  const charIndexRef = useRef(0);
  const isTypingRef = useRef(true);
  const isDeletingRef = useRef(false);
  const currentLineIndexRef = useRef(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const particleContainerRef = useRef<HTMLDivElement>(null);
  const particleCountRef = useRef(0);
  const particleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const mode = params.get('mode') || '';
  const installVersion = params.get('version') || '';

  const clearTypingTimer = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  // 粒子生成
  const spawnParticle = useCallback(() => {
    if (particleCountRef.current >= MAX_PARTICLES) return;
    if (!particleContainerRef.current) return;

    // eslint-disable-next-line no-restricted-syntax
    const particle = document.createElement('div');
    particle.className = 'splash-particle';

    // 随机出生角度 (-60° ~ +60° from bottom)
    const angle = (Math.random() * 120 - 60) * (Math.PI / 180);
    const distance = 36 + Math.random() * 8;
    const startX = 40 + Math.sin(angle) * distance;
    const startY = 40 + Math.cos(angle) * distance;

    particle.style.left = `${startX}px`;
    particle.style.top = `${startY}px`;

    const swing = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 4);
    particle.style.setProperty('--swing', `${swing}px`);

    const duration = 2.5 + Math.random() * 1.5;
    particle.style.animation = `particleFloat ${duration}s ease-in-out forwards`;

    particleCountRef.current += 1;
    particleContainerRef.current.appendChild(particle);

    const onEnd = () => {
      particle.remove();
      particleCountRef.current -= 1;
    };
    particle.addEventListener('animationend', onEnd, { once: true });

    const nextDelay = PARTICLE_MIN_DELAY + Math.random() * (PARTICLE_MAX_DELAY - PARTICLE_MIN_DELAY);
    particleTimerRef.current = setTimeout(spawnParticle, nextDelay);
  }, []);

  // 打字机核心逻辑 — 使用 ref 避免闭包陷阱，纯 setTimeout 方案
  const runTypewriter = useCallback(() => {
    clearTypingTimer();
    
    const currentLineIndex = currentLineIndexRef.current;
    const currentLine = linesRef.current[currentLineIndex];
    if (!currentLine) return;

    const type = () => {
      clearTypingTimer();
      
      const isDeleting = isDeletingRef.current;

      if (isDeleting) {
        setTypingState(false);
        if (charIndexRef.current > 0) {
          const deleteCount = Math.min(TYPING_BATCH_SIZE, charIndexRef.current);
          charIndexRef.current -= deleteCount;
          setDisplayText(currentLine.slice(0, charIndexRef.current));
          typingTimerRef.current = setTimeout(type, (TYPING_SPEED / 2.5) * deleteCount);
        } else {
          isDeletingRef.current = false;
          const nextIndex = (currentLineIndex + 1) % linesRef.current.length;
          currentLineIndexRef.current = nextIndex;
          setCurrentLineIndex(nextIndex);
          charIndexRef.current = 0;
          setDisplayText('');
          setTypingState(true);
          typingTimerRef.current = setTimeout(type, 300);
        }
      } else {
        setTypingState(true);
        const remaining = currentLine.length - charIndexRef.current;
        if (remaining > 0) {
          const typeCount = Math.min(TYPING_BATCH_SIZE, remaining);
          charIndexRef.current += typeCount;
          setDisplayText(currentLine.slice(0, charIndexRef.current));
          const speed = (TYPING_SPEED + (Math.random() * 30 - 15)) * typeCount;
          typingTimerRef.current = setTimeout(type, speed);
        } else {
          setTypingState(false);
          typingTimerRef.current = setTimeout(() => {
            isDeletingRef.current = true;
            runTypewriter();
          }, TYPING_PAUSE);
        }
      }
    };

    typingTimerRef.current = setTimeout(type, 50);
  }, [clearTypingTimer]);

  const [symbol, setSymbol] = useState(YUAN_SYMBOLS.hanako);
  const [lines, setLines] = useState<string[]>([]);

  // 光标状态管理 - 打字时常亮，停顿时呼吸闪烁
  const [isTypingState, setIsTypingState] = useState(true);
  const [cursorBreathing, setCursorBreathing] = useState(false);

  // 同步 isTyping 状态 - 移除轮询，改为在打字机逻辑中直接触发
  const setTypingState = useCallback((typing: boolean) => {
    setIsTypingState(typing);
    setCursorBreathing(!typing);
    if (typing) {
      document.body.classList.add('splash-typing');
    } else {
      document.body.classList.remove('splash-typing');
    }
  }, []);

  useEffect(() => {
    (async () => {
      let locale = 'zh';
      let name = DEFAULT_NAME;
      let yuan = 'hanako';

      try {
        const hana = window.hana;
        const [avatarPath, splashInfo] = await Promise.all([
          hana?.getAvatarPath?.('agent'),
          hana?.getSplashInfo?.(),
        ]);

        if (avatarPath && window.platform?.getFileUrl) {
          const base = window.platform.getFileUrl(avatarPath);
          if (base) {
            setAvatarSrc(`${base}?t=${Date.now()}`);
          } else if (splashInfo?.yuan) {
            setAvatarSrc(`assets/${YUAN_AVATARS[splashInfo.yuan] || 'jarvis.png'}`);
          }
        } else if (splashInfo?.yuan) {
          setAvatarSrc(`assets/${YUAN_AVATARS[splashInfo.yuan] || 'jarvis.png'}`);
        }

        if (splashInfo?.agentName) name = splashInfo.agentName;
        if (splashInfo?.locale?.startsWith('en')) locale = 'en';
        if (splashInfo?.yuan) yuan = splashInfo.yuan;

        setSymbol(YUAN_SYMBOLS[yuan] || YUAN_SYMBOLS.hanako);

        // 设置 CSS 变量
        const color = YUAN_COLORS[yuan] || YUAN_COLORS.hanako;
        document.documentElement.style.setProperty('--splash-accent', color);
      } catch {}

      // 安装模式：固定文案，不打字机
      if (mode === 'installing') {
        const data = await fetch(`./locales/${locale}.json`).then(r => r.json()).catch(() => null);
        const tpl = data?.splash?.installing
          || (locale === 'en'
            ? '{name} is updating to v{version}, please wait…'
            : '{name} 正在更新到 v{version}，请稍候…');
        setDisplayText(tpl.replaceAll('{name}', name).replaceAll('{version}', installVersion || ''));
        setTypingState(false);
        return;
      }

      // 加载语言包
      let loadedLines: string[];
      try {
        const res = await fetch(`./locales/${locale}.json`);
        const data = await res.json();
        const yuanLines = data.yuan?.splash?.[yuan];
        const defaultLines = data.splash?.lines;
        const raw = Array.isArray(yuanLines) ? yuanLines : defaultLines;
        loadedLines = raw ? raw.map((l: string) => l.replaceAll('{name}', name)) : [];
      } catch {
        loadedLines = [];
      }

      if (!loadedLines.length) {
        loadedLines = [
          `${name} remembers the evening light`,
          'Some words sprouted in her memory',
          'She found your silhouette in memories',
        ];
      }

      loadedLines.sort(() => Math.random() - 0.5);
      linesRef.current = loadedLines;
      setLines(loadedLines);
      charIndexRef.current = 0;

      // 启动打字机
      typingTimerRef.current = setTimeout(runTypewriter, 600);

      // 入场动画序列
      const enterTimer = setTimeout(() => {
        setAnimationPhase('awake');
        document.body.classList.add('splash-phase-entering');

        const awakeTimer = setTimeout(() => {
          setAnimationPhase('breathing');
          document.body.classList.remove('splash-phase-entering');
          // 启动粒子系统
          spawnParticle();
        }, 3000);

        return () => clearTimeout(awakeTimer);
      }, 100);

      return () => clearTimeout(enterTimer);
    })();

    // 光标闪烁 - 仅在停顿时使用 CSS 呼吸动画，打字时保持常亮
    // 移除了原有的 setInterval，改为通过 cursorBreathing 状态控制

    return () => {
      clearTypingTimer();
      if (particleTimerRef.current) clearTimeout(particleTimerRef.current);
      if (particleContainerRef.current) {
        particleContainerRef.current.innerHTML = '';
      }
      particleCountRef.current = 0;
      document.body.classList.remove('splash-typing');
      document.body.classList.remove('splash-phase-entering');
    };
  }, [mode, installVersion, runTypewriter, clearTypingTimer, spawnParticle, setTypingState]);

  // 打字时光标常亮，停顿时呼吸闪烁
  const showCursor = mode !== 'installing' && (isTypingState || !cursorBreathing);

  return (
    <div className="splash-container">
      <div className="splash-avatar-wrap">
        <div className="splash-avatar-glow" />
        <div className="splash-avatar-ring-inner" />
        <div className="splash-avatar-ring-outer" />
        <img
          className="splash-avatar"
          src={avatarSrc}
          alt=""
          draggable={false}
        />
        <div className="splash-avatar-eyelid" />
      </div>
      <div className="splash-text-row">
        <p className="splash-text">
          {displayText}
          <span
            className={`splash-cursor${showCursor ? ' visible' : ''}`}
            style={isTypingState || !cursorBreathing ? { animation: 'none', opacity: 1 } : undefined}
          />
        </p>
        <span className="splash-sakura">{symbol}</span>
      </div>
      {mode !== 'installing' && lines.length > 0 && (
        <div className="splash-dots">
          {lines.map((_, i) => (
            <span
              key={i}
              className={`splash-dot${i === currentLineIndex ? ' active' : ''}`}
            />
          ))}
        </div>
      )}
      <div ref={particleContainerRef} className="splash-particles" />
    </div>
  );
}
