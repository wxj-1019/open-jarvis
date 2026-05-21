import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("performance-monitor");

const DEFAULT_PERF_CONFIG = {
  searchTimeoutMs: 500,
  addTimeoutMs: 200,
  compileTimeoutMs: 30000,
  alertThreshold: 3,
  windowSize: 10,
};

export function createPerformanceMonitor(config) {
  const cfg = { ...DEFAULT_PERF_CONFIG, ...config };
  const metrics = new Map();
  const alerts = [];

  function recordMetric(operation, durationMs, success = true) {
    if (!metrics.has(operation)) {
      metrics.set(operation, []);
    }

    const history = metrics.get(operation);
    history.push({ duration: durationMs, success, timestamp: Date.now() });

    if (history.length > cfg.windowSize) {
      history.shift();
    }

    checkForAlerts(operation, durationMs);
  }

  function checkForAlerts(operation, durationMs) {
    const history = metrics.get(operation) || [];
    const recentFailures = history.filter(
      (m) => !m.success && (Date.now() - m.timestamp) < 60000,
    );

    if (recentFailures.length >= cfg.alertThreshold) {
      addAlert(
        `high_failure_rate_${operation}`,
        `${operation} has ${recentFailures.length} failures in the last minute`,
        "high",
      );
    }

    const timeouts = {
      search: cfg.searchTimeoutMs,
      add: cfg.addTimeoutMs,
      compile: cfg.compileTimeoutMs,
    };

    if (timeouts[operation] && durationMs > timeouts[operation]) {
      addAlert(
        `timeout_${operation}`,
        `${operation} took ${durationMs}ms (limit: ${timeouts[operation]}ms)`,
        "medium",
      );
    }
  }

  function addAlert(type, message, severity) {
    const existing = alerts.find((a) => a.type === type && (Date.now() - new Date(a.timestamp).getTime()) < 300000);
    if (existing) {
      existing.count = (existing.count || 1) + 1;
      existing.timestamp = new Date().toISOString();
    } else {
      alerts.push({
        type,
        message,
        severity,
        timestamp: new Date().toISOString(),
        count: 1,
      });
    }
    log?.warn?.(`Perf Alert [${severity}]: ${message}`);
  }

  function getMetrics(operation) {
    const history = metrics.get(operation) || [];
    if (history.length === 0) return null;

    const durations = history.map((m) => m.duration);
    const successCount = history.filter((m) => m.success).length;

    return {
      operation,
      sampleCount: history.length,
      avgDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      minDuration: Math.min(...durations),
      maxDuration: Math.max(...durations),
      p50Duration: percentile(durations, 50),
      p95Duration: percentile(durations, 95),
      successRate: Math.round((successCount / history.length) * 100),
    };
  }

  function getAllMetrics() {
    const result = {};
    for (const operation of metrics.keys()) {
      result[operation] = getMetrics(operation);
    }
    return result;
  }

  function getAlerts() {
    return [...alerts];
  }

  function clearAlerts() {
    alerts.length = 0;
  }

  function percentile(sorted, p) {
    const arr = [...sorted].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  }

  function wrapOperation(operation, fn) {
    return async (...args) => {
      const start = performance.now();
      try {
        const result = await fn(...args);
        recordMetric(operation, performance.now() - start, true);
        return result;
      } catch (err) {
        recordMetric(operation, performance.now() - start, false);
        throw err;
      }
    };
  }

  function generateReport() {
    const allMetrics = getAllMetrics();
    const lines = [];

    lines.push("Performance Monitor Report");
    lines.push("");

    for (const [operation, m] of Object.entries(allMetrics)) {
      if (!m) continue;
      lines.push(`Operation: ${operation}`);
      lines.push(`  Samples: ${m.sampleCount}`);
      lines.push(`  Avg: ${m.avgDuration}ms | P50: ${m.p50Duration}ms | P95: ${m.p95Duration}ms`);
      lines.push(`  Success Rate: ${m.successRate}%`);
      lines.push("");
    }

    const currentAlerts = getAlerts();
    if (currentAlerts.length > 0) {
      lines.push(`Alerts (${currentAlerts.length}):`);
      for (const alert of currentAlerts) {
        lines.push(`  [${alert.severity}] ${alert.message}`);
      }
    }

    return lines.join("\n");
  }

  return {
    recordMetric,
    getMetrics,
    getAllMetrics,
    getAlerts,
    clearAlerts,
    wrapOperation,
    generateReport,
  };
}
