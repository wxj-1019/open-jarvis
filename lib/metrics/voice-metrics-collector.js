/**
 * voice-metrics-collector.js — 语音指标收集器
 *
 * 跟踪 STT/TTS 延迟、对话周期时长和错误计数。
 * 支持 p50/p95 百分位数计算，最大 100 个样本。
 *
 * 职责：
 *   - 记录 STT 转录延迟
 *   - 记录 TTS 合成延迟
 *   - 记录完整对话周期时长（STT → Agent → TTS）
 *   - 跟踪错误计数
 *   - 提供 p50/p95 百分位数统计
 *
 * 架构：
 *   VoiceMetricsCollector 是无状态的纯数据收集器，
 *   通过 record*() 方法记录指标，通过 getStats() 查询统计。
 */

const MAX_SAMPLES = 100;

export class VoiceMetricsCollector {
  constructor({ maxSamples = MAX_SAMPLES } = {}) {
    this._maxSamples = maxSamples;
    this._sttLatencies = [];
    this._ttsLatencies = [];
    this._cycleDurations = [];
    this._errorCounts = {
      stt: 0,
      tts: 0,
      pipeline: 0,
    };
  }

  // ── 公共 API ──

  /**
   * 记录 STT 转录延迟。
   *
   * @param {number} latencyMs - 延迟（毫秒）
   * @param {boolean} success - 是否成功
   */
  recordSttLatency(latencyMs, success = true) {
    this._sttLatencies.push(latencyMs);
    if (this._sttLatencies.length > this._maxSamples) {
      this._sttLatencies.shift();
    }
    if (!success) {
      this._errorCounts.stt++;
    }
  }

  /**
   * 记录 TTS 合成延迟。
   *
   * @param {number} latencyMs - 延迟（毫秒）
   * @param {boolean} success - 是否成功
   */
  recordTtsLatency(latencyMs, success = true) {
    this._ttsLatencies.push(latencyMs);
    if (this._ttsLatencies.length > this._maxSamples) {
      this._ttsLatencies.shift();
    }
    if (!success) {
      this._errorCounts.tts++;
    }
  }

  /**
   * 记录完整对话周期时长。
   *
   * @param {number} durationMs - 周期时长（毫秒）
   * @param {boolean} success - 是否成功
   */
  recordCycleDuration(durationMs, success = true) {
    this._cycleDurations.push(durationMs);
    if (this._cycleDurations.length > this._maxSamples) {
      this._cycleDurations.shift();
    }
    if (!success) {
      this._errorCounts.pipeline++;
    }
  }

  /**
   * 获取所有统计数据。
   *
   * @returns {object} 包含 stt、tts、cycle 和 errors 的统计对象
   */
  getStats() {
    return {
      stt: this._computeStats(this._sttLatencies),
      tts: this._computeStats(this._ttsLatencies),
      cycle: this._computeStats(this._cycleDurations),
      errors: { ...this._errorCounts },
    };
  }

  /**
   * 重置所有收集的数据。
   */
  reset() {
    this._sttLatencies = [];
    this._ttsLatencies = [];
    this._cycleDurations = [];
    this._errorCounts = {
      stt: 0,
      tts: 0,
      pipeline: 0,
    };
  }

  // ── 内部方法 ──

  /**
   * 计算统计数据。
   *
   * @param {number[]} samples - 样本数组
   * @returns {object} 统计对象
   */
  _computeStats(samples) {
    const count = samples.length;
    if (count === 0) {
      return {
        count: 0,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p95: 0,
      };
    }

    const sorted = [...samples].sort((a, b) => a - b);
    const sum = samples.reduce((acc, val) => acc + val, 0);

    return {
      count,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: Math.round(sum / count),
      p50: this._percentile(sorted, 50),
      p95: this._percentile(sorted, 95),
    };
  }

  /**
   * 计算百分位数。
   *
   * @param {number[]} sorted - 已排序的样本数组
   * @param {number} percentile - 百分位（0-100）
   * @returns {number} 百分位数值
   */
  _percentile(sorted, percentile) {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}
