/**
 * SplashApp.tsx — 启动画面
 *
 * 头像呼吸动画 + 打字机文字轮播 + 底部进度点。
 * 不依赖 server（splash 显示时 server 还没启动），数据来源全部是 IPC + 本地文件。
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const DEFAULT_NAME = 'Jarvis';
const YUAN_AVATARS: Record<string, string> = {
  hanako: 'Hanako.png',
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

export function SplashApp() {
  const [avatarSrc, setAvatarSrc] = useState('assets/Hanako.png');
  const [displayText, setDisplayText] = useState('');
  const [cursorVisible, setCursorVisible] = useState(true);
  const [currentLineIndex, setCurrentLineIndex] = useState(0);
  const [isTyping, setIsTyping] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [symbol, setSymbol] = useState(YUAN_SYMBOLS.hanako);
  const [accentColor, setAccentColor] = useState(YUAN_COLORS.hanako);

  const linesRef = useRef<string[]>([]);
  const charIndexRef = useRef(0);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cursorTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const mode = params.get('mode') || '';
  const installVersion = params.get('version') || '';

  const clearTypingTimer = useCallback(() => {
    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  // 打字机核心逻辑
  const runTypewriter = useCallback(() => {
    if (linesRef.current.length === 0) return;

    const currentLine = linesRef.current[currentLineIndex];

    if (isDeleting) {
      // 删除模式
      if (charIndexRef.current > 0) {
        charIndexRef.current -= 1;
        setDisplayText(currentLine.slice(0, charIndexRef.current));
        typingTimerRef.current = setTimeout(runTypewriter, TYPING_SPEED / 2.5);
      } else {
        // 删除完成，切换到下一行
        setIsDeleting(false);
        setIsTyping(true);
        const nextIndex = (currentLineIndex + 1) % linesRef.current.length;
        setCurrentLineIndex(nextIndex);
        typingTimerRef.current = setTimeout(runTypewriter, 300);
      }
    } else {
      // 打字模式
      if (charIndexRef.current < currentLine.length) {
        charIndexRef.current += 1;
        setDisplayText(currentLine.slice(0, charIndexRef.current));
        const speed = TYPING_SPEED + (Math.random() * 30 - 15);
        typingTimerRef.current = setTimeout(runTypewriter, speed);
      } else {
        // 打字完成，暂停后进入删除模式
        setIsTyping(false);
        typingTimerRef.current = setTimeout(() => {
          setIsDeleting(true);
          typingTimerRef.current = setTimeout(runTypewriter, TYPING_SPEED);
        }, TYPING_PAUSE);
      }
    }
  }, [currentLineIndex, isDeleting]);

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
            setAvatarSrc(`assets/${YUAN_AVATARS[splashInfo.yuan] || 'Hanako.png'}`);
          }
        } else if (splashInfo?.yuan) {
          setAvatarSrc(`assets/${YUAN_AVATARS[splashInfo.yuan] || 'Hanako.png'}`);
        }

        if (splashInfo?.agentName) name = splashInfo.agentName;
        if (splashInfo?.locale?.startsWith('en')) locale = 'en';
        if (splashInfo?.yuan) yuan = splashInfo.yuan;

        setSymbol(YUAN_SYMBOLS[yuan] || YUAN_SYMBOLS.hanako);
        setAccentColor(YUAN_COLORS[yuan] || YUAN_COLORS.hanako);
      } catch {}

      // 安装模式：固定文案，不打字机
      if (mode === 'installing') {
        const data = await fetch(`./locales/${locale}.json`).then(r => r.json()).catch(() => null);
        const tpl = data?.splash?.installing
          || (locale === 'en'
            ? '{name} is updating to v{version}, please wait…'
            : '{name} 正在更新到 v{version}，请稍候…');
        setDisplayText(tpl.replaceAll('{name}', name).replaceAll('{version}', installVersion || ''));
        setIsTyping(false);
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
    })();

    // 光标闪烁
    cursorTimerRef.current = setInterval(() => {
      setCursorVisible(v => !v);
    }, 530);

    return () => {
      clearTypingTimer();
      if (cursorTimerRef.current) clearInterval(cursorTimerRef.current);
    };
  }, [mode, installVersion, runTypewriter, clearTypingTimer]);

  // 当行索引变化时重置字符索引并启动打字
  useEffect(() => {
    if (mode === 'installing') return;
    if (linesRef.current.length === 0) return;
    charIndexRef.current = 0;
    clearTypingTimer();
    typingTimerRef.current = setTimeout(runTypewriter, 300);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentLineIndex]);

  const showCursor = mode !== 'installing' && (isTyping || cursorVisible);

  return (
    <div className="splash-container">
      <div className="splash-avatar-wrap">
        <img
          className="splash-avatar"
          src={avatarSrc}
          alt=""
          draggable={false}
        />
        <div className="splash-avatar-ring" style={{ borderColor: accentColor }} />
        <div className="splash-avatar-glow" style={{ background: accentColor }} />
      </div>
      <div className="splash-text-row">
        <p className="splash-text">
          {displayText}
          <span
            className={`splash-cursor${showCursor ? ' visible' : ''}`}
            style={{ backgroundColor: accentColor }}
          />
        </p>
        <span className="splash-sakura" style={{ color: accentColor }}>{symbol}</span>
      </div>
      {mode !== 'installing' && lines.length > 0 && (
        <div className="splash-dots">
          {lines.map((_, i) => (
            <span
              key={i}
              className={`splash-dot${i === currentLineIndex ? ' active' : ''}`}
              style={i === currentLineIndex ? { backgroundColor: accentColor } : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}
