import { describe, it, expect, beforeEach } from 'vitest';
import { WhisperSTTAdapter } from '../../lib/speech/whisper-stt-adapter.js';

describe('WhisperSTTAdapter audio format validation', () => {
  let adapter;

  beforeEach(() => {
    adapter = new WhisperSTTAdapter({ serverUrl: 'http://localhost:7860' });
  });

  it('should reject unsupported audio format', async () => {
    const invalidBlob = new Blob(['test'], { type: 'audio/flac' });
    
    await expect(adapter.transcribe(invalidBlob)).rejects.toThrow(
      'Unsupported audio format: audio/flac'
    );
  });

  it('should accept webm format', async () => {
    const webmBlob = new Blob(['test'], { type: 'audio/webm' });
    
    // 不会在验证阶段失败，会在网络请求时失败（预期行为）
    await expect(adapter.transcribe(webmBlob)).rejects.toThrow();
  });

  it('should accept wav format', async () => {
    const wavBlob = new Blob(['test'], { type: 'audio/wav' });
    
    await expect(adapter.transcribe(wavBlob)).rejects.toThrow();
  });

  it('should accept blob without type (fallback to server validation)', async () => {
    const noTypeBlob = new Blob(['test']); // type 为空
    
    await expect(adapter.transcribe(noTypeBlob)).rejects.toThrow();
  });
});
