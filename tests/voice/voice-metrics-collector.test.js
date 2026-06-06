import { describe, it, expect, beforeEach } from "vitest";
import { VoiceMetricsCollector } from "../../lib/metrics/voice-metrics-collector.js";

describe("VoiceMetricsCollector", () => {
  let collector;

  beforeEach(() => {
    collector = new VoiceMetricsCollector();
  });

  describe("recordSttLatency", () => {
    it("records a successful STT latency sample", () => {
      collector.recordSttLatency(150, true);
      const stats = collector.getStats();
      expect(stats.stt.count).toBe(1);
      expect(stats.stt.min).toBe(150);
      expect(stats.stt.max).toBe(150);
      expect(stats.stt.avg).toBe(150);
      expect(stats.errors.stt).toBe(0);
    });

    it("records a failed STT latency sample", () => {
      collector.recordSttLatency(200, false);
      const stats = collector.getStats();
      expect(stats.stt.count).toBe(1);
      expect(stats.errors.stt).toBe(1);
    });

    it("accumulates multiple STT latency samples", () => {
      collector.recordSttLatency(100, true);
      collector.recordSttLatency(200, true);
      collector.recordSttLatency(300, true);

      const stats = collector.getStats();
      expect(stats.stt.count).toBe(3);
      expect(stats.stt.min).toBe(100);
      expect(stats.stt.max).toBe(300);
      expect(stats.stt.avg).toBe(200);
    });
  });

  describe("recordTtsLatency", () => {
    it("records a successful TTS latency sample", () => {
      collector.recordTtsLatency(250, true);
      const stats = collector.getStats();
      expect(stats.tts.count).toBe(1);
      expect(stats.tts.min).toBe(250);
      expect(stats.errors.tts).toBe(0);
    });

    it("records a failed TTS latency sample", () => {
      collector.recordTtsLatency(300, false);
      const stats = collector.getStats();
      expect(stats.tts.count).toBe(1);
      expect(stats.errors.tts).toBe(1);
    });

    it("accumulates multiple TTS latency samples", () => {
      collector.recordTtsLatency(100, true);
      collector.recordTtsLatency(200, true);
      collector.recordTtsLatency(300, true);

      const stats = collector.getStats();
      expect(stats.tts.count).toBe(3);
      expect(stats.tts.avg).toBe(200);
    });
  });

  describe("recordCycleDuration", () => {
    it("records a successful cycle duration", () => {
      collector.recordCycleDuration(500, true);
      const stats = collector.getStats();
      expect(stats.cycle.count).toBe(1);
      expect(stats.cycle.min).toBe(500);
      expect(stats.errors.pipeline).toBe(0);
    });

    it("records a failed cycle duration", () => {
      collector.recordCycleDuration(600, false);
      const stats = collector.getStats();
      expect(stats.cycle.count).toBe(1);
      expect(stats.errors.pipeline).toBe(1);
    });

    it("accumulates multiple cycle durations", () => {
      collector.recordCycleDuration(400, true);
      collector.recordCycleDuration(500, true);
      collector.recordCycleDuration(600, true);

      const stats = collector.getStats();
      expect(stats.cycle.count).toBe(3);
      expect(stats.cycle.avg).toBe(500);
    });
  });

  describe("percentile calculations", () => {
    it("calculates p50 correctly", () => {
      for (let i = 1; i <= 10; i++) {
        collector.recordSttLatency(i * 100, true);
      }

      const stats = collector.getStats();
      expect(stats.stt.p50).toBe(500);
    });

    it("calculates p95 correctly", () => {
      for (let i = 1; i <= 20; i++) {
        collector.recordSttLatency(i * 100, true);
      }

      const stats = collector.getStats();
      expect(stats.stt.p95).toBe(1900);
    });

    it("returns 0 for p50/p95 when no samples", () => {
      const stats = collector.getStats();
      expect(stats.stt.p50).toBe(0);
      expect(stats.stt.p95).toBe(0);
    });
  });

  describe("getStats", () => {
    it("returns empty stats when no data recorded", () => {
      const stats = collector.getStats();
      expect(stats.stt.count).toBe(0);
      expect(stats.tts.count).toBe(0);
      expect(stats.cycle.count).toBe(0);
      expect(stats.errors.stt).toBe(0);
      expect(stats.errors.tts).toBe(0);
      expect(stats.errors.pipeline).toBe(0);
    });

    it("returns independent stats for STT, TTS, and cycle", () => {
      collector.recordSttLatency(100, true);
      collector.recordTtsLatency(200, true);
      collector.recordCycleDuration(300, true);

      const stats = collector.getStats();
      expect(stats.stt.count).toBe(1);
      expect(stats.stt.avg).toBe(100);
      expect(stats.tts.count).toBe(1);
      expect(stats.tts.avg).toBe(200);
      expect(stats.cycle.count).toBe(1);
      expect(stats.cycle.avg).toBe(300);
    });

    it("returns a copy of error counts", () => {
      collector.recordSttLatency(100, false);
      const stats = collector.getStats();
      stats.errors.stt = 999;

      const stats2 = collector.getStats();
      expect(stats2.errors.stt).toBe(1);
    });
  });

  describe("reset", () => {
    it("clears all collected data", () => {
      collector.recordSttLatency(100, true);
      collector.recordTtsLatency(200, true);
      collector.recordCycleDuration(300, true);
      collector.recordSttLatency(150, false);

      collector.reset();

      const stats = collector.getStats();
      expect(stats.stt.count).toBe(0);
      expect(stats.tts.count).toBe(0);
      expect(stats.cycle.count).toBe(0);
      expect(stats.errors.stt).toBe(0);
      expect(stats.errors.tts).toBe(0);
      expect(stats.errors.pipeline).toBe(0);
    });

    it("allows recording after reset", () => {
      collector.recordSttLatency(100, true);
      collector.reset();
      collector.recordSttLatency(200, true);

      const stats = collector.getStats();
      expect(stats.stt.count).toBe(1);
      expect(stats.stt.avg).toBe(200);
    });
  });

  describe("max samples limit", () => {
    it("limits STT samples to maxSamples", () => {
      const limitedCollector = new VoiceMetricsCollector({ maxSamples: 5 });
      for (let i = 1; i <= 10; i++) {
        limitedCollector.recordSttLatency(i * 100, true);
      }

      const stats = limitedCollector.getStats();
      expect(stats.stt.count).toBe(5);
      expect(stats.stt.min).toBe(600);
      expect(stats.stt.max).toBe(1000);
    });

    it("limits TTS samples to maxSamples", () => {
      const limitedCollector = new VoiceMetricsCollector({ maxSamples: 3 });
      for (let i = 1; i <= 8; i++) {
        limitedCollector.recordTtsLatency(i * 100, true);
      }

      const stats = limitedCollector.getStats();
      expect(stats.tts.count).toBe(3);
      expect(stats.tts.min).toBe(600);
      expect(stats.tts.max).toBe(800);
    });

    it("limits cycle samples to maxSamples", () => {
      const limitedCollector = new VoiceMetricsCollector({ maxSamples: 4 });
      for (let i = 1; i <= 9; i++) {
        limitedCollector.recordCycleDuration(i * 100, true);
      }

      const stats = limitedCollector.getStats();
      expect(stats.cycle.count).toBe(4);
      expect(stats.cycle.min).toBe(600);
      expect(stats.cycle.max).toBe(900);
    });

    it("uses default MAX_SAMPLES (100) when not specified", () => {
      for (let i = 1; i <= 150; i++) {
        collector.recordSttLatency(i * 10, true);
      }

      const stats = collector.getStats();
      expect(stats.stt.count).toBe(100);
      expect(stats.stt.min).toBe(510);
      expect(stats.stt.max).toBe(1500);
    });
  });

  describe("edge cases", () => {
    it("handles zero latency", () => {
      collector.recordSttLatency(0, true);
      const stats = collector.getStats();
      expect(stats.stt.min).toBe(0);
      expect(stats.stt.max).toBe(0);
      expect(stats.stt.avg).toBe(0);
    });

    it("handles very large latency values", () => {
      collector.recordSttLatency(999999, true);
      const stats = collector.getStats();
      expect(stats.stt.max).toBe(999999);
    });

    it("handles single sample", () => {
      collector.recordSttLatency(123, true);
      const stats = collector.getStats();
      expect(stats.stt.count).toBe(1);
      expect(stats.stt.p50).toBe(123);
      expect(stats.stt.p95).toBe(123);
    });

    it("rounds average to nearest integer", () => {
      collector.recordSttLatency(100, true);
      collector.recordSttLatency(101, true);
      collector.recordSttLatency(102, true);

      const stats = collector.getStats();
      expect(stats.stt.avg).toBe(101);
    });
  });
});
