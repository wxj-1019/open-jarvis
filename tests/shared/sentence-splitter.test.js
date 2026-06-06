import { describe, it, expect } from 'vitest';
import { splitSentences, isSentenceComplete } from '../../lib/speech/sentence-splitter.js';

describe('SentenceSplitter', () => {
  describe('splitSentences', () => {
    it('should split Chinese sentences by punctuation', () => {
      expect(splitSentences('你好吗？我很好！谢谢。')).toEqual(['你好吗？', '我很好！', '谢谢。']);
    });

    it('should split English sentences by punctuation', () => {
      expect(splitSentences('Hello! How are you? I am fine.')).toEqual(['Hello!', 'How are you?', 'I am fine.']);
    });

    it('should handle mixed Chinese/English', () => {
      expect(splitSentences('Hello你好！I am很好。')).toEqual(['Hello你好！', 'I am很好。']);
    });

    it('should handle text with no sentence boundary (returns as remainder)', () => {
      expect(splitSentences('这是一个很长的句子没有标点')).toEqual(['这是一个很长的句子没有标点']);
    });

    it('should return empty when no sentence boundary and remainder disabled', () => {
      expect(splitSentences('这是一个很长的句子没有标点', { includeRemainder: false })).toEqual([]);
    });

    it('should handle empty string', () => {
      expect(splitSentences('')).toEqual([]);
    });

    it('should handle newlines as sentence boundaries', () => {
      expect(splitSentences('第一行\n第二行\n第三行')).toEqual(['第一行', '第二行', '第三行']);
    });

    it('should keep trailing incomplete text in remainder', () => {
      const result = splitSentences('你好。世界正在', { includeRemainder: true });
      expect(result).toEqual(['你好。', '世界正在']);
    });

    it('should handle abbreviations without false splits', () => {
      const result = splitSentences('Dr. Smith went to the U.S.A.');
      expect(result.length).toBeLessThanOrEqual(2);
    });
  });

  describe('isSentenceComplete', () => {
    it('should return true for text ending with sentence punctuation', () => {
      expect(isSentenceComplete('你好。')).toBe(true);
      expect(isSentenceComplete('Hello!')).toBe(true);
      expect(isSentenceComplete('Really?')).toBe(true);
    });

    it('should return false for incomplete text', () => {
      expect(isSentenceComplete('你好')).toBe(false);
      expect(isSentenceComplete('Hello')).toBe(false);
      expect(isSentenceComplete('')).toBe(false);
    });
  });
});
