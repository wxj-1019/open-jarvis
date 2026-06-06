/**
 * voice-agent-router.test.js — VoiceAgentRouter 单元测试
 *
 * 覆盖：
 *   - 构造函数校验（engine/hub 必填）
 *   - route() 正常流程（session 加载、delta 捕获、响应返回）
 *   - route() 错误路径（空文本、无 session、流式冲突、取消）
 *   - cancel() / cancelAll()
 *   - _resolveSessionPath 优先级
 *   - activeRequestCount 追踪
 *   - collectMediaFromDetails 辅助函数
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceAgentRouter } from '../../lib/voice/voice-agent-router.js';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function createMockEngine(overrides = {}) {
  return {
    focusSessionPath: null,
    currentSessionPath: null,
    ensureSessionLoaded: vi.fn(),
    promptSession: vi.fn(),
    isSessionStreaming: vi.fn().mockReturnValue(false),
    ...overrides,
  };
}

function createMockHub(overrides = {}) {
  return {
    send: vi.fn(),
    subscribe: vi.fn(),
    ...overrides,
  };
}

function createMockSession(overrides = {}) {
  return {
    subscribe: vi.fn().mockReturnValue(vi.fn()),
    ...overrides,
  };
}

function createDeps(engineOverrides = {}, hubOverrides = {}) {
  return {
    engine: createMockEngine(engineOverrides),
    hub: createMockHub(hubOverrides),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VoiceAgentRouter', () => {
  let router, deps;

  beforeEach(() => {
    deps = createDeps();
    router = new VoiceAgentRouter(deps);
  });

  // ── Constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('requires a deps object', () => {
      expect(() => new VoiceAgentRouter(null)).toThrow('requires a deps object');
      expect(() => new VoiceAgentRouter(undefined)).toThrow('requires a deps object');
    });

    it('requires deps.engine', () => {
      expect(() => new VoiceAgentRouter({ hub: createMockHub() }))
        .toThrow('requires deps.engine');
    });

    it('requires deps.hub', () => {
      expect(() => new VoiceAgentRouter({ engine: createMockEngine() }))
        .toThrow('requires deps.hub');
    });

    it('has activeRequestCount of 0 after construction', () => {
      expect(router.activeRequestCount).toBe(0);
    });
  });

  // ── route() — success path ──────────────────────────────────────────────

  describe('route() — success path', () => {
    it('routes user text and returns agent response', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const mockSession = createMockSession();
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);

      // Simulate session.subscribe capturing a text_delta
      mockSession.subscribe.mockImplementation((cb) => {
        // Call callback with text_delta event
        cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hello' } });
        cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: ' world' } });
        cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '!' } });
        return vi.fn(); // unsubscribe fn
      });

      deps.hub.send.mockResolvedValue(undefined);

      const result = await router.route('Hi');

      expect(result).toBe('Hello world!');
      expect(deps.engine.ensureSessionLoaded).toHaveBeenCalledWith('/sessions/test');
      expect(deps.hub.send).toHaveBeenCalledWith('Hi', expect.objectContaining({
        sessionPath: '/sessions/test',
      }));
    });

    it('returns null when captured text is whitespace-only', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const mockSession = createMockSession();
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);

      mockSession.subscribe.mockImplementation((cb) => {
        cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '  ' } });
        return vi.fn();
      });

      deps.hub.send.mockResolvedValue(undefined);

      const result = await router.route('Hi');
      expect(result).toBeNull();
    });

    it('handles tool_execution_end with media', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const mockSession = createMockSession();
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);

      mockSession.subscribe.mockImplementation((cb) => {
        cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Result:' } });
        cb({
          type: 'tool_execution_end',
          isError: false,
          result: {
            details: {
              media: [
                { url: 'https://example.com/img.png' },
                { description: 'A chart showing data' },
              ],
              card: { description: 'Tool completed successfully' },
            },
          },
        });
        return vi.fn();
      });

      deps.hub.send.mockResolvedValue(undefined);

      const result = await router.route('Analyze');
      expect(result).toContain('Result:');
      expect(result).toContain('Tool completed successfully');
    });

    it('ignores tool_execution_end with isError=true', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const mockSession = createMockSession();
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);

      mockSession.subscribe.mockImplementation((cb) => {
        cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Ok' } });
        cb({
          type: 'tool_execution_end',
          isError: true,
          result: { details: { media: [{ url: 'x' }] } },
        });
        return vi.fn();
      });

      deps.hub.send.mockResolvedValue(undefined);

      const result = await router.route('Test');
      expect(result).toBe('Ok');
    });

    it('calls onDelta callback during streaming', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const mockSession = createMockSession();
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);

      const onDelta = vi.fn();
      mockSession.subscribe.mockImplementation((cb) => {
        cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'A' } });
        cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'B' } });
        return vi.fn();
      });

      deps.hub.send.mockImplementation(async (text, opts) => {
        opts.onDelta?.('A', 'A');
        opts.onDelta?.('B', 'AB');
      });

      const result = await router.route('Hi', { onDelta });

      expect(result).toBe('AB');
      // onDelta is called by both session.subscribe (2x) and hub.send (2x) = 4 total
      expect(onDelta).toHaveBeenCalledTimes(4);
    });

    it('increments and cleans up activeRequestCount', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const mockSession = createMockSession();
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);
      mockSession.subscribe.mockReturnValue(vi.fn());
      deps.hub.send.mockResolvedValue(undefined);

      const promise = router.route('Test');
      expect(router.activeRequestCount).toBe(1);
      await promise;
      expect(router.activeRequestCount).toBe(0);
    });
  });

  // ── route() — error paths ─────────────────────────────────────────────

  describe('route() — error paths', () => {
    it('throws when userText is empty', async () => {
      await expect(router.route('')).rejects.toThrow('userText is required');
    });

    it('throws when userText is whitespace-only', async () => {
      await expect(router.route('   ')).rejects.toThrow('userText is required');
    });

    it('throws when no active session is available', async () => {
      await expect(router.route('Hello')).rejects.toThrow('no active session available');
    });

    it('throws when session is currently streaming', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      deps.engine.isSessionStreaming = vi.fn().mockReturnValue(true);

      await expect(router.route('Hello')).rejects.toThrow('session is currently streaming');
    });

    it('throws when engine.ensureSessionLoaded is not a function', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      deps.engine.ensureSessionLoaded = 'not-a-function';

      await expect(router.route('Hello')).rejects.toThrow('ensureSessionLoaded unavailable');
    });

    it('throws when engine.promptSession is not a function', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      // ensureSessionLoaded is fine
      deps.engine.ensureSessionLoaded = vi.fn();
      deps.engine.promptSession = null;

      await expect(router.route('Hello')).rejects.toThrow('promptSession unavailable');
    });

    it('throws when hub.send is not a function', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      deps.engine.ensureSessionLoaded = vi.fn();
      deps.engine.promptSession = vi.fn();
      deps.hub.send = null;

      await expect(router.route('Hello')).rejects.toThrow('hub.send unavailable');
    });

    it('throws when hub.subscribe is not a function', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      deps.engine.ensureSessionLoaded = vi.fn();
      deps.engine.promptSession = vi.fn();
      deps.hub.send = vi.fn();
      deps.hub.subscribe = null;

      await expect(router.route('Hello')).rejects.toThrow('hub.subscribe unavailable');
    });

    it('throws when session fails to load', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      deps.engine.ensureSessionLoaded.mockResolvedValue(null);

      await expect(router.route('Hello')).rejects.toThrow('failed to load session');
    });

    it('throws AbortError when pre-flight abort signal is set', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const abortController = new AbortController();
      abortController.abort();

      await expect(router.route('Hello', { abortController }))
        .rejects.toThrow('request aborted');
    });

    it('throws AbortError when hub.send is aborted mid-request', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const mockSession = createMockSession();
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);
      mockSession.subscribe.mockReturnValue(vi.fn());

      const abortController = new AbortController();
      deps.hub.send.mockImplementation(async () => {
        abortController.abort();
        throw new Error('Aborted');
      });

      await expect(router.route('Hello', { abortController }))
        .rejects.toThrow('request aborted');
    });
  });

  // ── cancel() / cancelAll() ────────────────────────────────────────────

  describe('cancel() / cancelAll()', () => {
    it('cancel does nothing for unknown requestId', () => {
      expect(() => router.cancel('unknown')).not.toThrow();
    });

    it('cancelAll aborts all active request controllers', () => {
      const ctrl1 = new AbortController();
      const ctrl2 = new AbortController();
      router._activeRequests.set('test-1', ctrl1);
      router._activeRequests.set('test-2', ctrl2);

      router.cancelAll();

      // Controllers are aborted but remain in map (cleaned up by route() finally)
      expect(ctrl1.signal.aborted).toBe(true);
      expect(ctrl2.signal.aborted).toBe(true);
      expect(router.activeRequestCount).toBe(2);
    });
  });

  // ── _resolveSessionPath priority ─────────────────────────────────────

  describe('_resolveSessionPath priority', () => {
    it('prefers focusSessionPath over currentSessionPath', () => {
      deps.engine.focusSessionPath = '/focus';
      deps.engine.currentSessionPath = '/current';

      const path = router._resolveSessionPath();
      expect(path).toBe('/focus');
    });

    it('falls back to currentSessionPath when focus is null', () => {
      deps.engine.focusSessionPath = null;
      deps.engine.currentSessionPath = '/current';

      const path = router._resolveSessionPath();
      expect(path).toBe('/current');
    });

    it('returns null when neither path is available', () => {
      const path = router._resolveSessionPath();
      expect(path).toBeNull();
    });

    it('returns null when paths are whitespace-only', () => {
      deps.engine.focusSessionPath = '   ';
      deps.engine.currentSessionPath = '  ';

      const path = router._resolveSessionPath();
      expect(path).toBeNull();
    });
  });

  // ── AbortController forwarding ────────────────────────────────────────

  describe('AbortController', () => {
    it('creates a new AbortController when none provided', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const mockSession = createMockSession();
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);
      mockSession.subscribe.mockReturnValue(vi.fn());
      deps.hub.send.mockResolvedValue(undefined);

      await router.route('Test');
      // Should have created and cleaned up
      expect(router.activeRequestCount).toBe(0);
    });

    it('uses custom sessionPath when provided', async () => {
      const mockSession = createMockSession();
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);
      mockSession.subscribe.mockReturnValue(vi.fn());
      deps.hub.send.mockResolvedValue(undefined);

      await router.route('Test', { sessionPath: '/custom' });

      expect(deps.engine.ensureSessionLoaded).toHaveBeenCalledWith('/custom');
      expect(deps.hub.send).toHaveBeenCalledWith('Test', expect.objectContaining({
        sessionPath: '/custom',
      }));
    });
  });

  // ── Edge cases ────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles session.subscribe returning non-function', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const mockSession = { subscribe: undefined };
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);
      deps.hub.send.mockResolvedValue(undefined);

      const result = await router.route('Test');
      // Should not crash, but no text captured
      expect(result).toBeNull();
    });

    it('handles hub.send throwing non-Abort error', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const mockSession = createMockSession();
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);
      mockSession.subscribe.mockReturnValue(vi.fn());
      deps.hub.send.mockRejectedValue(new Error('Network failure'));

      await expect(router.route('Test')).rejects.toThrow('Network failure');
    });

    it('handles onDelta throwing without propagating', async () => {
      deps.engine.focusSessionPath = '/sessions/test';
      const mockSession = createMockSession();
      deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);

      const throwingDelta = vi.fn().mockImplementation(() => {
        throw new Error('delta crash');
      });

      mockSession.subscribe.mockImplementation((cb) => {
        cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Safe' } });
        return vi.fn();
      });

      deps.hub.send.mockResolvedValue(undefined);

      // Should not crash even though delta handler throws internally
      const result = await router.route('Test', { onDelta: throwingDelta });
      expect(result).toBe('Safe');
    });
  });
});

// ── collectMediaFromDetails (via route) ───────────────────────────────────────

describe('collectMediaFromDetails (via route)', () => {
  it('handles tool_execution_end without details', async () => {
    const deps = createDeps();
    deps.engine.focusSessionPath = '/sessions/test';
    const mockSession = createMockSession();
    deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);
    deps.hub.send.mockResolvedValue(undefined);

    mockSession.subscribe.mockImplementation((cb) => {
      cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'X' } });
      cb({ type: 'tool_execution_end', isError: false, result: null });
      return vi.fn();
    });

    const router = new VoiceAgentRouter(deps);
    const result = await router.route('Test');
    expect(result).toBe('X');
  });

  it('handles tool_execution_end with empty media array', async () => {
    const deps = createDeps();
    deps.engine.focusSessionPath = '/sessions/test';
    const mockSession = createMockSession();
    deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);
    deps.hub.send.mockResolvedValue(undefined);

    mockSession.subscribe.mockImplementation((cb) => {
      cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Y' } });
      cb({ type: 'tool_execution_end', isError: false, result: { details: { media: [] } } });
      return vi.fn();
    });

    const router = new VoiceAgentRouter(deps);
    const result = await router.route('Test');
    expect(result).toBe('Y');
  });

  it('handles tool_execution_end with card but no description', async () => {
    const deps = createDeps();
    deps.engine.focusSessionPath = '/sessions/test';
    const mockSession = createMockSession();
    deps.engine.ensureSessionLoaded.mockResolvedValue(mockSession);
    deps.hub.send.mockResolvedValue(undefined);

    mockSession.subscribe.mockImplementation((cb) => {
      cb({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Z' } });
      cb({ type: 'tool_execution_end', isError: false, result: { details: { card: {} } } });
      return vi.fn();
    });

    const router = new VoiceAgentRouter(deps);
    const result = await router.route('Test');
    expect(result).toBe('Z');
  });
});
