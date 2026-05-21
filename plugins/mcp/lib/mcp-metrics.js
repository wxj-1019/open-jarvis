export class McpMetricsCollector {
  constructor() {
    this._requests = new Map();
    this._tools = new Map();
  }

  recordRequest(connectorId, method, latencyMs, success) {
    let entries = this._requests.get(connectorId);
    if (!entries) {
      entries = [];
      this._requests.set(connectorId, entries);
    }
    entries.push({
      method,
      latencyMs,
      success,
      timestamp: Date.now(),
    });
  }

  recordToolCall(connectorId, toolName, latencyMs, success) {
    const key = `${connectorId}/${toolName}`;
    let entries = this._tools.get(key);
    if (!entries) {
      entries = [];
      this._tools.set(key, entries);
    }
    entries.push({
      latencyMs,
      success,
      timestamp: Date.now(),
    });
  }

  getConnectorStats(connectorId) {
    const entries = this._requests.get(connectorId) || [];
    return computeConnectorStats(connectorId, entries);
  }

  getToolStats(connectorId, toolName) {
    const key = `${connectorId}/${toolName}`;
    const entries = this._tools.get(key) || [];
    return computeToolStats(connectorId, toolName, entries);
  }

  getAllStats() {
    const stats = [];
    for (const [connectorId, entries] of this._requests.entries()) {
      const connectorStats = computeConnectorStats(connectorId, entries);

      const tools = {};
      for (const [key, toolEntries] of this._tools.entries()) {
        if (key.startsWith(`${connectorId}/`)) {
          const toolName = key.slice(connectorId.length + 1);
          tools[toolName] = computeToolStats(connectorId, toolName, toolEntries);
        }
      }

      stats.push({
        ...connectorStats,
        tools,
      });
    }
    return stats;
  }

  reset() {
    this._requests.clear();
    this._tools.clear();
  }
}

function computeConnectorStats(connectorId, entries) {
  const totalRequests = entries.length;
  let successCount = 0;
  let totalLatency = 0;

  for (const entry of entries) {
    if (entry.success) successCount++;
    totalLatency += entry.latencyMs;
  }

  const failureCount = totalRequests - successCount;
  const successRate = totalRequests > 0 ? successCount / totalRequests : 0;
  const avgLatencyMs = totalRequests > 0 ? Math.round(totalLatency / totalRequests) : 0;

  return {
    connectorId,
    totalRequests,
    successCount,
    failureCount,
    successRate,
    avgLatencyMs,
  };
}

function computeToolStats(connectorId, toolName, entries) {
  const totalCalls = entries.length;
  let successCount = 0;
  let totalLatency = 0;

  for (const entry of entries) {
    if (entry.success) successCount++;
    totalLatency += entry.latencyMs;
  }

  const failureCount = totalCalls - successCount;
  const successRate = totalCalls > 0 ? successCount / totalCalls : 0;
  const avgLatencyMs = totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0;

  return {
    connectorId,
    toolName,
    totalCalls,
    successCount,
    failureCount,
    successRate,
    avgLatencyMs,
  };
}
