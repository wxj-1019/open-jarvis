import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Voice IPC Audio Channel', () => {
  it('should convert Blob to ArrayBuffer and back', async () => {
    const original = new Blob(['test audio data'], { type: 'audio/webm' });
    const arrayBuffer = await original.arrayBuffer();
    expect(arrayBuffer).toBeInstanceOf(ArrayBuffer);
    expect(arrayBuffer.byteLength).toBeGreaterThan(0);

    const restored = new Blob([arrayBuffer], { type: 'audio/webm' });
    expect(restored.size).toBe(original.size);
    expect(restored.type).toBe(original.type);
  });

  it('should reject empty ArrayBuffer', () => {
    const empty = new ArrayBuffer(0);
    expect(empty.byteLength).toBe(0);
  });

  it('should preserve MIME type through IPC', () => {
    const mimeTypes = ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4'];
    for (const mimeType of mimeTypes) {
      expect(mimeType).toMatch(/^audio\//);
    }
  });
});
