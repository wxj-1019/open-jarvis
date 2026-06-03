/**
 * whisper-streaming.test.js — WhisperStreamingClient unit tests
 *
 * Tests the WebSocket streaming transcription client with mocked WebSocket.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We need to mock WebSocket since it's not available in Node.js test environment
const mockWebSocketInstances = [];

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url = "";
  onopen = null;
  onmessage = null;
  onclose = null;
  onerror = null;

  sentMessages = [];

  constructor(url) {
    this.url = url;
    mockWebSocketInstances.push(this);
  }

  send(data) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code: 1000, wasClean: true });
    }
  }

  // Simulate connection open
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen();
    }
  }

  // Simulate receiving a message
  simulateMessage(data) {
    if (this.onmessage) {
      this.onmessage({ data });
    }
  }

  // Simulate close event
  simulateClose(code = 1000, wasClean = true) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose({ code, wasClean });
    }
  }

  // Simulate error event (also triggers close, like real WebSocket)
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
    // In real WebSocket, error during connection is followed by close
    if (this.readyState !== MockWebSocket.CLOSED && this.onclose) {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose({ code: 1006, wasClean: false });
    }
  }
}

// Mock global WebSocket
vi.stubGlobal("WebSocket", MockWebSocket);

// Import after mocking
const { WhisperStreamingClient } = await import("../../desktop/src/react/utils/whisper-streaming.ts");

describe("WhisperStreamingClient", () => {
  let client;
  let callbacks;
  let mockWs;

  beforeEach(() => {
    mockWebSocketInstances.length = 0;
    callbacks = {
      onPartialResult: vi.fn(),
      onFinalResult: vi.fn(),
      onError: vi.fn(),
      onStateChange: vi.fn(),
    };

    client = new WhisperStreamingClient({
      serverUrl: "ws://localhost:3000/api/voice/stream",
      language: "zh",
      ...callbacks,
    });
  });

  afterEach(() => {
    client?.close();
    vi.useRealTimers();
  });

  // ── Initial State ──

  it("initializes with idle state", () => {
    expect(client.getState()).toBe("idle");
  });

  // ── connect ──

  it("connect succeeds and transitions to streaming", async () => {
    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    expect(mockWs).toBeDefined();
    expect(client.getState()).toBe("connecting");

    mockWs.simulateOpen();
    await connectPromise;

    expect(client.getState()).toBe("streaming");
    expect(callbacks.onStateChange).toHaveBeenCalledWith("connecting");
    expect(callbacks.onStateChange).toHaveBeenCalledWith("streaming");
  });

  it("connect includes language parameter in URL", async () => {
    client.connect();
    mockWs = mockWebSocketInstances[0];
    expect(mockWs.url).toContain("lang=zh");
    mockWs.simulateOpen();
  });

  it("connect rejects on WebSocket error", async () => {
    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateError();

    await expect(connectPromise).rejects.toThrow("WebSocket connection error");
    expect(client.getState()).toBe("error");
  });

  it("connect does nothing if already connecting", async () => {
    const p1 = client.connect();
    const p2 = client.connect();

    expect(mockWebSocketInstances.length).toBe(1);

    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();

    await p1;
    await p2;
  });

  // ── sendChunk ──

  it("sendChunk converts Float32Array to Int16 PCM and sends", async () => {
    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    mockWs.sentMessages.length = 0;

    const audioData = new Float32Array([0.5, -0.5, 1.0, -1.0]);
    client.sendChunk(audioData, 16000);

    expect(mockWs.sentMessages.length).toBe(1);
    expect(mockWs.sentMessages[0] instanceof ArrayBuffer).toBe(true);

    const int16 = new Int16Array(mockWs.sentMessages[0]);
    expect(int16[0]).toBe(16383); // 0.5 * 0x7fff = 16383.5, truncated to 16383
    expect(int16[1]).toBe(-16384); // -0.5 * 0x8000 = -16384
    expect(int16[2]).toBe(0x7fff);
    expect(int16[3]).toBe(-0x8000);
  });

  it("sendChunk does nothing when not connected", () => {
    const audioData = new Float32Array([0.5]);
    client.sendChunk(audioData);
    // No messages should be sent, no error
  });

  it("sendChunk clips values outside [-1, 1]", async () => {
    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    mockWs.sentMessages.length = 0;

    const audioData = new Float32Array([2.0, -3.0]);
    client.sendChunk(audioData);

    const int16 = new Int16Array(mockWs.sentMessages[0]);
    expect(int16[0]).toBe(0x7fff);
    expect(int16[1]).toBe(-0x8000);
  });

  // ── finish ──

  it("finish sends control message", async () => {
    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    mockWs.sentMessages.length = 0;

    client.finish();

    expect(mockWs.sentMessages.length).toBe(1);
    expect(mockWs.sentMessages[0]).toBe(JSON.stringify({ type: "finish" }));
  });

  // ── Message Handling ──

  it("partial result callback is called on partial message", async () => {
    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    mockWs.simulateMessage(JSON.stringify({ type: "partial", text: "hello world" }));

    expect(callbacks.onPartialResult).toHaveBeenCalledWith("hello world");
  });

  it("final result callback is called on final message", async () => {
    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    mockWs.simulateMessage(JSON.stringify({ type: "final", text: "final text" }));

    expect(callbacks.onFinalResult).toHaveBeenCalledWith("final text");
  });

  it("error callback is called on error message", async () => {
    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    mockWs.simulateMessage(JSON.stringify({ type: "error", message: "transcription failed" }));

    expect(callbacks.onError).toHaveBeenCalled();
    expect(callbacks.onError.mock.calls[0][0].message).toBe("transcription failed");
  });

  it("ignores non-JSON messages", async () => {
    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    mockWs.simulateMessage("not json");

    expect(callbacks.onPartialResult).not.toHaveBeenCalled();
    expect(callbacks.onFinalResult).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  // ── close ──

  it("close transitions to closed state", async () => {
    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    client.close();
    expect(client.getState()).toBe("closed");
  });

  it("close prevents reconnect", async () => {
    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    client.close();

    // Simulate unexpected close after manual close - should not trigger reconnect
    mockWs.simulateClose(1006, false);

    expect(client.getState()).toBe("closed");
    expect(mockWebSocketInstances.length).toBe(1); // No new WebSocket created
  });

  // ── Reconnect ──

  it("reconnects on unexpected close with exponential backoff", async () => {
    vi.useFakeTimers();

    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    // Simulate unexpected disconnect
    mockWs.simulateClose(1006, false);

    // State stays streaming until setTimeout fires
    expect(client.getState()).toBe("streaming");

    // Advance timer to trigger first reconnect (500ms)
    vi.advanceTimersByTime(500);

    expect(client.getState()).toBe("connecting");

    const secondWs = mockWebSocketInstances[1];
    expect(secondWs).toBeDefined();
    expect(secondWs.readyState).toBe(MockWebSocket.CONNECTING);

    // Open the reconnected WebSocket
    secondWs.simulateOpen();
    expect(client.getState()).toBe("streaming");

    vi.useRealTimers();
  });

  it("stops reconnecting after max attempts", async () => {
    vi.useFakeTimers();

    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    // Simulate 3 failed reconnect attempts
    for (let i = 0; i < 3; i++) {
      const currentWs = mockWebSocketInstances[mockWebSocketInstances.length - 1];
      if (currentWs.readyState !== MockWebSocket.CLOSED) {
        currentWs.simulateClose(1006, false);
      }

      const delay = 500 * Math.pow(2, i);
      vi.advanceTimersByTime(delay);

      // New ws created but errors immediately
      const newWs = mockWebSocketInstances[mockWebSocketInstances.length - 1];
      if (newWs && newWs !== currentWs && newWs.readyState === MockWebSocket.CONNECTING) {
        newWs.simulateError();
      }
    }

    // After 3 failed attempts, should be closed
    expect(client.getState()).toBe("closed");

    vi.useRealTimers();
  });

  it("reconnect delay doubles each attempt", async () => {
    vi.useFakeTimers();

    const connectPromise = client.connect();
    mockWs = mockWebSocketInstances[0];
    mockWs.simulateOpen();
    await connectPromise;

    // First disconnect
    mockWs.simulateClose(1006, false);

    // First reconnect: 500ms delay
    expect(mockWebSocketInstances.length).toBe(1);
    vi.advanceTimersByTime(499);
    expect(mockWebSocketInstances.length).toBe(1);
    vi.advanceTimersByTime(1);
    expect(mockWebSocketInstances.length).toBe(2);

    // Fail the second connection
    const secondWs = mockWebSocketInstances[1];
    secondWs.simulateError();

    // Second reconnect: 1000ms delay
    vi.advanceTimersByTime(999);
    expect(mockWebSocketInstances.length).toBe(2);
    vi.advanceTimersByTime(1);
    expect(mockWebSocketInstances.length).toBe(3);

    vi.useRealTimers();
  });

  // ── Default Options ──

  it("uses default options when not provided", () => {
    const defaultClient = new WhisperStreamingClient();
    expect(defaultClient.getState()).toBe("idle");
    defaultClient.close();
  });
});
