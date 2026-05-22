export class McpMetricsCollector {
  constructor({
    ttlMs = 60 * 60 * 1000,
    maxEntriesPerConnector = 1000,
    maxEntriesPerTool = 500,
  } = {}) {
    this._ttlMs = ttlMs;
    this._maxEntriesPerConnector = maxEntriesPerConnector;
    this._maxEntriesPerTool = maxEntriesPerTool;
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

    if (entries.length > this._maxEntriesPerConnector) {
      entries.shift();
    }
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

    if (entries.length > this._maxEntriesPerTool) {
      entries.shift();
    }
  }

  getConnectorStats(connectorId) {
    const allEntries = this._requests.get(connectorId) || [];
    const now = Date.now();
    const entries = allEntries.filter(e => now - e.timestamp < this._ttlMs);
    return computeConnectorStats(connectorId, entries);
  }

  getToolStats(connectorId, toolName) {
    const key = `${connectorId}/${toolName}`;
    const allEntries = this._tools.get(key) || [];
    const now = Date.now();
    const entries = allEntries.filter(e => now - e.timestamp < this._ttlMs);
    return computeToolStats(connectorId, toolName, entries);
  }

  getAllStats() {
    const now = Date.now();
    const connectorIds = new Set(this._requests.keys());
    for (const key of this._tools.keys()) {
      const slashIndex = key.indexOf("/");
      if (slashIndex > 0) {
        connectorIds.add(key.slice(0, slashIndex));
      }
    }

    const stats = [];
    for (const connectorId of connectorIds) {
      const allEntries = this._requests.get(connectorId) || [];
      const entries = allEntries.filter(e => now - e.timestamp < this._ttlMs);
      const connectorStats = computeConnectorStats(connectorId, entries);

      const tools = {};
      for (const [key, toolAllEntries] of this._tools.entries()) {
        if (key.startsWith(`${connectorId}/`)) {
          const toolName = key.slice(connectorId.length + 1);
          const toolEntries = toolAllEntries.filter(e => now - e.timestamp < this._ttlMs);
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

  cleanup() {
    const now = Date.now();

    for (const [connectorId, entries] of this._requests.entries()) {
      const freshEntries = entries.filter(e => now - e.timestamp < this._ttlMs);
      if (freshEntries.length === 0) {
        this._requests.delete(connectorId);
      } else {
        this._requests.set(connectorId, freshEntries);
      }
    }

    for (const [key, entries] of this._tools.entries()) {
      const freshEntries = entries.filter(e => now - e.timestamp < this._ttlMs);
      if (freshEntries.length === 0) {
        this._tools.delete(key);
      } else {
        this._tools.set(key, freshEntries);
      }
    }
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
