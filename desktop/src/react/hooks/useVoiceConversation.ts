/**
 * useVoiceConversation.ts — 渲染进程侧语音对话循环
 *
 * 绕过主进程 CJS/ESM 兼容问题，在渲染进程直接实现完整的语音对话管道：
 *   Web Speech API (STT) → WebSocket (Agent) → speechSynthesis (TTS)
 *
 * 状态机: idle → listening → processing → speaking → idle
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useStore } from '../stores';
import { getWebSocket } from '../services/websocket';

export type VoiceConversationState = 'idle' | 'listening' | 'processing' | 'speaking' | 'paused' | 'error';

interface UseVoiceConversationOptions {
  /** 识别语言 */
  lang?: string;
  /** 是否持续对话 */
  continuous?: boolean;
  /** 是否自动播放回复 */
  autoSpeak?: boolean;
  /** 状态变化回调 */
  onStateChange?: (state: VoiceConversationState) => void;
  /** 识别到用户文本回调 */
  onUserText?: (text: string) => void;
  /** AI 回复文本回调 */
  onAiText?: (text: string) => void;
}

export function useVoiceConversation(options: UseVoiceConversationOptions = {}) {
  const {
    lang = 'zh-CN',
    continuous = true,
    autoSpeak = true,
    onStateChange,
    onUserText,
    onAiText,
  } = options;

  const [state, setState] = useState<VoiceConversationState>('idle');
  const [userText, setUserText] = useState('');
  const [aiText, setAiText] = useState('');

  const stateRef = useRef<VoiceConversationState>('idle');
  const recognitionRef = useRef<any>(null);
  const stoppingRef = useRef(false);
  const activeRef = useRef(false);
  const wsListenerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const currentAiTextRef = useRef('');
  const turnCompleteRef = useRef(false);

  const updateState = useCallback((newState: VoiceConversationState) => {
    stateRef.current = newState;
    setState(newState);
    onStateChange?.(newState);
  }, [onStateChange]);

  // 检查 Web Speech API 是否可用
  const isAvailable = useCallback(() => {
    return typeof window !== 'undefined'
      && (!!(window as any).webkitSpeechRecognition || !!(window as any).SpeechRecognition);
  }, []);

  // 停止识别
  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        stoppingRef.current = true;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
  }, []);

  // 停止 TTS
  const stopTTS = useCallback(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // TTS 播放文本
  const speakText = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!text || typeof window === 'undefined' || !window.speechSynthesis) {
        resolve();
        return;
      }

      // 清理 markdown 格式
      const cleanText = text
        .replace(/```[\s\S]*?```/g, '代码块已省略')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[#*_~>|]/g, '')
        .replace(/\n{2,}/g, '。')
        .trim();

      if (!cleanText) {
        resolve();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = lang;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const match = voices.find(v => v.lang.startsWith(lang.split('-')[0])) || voices[0];
        utterance.voice = match;
      }

      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }, [lang]);

  // 通过 WebSocket 发送消息给 Agent
  const sendToAgent = useCallback((text: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const ws = getWebSocket();
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const sessionPath = useStore.getState().currentSessionPath;
      if (!sessionPath) {
        reject(new Error('No active session'));
        return;
      }

      // 重置状态
      currentAiTextRef.current = '';
      turnCompleteRef.current = false;

      // 发送消息
      ws.send(JSON.stringify({
        type: 'prompt',
        text,
        sessionPath,
        displayMessage: { text },
      }));

      // 监听响应
      const timeout = setTimeout(() => {
        cleanup();
        resolve(currentAiTextRef.current || '(无响应)');
      }, 60000);

      const messageHandler = (event: MessageEvent) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.sessionPath !== sessionPath) return;

          if (msg.type === 'text_delta' || msg.type === 'content_block') {
            const delta = msg.delta || msg.text || '';
            if (delta) {
              currentAiTextRef.current += delta;
              setAiText(currentAiTextRef.current);
              onAiText?.(currentAiTextRef.current);
            }
          }

          if (msg.type === 'turn_end') {
            turnCompleteRef.current = true;
            cleanup();
            resolve(currentAiTextRef.current || '(无响应)');
          }
        } catch {}
      };

      const cleanup = () => {
        clearTimeout(timeout);
        ws.removeEventListener('message', messageHandler);
        wsListenerRef.current = null;
      };

      wsListenerRef.current = messageHandler;
      ws.addEventListener('message', messageHandler);
    });
  }, [onAiText]);

  // 开始一轮对话：STT → Agent → TTS
  const startConversationTurn = useCallback(async () => {
    if (!activeRef.current || stoppingRef.current) return;

    // 1. 开始识别
    updateState('listening');
    setUserText('');
    setAiText('');
    onUserText?.('');

    const SpeechRecognitionCtor = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognitionCtor) {
      updateState('error');
      return;
    }

    let recognizedText = '';

    try {
      recognizedText = await new Promise<string>((resolve, reject) => {
        const recognition = new SpeechRecognitionCtor();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = lang;
        recognitionRef.current = recognition;
        stoppingRef.current = false;

        let finalText = '';

        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalText += transcript;
            } else {
              interim += transcript;
            }
          }
          const displayText = finalText + interim;
          setUserText(displayText);
          onUserText?.(displayText);
        };

        recognition.onend = () => {
          if (stoppingRef.current) {
            resolve('');
          } else {
            resolve(finalText.trim());
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'aborted' || event.error === 'no-speech') {
            resolve(finalText.trim());
          } else {
            reject(new Error(`Speech recognition error: ${event.error}`));
          }
        };

        try {
          recognition.start();
        } catch (err) {
          reject(err);
        }
      });
    } catch (err) {
      console.error('[VoiceConversation] STT error:', err);
      if (activeRef.current && !stoppingRef.current) {
        updateState('error');
        // 错误后短暂等待再重试
        setTimeout(() => {
          if (activeRef.current && continuous) {
            updateState('idle');
            startConversationTurn();
          }
        }, 2000);
      }
      return;
    }

    recognitionRef.current = null;

    if (!activeRef.current || stoppingRef.current) return;

    if (!recognizedText) {
      // 没有识别到文本，继续监听
      if (continuous && activeRef.current) {
        updateState('idle');
        setTimeout(() => startConversationTurn(), 500);
      }
      return;
    }

    // 2. 发送给 Agent
    updateState('processing');

    try {
      const response = await sendToAgent(recognizedText);

      if (!activeRef.current || stoppingRef.current) return;

      // 3. TTS 播放回复
      if (autoSpeak && response) {
        updateState('speaking');
        await speakText(response);
      }

      if (!activeRef.current || stoppingRef.current) return;

      // 4. 持续对话模式：继续下一轮
      if (continuous && activeRef.current) {
        updateState('idle');
        setTimeout(() => startConversationTurn(), 500);
      } else {
        stop();
      }
    } catch (err) {
      console.error('[VoiceConversation] Agent error:', err);
      if (activeRef.current && !stoppingRef.current) {
        // Agent 错误后继续监听
        if (continuous) {
          updateState('idle');
          setTimeout(() => startConversationTurn(), 1000);
        }
      }
    }
  }, [lang, continuous, autoSpeak, updateState, onUserText, onAiText, sendToAgent, speakText]);

  // 启动语音对话
  const start = useCallback(() => {
    if (activeRef.current) return;
    if (!isAvailable()) {
      updateState('error');
      return;
    }

    activeRef.current = true;
    stoppingRef.current = false;
    setUserText('');
    setAiText('');
    startConversationTurn();
  }, [isAvailable, updateState, startConversationTurn]);

  // 停止语音对话
  const stop = useCallback(() => {
    activeRef.current = false;
    stoppingRef.current = true;
    stopRecognition();
    stopTTS();

    // 清理 WebSocket 监听
    if (wsListenerRef.current) {
      const ws = getWebSocket();
      if (ws) {
        ws.removeEventListener('message', wsListenerRef.current);
      }
      wsListenerRef.current = null;
    }

    updateState('idle');
  }, [stopRecognition, stopTTS, updateState]);

  // 暂停
  const pause = useCallback(() => {
    if (stateRef.current === 'idle' || stateRef.current === 'paused') return;
    activeRef.current = false;
    stoppingRef.current = true;
    stopRecognition();
    stopTTS();
    updateState('paused');
  }, [stopRecognition, stopTTS, updateState]);

  // 恢复
  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return;
    activeRef.current = true;
    stoppingRef.current = false;
    updateState('idle');
    startConversationTurn();
  }, [updateState, startConversationTurn]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      activeRef.current = false;
      stoppingRef.current = true;
      stopRecognition();
      stopTTS();
    };
  }, [stopRecognition, stopTTS]);

  return {
    state,
    userText,
    aiText,
    start,
    stop,
    pause,
    resume,
    isAvailable: isAvailable(),
  };
}
